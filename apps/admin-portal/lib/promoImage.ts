/** Turn API-relative promo paths into same-origin URLs the browser can load. */
export function resolvePromoImageSrc(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:") || u.startsWith("blob:")) {
    // Prefer same-origin proxy when the absolute URL points at our /uploads/
    try {
      const parsed = new URL(u);
      if (parsed.pathname.startsWith("/uploads/")) return parsed.pathname;
    } catch {
      /* keep absolute */
    }
    return u;
  }
  return u.startsWith("/") ? u : `/${u}`;
}
