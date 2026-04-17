import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { ChatModel } from "./models";

const DEFAULT_CONFIG_FILENAME = "local-models.config.json";
const SUPPORTED_PROVIDER_PREFIXES = ["claude-code/", "codex/"] as const;

type RawModelEntry = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
};

type RawLocalModelsConfig = {
  enabled?: unknown;
  models?: unknown;
};

export type LocalCliModelsResolution = {
  enabled: boolean;
  models: ChatModel[];
};

function isSupportedId(id: string) {
  return SUPPORTED_PROVIDER_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function isLocalCliModelId(id: string) {
  return isSupportedId(id);
}

function normalizeModelEntry(entry: RawModelEntry): ChatModel | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isSupportedId(id)) {
    return null;
  }

  const provider = id.split("/", 1)[0];
  const name =
    typeof entry.name === "string" && entry.name.trim()
      ? entry.name.trim()
      : id;
  const description =
    typeof entry.description === "string" ? entry.description.trim() : "";

  return { id, name, provider, description };
}

function resolveConfigPath(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.LOCAL_CLI_MODELS_CONFIG?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), DEFAULT_CONFIG_FILENAME);
}

function readConfigFile(path: string): RawLocalModelsConfig | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RawLocalModelsConfig;
    }
  } catch {
    // Surface as empty config; caller can still pass IDs via LOCAL_CLI_MODELS.
  }
  return null;
}

function parseInlineIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function modelEntryFromId(id: string): ChatModel | null {
  return normalizeModelEntry({ id });
}

export function resolveLocalCliModels(
  env: NodeJS.ProcessEnv = process.env
): LocalCliModelsResolution {
  if (env.NODE_ENV === "production") {
    return { enabled: false, models: [] };
  }

  const configPath = resolveConfigPath(env);
  const fileConfig = readConfigFile(configPath);

  const fileEnabled =
    typeof fileConfig?.enabled === "boolean" ? fileConfig.enabled : undefined;
  const fileModels: ChatModel[] = Array.isArray(fileConfig?.models)
    ? (fileConfig.models as RawModelEntry[])
        .map((entry) => normalizeModelEntry(entry))
        .filter((entry): entry is ChatModel => entry !== null)
    : [];

  const envEnable = env.ENABLE_LOCAL_CLI_MODELS?.trim();
  const inlineIds = parseInlineIds(env.LOCAL_CLI_MODELS);

  let enabled: boolean;
  if (envEnable === "1") enabled = true;
  else if (envEnable === "0") enabled = false;
  else if (inlineIds.length > 0) enabled = true;
  else enabled = fileEnabled ?? false;

  if (!enabled) {
    return { enabled: false, models: [] };
  }

  if (inlineIds.length > 0) {
    const byId = new Map(fileModels.map((model) => [model.id, model]));
    const models = inlineIds
      .map((id) => byId.get(id) ?? modelEntryFromId(id))
      .filter((entry): entry is ChatModel => entry !== null);
    return { enabled: true, models };
  }

  return { enabled: true, models: fileModels };
}
