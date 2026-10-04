/**
 * The address a request came from, for rate limits. Behind a reverse proxy (Render's load balancer, nginx, Caddy) the
 * socket address is the proxy's own, so every player would share one bucket; with `trustProxy` the address the proxy
 * appended to X-Forwarded-For is used instead. The last entry is the one the trusted proxy saw: entries before it come
 * from the client and could be made up. Without a trusted proxy the header is ignored for the same reason. CF-Connecting-IP
 * is not trusted on purpose: TRUST_PROXY=1 is also set behind proxies that pass it through untouched (Render, ngrok), so
 * a player could pick a new address per request. Cloudflare appends the visitor to X-Forwarded-For too (npm run share).
 */
export function clientAddress(request, trustProxy = false) {
  const socket = request.socket?.remoteAddress || 'unknown';
  if (!trustProxy) return socket;
  const header = request.headers?.['x-forwarded-for'];
  const list = (Array.isArray(header) ? header.join(',') : header || '').split(',').map(v => v.trim()).filter(Boolean);
  return (list.at(-1) || socket).slice(0, 64);
}
