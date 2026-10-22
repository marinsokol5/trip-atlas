import { isIP } from "node:net";

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

/**
 * The address the server listens on: loopback unless TRIP_ATLAS_LISTEN names
 * another IP address, such as 0.0.0.0 inside a container.
 */
export function parseListenAddress(value = "") {
  const address = value.trim() || "127.0.0.1";
  if (!isIP(address))
    throw new Error(
      `TRIP_ATLAS_LISTEN: "${address}" is not an IP address (write it like 0.0.0.0, for a container)`,
    );
  return address;
}

/** Keep the local viewer out of other websites' origins (including DNS rebinding). */
export function localRequests(req, res, allowedHosts, next) {
  const host = req.headers.host;
  // Any port: a forwarded port (docker run -p, ssh -L) changes the one the browser
  // sees, and no website can make a browser send these names to this server.
  const local = /^(127(\.\d{1,3}){3}|localhost|\[::1\])(:\d+)?$/.test(
    host ?? "",
  );
  // A proxy for a listed name may terminate HTTPS in front of this server.
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
