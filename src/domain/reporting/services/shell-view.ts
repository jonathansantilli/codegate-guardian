export type ShellView = "chat" | "report";

export function getShellViewFromPathname(pathname: string | null): ShellView {
  if (!pathname || pathname === "/" || pathname === "") {
    return "report";
  }

  if (pathname === "/scan" || pathname.startsWith("/chat/")) {
    return "chat";
  }

  return "report";
}
