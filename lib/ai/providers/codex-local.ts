import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

const PROVIDER_ID = "codex-local";
const CODEX_BIN = process.env.CODEX_BIN?.trim() || "codex";

function renderPartsToText(
  parts: Extract<
    LanguageModelV2Prompt[number],
    { role: "user" | "assistant" | "tool" }
  >["content"]
): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.type === "text" || part.type === "reasoning") {
      chunks.push(part.text);
    } else if (part.type === "tool-call") {
      chunks.push(
        `[tool-call ${part.toolName} ${JSON.stringify(part.input)}]`
      );
    } else if (part.type === "tool-result") {
      chunks.push(`[tool-result ${part.toolName}]`);
    } else if (part.type === "file") {
      chunks.push(`[file ${part.mediaType} ${part.filename ?? ""}]`);
    }
  }
  return chunks.join("\n");
}

function flattenPrompt(prompt: LanguageModelV2Prompt): string {
  const sections: string[] = [];
  const systemChunks: string[] = [];

  for (const message of prompt) {
    if (message.role === "system") {
      systemChunks.push(message.content);
      continue;
    }
    const rendered = renderPartsToText(message.content);
    if (!rendered.trim()) {
      continue;
    }
    if (message.role === "user" || message.role === "tool") {
      sections.push(`User: ${rendered}`);
    } else if (message.role === "assistant") {
      sections.push(`Assistant: ${rendered}`);
    }
  }

  const system = systemChunks.length > 0
    ? `System:\n${systemChunks.join("\n\n")}\n\n`
    : "";
  return `${system}${sections.join("\n\n")}`;
}

type CodexUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

function mapUsage(usage: CodexUsage | undefined): LanguageModelV2Usage {
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    totalTokens:
      (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0) || undefined,
    cachedInputTokens: usage?.cached_input_tokens,
  };
}

type CodexItemDetails = {
  type: string;
  text?: string;
  summary?: string;
  message?: string;
};

type CodexThreadItem = {
  id?: string;
  details?: CodexItemDetails;
};

type CodexEvent = {
  type: string;
  thread_id?: string;
  item?: CodexThreadItem;
  usage?: CodexUsage;
  error?: { message?: string };
  message?: string;
};

function spawnCodex(
  modelId: string,
  promptText: string,
  signal: AbortSignal | undefined
) {
  const child = spawn(
    CODEX_BIN,
    [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "-C",
      tmpdir(),
      "-m",
      modelId,
      "-",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    }
  );

  if (signal) {
    if (signal.aborted) {
      child.kill("SIGTERM");
    } else {
      signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
        },
        { once: true }
      );
    }
  }

  child.stdin.end(promptText);
  return child;
}

async function* readJsonLines(
  stream: NodeJS.ReadableStream
): AsyncGenerator<CodexEvent> {
  let buffer = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    buffer += chunk as string;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          yield JSON.parse(line) as CodexEvent;
        } catch {
          // Ignore non-JSON lines (Codex occasionally writes status text)
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail) as CodexEvent;
    } catch {
      // ignore
    }
  }
}

function mapFinishReason(
  reason: "stop" | "error" | "abort"
): LanguageModelV2FinishReason {
  if (reason === "error") return "error";
  if (reason === "abort") return "other";
  return "stop";
}

function readStderr(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let acc = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      acc += chunk;
    });
    stream.on("end", () => resolve(acc));
    stream.on("error", () => resolve(acc));
  });
}

export function createCodexLocalModel(modelId: string): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: PROVIDER_ID,
    modelId,
    supportedUrls: {},
    async doGenerate(options: LanguageModelV2CallOptions) {
      const promptText = flattenPrompt(options.prompt);
      const child = spawnCodex(modelId, promptText, options.abortSignal);
      const stderrPromise = readStderr(child.stderr);

      let text = "";
      let reasoning = "";
      let usage: CodexUsage | undefined;
      let errorMessage: string | null = null;

      for await (const event of readJsonLines(child.stdout)) {
        if (event.type === "item.completed") {
          const details = event.item?.details;
          if (details?.type === "agent_message" && details.text) {
            text += details.text;
          } else if (details?.type === "reasoning") {
            const chunk = details.text ?? details.summary;
            if (chunk) {
              reasoning += chunk;
            }
          } else if (details?.type === "error") {
            errorMessage = details.message ?? "Codex reported an error";
          }
        } else if (event.type === "turn.completed") {
          usage = event.usage;
        } else if (event.type === "turn.failed") {
          errorMessage = event.error?.message ?? "Codex turn failed";
        } else if (event.type === "error") {
          errorMessage = event.message ?? errorMessage;
        }
      }

      const exitCode: number = await new Promise((resolve) => {
        child.once("close", (code) => resolve(code ?? 0));
      });

      if (errorMessage || exitCode !== 0) {
        const stderr = (await stderrPromise).trim();
        throw new Error(
          errorMessage ||
            stderr ||
            `codex exec exited with code ${exitCode}`
        );
      }

      const content: LanguageModelV2Content[] = [];
      if (reasoning) {
        content.push({ type: "reasoning", text: reasoning });
      }
      if (text) {
        content.push({ type: "text", text });
      }

      return {
        content,
        finishReason: mapFinishReason("stop"),
        usage: mapUsage(usage),
        warnings: [],
      };
    },
    async doStream(options: LanguageModelV2CallOptions) {
      const promptText = flattenPrompt(options.prompt);
      const child = spawnCodex(modelId, promptText, options.abortSignal);
      const stderrPromise = readStderr(child.stderr);

      const readable = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });

          let textId: string | null = null;
          let reasoningId: string | null = null;
          let usage: CodexUsage | undefined;
          let errorMessage: string | null = null;

          try {
            for await (const event of readJsonLines(child.stdout)) {
              if (event.type === "item.completed") {
                const details = event.item?.details;
                if (details?.type === "agent_message" && details.text) {
                  if (!textId) {
                    textId = randomUUID();
                    controller.enqueue({ type: "text-start", id: textId });
                  }
                  controller.enqueue({
                    type: "text-delta",
                    id: textId,
                    delta: details.text,
                  });
                } else if (details?.type === "reasoning") {
                  const chunk = details.text ?? details.summary;
                  if (chunk && chunk.length > 0) {
                    if (!reasoningId) {
                      reasoningId = randomUUID();
                      controller.enqueue({
                        type: "reasoning-start",
                        id: reasoningId,
                      });
                    }
                    controller.enqueue({
                      type: "reasoning-delta",
                      id: reasoningId,
                      delta: chunk,
                    });
                  }
                } else if (details?.type === "error") {
                  errorMessage = details.message ?? "Codex reported an error";
                }
              } else if (event.type === "turn.completed") {
                usage = event.usage;
              } else if (event.type === "turn.failed") {
                errorMessage = event.error?.message ?? "Codex turn failed";
              } else if (event.type === "error") {
                errorMessage = event.message ?? errorMessage;
              }
            }

            const exitCode: number = await new Promise((resolve) => {
              child.once("close", (code) => resolve(code ?? 0));
            });

            if (textId) {
              controller.enqueue({ type: "text-end", id: textId });
            }
            if (reasoningId) {
              controller.enqueue({ type: "reasoning-end", id: reasoningId });
            }

            if (errorMessage || exitCode !== 0) {
              const stderr = (await stderrPromise).trim();
              const finalError =
                errorMessage ||
                stderr ||
                `codex exec exited with code ${exitCode}`;
              controller.enqueue({ type: "error", error: new Error(finalError) });
              controller.enqueue({
                type: "finish",
                finishReason: "error",
                usage: mapUsage(usage),
              });
            } else {
              controller.enqueue({
                type: "finish",
                finishReason: mapFinishReason("stop"),
                usage: mapUsage(usage),
              });
            }
            controller.close();
          } catch (error) {
            controller.enqueue({ type: "error", error });
            controller.enqueue({
              type: "finish",
              finishReason: "error",
              usage: mapUsage(usage),
            });
            controller.close();
          }
        },
        cancel() {
          child.kill("SIGTERM");
        },
      });

      return { stream: readable };
    },
  };
}
