import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  ObjectStore,
  ObjectStoreEntry,
  PutObjectInput,
  StoredObject,
} from "@/src/application/ports/storage/object-store";
import { isSafeObjectKey } from "@/src/domain/storage/object-key";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export type S3ObjectStoreConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Public URL prefix objects are readable at, without a trailing slash. */
  publicUrlBase: string;
  /** MinIO and most self-hosted gateways require path-style addressing. */
  forcePathStyle: boolean;
};

export type S3ObjectStore = ObjectStore & {
  destroy(): void;
};

/**
 * Stores objects in any S3-compatible endpoint — MinIO in the bundled compose
 * stack, or a managed bucket when one is already available.
 */
export function createS3ObjectStore(
  config: S3ObjectStoreConfig
): S3ObjectStore {
  const client = new S3Client({
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });

  const publicUrlBase = config.publicUrlBase.replace(/\/+$/, "");

  return {
    async put(input: PutObjectInput): Promise<StoredObject> {
      if (!isSafeObjectKey(input.key)) {
        throw new Error(`Unsafe object key: ${input.key}`);
      }

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        })
      );

      return {
        url: `${publicUrlBase}/${input.key}`,
        key: input.key,
        contentType: input.contentType,
        size: input.body.byteLength,
      };
    },

    async get(key: string): Promise<ObjectStoreEntry | null> {
      if (!isSafeObjectKey(key)) {
        return null;
      }

      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );

        if (!result.Body) {
          return null;
        }

        return {
          body: await result.Body.transformToByteArray(),
          contentType: result.ContentType ?? DEFAULT_CONTENT_TYPE,
        };
      } catch {
        return null;
      }
    },

    destroy() {
      client.destroy();
    },
  };
}
