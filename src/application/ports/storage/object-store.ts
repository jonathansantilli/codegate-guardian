export type StoredObject = {
  /** Absolute URL a browser (or a vision model) can fetch the object from. */
  url: string;
  key: string;
  contentType: string;
  size: number;
};

export type PutObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
};

export type ObjectStoreEntry = {
  body: Uint8Array;
  contentType: string;
};

export type ObjectStore = {
  put(input: PutObjectInput): Promise<StoredObject>;
  /** Returns null when the key is absent or unsafe. */
  get(key: string): Promise<ObjectStoreEntry | null>;
};
