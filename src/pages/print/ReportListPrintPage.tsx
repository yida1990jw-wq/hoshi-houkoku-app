import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { buildReportListPdf } from '../../lib/pdfReports'

// 報告一覧をA4縦1ページのPDFにする(上部の立場別集計も含む)
export function ReportListPrintPage() {
  const { year, month } = useParams<{ year: string; month: string }>()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!year || !month) return
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setPdfUrl(null)

    buildReportListPdf(Number(year), Number(month))
      .then((bytes) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        setPdfUrl(objectUrl)
      })
      .catch((e) => {
        if (!cancelled) setError((e as { message?: string })?.message || '作成に失敗しました')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [year, month])

  return (
    <div className="pdf-print-page">
      <div className="print-toolbar">
        <Link to="/">← 戻る</Link>
        {pdfUrl && (
          <a href={pdfUrl} download={`報告一覧_${year}年度${month}月.pdf`}>
            ダウンロード
          </a>
        )}
      </div>
      {loading && <div className="center-message">PDFを作成中...</div>}
      {error && <div className="center-message error-text">{error}</div>}
      {pdfUrl && <iframe src={pdfUrl} className="pdf-frame" title="報告一覧" />}
    </div>
  )
}
