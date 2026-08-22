import { getContainer } from "@/src/infrastructure";

// Serves objects held by the filesystem object store.
//
// Objects are public, matching the previous hosted-blob behavior: the browser
// serves them by URL, so
// no session cookie is available at read time. Keys are uuid-prefixed and
// unguessable, and the store rejects any key that could escape its root.
//
// With OBJECT_STORE_DRIVER=s3 this route is unused — those URLs point straight
// at the bucket — but it stays mounted so a driver switch needs no redeploy of
// previously stored URLs.

const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const key = path.join("/");

  const entry = await getContainer().ports.objectStore.get(key);

  if (!entry) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(entry.body, {
    headers: {
      "Content-Type": entry.contentType,
      "Content-Length": String(entry.body.byteLength),
      "Cache-Control": CACHE_CONTROL_IMMUTABLE,
    },
  });
}
