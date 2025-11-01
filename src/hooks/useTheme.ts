import { useEffect, useLayoutEffect } from "react";
import { usePersistentState } from "./usePersistentState.ts";

export type Theme = "light" | "dark";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const getPreferredTheme = (): Theme => {
  if (typeof window !== "undefined") {
    const userMedia = window.matchMedia("(prefers-color-scheme: dark)");
    if (userMedia.matches) {
      return "dark";
    }
  }
  return "light";
};

const isThemeValue = (value: Theme) => value === "light" || value === "dark";

export function useTheme() {
  const [theme, setTheme] = usePersistentState<Theme>(
    "theme",
    getPreferredTheme(),
    {
      validate: isThemeValue,
    },
  );

  // Update document theme class when it changes
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = window.document.documentElement;
    const otherTheme = theme === "dark" ? "light" : "dark";
    root.classList.remove(otherTheme);
    root.classList.add(theme);
    root.classList.add("theme-ready");
    root.style.colorScheme = theme;

    const background = window
      .getComputedStyle(root)
      .getPropertyValue("--background")
      .trim();

    if (background) {
      root.style.backgroundColor = background;
      if (window.document.body) {
        window.document.body.style.backgroundColor = background;
      }
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "light" ? "dark" : "light";
      return newTheme;
    });
  };

  return { theme, toggleTheme };
}
