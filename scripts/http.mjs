/** Keep the local viewer out of other websites' origins (including DNS rebinding). */
export function localRequests(req, res, next) {
  const host = req.headers.host;
  const port = req.socket.localPort;
  if (
    ![
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      ...(port === 80 ? ["127.0.0.1", "localhost"] : []),
    ].includes(host) ||
    (req.headers.origin !== undefined &&
      req.headers.origin !== `http://${host}`) ||
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
