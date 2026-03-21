function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function normalizeFilePath(filePath: string): string {
  return filePath
    .trim()
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
}

export function buildGitHubSourceUrl({
  repositoryUrl,
  filePath,
  line,
  ref = "HEAD",
}: {
  repositoryUrl: string | null;
  filePath: string | null;
  line?: number | null;
  ref?: string;
}): string | null {
  if (!repositoryUrl || !filePath) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const owner = encodeURIComponent(parts[0] ?? "");
  const repoRaw = parts[1]?.replace(/\.git$/i, "") ?? "";
  const repo = encodeURIComponent(repoRaw);
  const normalizedPath = normalizeFilePath(filePath);

  if (!owner || !repo || !normalizedPath) {
    return null;
  }

  const encodedPath = normalizedPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  if (!encodedPath) {
    return null;
  }

  const lineAnchor = toPositiveInteger(line) ? `#L${line}` : "";

  return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${encodedPath}${lineAnchor}`;
}
