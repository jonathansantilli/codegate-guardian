import { resolveLocalCliModels } from "@/lib/ai/local-models-config";
import {
  chatModels,
  getAllGatewayModels,
  getCapabilities,
  isDemo,
} from "@/lib/ai/models";

const LOCAL_MODEL_CAPABILITIES = {
  tools: false,
  vision: false,
  reasoning: false,
};

export async function GET() {
  const headers = {
    "Cache-Control": "private, no-store",
  };

  const curatedCapabilities = await getCapabilities();
  const { models: localModels } = resolveLocalCliModels();

  const localCapabilities = Object.fromEntries(
    localModels.map((model) => [model.id, LOCAL_MODEL_CAPABILITIES])
  );

  if (isDemo) {
    const models = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      models.map((m) => [m.id, curatedCapabilities[m.id] ?? m.capabilities])
    );

    return Response.json(
      {
        capabilities: { ...capabilities, ...localCapabilities },
        models: [...localModels, ...models],
      },
      { headers }
    );
  }

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
