import { useEffect, useLayoutEffect, useState } from "react";

const key = "mrwhite-theme";
const normalize = (value) => (value === "light" ? "light" : "dark");

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return normalize(localStorage.getItem(key));
    } catch {
      return normalize(document.documentElement.dataset.theme);
    }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f1f1f3" : "#19191c");
    try {
      localStorage.setItem(key, theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const sync = (event) => {
      if (
        event.storageArea === localStorage &&
        (event.key === key || event.key === null)
      )
        setTheme(normalize(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return [theme, (value) => setTheme(normalize(value))];
}
