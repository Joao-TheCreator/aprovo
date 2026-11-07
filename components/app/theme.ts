/**
 * Theme preference (docs/14-redesign-gen-z.md, "Tema").
 * "system" removes data-theme from <html> so CSS follows prefers-color-scheme;
 * "light" / "dark" force a mode. Persisted in localStorage.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "aprovo-theme";
export const THEME_CHANGE_EVENT = "aprovo-theme-change";

/** Inline script run in <head> before paint, so a forced theme never flashes. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private mode / blocked storage: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
