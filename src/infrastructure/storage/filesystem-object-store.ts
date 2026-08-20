import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type {
  ObjectStore,
  ObjectStoreEntry,
  PutObjectInput,
  StoredObject,
} from "@/src/application/ports/storage/object-store";
import { isSafeObjectKey } from "@/src/domain/storage/object-key";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

// Uploads are validated to a small set of image types before they reach the
// store, so recovering the content type from the extension avoids writing a
// sidecar metadata file next to every object.
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
};

export function contentTypeForKey(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? DEFAULT_CONTENT_TYPE;
}

export type FilesystemObjectStoreOptions = {
  /** Directory objects are written under. Created on first write. */
  rootDir: string;
  /** Absolute URL prefix the serving route is mounted at, without a trailing slash. */
  publicUrlBase: string;
};

/**
 * Stores objects on the local filesystem — the zero-dependency default for a
 * self-hosted deployment. Objects are served back through the app's own
 * /api/uploads route rather than by a separate web server.
 */
export function createFilesystemObjectStore(
  options: FilesystemObjectStoreOptions
): ObjectStore {
  const root = resolve(options.rootDir);
  const publicUrlBase = options.publicUrlBase.replace(/\/+$/, "");

  function resolveWithinRoot(key: string): string | null {
    if (!isSafeObjectKey(key)) {
      return null;
    }

    const fullPath = resolve(join(root, key));
    // Defense in depth: isSafeObjectKey already rejects traversal, but the
    // resolved path is re-checked so no future key rule can open an escape.
    if (fullPath !== root && !fullPath.startsWith(root + sep)) {
      return null;
    }

    return fullPath;
  }

  return {
    async put(input: PutObjectInput): Promise<StoredObject> {
      const fullPath = resolveWithinRoot(input.key);
      if (!fullPath) {
        throw new Error(`Unsafe object key: ${input.key}`);
      }

      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, input.body);

      return {
        url: `${publicUrlBase}/${input.key}`,
        key: input.key,
        contentType: input.contentType,
        size: input.body.byteLength,
      };
    },

    async get(key: string): Promise<ObjectStoreEntry | null> {
      const fullPath = resolveWithinRoot(key);
      if (!fullPath) {
        return null;
      }

      try {
        const body = await readFile(fullPath);
        return {
          body: new Uint8Array(body),
          contentType: contentTypeForKey(key),
        };
      } catch {
        return null;
      }
    },
  };
}
