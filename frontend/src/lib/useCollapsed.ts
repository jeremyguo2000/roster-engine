import { useState } from "react";

export function useCollapsed(
  key: string,
  defaultCollapsed = true,
): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === "true") return true;
      if (raw === "false") return false;
    } catch {}
    return defaultCollapsed;
  });

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(key, next ? "true" : "false");
    } catch {}
  };

  return [collapsed, setCollapsed];
}
