export const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
export const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";

export function resolveThemeColor(isDark: boolean) {
  return isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}
