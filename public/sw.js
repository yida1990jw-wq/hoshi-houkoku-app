// ホーム画面に追加したときに動くサービスワーカー。
//
// 方針は「更新の取りこぼしを絶対に起こさない」こと。デプロイのたびに内容が変わりうる
// index.html は必ずネットワークを先に見に行き、通信できないときだけキャッシュを使う。
// 逆にファイル名にハッシュが付いていて内容が変わらないもの(assets配下)や、
// 数MBあって取得が重いフォント・帳票テンプレートはキャッシュを優先する。
//
// Supabase への通信は別オリジンなのでここでは一切触らない(常に素通り)。

// 版を上げると、古いキャッシュは activate で丸ごと捨てられる
const CACHE = 'hoshi-houkoku-v2'

// 内容が変わらないので、一度取得したらキャッシュを使ってよいもの
const IMMUTABLE = [/\/assets\//, /\/fonts\//, /\/forms\//, /\.png$/, /\.svg$/]

self.addEventListener('install', (event) => {
  // 新しいサービスワーカーをすぐ有効にする(古い版が残り続けるのを防ぐ)
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    // ブラウザ自身のHTTPキャッシュを経由すると、デプロイ直後でも古い内容が返ることがある
    // (GitHub Pages は index.html に10分間の再利用を指示するため)。
    // ここは「常に最新を取りに行く」経路なので、そのキャッシュを迂回する。
    // mode:'navigate' のリクエストは init 付きで作り直せないため、URLから組み立てる
    const response = await fetch(request.url, { cache: 'no-store' })
    if (response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 別オリジン(Supabaseなど)は扱わない
  if (url.origin !== self.location.origin) return

  // 画面遷移(index.html)は常に最新を取りに行く。オフラインのときだけキャッシュを返す
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (IMMUTABLE.some((re) => re.test(url.pathname))) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})
