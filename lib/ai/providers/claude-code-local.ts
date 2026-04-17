import "server-only";
import { randomUUID } from "node:crypto";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

const PROVIDER_ID = "claude-code-local";

type FlattenedPrompt = {
  systemPrompt: string | undefined;
  userPrompt: string;
};

function renderPartsToText(
  parts: Extract<
    LanguageModelV2Prompt[number],
    { role: "user" | "assistant" | "tool" }
  >["content"]
): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      chunks.push(part.text);
    } else if (part.type === "reasoning") {
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

function flattenPrompt(prompt: LanguageModelV2Prompt): FlattenedPrompt {
  const systemChunks: string[] = [];
  const conversation: string[] = [];

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
      conversation.push(`User: ${rendered}`);
    } else if (message.role === "assistant") {
      conversation.push(`Assistant: ${rendered}`);
    }
  }

  return {
    systemPrompt: systemChunks.length > 0 ? systemChunks.join("\n\n") : undefined,
    userPrompt: conversation.join("\n\n"),
  };
}

function mapStopReason(stopReason: string | null): LanguageModelV2FinishReason {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool-calls";
    case "refusal":
      return "content-filter";
    default:
      return stopReason ? "other" : "unknown";
  }
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
};

function mapUsage(usage: Usage | undefined): LanguageModelV2Usage {
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    totalTokens:
      (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0) || undefined,
    cachedInputTokens: usage?.cache_read_input_tokens,
  };
}

async function runQuery(
  modelId: string,
  prompt: LanguageModelV2Prompt,
  signal: AbortSignal | undefined
) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const abortController = new AbortController();
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener("abort", () => abortController.abort(), {
        once: true,
      });
    }
  }

  const { systemPrompt, userPrompt } = flattenPrompt(prompt);

  return {
    abortController,
    stream: query({
      prompt: userPrompt || "(empty prompt)",
      options: {
        model: modelId,
        tools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        abortController,
        ...(systemPrompt && { systemPrompt }),
      },
    }),
  };
}

type RawStreamEvent = {
  type: string;
  index?: number;
  content_block?: { type: string };
  delta?: { type?: string; text?: string; thinking?: string };
  message?: { usage?: Usage; stop_reason?: string | null };
  usage?: Usage;
};

type StreamAccumulator = {
  textId: string | null;
  reasoningId: string | null;
  finalText: string;
  stopReason: string | null;
  usage: Usage | undefined;
};

function processStreamEvent(
  event: RawStreamEvent,
  acc: StreamAccumulator,
  controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>
) {
  if (event.type === "content_block_start") {
    const blockType = event.content_block?.type;
    if (blockType === "text" && !acc.textId) {
      acc.textId = randomUUID();
      controller.enqueue({ type: "text-start", id: acc.textId });
    } else if (blockType === "thinking" && !acc.reasoningId) {
      acc.reasoningId = randomUUID();
      controller.enqueue({ type: "reasoning-start", id: acc.reasoningId });
    }
    return;
  }

  if (event.type === "content_block_delta") {
    const deltaType = event.delta?.type;
    if (deltaType === "text_delta" && event.delta?.text) {
      if (!acc.textId) {
        acc.textId = randomUUID();
        controller.enqueue({ type: "text-start", id: acc.textId });
      }
      acc.finalText += event.delta.text;
      controller.enqueue({
        type: "text-delta",
        id: acc.textId,
        delta: event.delta.text,
      });
    } else if (deltaType === "thinking_delta" && event.delta?.thinking) {
      if (!acc.reasoningId) {
        acc.reasoningId = randomUUID();
        controller.enqueue({ type: "reasoning-start", id: acc.reasoningId });
      }
      controller.enqueue({
        type: "reasoning-delta",
        id: acc.reasoningId,
        delta: event.delta.thinking,
      });
    }
    return;
  }

  if (event.type === "content_block_stop") {
    if (acc.textId) {
      controller.enqueue({ type: "text-end", id: acc.textId });
      acc.textId = null;
    }
    if (acc.reasoningId) {
      controller.enqueue({ type: "reasoning-end", id: acc.reasoningId });
      acc.reasoningId = null;
    }
    return;
  }

  if (event.type === "message_delta") {
    if (event.delta?.type === undefined && "usage" in event) {
      acc.usage = event.usage ?? acc.usage;
    }
    if (event.message?.stop_reason) {
      acc.stopReason = event.message.stop_reason;
    }
  }

  if (event.type === "message_stop") {
    if (event.message?.usage) {
      acc.usage = event.message.usage;
    }
  }
}

export function createClaudeCodeLocalModel(modelId: string): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: PROVIDER_ID,
    modelId,
    supportedUrls: {},
    async doGenerate(options: LanguageModelV2CallOptions) {
      const { stream } = await runQuery(
        modelId,
        options.prompt,
        options.abortSignal
      );

      let text = "";
      let reasoning = "";
      let stopReason: string | null = null;
      let usage: Usage | undefined;

      for await (const message of stream) {
        if (message.type === "stream_event") {
          const raw = message.event as unknown as RawStreamEvent;
          if (raw.type === "content_block_delta") {
            const deltaType = raw.delta?.type;
            if (deltaType === "text_delta" && raw.delta?.text) {
              text += raw.delta.text;
            } else if (deltaType === "thinking_delta" && raw.delta?.thinking) {
              reasoning += raw.delta.thinking;
            }
          } else if (raw.type === "message_delta" && raw.message?.stop_reason) {
            stopReason = raw.message.stop_reason;
          } else if (raw.type === "message_stop" && raw.message?.usage) {
            usage = raw.message.usage;
          }
          continue;
        }

        if (message.type === "result") {
          if (message.subtype !== "success") {
            throw new Error(
              message.subtype === "error_during_execution"
                ? message.errors?.[0] ?? "Claude Code session failed"
                : `Claude Code session failed: ${message.subtype}`
            );
          }
          if (!text) {
            text = message.result;
          }
          usage = message.usage as unknown as Usage;
        }
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
        finishReason: mapStopReason(stopReason),
        usage: mapUsage(usage),
        warnings: [],
      };
    },
    async doStream(options: LanguageModelV2CallOptions) {
      const { stream, abortController } = await runQuery(
        modelId,
        options.prompt,
        options.abortSignal
      );

      const acc: StreamAccumulator = {
        textId: null,
        reasoningId: null,
        finalText: "",
        stopReason: null,
        usage: undefined,
      };

      const readable = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });

          try {
            for await (const message of stream) {
              if (message.type === "stream_event") {
                processStreamEvent(
                  message.event as unknown as RawStreamEvent,
                  acc,
                  controller
                );
                continue;
              }

              if (message.type === "assistant" && !acc.finalText) {
                const parts = message.message?.content ?? [];
                for (const part of parts) {
                  if (part.type === "text" && part.text) {
                    if (!acc.textId) {
                      acc.textId = randomUUID();
                      controller.enqueue({
                        type: "text-start",
                        id: acc.textId,
                      });
                    }
                    acc.finalText += part.text;
                    controller.enqueue({
                      type: "text-delta",
                      id: acc.textId,
                      delta: part.text,
                    });
                  }
                }
                continue;
              }

              if (message.type === "result") {
                if (acc.textId) {
                  controller.enqueue({ type: "text-end", id: acc.textId });
                  acc.textId = null;
                }
                if (acc.reasoningId) {
                  controller.enqueue({
                    type: "reasoning-end",
                    id: acc.reasoningId,
                  });
                  acc.reasoningId = null;
                }

                if (message.subtype !== "success") {
                  controller.enqueue({
                    type: "error",
                    error: new Error(
                      message.subtype === "error_during_execution"
                        ? message.errors?.[0] ?? "Claude Code session failed"
                        : `Claude Code session failed: ${message.subtype}`
                    ),
                  });
                  controller.enqueue({
                    type: "finish",
                    finishReason: "error",
                    usage: mapUsage(message.usage as unknown as Usage),
                  });
                  controller.close();
                  return;
                }

                if (!acc.finalText && message.result) {
                  const id = randomUUID();
                  controller.enqueue({ type: "text-start", id });
                  controller.enqueue({
                    type: "text-delta",
                    id,
                    delta: message.result,
                  });
                  controller.enqueue({ type: "text-end", id });
                }

                controller.enqueue({
                  type: "finish",
                  finishReason: mapStopReason(acc.stopReason),
                  usage: mapUsage(
                    (message.usage as unknown as Usage) ?? acc.usage
                  ),
                });
                controller.close();
                return;
              }
            }

            if (acc.textId) {
              controller.enqueue({ type: "text-end", id: acc.textId });
            }
            if (acc.reasoningId) {
              controller.enqueue({
                type: "reasoning-end",
                id: acc.reasoningId,
              });
            }
            controller.enqueue({
              type: "finish",
              finishReason: mapStopReason(acc.stopReason),
              usage: mapUsage(acc.usage),
            });
            controller.close();
          } catch (error) {
            controller.enqueue({ type: "error", error });
            controller.enqueue({
              type: "finish",
              finishReason: "error",
              usage: mapUsage(acc.usage),
            });
            controller.close();
          }
        },
        cancel() {
          abortController.abort();
        },
      });

      return { stream: readable };
    },
  };
}
