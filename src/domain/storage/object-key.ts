// Pure key rules for the object store. No I/O, no randomness — the caller
// supplies the unique id so this stays deterministic and testable.

const UNSAFE_CHARACTERS = /[^a-zA-Z0-9._-]/g;
const LEADING_DOTS = /^\.+/;
const PATH_SEPARATORS = /[/\\]/;
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

const CURRENT_DIRECTORY = ".";
const PARENT_DIRECTORY = "..";

const MAX_FILE_NAME_LENGTH = 96;
const MAX_OBJECT_KEY_LENGTH = 512;
const FALLBACK_FILE_NAME = "upload";

/**
 * Reduces a user-supplied filename to a single safe path segment: strips any
 * directory component, replaces anything outside [A-Za-z0-9._-], and refuses
 * to produce a dotfile or an empty name.
 */
export function sanitizeFileName(fileName: string): string {
  const withoutDirectories = fileName.split(PATH_SEPARATORS).pop() ?? "";
  const safe = withoutDirectories
    .replace(UNSAFE_CHARACTERS, "_")
    .replace(LEADING_DOTS, "")
    .slice(0, MAX_FILE_NAME_LENGTH);

  return safe.length > 0 ? safe : FALLBACK_FILE_NAME;
}

/**
 * Builds the storage key for an upload. The id prefix keeps two uploads of
 * the same filename from overwriting each other — the guarantee the hosted
 * blob store used to provide by appending a random suffix.
 */
export function buildObjectKey(input: {
  fileName: string;
  id: string;
}): string {
  return `${input.id}-${sanitizeFileName(input.fileName)}`;
}

/**
 * Guards every path built from an untrusted key. Rejects traversal segments,
 * absolute paths, empty segments, and anything outside the safe alphabet, so
 * a key can never escape the storage root.
 */
export function isSafeObjectKey(key: string): boolean {
  if (key.length === 0 || key.length > MAX_OBJECT_KEY_LENGTH) {
    return false;
  }

  return key
    .split("/")
    .every(
      (segment) =>
        SAFE_SEGMENT.test(segment) &&
        segment !== CURRENT_DIRECTORY &&
        segment !== PARENT_DIRECTORY
    );
}
