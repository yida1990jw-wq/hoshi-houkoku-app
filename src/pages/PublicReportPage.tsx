import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { computeReportPeriod } from '../lib/reportPeriod'
import { CONSIDERATION_REASONS, capConsideredHours, composeRemarks, type ConsiderationReason } from '../lib/reportRules'
import { PIONEER_TARGET_STATUSES, ROSTER_STATUS_ORDER, type PublicPublisher } from '../types/domain'

type Step = 'select' | 'notice' | 'form' | 'done'

const EMPTY_FORM = {
  preached: true,
  auxChoice: 'none' as 'none' | '15' | '30',
  bibleStudies: '0',
  hours: '',
  hasConsideration: false,
  reasons: [] as ConsiderationReason[],
  otherReasonText: '',
  consideredHours: '0',
  remarks: '',
}

export function PublicReportPage() {
  const [publishers, setPublishers] = useState<PublicPublisher[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('select')
  const [publisherId, setPublisherId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [checkingExisting, setCheckingExisting] = useState(false)

  const period = useMemo(() => computeReportPeriod(), [])

  useEffect(() => {
    Promise.resolve(supabase.from('public_publisher_roster').select('*').returns<PublicPublisher[]>())
      .then(({ data, error }) => {
        if (error) throw error
        const sorted = [...(data ?? [])].sort((a, b) => {
          const statusDiff = ROSTER_STATUS_ORDER.indexOf(a.pioneer_status) - ROSTER_STATUS_ORDER.indexOf(b.pioneer_status)
          return statusDiff !== 0 ? statusDiff : (a.romaji ?? '').localeCompare(b.romaji ?? '')
        })
        setPublishers(sorted)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : '名簿の読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const publisher = publishers.find((p) => p.id === publisherId)
  const isPublisherStatus = publisher?.pioneer_status === '伝道者'
  const isPioneerTarget =
    !!publisher && PIONEER_TARGET_STATUSES.includes(publisher.pioneer_status as (typeof PIONEER_TARGET_STATUSES)[number])

  async function handleSelectPublisher(id: string) {
    setPublisherId(id)
    if (!id) return
    setCheckingExisting(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase.rpc('public_report_exists', {
        p_publisher_id: id,
        p_year: period.year,
        p_month: period.month,
      })
      if (error) throw error
      setStep(data ? 'notice' : 'form')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '確認に失敗しました')
    } finally {
      setCheckingExisting(false)
    }
  }

  function handleCancelNotice() {
    setPublisherId('')
    setStep('select')
  }

  function handleContinueFromNotice() {
    setForm(EMPTY_FORM)
    setStep('form')
  }

  function toggleReason(reason: ConsiderationReason) {
    setForm((f) => {
      if (reason === '開拓者学校') {
        return { ...f, reasons: f.reasons.includes('開拓者学校') ? [] : ['開拓者学校'] }
      }
      const withoutSchool = f.reasons.filter((r) => r !== '開拓者学校')
      const has = withoutSchool.includes(reason)
      return { ...f, reasons: has ? withoutSchool.filter((r) => r !== reason) : [...withoutSchool, reason] }
    })
  }

  async function handleSubmit() {
    if (!publisher) return
    setValidationError(null)
    setSubmitError(null)

    const hoursNum = isPublisherStatus ? 0 : Number(form.hours) || 0
    if (!isPublisherStatus && form.hours.trim() === '') {
      setValidationError('時間を入力してください')
      return
    }

    // 月間要求時間に満たない場合、備考への記入を必須にする
    if (isPioneerTarget && publisher.monthly_hour_target && hoursNum < publisher.monthly_hour_target && !form.remarks.trim()) {
      setValidationError('要求時間に満たない月は、備考欄に理由の記入が必要です')
      return
    }
    if (form.hasConsideration && form.reasons.length === 0) {
      setValidationError('考慮の理由を選択してください')
      return
    }
    if (form.hasConsideration && form.reasons.includes('その他') && !form.otherReasonText.trim()) {
      setValidationError('「その他」の内容を入力してください')
      return
    }

    const consideredHoursRaw = form.hasConsideration ? Number(form.consideredHours) || 0 : 0
    const cappedConsideredHours = form.hasConsideration
      ? capConsideredHours(hoursNum, consideredHoursRaw, form.reasons)
      : 0

    const auxChoice = form.auxChoice === 'none' ? null : form.auxChoice
    const remarks = composeRemarks({
      auxChoice,
      reasons: form.hasConsideration ? form.reasons : [],
      otherReasonText: form.otherReasonText,
      consideredHoursRaw,
      cappedConsideredHours,
      ownRemarks: form.remarks,
    })

    const pioneerStatusSnapshot = auxChoice ? '補助開拓者' : publisher.pioneer_status

    setSubmitting(true)
    try {
      const { error } = await supabase.from('service_reports').upsert(
        {
          publisher_id: publisher.id,
          year: period.year,
          month: period.month,
          preached: form.preached,
          bible_studies: Number(form.bibleStudies) || 0,
          hours: hoursNum,
          considered_hours: cappedConsideredHours,
          remarks: remarks || null,
          pioneer_status_snapshot: pioneerStatusSnapshot,
        },
        { onConflict: 'publisher_id,year,month' },
      )
      if (error) throw error
      setStep('done')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="login-page">
      <div className="login-form" style={{ maxWidth: 480 }}>
        <h1>野外奉仕の報告</h1>
        <p className="reports-hint">
          対象月: {period.year}年度{period.month}月
        </p>
        {loadError && <p className="error-text">{loadError}</p>}

        {step === 'select' && (
          <label>
            氏名
            <select value={publisherId} onChange={(e) => handleSelectPublisher(e.target.value)} disabled={checkingExisting}>
              <option value="">選択してください</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.last_name} {p.first_name}
                </option>
              ))}
            </select>
          </label>
        )}

        {step === 'notice' && publisher && (
          <div>
            <p>
              {publisher.last_name} {publisher.first_name}さんの{period.year}年度{period.month}月の報告はすでに提出されています。
              修正がある場合はこのまま入力・送信すると内容が上書きされます。修正が不要であれば「キャンセル」を押してください。
            </p>
            <div className="publisher-form-actions">
              <button type="button" onClick={handleContinueFromNotice}>
                修正して送信する
              </button>
              <button type="button" onClick={handleCancelNotice}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        {step === 'form' && publisher && (
          <div>
            <p>
              {publisher.last_name} {publisher.first_name}さんの{period.year}年度{period.month}月分の報告
            </p>
            <label>
              1ヵ月間に何らかの形で伝道に参加しましたか
              <select value={form.preached ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, preached: e.target.value === '1' }))}>
                <option value="1">はい</option>
                <option value="0">いいえ</option>
              </select>
            </label>

            {isPublisherStatus && (
              <label>
                補助開拓を行いましたか
                <select value={form.auxChoice} onChange={(e) => setForm((f) => ({ ...f, auxChoice: e.target.value as typeof f.auxChoice }))}>
                  <option value="none">いいえ</option>
                  <option value="15">15時間</option>
                  <option value="30">30時間</option>
                </select>
              </label>
            )}

            <label>
              研究
              <input type="number" min="0" value={form.bibleStudies} onChange={(e) => setForm((f) => ({ ...f, bibleStudies: e.target.value }))} />
              <span className="reports-hint">司会した個別の聖書研究の数(回数ではなく件数)</span>
            </label>

            {!isPublisherStatus && (
              <label>
                時間
                <input type="number" min="0" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
                <span className="reports-hint">
                  1時間単位での報告。端数は次月に繰り越して報告してください。実際に野外奉仕にあてた時間を報告してください。(考慮時間のある方は、その時間を足さずに報告)
                </span>
              </label>
            )}

            {isPioneerTarget && (
              <>
                <label>
                  考慮対象の奉仕や学校に参加しましたか
                  <select
                    value={form.hasConsideration ? '1' : '0'}
                    onChange={(e) => setForm((f) => ({ ...f, hasConsideration: e.target.value === '1' }))}
                  >
                    <option value="0">いいえ</option>
                    <option value="1">はい</option>
                  </select>
                  <span className="reports-hint">大会に関連した部門奉仕や支部主催の学校など。</span>
                </label>

                {form.hasConsideration && (
                  <>
                    <div className="crud-checkbox-group">
                      {CONSIDERATION_REASONS.map((r) => (
                        <label key={r}>
                          <input type="checkbox" checked={form.reasons.includes(r)} onChange={() => toggleReason(r)} />
                          {r}
                        </label>
                      ))}
                    </div>
                    {form.reasons.includes('その他') && (
                      <label>
                        その他の内容
                        <input
                          value={form.otherReasonText}
                          onChange={(e) => setForm((f) => ({ ...f, otherReasonText: e.target.value }))}
                        />
                      </label>
                    )}
                    <label>
                      考慮時間
                      <input
                        type="number"
                        min="0"
                        value={form.consideredHours}
                        onChange={(e) => setForm((f) => ({ ...f, consideredHours: e.target.value }))}
                      />
                      <span className="reports-hint">
                        1時間単位で記入ください。理由が複数ある方、それぞれの時間を合計してください。他の月に振り分けたり、繰り越したりはできません。
                      </span>
                    </label>
                  </>
                )}
              </>
            )}

            <label>
              備考
              <input value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
              <span className="reports-hint">連絡事項。要求時間を満たせなかった理由など。何もなければ空欄のままでお願いします。</span>
            </label>

            {validationError && <p className="error-text">{validationError}</p>}
            {submitError && <p className="error-text">{submitError}</p>}
            <div className="publisher-form-actions">
              <button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '送信中...' : '送信する'}
              </button>
              <button type="button" onClick={() => setStep('select')} disabled={submitting}>
                やり直す
              </button>
            </div>
          </div>
        )}

        {step === 'done' && <p>送信しました。ありがとうございました。</p>}
      </div>
    </div>
  )
}
