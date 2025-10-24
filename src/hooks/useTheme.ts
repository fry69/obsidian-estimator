import { useState, useEffect } from "react";

export type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  if (typeof window !== "undefined" && window.localStorage) {
    const storedTheme = window.localStorage.getItem("theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }

    const userMedia = window.matchMedia("(prefers-color-scheme: dark)");
    if (userMedia.matches) {
      return "dark";
    }
  }
  return "light";
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Update theme when it changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = window.document.documentElement;
    const otherTheme = theme === "dark" ? "light" : "dark";
    root.classList.remove(otherTheme);
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "light" ? "dark" : "light";
      return newTheme;
    });
  };

  return { theme, toggleTheme };
}
