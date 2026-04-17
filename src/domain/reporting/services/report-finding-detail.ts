type JsonRecord = Record<string, unknown>;

export type FindingLocation = {
  filePath: string | null;
  field: string | null;
  line: number | null;
  column: number | null;
};

export type FindingLocationMetadata = {
  primaryLocation: FindingLocation | null;
  affectedLocations: FindingLocation[];
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseLineFromEvidence(evidence: string | null): number | null {
  if (!evidence) {
    return null;
  }

  const match = /line\s+(\d+)/i.exec(evidence);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLocation(
  value: unknown,
  fallbackFilePath: string | null
): FindingLocation | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const field = asString(record.field);
  const line = asNumber(record.line);
  const column = asNumber(record.column);
  const filePath =
    asString(record.file_path) ?? asString(record.path) ?? fallbackFilePath;

  if (!field && line === null && column === null && !filePath) {
    return null;
  }

  return {
    filePath,
    field,
    line,
    column,
  };
}

function toAffectedLocations(value: unknown): FindingLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }

      const filePath =
        asString(record.file_path) ??
        asString(record.path) ??
        asString(record.file);

      return toLocation(record.location, filePath);
    })
    .filter((entry): entry is FindingLocation => entry !== null);
}

export function extractFindingLocations({
  filePath,
  evidence,
  rawFinding,
}: {
  filePath: string | null;
  evidence: string | null;
  rawFinding: unknown;
}): FindingLocationMetadata {
  const rawRecord = asRecord(rawFinding);
  const rawFilePath = rawRecord ? asString(rawRecord.file_path) : null;

  const affectedLocations = rawRecord
    ? toAffectedLocations(rawRecord.affected_locations)
    : [];

  const explicitPrimaryLocation = rawRecord
    ? toLocation(rawRecord.location, rawFilePath ?? filePath)
    : null;

  const lineFromEvidence = parseLineFromEvidence(evidence);

  const primaryLocation =
    explicitPrimaryLocation ??
    affectedLocations[0] ??
    (rawFilePath || filePath || lineFromEvidence !== null
      ? {
          filePath: rawFilePath ?? filePath ?? null,
          field: null,
          line: null,
          column: null,
        }
      : null);

  if (
    primaryLocation &&
    primaryLocation.line === null &&
    lineFromEvidence !== null
  ) {
    primaryLocation.line = lineFromEvidence;
  }

  return {
    primaryLocation,
    affectedLocations,
  };
}

export function extractStringArrayField(
  rawFinding: unknown,
  fieldName: string
): string[] {
  const record = asRecord(rawFinding);
  if (!record) {
    return [];
  }

  const value = record[fieldName];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => item !== null && item.trim().length > 0);
}
