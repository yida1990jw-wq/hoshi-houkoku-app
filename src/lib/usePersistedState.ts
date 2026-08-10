import { useState } from 'react'

function createPersistedStateHook(storage: Storage) {
  return function usePersistedStateWithStorage<T>(key: string, defaultValue: T) {
    const [value, setValue] = useState<T>(() => {
      const stored = storage.getItem(key)
      if (stored === null) return defaultValue
      try {
        return JSON.parse(stored) as T
      } catch {
        return defaultValue
      }
    })

    function set(next: T | ((prev: T) => T)) {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next
        storage.setItem(key, JSON.stringify(resolved))
        return resolved
      })
    }

    return [value, set] as const
  }
}

// ページ(タブ)を切り替えるたびに選択がリセットされるのを防ぐため、localStorageに保持する。
// ブラウザを閉じてもタブ間・再訪問時も保持され続ける(名簿の絞り込み・並び替えなど、次回訪問時も
// 覚えていてほしい設定向け)。
export const usePersistedState = createPersistedStateHook(localStorage)

// 上と同じ挙動だが、sessionStorageに保持する。タブ切り替え(画面遷移)では保持されるが、
// ブラウザ/タブを閉じたり新しく開き直すとリセットされる(年度・月の選択など、起動のたびに
// 最新の状態に戻ってほしいが、作業中は保持していてほしい設定向け)。
export const useSessionPersistedState = createPersistedStateHook(sessionStorage)
