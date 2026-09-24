import { countryFlag, countryName } from "./view-model";

// Windows draws flag emoji as two letters, so the country name stands in there.
export const flagsShown =
  typeof navigator !== "undefined" && !/Windows/i.test(navigator.userAgent);

/** A country's flag, named on hover; nothing where flags cannot be drawn. */
export function Flag({ code }: { code: string }) {
  const flag = countryFlag(code);
  if (!flagsShown || !flag) return null;
  const name = countryName(code);
  return (
    <span className="flag" role="img" aria-label={name} title={name}>
      {flag}
    </span>
  );
}
