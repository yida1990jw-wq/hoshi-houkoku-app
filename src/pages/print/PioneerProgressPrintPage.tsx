import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { buildPioneerProgressPdf } from '../../lib/pdfReports'

// 開拓者進捗をA4横1ページのPDFにする(1年度分)
export function PioneerProgressPrintPage() {
  const { year } = useParams<{ year: string }>()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!year) return
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setPdfUrl(null)

    buildPioneerProgressPdf(Number(year))
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
  }, [year])

  return (
    <div className="pdf-print-page">
      <div className="print-toolbar">
        <Link to="/pioneer-progress">← 戻る</Link>
        {pdfUrl && (
          <a href={pdfUrl} download={`開拓者進捗_${year}年度.pdf`}>
            ダウンロード
          </a>
        )}
      </div>
      {loading && <div className="center-message">PDFを作成中...</div>}
      {error && <div className="center-message error-text">{error}</div>}
      {pdfUrl && <iframe src={pdfUrl} className="pdf-frame" title="開拓者進捗" />}
    </div>
  )
}
