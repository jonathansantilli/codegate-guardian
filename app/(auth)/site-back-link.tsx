import { ArrowLeftIcon } from "lucide-react";
import { connection } from "next/server";
import { getContainer } from "@/src/infrastructure";

/**
 * Where the product's own site lives, if it is deployed.
 *
 * The page describing CodeGate Guardian is its own deployment, so this screen
 * can only link to it if somebody has said where it is. Unset, no link is
 * rendered at all: a link that returns you to the page you are already on is
 * worse than no link.
 *
 * Read at request time, and deliberately not a NEXT_PUBLIC_ variable. Those are
 * inlined when the image is built, and an image built once and published for
 * everyone to run cannot know anybody's address. `connection()` is what keeps
 * this out of the static shell: without it the value would be baked in at
 * build time just the same, only by a different route.
 */
export async function SiteBackLink() {
  await connection();
  const siteUrl = getContainer().env.SITE_URL;

  if (!siteUrl) {
    // Nothing to go back to. "/" is the console, which is behind this screen
    // — a Back link pointing at it returns the visitor here.
    return <span />;
  }

  return (
    <a
      className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      href={siteUrl}
    >
      <ArrowLeftIcon className="size-3.5" />
      Back
    </a>
  );
}
