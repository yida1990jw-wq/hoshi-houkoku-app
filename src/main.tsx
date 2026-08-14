import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ホーム画面に追加(PWA)のためのサービスワーカー。
// 開発中は登録しない(キャッシュがHMRと干渉して、直したはずの内容が反映されないため)。
// 動作確認は `npm run build` してから `npm run preview` で行う
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // 登録できなくてもアプリ自体は通常どおり動くので、ここでは何もしない
    })
  })
}
