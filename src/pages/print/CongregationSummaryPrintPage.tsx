import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchCongregationSummaryCardData, type SummaryPattern } from '../../lib/printData'
import { fillCongregationSummaryCardPdf } from '../../lib/pdfFill'

export function CongregationSummaryPrintPage() {
  const { year, pattern } = useParams<{ year: string; pattern: string }>()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('会衆集計.pdf')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!year || !pattern) return
    let cancelled = false
    let objectUrl: string | null = null

    setLoading(true)
    setError(null)
    setPdfUrl(null)

    fetchCongregationSummaryCardData(Number(year), pattern as SummaryPattern)
      .then(async (data) => {
        const pdfBytes = await fillCongregationSummaryCardPdf(data)
        if (cancelled) return
        const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
        setFileName(`会衆集計_${data.label}_${year}.pdf`)
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
  }, [year, pattern])

  return (
    <div className="pdf-print-page">
      <div className="print-toolbar">
        <Link to="/reports">← 戻る</Link>
        {pdfUrl && (
          <a href={pdfUrl} download={fileName}>
            ダウンロード
          </a>
        )}
      </div>
      {loading && <div className="center-message">PDFを作成中...</div>}
      {error && <div className="center-message error-text">{error}</div>}
      {pdfUrl && <iframe src={pdfUrl} className="pdf-frame" title="会衆集計" />}
    </div>
  )
}
