import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex } from "./lib/constants";
import { isSecureRequest } from "./lib/security/request-protocol";
import { AGENT_ROUTE_PREFIX, UPLOADS_ROUTE_PATH } from "./src/shared/routes";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Agents authenticate with a bearer token, not a session cookie. Without
  // this exemption the session gate would answer a machine check-in with a
  // redirect to guest sign-in.
  if (pathname.startsWith(AGENT_ROUTE_PREFIX)) {
    return NextResponse.next();
  }

  // Stored uploads are public, as they were on the previous hosted blob store:
  // the browser renders them in the transcript and vision models fetch them by
  // URL, with no session cookie to present. Keys are uuid-prefixed and the
  // object store rejects anything that could escape its root.
  if (pathname.startsWith(UPLOADS_ROUTE_PATH)) {
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

  if (!token) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);

    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
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
