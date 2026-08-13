import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublisherYearData } from '../../lib/printData'
import { fillYearEndNoticePdf } from '../../lib/pdfFill'
import { PublisherSwitcher } from '../../components/PublisherSwitcher'
import { PIONEER_TARGET_STATUSES } from '../../types/domain'

export function YearEndNoticePrintPage() {
  const { publisherId, year } = useParams<{ publisherId: string; year: string }>()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('年度末お知らせ.pdf')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publisherId || !year) return
    let cancelled = false
    let objectUrl: string | null = null

    setLoading(true)
    setError(null)
    setPdfUrl(null)

    fetchPublisherYearData(publisherId, Number(year))
      .then(async (data) => {
        const pdfBytes = await fillYearEndNoticePdf(data)
        if (cancelled) return
        const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
        setFileName(`年度末お知らせ_${data.publisher.last_name}${data.publisher.first_name}_${year}.pdf`)
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
          <PublisherSwitcher
            currentId={publisherId}
            buildPath={(id) => `/print/year-end-notice/${id}/${year}`}
            statuses={PIONEER_TARGET_STATUSES}
          />
        )}
        {pdfUrl && (
          <a href={pdfUrl} download={fileName}>
            ダウンロード
          </a>
        )}
      </div>
      {loading && <div className="center-message">PDFを作成中...</div>}
      {error && <div className="center-message error-text">{error}</div>}
      {pdfUrl && <iframe src={pdfUrl} className="pdf-frame" title="年度末お知らせ" />}
    </div>
  )
}
