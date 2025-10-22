import { useState, useEffect } from 'react';

const getInitialTheme = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedTheme = window.localStorage.getItem('theme');
    if (typeof storedTheme === 'string') {
      return storedTheme;
    }

    const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
    if (userMedia.matches) {
      return 'dark';
    }
  }
  return 'light';
};

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    setMounted(true);
    const root = window.document.documentElement;
    const initialTheme = getInitialTheme();
    root.classList.remove(initialTheme === 'dark' ? 'light' : 'dark');
    root.classList.add(initialTheme);
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (!mounted) return;

    const root = window.document.documentElement;
    const otherTheme = theme === 'dark' ? 'light' : 'dark';
    root.classList.remove(otherTheme);
    root.classList.add(theme);
    localStorage.setItem('theme', theme);

  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      return newTheme;
    });
  };

  return { theme, toggleTheme };
}
