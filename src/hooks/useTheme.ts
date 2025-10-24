import { useEffect } from "react";
import { usePersistentState } from "./usePersistentState";

export type Theme = "light" | "dark";

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
    }
  );

  // Update document theme class when it changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = window.document.documentElement;
    const otherTheme = theme === "dark" ? "light" : "dark";
    root.classList.remove(otherTheme);
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "light" ? "dark" : "light";
      return newTheme;
    });
  };

  return { theme, toggleTheme };
}
