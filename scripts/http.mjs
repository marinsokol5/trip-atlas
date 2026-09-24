/**
 * Extra Host names the viewer answers to, such as a tailnet name in front of
 * `tailscale serve`. Comma-separated; a port is part of the name when it is not 80/443.
 */
export function parseAllowedHosts(value = "") {
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => {
      let parsed;
      try {
        parsed = new URL(`http://${host}`);
      } catch {
        /* Reported below. */
      }
      // Letters, digits, dots and hyphens (or a bracketed IPv6 address): no wildcards.
      if (
        !/^([a-z0-9.-]+|\[[0-9a-f:.]+\])(:\d+)?$/.test(host) ||
        parsed?.host !== host
      )
        throw new Error(
          `TRIP_ATLAS_HOSTS: "${host}" is not a host name (write it like your-mac.tailnet.ts.net, without a scheme or path)`,
        );
      return host;
    });
}

/** Keep the local viewer out of other websites' origins (including DNS rebinding). */
export function localRequests(req, res, allowedHosts, next) {
  const host = req.headers.host;
  const port = req.socket.localPort;
  const local = [
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    ...(port === 80 ? ["127.0.0.1", "localhost"] : []),
  ].includes(host);
  // A proxy for a listed name may terminate HTTPS in front of this loopback server.
  const listed = !local && allowedHosts.includes(host?.toLowerCase());
  const origins = [`http://${host}`, ...(listed ? [`https://${host}`] : [])];
  if (
    !(local || listed) ||
    (req.headers.origin !== undefined &&
      !origins.includes(req.headers.origin)) ||
    (["cross-site", "same-site"].includes(req.headers["sec-fetch-site"]) &&
      req.headers["sec-fetch-mode"] !== "navigate")
  ) {
    res.writeHead(403);
    res.end("This viewer only accepts local, same-origin requests");
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

export const appPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
