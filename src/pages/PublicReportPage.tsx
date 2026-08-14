import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { computeReportPeriod } from '../lib/reportPeriod'
import { CONSIDERATION_REASONS, capConsideredHours, composeRemarks, type ConsiderationReason } from '../lib/reportRules'
import { PIONEER_TARGET_STATUSES, type PublicPublisherMatch } from '../types/domain'

type Step = 'name' | 'confirm' | 'notice' | 'form' | 'done'

type AuxChoice = 'none' | '15' | '30'

const EMPTY_FORM = {
  preached: null as boolean | null,
  auxChoice: null as AuxChoice | null,
  bibleStudies: '0',
  hours: '',
  hasConsideration: null as boolean | null,
  reasons: [] as ConsiderationReason[],
  otherReasonText: '',
  consideredHours: '0',
  remarks: '',
}

function YesNoButtons({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="yes-no-buttons">
      <button type="button" className={value === true ? 'active' : ''} onClick={() => onChange(true)}>
        はい
      </button>
      <button type="button" className={value === false ? 'active' : ''} onClick={() => onChange(false)}>
        いいえ
      </button>
    </div>
  )
}

function AuxChoiceButtons({ value, onChange }: { value: AuxChoice | null; onChange: (v: AuxChoice) => void }) {
  return (
    <div className="yes-no-buttons">
      <button type="button" className={value === 'none' ? 'active' : ''} onClick={() => onChange('none')}>
        いいえ
      </button>
      <button type="button" className={value === '15' ? 'active' : ''} onClick={() => onChange('15')}>
        15時間
      </button>
      <button type="button" className={value === '30' ? 'active' : ''} onClick={() => onChange('30')}>
        30時間
      </button>
    </div>
  )
}

export function PublicReportPage() {
  // ログイン中(管理者・監督者)がこの画面に来た場合だけ、管理画面への戻り道を出す。
  // ホーム画面に追加して開くと戻るボタンが無く行き止まりになるため
  const { session } = useAuth()
  const [step, setStep] = useState<Step>('name')
  const [nameInput, setNameInput] = useState('')
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<PublicPublisherMatch | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [reportExists, setReportExists] = useState(false)

  const period = useMemo(() => computeReportPeriod(), [])

  const publisher = candidate
  const isPublisherStatus = publisher?.pioneer_status === '伝道者'
  // 伝道者でもその月に補助開拓(15h/30h)を行った場合は時間の報告が必要
  const needsHours = !isPublisherStatus || form.auxChoice === '15' || form.auxChoice === '30'
  const isPioneerTarget =
    !!publisher && PIONEER_TARGET_STATUSES.includes(publisher.pioneer_status as (typeof PIONEER_TARGET_STATUSES)[number])

  // 本人が確定した後、対象月の報告が既にあるかを確認してnotice/formへ進む
  async function proceedWithPublisher(p: PublicPublisherMatch) {
    setCheckingExisting(true)
    setMatchError(null)
    try {
      const { data, error } = await supabase.rpc('public_report_exists', {
        p_publisher_id: p.id,
        p_year: period.year,
        p_month: period.month,
      })
      if (error) throw error
      setReportExists(!!data)
      setStep(data ? 'notice' : 'form')
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : '確認に失敗しました')
    } finally {
      setCheckingExisting(false)
    }
  }

  async function handleLookupName() {
    const name = nameInput.trim()
    if (!name) {
      setMatchError('氏名を入力してください')
      return
    }
    setMatching(true)
    setMatchError(null)
    setForm(EMPTY_FORM)
    setValidationError(null)
    setSubmitError(null)
    try {
      const { data, error } = await supabase.rpc('public_match_publisher', { p_name: name })
      if (error) throw error
      const match = (data as PublicPublisherMatch[] | null)?.[0] ?? null
      if (!match) {
        setMatchError('名前が見つかりませんでした。表記をご確認いただくか、担当者にご連絡ください。')
        return
      }
      setCandidate(match)
      if (match.exact) {
        await proceedWithPublisher(match)
      } else {
        setStep('confirm')
      }
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : '確認に失敗しました')
    } finally {
      setMatching(false)
    }
  }

  function handleConfirmNo() {
    setCandidate(null)
    setMatchError(null)
    setStep('name')
  }

  async function handleConfirmYes() {
    if (!candidate) return
    await proceedWithPublisher(candidate)
  }

  function handleCancelNotice() {
    setCandidate(null)
    setNameInput('')
    setReportExists(false)
    setValidationError(null)
    setSubmitError(null)
    setStep('name')
  }

  function handleContinueFromNotice() {
    setForm(EMPTY_FORM)
    setValidationError(null)
    setSubmitError(null)
    setStep('form')
  }

  function handleRestart() {
    setCandidate(null)
    setNameInput('')
    setReportExists(false)
    setForm(EMPTY_FORM)
    setValidationError(null)
    setSubmitError(null)
    setMatchError(null)
    setStep('name')
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

  async function submitReport(fields: {
    preached: boolean
    bible_studies: number
    hours: number
    considered_hours: number
    remarks: string | null
    pioneer_status_snapshot: string
    no_count: boolean
  }) {
    if (!publisher) return
    setSubmitting(true)
    try {
      // 未ログイン(anon)にはservice_reportsの閲覧(select)権限を与えていないため、
      // upsert()のON CONFLICT経路(内部的にSELECT権限を要求する)はRLSで弾かれる。
      // 既に存在するかは事前のpublic_report_existsで分かっているので、insert/updateを分けて呼ぶ
      const { error } = reportExists
        ? await supabase
            .from('service_reports')
            .update(fields)
            .match({ publisher_id: publisher.id, year: period.year, month: period.month })
        : await supabase
            .from('service_reports')
            .insert({ publisher_id: publisher.id, year: period.year, month: period.month, ...fields })
      if (error) throw error
      setStep('done')
    } catch (e) {
      const message = e instanceof Error ? e.message : '送信に失敗しました'
      const code = (e as { code?: string })?.code
      setSubmitError(code ? `${message}(${code})` : message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!publisher) return
    setValidationError(null)
    setSubmitError(null)

    if (form.preached === null) {
      setValidationError('宣教を行ったかどうかを選択してください')
      return
    }

    // 伝道に参加していない月は、以降の項目を尋ねず空の報告として送信する
    if (form.preached === false) {
      await submitReport({
        preached: false,
        bible_studies: 0,
        hours: 0,
        considered_hours: 0,
        remarks: null,
        pioneer_status_snapshot: publisher.pioneer_status,
        // 管理者側の手入力・取込と同じく、伝道していない月の報告は集計対象から外す
        no_count: true,
      })
      return
    }

    if (isPublisherStatus && form.auxChoice === null) {
      setValidationError('補助開拓を行ったかどうかを選択してください')
      return
    }
    if (isPioneerTarget && form.hasConsideration === null) {
      setValidationError('考慮対象の奉仕や学校に参加したかどうかを選択してください')
      return
    }

    const hoursNum = needsHours ? Number(form.hours) || 0 : 0
    if (needsHours && form.hours.trim() === '') {
      setValidationError('時間を入力してください')
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

    // 月間要求時間に満たない場合、備考への記入を必須にする(考慮時間を含めた時間で判定する)
    if (
      isPioneerTarget &&
      publisher.monthly_hour_target &&
      hoursNum + cappedConsideredHours < publisher.monthly_hour_target &&
      !form.remarks.trim()
    ) {
      setValidationError('要求時間に満たない月は、備考欄に理由の記入が必要です')
      return
    }

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

    await submitReport({
      preached: form.preached ?? false,
      bible_studies: Number(form.bibleStudies) || 0,
      hours: hoursNum,
      considered_hours: cappedConsideredHours,
      remarks: remarks || null,
      pioneer_status_snapshot: pioneerStatusSnapshot,
      no_count: false,
    })
  }

  return (
    <div className="login-page login-page-top">
      <div className="login-form" style={{ maxWidth: 480 }}>
        {/* ログイン中(管理者・監督者)が管理画面から来た場合だけ戻り道を出す。
            ホーム画面に追加して開くと戻るボタンが画面に無く、行き止まりになるため。
            リンクを受け取って開いた伝道者には表示されない */}
        {session && (
          <p style={{ margin: '0 0 12px' }}>
            <Link to="/submission-status">← 管理画面に戻る</Link>
          </p>
        )}
        <h1>野外奉仕の報告</h1>
        <p className="reports-hint">
          対象月: {period.year}年度{period.month}月
        </p>

        {step === 'name' && (
          <div>
            <label>
              氏名
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookupName()
                }}
                placeholder="姓名を入力してください"
                disabled={matching || checkingExisting}
              />
            </label>
            {matchError && <p className="error-text">{matchError}</p>}
            <div className="publisher-form-actions">
              <button type="button" onClick={handleLookupName} disabled={matching || checkingExisting}>
                {matching || checkingExisting ? '確認中...' : '次へ'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && candidate && (
          <div>
            <p>
              「{nameInput}」で検索しましたが、表記が一致しませんでした。
              <br />
              <span className="pr-greeting">
                {candidate.last_name} {candidate.first_name}
              </span>
              さんのお名前でお間違いないですか?
            </p>
            {matchError && <p className="error-text">{matchError}</p>}
            <div className="publisher-form-actions">
              <button type="button" onClick={handleConfirmYes} disabled={checkingExisting}>
                {checkingExisting ? '確認中...' : 'はい、私です'}
              </button>
              <button type="button" onClick={handleConfirmNo} disabled={checkingExisting}>
                いいえ、違います
              </button>
            </div>
          </div>
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
            <p className="pr-greeting">
              {publisher.last_name} {publisher.first_name}さんの{period.year}年度{period.month}月分の報告
            </p>
            <div className="yes-no-field">
              <span className="pr-question">1ヵ月間に何らかの形で伝道に参加しましたか</span>
              <YesNoButtons value={form.preached} onChange={(v) => setForm((f) => ({ ...f, preached: v }))} />
            </div>

            {form.preached !== false && (
              <>
                <label>
                  <span className="pr-question">研究</span>
                  <input
                    type="number"
                    min="0"
                    value={form.bibleStudies}
                    onChange={(e) => setForm((f) => ({ ...f, bibleStudies: e.target.value }))}
                  />
                  <span className="reports-hint pr-hint">司会した個別の聖書研究の数(回数ではなく件数)</span>
                </label>

                {isPublisherStatus && (
                  <div className="yes-no-field">
                    <span className="pr-question">補助開拓を行いましたか</span>
                    <AuxChoiceButtons value={form.auxChoice} onChange={(v) => setForm((f) => ({ ...f, auxChoice: v }))} />
                  </div>
                )}

                {needsHours && (
                  <label>
                    <span className="pr-question">時間</span>
                    <input type="number" min="0" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
                    <span className="reports-hint pr-hint">
                      1時間単位での報告。端数は次月に繰り越して報告してください。実際に野外奉仕にあてた時間を報告してください。(考慮時間のある方は、その時間を足さずに報告)
                    </span>
                  </label>
                )}

                {isPioneerTarget && (
                  <>
                    <div className="yes-no-field">
                      <span className="pr-question">考慮対象の奉仕や学校に参加しましたか</span>
                      <YesNoButtons value={form.hasConsideration} onChange={(v) => setForm((f) => ({ ...f, hasConsideration: v }))} />
                      <span className="reports-hint pr-hint">大会に関連した部門奉仕や支部主催の学校など。</span>
                    </div>

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
                            <span className="pr-question">その他の内容</span>
                            <input
                              value={form.otherReasonText}
                              onChange={(e) => setForm((f) => ({ ...f, otherReasonText: e.target.value }))}
                            />
                          </label>
                        )}
                        <label>
                          <span className="pr-question">考慮時間</span>
                          <input
                            type="number"
                            min="0"
                            value={form.consideredHours}
                            onChange={(e) => setForm((f) => ({ ...f, consideredHours: e.target.value }))}
                          />
                          <span className="reports-hint pr-hint">
                            1時間単位で記入ください。理由が複数ある方、それぞれの時間を合計してください。他の月に振り分けたり、繰り越したりはできません。
                          </span>
                        </label>
                      </>
                    )}
                  </>
                )}

                <label>
                  <span className="pr-question">備考</span>
                  <input value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
                  <span className="reports-hint pr-hint">連絡事項。要求時間を満たせなかった理由など。何もなければ空欄のままでお願いします。</span>
                </label>
              </>
            )}

            {validationError && <p className="error-text">{validationError}</p>}
            {submitError && <p className="error-text">{submitError}</p>}
            <div className="publisher-form-actions">
              <button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '送信中...' : '送信する'}
              </button>
              <button type="button" onClick={handleRestart} disabled={submitting}>
                やり直す
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div>
            <p>
              送信しました。ありがとうございました。
              {!session && 'このページは閉じていただいて構いません。'}
            </p>
            <div className="publisher-form-actions">
              {session && (
                <Link className="header-button" to="/submission-status">
                  管理画面に戻る
                </Link>
              )}
              <button type="button" onClick={handleRestart}>
                はじめから
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
