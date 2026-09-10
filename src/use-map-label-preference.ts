import { useState } from "react";

export function useMapLabelPreference(key: string, fallback: boolean) {
  const storageKey = `trip-atlas-label-${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* Storage is optional. */
    }
    return fallback;
  });
  return [
    value,
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        /* Keep the preference for this session. */
      }
    },
  ] as const;
}
