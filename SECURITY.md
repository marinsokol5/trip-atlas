# Security

Trip Atlas is a local file viewer. Use the latest source revision and its lockfile; older revisions are not maintained as separate security branches.

The production launcher binds `127.0.0.1`, accepts GET/HEAD only, checks the request Host and Origin, and denies cross-origin subresource requests. `TRIP_ATLAS_HOSTS` adds exact host names (no wildcards) to the accepted Host list, with HTTP or HTTPS origins, for a private proxy such as `tailscale serve`; the server still binds only loopback. It serves the built application plus explicitly selected itineraries and their declared local document paths. Selected alternatives have separate document roots and allowlists. Traversal and symlinks outside each root are rejected. JSON reads are capped at 2 MiB; attachments are streamed separately. HTML, SVG, JavaScript and unrecognized document types download with a sandbox policy rather than execute in the viewer's origin. The browser renders itinerary notes as text.

The no-argument launcher and development server expose the bundled public `trips/` directory. Keep private itineraries outside the repository and pass their paths explicitly to `npm start`. Development mode also serves project source: use it only with a trusted checkout and dependencies. The server is intended for direct loopback access or a private tailnet proxy named in `TRIP_ATLAS_HOSTS`, not a public deployment or shared network service: anyone who can reach a listed name can read the itinerary and its documents. Another process or user with access to your local account can access the files and local server; it is not an operating-system sandbox. Opening a downloaded attachment uses the application you choose outside Trip Atlas.

There are no accounts, uploads, write endpoints, analytics or runtime map services. Browser storage holds display preferences, including selected journey identifiers; itinerary content is fetched from local files. Stop the process with Ctrl+C when finished. Dependency installation and optional `npm audit` require network access; using the built viewer does not.

## Reporting

If the repository's Security tab provides **Report a vulnerability**, use that private channel. Otherwise open an issue asking for a private contact without posting exploit details or personal data. A useful report includes the affected revision, a minimal fictional fixture and reproduction steps. Never attach real travel documents, credentials or private itineraries to a public report.
