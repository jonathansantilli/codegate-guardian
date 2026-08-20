"use client";

import { useEffect } from "react";
import { resolveThemeColor } from "@/lib/theme-color";

function ensureThemeColorMeta() {
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }

  return meta;
}

export function ThemeColorSync() {
  useEffect(() => {
    const html = document.documentElement;
    const meta = ensureThemeColorMeta();

    const apply = () => {
      const isDark = html.classList.contains("dark");
      meta.setAttribute("content", resolveThemeColor(isDark));
    };

    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    apply();

    return () => observer.disconnect();
  }, []);

  return null;
}
