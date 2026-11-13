// 网不好也能打开：先上网拿最新的页面；4 秒没拿到或断网，就用上次存在手机里的那份。
// 只管本站自己的文件（页面、图标）；YouTube 伴奏本来就要网。
const C = "singokay-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname === "/version.txt") return;
  e.respondWith((async () => {
    const cache = await caches.open(C);
    const net = fetch(r).then(res => { if (res.ok) cache.put(r.mode === "navigate" ? "/index.html" : r, res.clone()); return res; });
    const timeout = new Promise(res => setTimeout(res, 4000));
    try {
      const res = await Promise.race([net, timeout]);
      if (res) return res;
    } catch (err) {}
    const hit = await cache.match(r.mode === "navigate" ? "/index.html" : r);
    return hit || net;
  })());
});
