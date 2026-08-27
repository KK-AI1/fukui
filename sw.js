const CACHE_NAME = "dino-map-v2";
const ASSETS = ["./", "./index.html", "./manifest.json"];

// index.html/manifest.jsonなど「アプリの骨格」は毎回まずネットワークから
// 取りに行き、更新をすぐ反映する（オフライン時のみキャッシュにフォールバック）。
// .glb / three.js などの重い静的アセットは変わらないのでキャッシュ優先のままにする。
const NETWORK_FIRST_PATHS = ["/", "/index.html", "/manifest.json", "/sw.js"];

function isNetworkFirst(url){
  return NETWORK_FIRST_PATHS.some(p => url.pathname === p || url.pathname.endsWith(p));
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if(isNetworkFirst(url) || event.request.mode === "navigate"){
    event.respondWith(
      fetch(event.request).then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      }).catch(() => cached);
    })
  );
});
