export type ShellView = "chat" | "report" | "fleet";

const FLEET_PATH = "/fleet";

export function getShellViewFromPathname(pathname: string | null): ShellView {
  if (!pathname || pathname === "/" || pathname === "") {
    return "report";
  }

  if (pathname === FLEET_PATH || pathname.startsWith(`${FLEET_PATH}/`)) {
    return "fleet";
  }

  if (pathname === "/scan" || pathname.startsWith("/chat/")) {
    return "chat";
  }

  return "report";
}
