import { useState } from "react";

/** A per-browser on/off preference; works without storage for the session. */
export function useStoredBoolean(storageKey: string, fallback: boolean) {
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
