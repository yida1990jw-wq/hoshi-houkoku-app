import { Link } from 'react-router-dom'

export function PrintToolbar({ backTo }: { backTo: string }) {
  return (
    <div className="print-toolbar">
      <Link to={backTo}>← 戻る</Link>
      <button type="button" className="primary" onClick={() => window.print()}>
        印刷 / PDFに保存
      </button>
    </div>
  )
}
