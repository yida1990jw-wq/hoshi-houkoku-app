import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublisherCardData } from '../../lib/printData'
import { fillPublisherCardPdf } from '../../lib/pdfFill'
import { PublisherSwitcher } from '../../components/PublisherSwitcher'

export function PublisherCardPrintPage() {
  const { publisherId, year } = useParams<{ publisherId: string; year: string }>()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('伝道者記録.pdf')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publisherId || !year) return
    let cancelled = false
    let objectUrl: string | null = null

    setLoading(true)
    setError(null)
    setPdfUrl(null)

    fetchPublisherCardData(publisherId, Number(year))
      .then(async (data) => {
        const pdfBytes = await fillPublisherCardPdf(data)
        if (cancelled) return
        const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
        setFileName(`伝道者記録_${data.publisher.last_name}${data.publisher.first_name}_${year}.pdf`)
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
  }, [publisherId, year])

  return (
    <div className="pdf-print-page">
      <div className="print-toolbar">
        <Link to="/reports">← 戻る</Link>
        {publisherId && year && (
          <PublisherSwitcher currentId={publisherId} buildPath={(id) => `/print/publisher-card/${id}/${year}`} />
        )}
        {pdfUrl && (
          <a href={pdfUrl} download={fileName}>
            ダウンロード
          </a>
        )}
      </div>
      {loading && <div className="center-message">PDFを作成中...</div>}
      {error && <div className="center-message error-text">{error}</div>}
      {pdfUrl && <iframe src={pdfUrl} className="pdf-frame" title="伝道者記録" />}
    </div>
  )
}
