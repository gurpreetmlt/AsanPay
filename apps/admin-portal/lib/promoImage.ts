/** Map stored promo paths to portal /api/proxy so images load through the backend API. */
export function resolvePromoImageSrc(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;

  const fileMatch =
    u.match(/\/(?:api\/)?promos\/file\/([^/?#]+)/) ||
    u.match(/\/uploads\/promos\/([^/?#]+)/) ||
    (u.startsWith("http")
      ? (() => {
          try {
            return new URL(u).pathname.match(/\/(?:api\/)?promos\/file\/([^/?#]+)|\/uploads\/promos\/([^/?#]+)/);
          } catch {
            return null;
          }
        })()
      : null);

  const name = fileMatch?.[1] || fileMatch?.[2];
  if (name) return `/api/proxy/promos/file/${encodeURIComponent(name)}`;

  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return u.startsWith("/") ? u : `/${u}`;
}
