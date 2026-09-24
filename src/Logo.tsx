/** The Trip Atlas mark: a folded map with a route to a pin. Matches public/favicon.svg. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--logo)" />
      <path d="M13 18 25 13v33l-12 5zM39 18l12-5v33l-12 5z" fill="#fff" />
      <path d="m25 13 14 5v33l-14-5z" fill="#c9dcf5" />
      <path
        d="M18 41c6-11 14-1 26-16"
        fill="none"
        stroke="var(--logo)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="18" cy="41" r="2.8" fill="var(--logo)" />
      <circle
        cx="44"
        cy="25"
        r="4.2"
        fill="#f0a531"
        stroke="#fff"
        strokeWidth="1.5"
      />
    </svg>
  );
}
