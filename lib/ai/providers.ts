import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { customProvider, gateway } from "ai";
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

  if (googleProvider && modelId.startsWith("google/")) {
    return googleProvider.languageModel(normalizeGeminiModelId(modelId));
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (googleProvider) {
    return googleProvider.languageModel("gemini-2.5-flash");
  }

  return gateway.languageModel(titleModel.id);
}
