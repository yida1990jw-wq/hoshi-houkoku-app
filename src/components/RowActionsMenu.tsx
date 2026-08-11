import { useEffect, useRef, useState } from 'react'

// 表の各行にある「編集」「削除」ボタンを、省スペースな「⋮」メニューにまとめたもの。
// 編集そのものの見た目(その場でのインライン展開)は呼び出し元に任せ、ここではトリガーだけを担う
export function RowActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="row-menu" ref={containerRef}>
      <button type="button" className="row-menu-trigger" onClick={() => setOpen((v) => !v)} aria-label="操作メニュー">
        ⋮
      </button>
      {open && (
        <div className="row-menu-dropdown">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            削除
          </button>
        </div>
      )}
    </div>
  )
}
