/** Preview helper — data URLs and /api/proxy file / by-id paths. */
export function resolvePromoImageSrc(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;

  const byId =
    u.match(/\/(?:api\/)?(?:proxy\/)?promos\/by-id\/([^/?#]+)/) ||
    (u.startsWith("http")
      ? (() => {
          try {
            return new URL(u).pathname.match(/\/(?:api\/)?promos\/by-id\/([^/?#]+)/);
          } catch {
            return null;
          }
        })()
      : null);
  if (byId?.[1]) return `/api/proxy/promos/by-id/${encodeURIComponent(byId[1])}`;

  const fileMatch =
    u.match(/\/(?:api\/)?promos\/file\/([^/?#]+)/) ||
    u.match(/\/uploads\/promos\/([^/?#]+)/) ||
    (u.startsWith("http")
      ? (() => {
          try {
            return new URL(u).pathname.match(
              /\/(?:api\/)?promos\/file\/([^/?#]+)|\/uploads\/promos\/([^/?#]+)/,
            );
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
