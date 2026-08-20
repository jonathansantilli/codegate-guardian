import { resolveLocalCliModels } from "@/lib/ai/local-models-config";
import { chatModels, getCapabilities } from "@/lib/ai/models";

const LOCAL_MODEL_CAPABILITIES = {
  tools: false,
  vision: false,
  reasoning: false,
};

export function GET() {
  const headers = {
    "Cache-Control": "private, no-store",
  };

  const curatedCapabilities = getCapabilities();
  const { models: localModels } = resolveLocalCliModels();

  const localCapabilities = Object.fromEntries(
    localModels.map((model) => [model.id, LOCAL_MODEL_CAPABILITIES])
  );

  if (localModels.length === 0) {
    return Response.json(curatedCapabilities, { headers });
  }

  return Response.json(
    {
      capabilities: { ...curatedCapabilities, ...localCapabilities },
      models: [...localModels, ...chatModels],
    },
    { headers }
  );
}
