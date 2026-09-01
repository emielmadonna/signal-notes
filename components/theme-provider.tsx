"use client";

// Theme system (DESIGN-SPEC §1: two themes, DARK IS DEFAULT, toggle in
// header, persisted). The current theme lives as a data-theme attribute on
// <html>. It is persisted in BOTH localStorage and the sn-theme cookie: the
// cookie lets the server (app/layout.tsx) render the correct theme with no
// flash; localStorage survives cookie clearing and re-seeds the cookie.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

/** Cookie name the server reads in app/layout.tsx. */
export const THEME_COOKIE = "sn-theme";

const STORAGE_KEY = "sn-theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function persist(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage can be unavailable (private mode); the cookie still
    // persists the choice, so this is safe to ignore.
  }
  // One year; Lax so it rides every normal navigation the server renders.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    persist(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, []);

  // If localStorage remembers a choice the cookie lost (cookie cleared or
  // expired), re-apply it once on mount and re-seed the cookie.
  //
  // This IS a setState in an effect body, and it is the justified case the
  // rule exists to make rare: localStorage cannot be read while rendering on
  // the server, so the stored preference genuinely cannot be known until
  // after mount. Reading it in a lazy useState initializer instead would
  // produce a hydration mismatch — the server has already painted the cookie
  // theme. The cost is one extra render, once, only for the users whose
  // cookie and localStorage disagree.
  //
  // The suppression is deliberately scoped to this single call. Everywhere
  // else in the codebase the rule is enforced (see lib/workspace-data.ts,
  // where the same pattern was moved into the retry handler instead).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Unavailable storage means nothing to restore; keep the server theme.
    }
    if ((stored === "dark" || stored === "light") && stored !== initialTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above this effect
      setThemeState(stored);
      persist(stored);
    }
    // Run once against the server-rendered starting point only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Toggle hook for the header button and anything else that switches theme. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
