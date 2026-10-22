const CACHE_NAME = "dino-map-v3";
const ASSETS = ["./", "./index.html", "./manifest.json"];

// index.html/manifest.jsonなど「アプリの骨格」は毎回まずネットワークから
// 取りに行き、更新をすぐ反映する（オフライン時のみキャッシュにフォールバック）。
// .glb / three.js などの重い静的アセットは、キャッシュがあればまず即座に
// それを返しつつ裏で必ず再取得してキャッシュを更新する（stale-while-revalidate）。
// 以前は単純なキャッシュ優先だったため、同じファイル名のまま中身だけ差し替えた
// 場合（.glbモデルの軽量化・差し替えなど）に、一度でもキャッシュした端末では
// 古い中身がずっと表示され続けるという問題があった。
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
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const update = fetch(event.request).then(res => {
          cache.put(event.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || update;
      })
    )
  );
});
