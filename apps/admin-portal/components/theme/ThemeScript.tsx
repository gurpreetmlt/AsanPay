/** Inline script — prevents theme flash before React hydrates. */
export function ThemeScript() {
  const code = `
(function() {
  try {
    var t = localStorage.getItem('asanpay-admin-theme') || 'auto';
    var h = new Date().getHours();
    var night = h >= 19 || h < 7;
    var dark = t === 'dark' || (t === 'auto' && night);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.adminTheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
