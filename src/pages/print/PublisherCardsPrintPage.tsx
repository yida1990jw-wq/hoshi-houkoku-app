import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublisherCardsData, type PublisherCardsScope } from '../../lib/printData'
import { fillPublisherCardsPdf } from '../../lib/pdfFill'

// 伝道者記録の一括出力(1人1ページ)。scopeは「pioneers」か、グループのidそのもの
export function PublisherCardsPrintPage() {
  const { scope, year } = useParams<{ scope: string; year: string }>()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('伝道者記録.pdf')
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // 個人の伝道者記録と同じく、年度途中で未確定の集計を出したくない場合に隠せるようにする
  const [showTotals, setShowTotals] = useState(true)

  useEffect(() => {
    if (!scope || !year) return
    let cancelled = false
    let objectUrl: string | null = null

    setLoading(true)
    setError(null)
    setPdfUrl(null)

    const target: PublisherCardsScope = scope === 'pioneers' ? { kind: 'pioneers' } : { kind: 'group', groupId: scope }

    fetchPublisherCardsData(target, Number(year))
      .then(async (data) => {
        if (data.cards.length === 0) throw new Error('対象になる在籍者がいませんでした')
        const pdfBytes = await fillPublisherCardsPdf(data.cards, { showSelectedYearTotals: showTotals })
        if (cancelled) return
        const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
        setCount(data.cards.length)
        setFileName(`伝道者記録_${data.label}_${year}.pdf`)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [scope, year, showTotals])

  return (
    <div className="pdf-print-page">
      <div className="print-toolbar">
        <Link to="/reports">← 戻る</Link>
        {pdfUrl && <span className="print-toolbar-note">{count}名分</span>}
        <label className="print-toolbar-checkbox">
          <input type="checkbox" checked={showTotals} onChange={(e) => setShowTotals(e.target.checked)} />
          選択年度の集計欄を表示
        </label>
        {pdfUrl && (
          <a href={pdfUrl} download={fileName}>
            ダウンロード
          </a>
        )}
      </div>
      {loading && <div className="center-message">PDFを作成中...</div>}
      {error && <div className="center-message error-text">{error}</div>}
      {pdfUrl && <iframe src={pdfUrl} className="pdf-frame" title="伝道者記録(一括)" />}
    </div>
  )
}
