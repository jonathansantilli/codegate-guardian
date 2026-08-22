export const DEFAULT_CHAT_MODEL = "google/gemini-2.5-pro";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const LOCAL_CLI_MODEL_PREFIXES = ["claude-code/", "codex/"] as const;

export function isLocalCliModelId(id: string) {
  return LOCAL_CLI_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export const chatModels: ChatModel[] = [
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "Highest capability Gemini model with tool use",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Fast Gemini model with tool use",
  },
];

export const titleModel: ChatModel = {
  id: "google/gemini-2.5-flash",
  name: "Gemini 2.5 Flash",
  provider: "google",
  description: "Fast model for title generation",
};

const NO_CAPABILITIES: ModelCapabilities = {
  tools: false,
  vision: false,
  reasoning: false,
};

const capabilitiesByModelId: Record<string, ModelCapabilities> = {
  "google/gemini-2.5-pro": { tools: true, vision: true, reasoning: true },
  "google/gemini-2.5-flash": { tools: true, vision: true, reasoning: true },
};

export function getCapabilities(): Record<string, ModelCapabilities> {
  return Object.fromEntries(
    chatModels.map((model) => [
      model.id,
      capabilitiesByModelId[model.id] ?? NO_CAPABILITIES,
    ])
  );
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));
