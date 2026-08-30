import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isSecureRequest } from "./lib/security/request-protocol";
import { AGENT_ROUTE_PREFIX } from "./src/shared/routes";

/**
 * Reachable without a session: everything else needs one.
 *
 * "/" is the front page, and it is public because the sign-in screen links
 * back to it. It reads nothing and shows nothing about this instance — it
 * describes the product, which is already public knowledge.
 */
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Agents authenticate with a bearer token, not a session cookie, so the
  // session gate must not answer a machine check-in with a sign-in page.
  if (pathname.startsWith(AGENT_ROUTE_PREFIX)) {
    return NextResponse.next();
  }

  // Must match the scheme Auth.js used when it wrote the cookie, not the
  // build mode: a self-hosted instance runs NODE_ENV=production over plain
  // HTTP, where the session cookie carries no __Secure- prefix.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecureRequest(request),
  });

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  // Signing in is how you get in, and the only way.
  //
  // This console previously auto-provisioned a session for anyone who asked,
  // inherited from the chat starter it grew inside. On a fleet security
  // console that meant reaching the port was the whole of authentication: an
  // anonymous caller could read every machine, mint an enrolment code and
  // exchange it for the fleet's ingest token.
  if (!token) {
    if (PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    const signIn = new URL(`${base}/login`, request.url);
    const wanted = new URL(request.url);
    if (wanted.pathname !== "/") {
      signIn.searchParams.set("callbackUrl", wanted.pathname + wanted.search);
    }
    // An API call cannot follow a redirect into a form. Answer it as what it
    // is — unauthenticated — so a script sees 401 rather than a login page
    // with a 200 on it.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(signIn);
  }

  // Signed in, the console is the destination — including from "/", which is
  // the front page for people who do not have an account here. Sending them
  // to "/" instead would now be a redirect to a public path, which loops.
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL(`${base}/fleet`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
