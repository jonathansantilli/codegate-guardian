import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

export function resolveGeminiApiKey(env: NodeJS.ProcessEnv = process.env) {
  return env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY;
}

export function normalizeGeminiModelId(modelId: string) {
  return modelId.startsWith("google/")
    ? modelId.replace(/^google\//, "")
    : modelId;
}

const geminiApiKey = resolveGeminiApiKey();
const googleProvider = geminiApiKey
  ? createGoogleGenerativeAI({ apiKey: geminiApiKey })
  : null;

const MISSING_GOOGLE_KEY_MESSAGE =
  "No Google Gemini API key is configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) in the environment.";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  if (modelId.startsWith("google/")) {
    if (!googleProvider) {
      throw new Error(MISSING_GOOGLE_KEY_MESSAGE);
    }
    return googleProvider.languageModel(normalizeGeminiModelId(modelId));
  }

  if (modelId.startsWith("claude-code/")) {
    const {
      createClaudeCodeLocalModel,
    } = require("./providers/claude-code-local");
    return createClaudeCodeLocalModel(modelId.replace(/^claude-code\//, ""));
  }

  if (modelId.startsWith("codex/")) {
    const { createCodexLocalModel } = require("./providers/codex-local");
    return createCodexLocalModel(modelId.replace(/^codex\//, ""));
  }

  throw new Error(`Unsupported model: ${modelId}`);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (!googleProvider) {
    throw new Error(MISSING_GOOGLE_KEY_MESSAGE);
  }

  return googleProvider.languageModel(normalizeGeminiModelId(titleModel.id));
}
