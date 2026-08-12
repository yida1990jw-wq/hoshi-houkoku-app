import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { RowActionsMenu } from '../components/RowActionsMenu'
import {
  DEDICATIONS,
  GENDERS,
  HOPES,
  PIONEER_STATUSES,
  PIONEER_TARGET_STATUSES,
  QUALIFICATIONS,
  ROSTER_STATUS_ORDER,
  type Group,
  type Publisher,
} from '../types/domain'
import { isoDateToYearMonth, yearMonthToIsoDate } from '../lib/dateFormat'
import {
  mapDedication,
  mapGender,
  mapHope,
  mapPioneerStatus,
  mapQualification,
  parseFlexibleDate,
  parseFlexibleYearMonth,
} from '../lib/importParsing'

const PIONEER_TYPE_STATUSES = ['補助開拓者', '正規開拓者', '特別開拓者', '野外の宣教者']
const NEW_ROW_ID = '__new__'

interface PublisherDraft {
  last_name: string
  first_name: string
  last_name_kana: string
  first_name_kana: string
  romaji: string
  gender: string
  birth_date: string
  baptism_date: string
  dedication: string
  hope: string
  group_id: string
  qualification: string
  elder_qualified_on: string
  servant_qualified_on: string
  pioneer_status: string
  pioneer_started_on: string
  annual_hour_target: string
  monthly_hour_target: string
  is_active: boolean
}

const EMPTY_DRAFT: PublisherDraft = {
  last_name: '',
  first_name: '',
  last_name_kana: '',
  first_name_kana: '',
  romaji: '',
  gender: GENDERS[0],
  birth_date: '',
  baptism_date: '',
  dedication: DEDICATIONS[0],
  hope: HOPES[0],
  group_id: '',
  qualification: '',
  elder_qualified_on: '',
  servant_qualified_on: '',
  pioneer_status: PIONEER_STATUSES[0],
  pioneer_started_on: '',
  annual_hour_target: '',
  monthly_hour_target: '',
  is_active: true,
}

function draftFromPublisher(p: Publisher): PublisherDraft {
  return {
    last_name: p.last_name,
    first_name: p.first_name,
    last_name_kana: p.last_name_kana ?? '',
    first_name_kana: p.first_name_kana ?? '',
    romaji: p.romaji ?? '',
    gender: p.gender,
    birth_date: p.birth_date ?? '',
    baptism_date: p.baptism_date ?? '',
    dedication: p.dedication,
    hope: p.hope,
    group_id: p.group_id ?? '',
    qualification: p.qualification ?? '',
    elder_qualified_on: p.elder_qualified_on ?? '',
    servant_qualified_on: p.servant_qualified_on ?? '',
    pioneer_status: p.pioneer_status,
    pioneer_started_on: isoDateToYearMonth(p.pioneer_started_on),
    annual_hour_target: p.annual_hour_target === null ? '' : String(p.annual_hour_target),
    monthly_hour_target: p.monthly_hour_target === null ? '' : String(p.monthly_hour_target),
    is_active: p.is_active,
  }
}

function draftToPatch(d: PublisherDraft) {
  return {
    last_name: d.last_name.trim(),
    first_name: d.first_name.trim(),
    last_name_kana: d.last_name_kana.trim() || null,
    first_name_kana: d.first_name_kana.trim() || null,
    romaji: d.romaji.trim() || null,
    gender: d.gender,
    birth_date: d.birth_date || null,
    baptism_date: d.baptism_date || null,
    dedication: d.dedication,
    hope: d.hope,
    group_id: d.group_id || null,
    qualification: d.qualification || null,
    elder_qualified_on: d.elder_qualified_on || null,
    servant_qualified_on: d.servant_qualified_on || null,
    pioneer_status: d.pioneer_status,
    pioneer_started_on: yearMonthToIsoDate(d.pioneer_started_on),
    annual_hour_target: d.annual_hour_target.trim() === '' ? null : Number(d.annual_hour_target),
    monthly_hour_target: d.monthly_hour_target.trim() === '' ? null : Number(d.monthly_hour_target),
    is_active: d.is_active,
  }
}

function PublisherFormFields({
  draft,
  setDraft,
  groups,
}: {
  draft: PublisherDraft
  setDraft: (update: (d: PublisherDraft) => PublisherDraft) => void
  groups: Group[]
}) {
  return (
    <>
      <div className="publisher-form-section">
        <h3>氏名</h3>
        <div className="publisher-form-grid">
          <label>
            姓
            <input value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} />
          </label>
          <label>
            名
            <input value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} />
          </label>
          <label>
            姓（フリガナ）
            <input
              value={draft.last_name_kana}
              onChange={(e) => setDraft((d) => ({ ...d, last_name_kana: e.target.value }))}
            />
          </label>
          <label>
            名（フリガナ）
            <input
              value={draft.first_name_kana}
              onChange={(e) => setDraft((d) => ({ ...d, first_name_kana: e.target.value }))}
            />
          </label>
          <label>
            ローマ字
            <input value={draft.romaji} onChange={(e) => setDraft((d) => ({ ...d, romaji: e.target.value }))} />
          </label>
        </div>
      </div>

      <div className="publisher-form-section">
        <h3>属性</h3>
        <div className="publisher-form-grid">
          <label>
            性別
            <select value={draft.gender} onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            献身
            <select value={draft.dedication} onChange={(e) => setDraft((d) => ({ ...d, dedication: e.target.value }))}>
              {DEDICATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            希望
            <select value={draft.hope} onChange={(e) => setDraft((d) => ({ ...d, hope: e.target.value }))}>
              {HOPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            グループ
            <select value={draft.group_id} onChange={(e) => setDraft((d) => ({ ...d, group_id: e.target.value }))}>
              <option value="">(なし)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            在籍
            <select
              value={draft.is_active ? '1' : '0'}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.value === '1' }))}
            >
              <option value="1">在籍</option>
              <option value="0">転出/休止</option>
            </select>
          </label>
        </div>
      </div>

      <div className="publisher-form-section">
        <h3>日付</h3>
        <div className="publisher-form-grid">
          <label>
            生年月日
            <input type="date" value={draft.birth_date} onChange={(e) => setDraft((d) => ({ ...d, birth_date: e.target.value }))} />
          </label>
          <label>
            バプテスマの日付
            <input
              type="date"
              value={draft.baptism_date}
              onChange={(e) => setDraft((d) => ({ ...d, baptism_date: e.target.value }))}
            />
          </label>
        </div>
      </div>

      <div className="publisher-form-section">
        <h3>資格・立場</h3>
        <div className="publisher-form-grid">
          <label>
            資格
            <select value={draft.qualification} onChange={(e) => setDraft((d) => ({ ...d, qualification: e.target.value }))}>
              <option value="">(なし)</option>
              {QUALIFICATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {draft.qualification === '長老' && (
            <label>
              長老資格日
              <input
                type="date"
                value={draft.elder_qualified_on}
                onChange={(e) => setDraft((d) => ({ ...d, elder_qualified_on: e.target.value }))}
              />
            </label>
          )}
          {draft.qualification === '援助奉仕者' && (
            <label>
              援助奉仕者資格日
              <input
                type="date"
                value={draft.servant_qualified_on}
                onChange={(e) => setDraft((d) => ({ ...d, servant_qualified_on: e.target.value }))}
              />
            </label>
          )}
          <label>
            立場
            <select value={draft.pioneer_status} onChange={(e) => setDraft((d) => ({ ...d, pioneer_status: e.target.value }))}>
              {PIONEER_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {PIONEER_TYPE_STATUSES.includes(draft.pioneer_status) && (
            <label>
              開拓開始日（年月）
              <input
                type="month"
                value={draft.pioneer_started_on}
                onChange={(e) => setDraft((d) => ({ ...d, pioneer_started_on: e.target.value }))}
              />
            </label>
          )}
          {PIONEER_TARGET_STATUSES.includes(draft.pioneer_status as (typeof PIONEER_TARGET_STATUSES)[number]) && (
            <>
              <label>
                年間要求時間(h)
                <input
                  type="number"
                  value={draft.annual_hour_target}
                  onChange={(e) => setDraft((d) => ({ ...d, annual_hour_target: e.target.value }))}
                />
              </label>
              <label>
                月間要求時間(h)
                <input
                  type="number"
                  value={draft.monthly_hour_target}
                  onChange={(e) => setDraft((d) => ({ ...d, monthly_hour_target: e.target.value }))}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function PublishersPage() {
  const { isAdmin } = useAuth()
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [qualificationFilter, setQualificationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey] = useState<'romaji' | 'lastName' | 'group' | 'qualification' | 'status'>('status')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PublisherDraft>(EMPTY_DRAFT)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; warnings: string[] } | null>(null)
  const [bulkStatus, setBulkStatus] = useState<(typeof PIONEER_TARGET_STATUSES)[number]>(PIONEER_TARGET_STATUSES[0])
  const [bulkAnnual, setBulkAnnual] = useState('')
  const [bulkMonthly, setBulkMonthly] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  async function refetch() {
    const [{ data: pubData, error: pubError }, { data: groupData, error: groupError }] = await Promise.all([
      supabase.from('publishers').select('*').order('last_name_kana').returns<Publisher[]>(),
      supabase.from('groups').select('*').order('name').returns<Group[]>(),
    ])
    if (pubError) throw pubError
    if (groupError) throw groupError
    setPublishers(pubData ?? [])
    setGroups(groupData ?? [])
  }

  useEffect(() => {
    refetch()
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const groupName = useMemo(() => {
    const map = new Map(groups.map((g) => [g.id, g.name]))
    return (id: string | null) => (id ? (map.get(id) ?? '') : '')
  }, [groups])

  const visiblePublishers = useMemo(() => {
    const q = query.trim()
    let list = publishers.filter((p) => {
      if (q && !(`${p.last_name}${p.first_name}`.includes(q) || (p.romaji ?? '').includes(q.toLowerCase()))) return false
      if (groupFilter && p.group_id !== groupFilter) return false
      if (qualificationFilter) {
        if (qualificationFilter === '(なし)' ? p.qualification !== null : p.qualification !== qualificationFilter) return false
      }
      if (statusFilter && p.pioneer_status !== statusFilter) return false
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'lastName':
          return `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`)
        case 'group':
          return groupName(a.group_id).localeCompare(groupName(b.group_id))
        case 'qualification':
          return (a.qualification ?? '').localeCompare(b.qualification ?? '')
        case 'status': {
          const statusDiff = ROSTER_STATUS_ORDER.indexOf(a.pioneer_status) - ROSTER_STATUS_ORDER.indexOf(b.pioneer_status)
          return statusDiff !== 0 ? statusDiff : (a.romaji ?? '').localeCompare(b.romaji ?? '')
        }
        case 'romaji':
        default:
          return (a.romaji ?? '').localeCompare(b.romaji ?? '')
      }
    })
    return list
  }, [publishers, query, groupFilter, qualificationFilter, statusFilter, sortKey, groupName])

  function toggleAddRow() {
    if (editingId === NEW_ROW_ID) {
      cancel()
      return
    }
    setEditingId(NEW_ROW_ID)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  function startEdit(p: Publisher) {
    setEditingId(p.id)
    setDraft(draftFromPublisher(p))
    setError(null)
  }

  function cancel() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  async function handleSubmit() {
    if (!draft.last_name.trim() || !draft.first_name.trim()) {
      setError('姓と名は必須です')
      return
    }
    setError(null)
    try {
      if (editingId && editingId !== NEW_ROW_ID) {
        const { error } = await supabase.from('publishers').update(draftToPatch(draft)).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('publishers').insert(draftToPatch(draft))
        if (error) throw error
      }
      await refetch()
      cancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function handleDelete(p: Publisher) {
    if (
      !window.confirm(
        `「${p.last_name} ${p.first_name}」を削除しますか?\n\n過去の報告(service_reports)も全て連動して削除され、会衆集計にも反映されなくなります。転出・死去などで今後の報告対象から外したいだけの場合は、削除ではなく「在籍」を「転出/休止」に変更してください。`,
      )
    )
      return
    setError(null)
    try {
      const { error } = await supabase.from('publishers').delete().eq('id', p.id)
      if (error) throw error
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  async function handleBulkImport() {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '')
    if (lines.length === 0) return

    setImporting(true)
    setError(null)
    setImportResult(null)

    const warnings: string[] = []
    const rows: Array<Record<string, unknown>> = []

    for (const line of lines) {
      const cols = line.split('\t')
      const [
        lastNameRaw,
        firstNameRaw,
        lastNameKanaRaw,
        firstNameKanaRaw,
        romajiRaw,
        genderRaw,
        birthDateRaw,
        baptismDateRaw,
        dedicationRaw,
        hopeRaw,
        groupNameRaw,
        qualificationRaw,
        elderDateRaw,
        servantDateRaw,
        pioneerStatusRaw,
        pioneerStartedRaw,
      ] = cols

      const lastName = lastNameRaw?.trim()
      const firstName = firstNameRaw?.trim()
      if (!lastName || !firstName) continue

      const rowLabel = `${lastName} ${firstName}`

      const gender = mapGender(genderRaw) ?? '男性'
      if (!mapGender(genderRaw) && genderRaw?.trim()) warnings.push(`${rowLabel}: 性別「${genderRaw}」を認識できず「男性」にしました`)

      const dedication = mapDedication(dedicationRaw) ?? '兄弟'
      if (!mapDedication(dedicationRaw) && dedicationRaw?.trim())
        warnings.push(`${rowLabel}: 献身「${dedicationRaw}」を認識できず「兄弟」にしました`)

      const hope = mapHope(hopeRaw) ?? 'ほかの羊'
      if (!mapHope(hopeRaw) && hopeRaw?.trim()) warnings.push(`${rowLabel}: 希望「${hopeRaw}」を認識できず「ほかの羊」にしました`)

      const pioneerStatus = mapPioneerStatus(pioneerStatusRaw) ?? '伝道者'
      if (!mapPioneerStatus(pioneerStatusRaw) && pioneerStatusRaw?.trim())
        warnings.push(`${rowLabel}: 立場「${pioneerStatusRaw}」を認識できず「伝道者」にしました`)

      const qualification = mapQualification(qualificationRaw)
      if (qualificationRaw?.trim() && !qualification) warnings.push(`${rowLabel}: 資格「${qualificationRaw}」を認識できませんでした`)

      let groupId: string | null = null
      const groupName = groupNameRaw?.trim()
      if (groupName) {
        const g = groups.find((g) => g.name === groupName)
        if (g) groupId = g.id
        else warnings.push(`${rowLabel}: グループ「${groupName}」が見つかりませんでした`)
      }

      const birthDate = parseFlexibleDate(birthDateRaw)
      if (birthDateRaw?.trim() && !birthDate) warnings.push(`${rowLabel}: 生年月日「${birthDateRaw}」を読み取れませんでした`)
      const baptismDate = parseFlexibleDate(baptismDateRaw)
      if (baptismDateRaw?.trim() && !baptismDate) warnings.push(`${rowLabel}: バプテスマの日付「${baptismDateRaw}」を読み取れませんでした`)
      const elderDate = parseFlexibleDate(elderDateRaw)
      if (elderDateRaw?.trim() && !elderDate) warnings.push(`${rowLabel}: 長老資格日「${elderDateRaw}」を読み取れませんでした`)
      const servantDate = parseFlexibleDate(servantDateRaw)
      if (servantDateRaw?.trim() && !servantDate) warnings.push(`${rowLabel}: 援助奉仕者資格日「${servantDateRaw}」を読み取れませんでした`)
      const pioneerStarted = parseFlexibleYearMonth(pioneerStartedRaw)
      if (pioneerStartedRaw?.trim() && !pioneerStarted) warnings.push(`${rowLabel}: 開拓開始日「${pioneerStartedRaw}」を読み取れませんでした`)

      rows.push({
        last_name: lastName,
        first_name: firstName,
        last_name_kana: lastNameKanaRaw?.trim() || null,
        first_name_kana: firstNameKanaRaw?.trim() || null,
        romaji: romajiRaw?.trim() || null,
        gender,
        birth_date: birthDate,
        baptism_date: baptismDate,
        dedication,
        hope,
        group_id: groupId,
        qualification,
        elder_qualified_on: elderDate,
        servant_qualified_on: servantDate,
        pioneer_status: pioneerStatus,
        pioneer_started_on: pioneerStarted,
      })
    }

    try {
      if (rows.length > 0) {
        const { error } = await supabase.from('publishers').insert(rows)
        if (error) throw error
      }
      setImportResult({ added: rows.length, warnings })
      setPasteText('')
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り込みに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  async function handleBulkTargetApply() {
    const annual = bulkAnnual.trim() === '' ? null : Number(bulkAnnual)
    const monthly = bulkMonthly.trim() === '' ? null : Number(bulkMonthly)
    const targetCount = publishers.filter((p) => p.pioneer_status === bulkStatus && p.is_active).length
    if (targetCount === 0) {
      setError(`在籍中の「${bulkStatus}」が見つかりませんでした`)
      return
    }
    if (
      !window.confirm(
        `在籍中の「${bulkStatus}」全員(${targetCount}名)の年間要求時間・月間要求時間を上書きします。個別に調整している人の値も上書きされます。よろしいですか?`,
      )
    )
      return
    setBulkApplying(true)
    setError(null)
    setBulkResult(null)
    try {
      const { error } = await supabase
        .from('publishers')
        .update({ annual_hour_target: annual, monthly_hour_target: monthly })
        .eq('pioneer_status', bulkStatus)
        .eq('is_active', true)
      if (error) throw error
      await refetch()
      setBulkResult(`「${bulkStatus}」${targetCount}名に適用しました。`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '一括設定に失敗しました')
    } finally {
      setBulkApplying(false)
    }
  }

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>名簿</h1>
        {isAdmin && (
          <button type="button" onClick={toggleAddRow}>
            {editingId === NEW_ROW_ID ? '取消' : '+ 新規追加'}
          </button>
        )}
      </div>

      {isAdmin && (
        <details className="paste-import">
          <summary>名簿を一括で取り込む(初回の一括登録向け)</summary>
          <p className="paste-import-hint">
            タブ区切りで次の順に貼り付けてください(1行1人、姓・名は必須、他は空欄可):
            <br />
            姓・名・姓(フリガナ)・名(フリガナ)・ローマ字・性別・生年月日・バプテスマの日付・献身・希望・グループ・資格・長老資格日・援助奉仕者資格日・立場・開拓開始日(年月)
            <br />
            性別は「男性/女性」、献身は「兄弟/姉妹」、希望は「ほかの羊/天に行く者」、資格は「長老/援助奉仕者」、立場は「伝道者/補助開拓者/正規開拓者/特別開拓者/野外の宣教者/不活発者」(名簿シートの短縮コード「伝・開・特開・野宣・不・長・援」もそのまま使えます)。日付は
            1955-02-19 のような形式、開拓開始日は 2024/9 のように年月だけで構いません。
          </p>
          <textarea
            className="paste-import-textarea"
            rows={8}
            placeholder={'荒木\t豊\tアラキ\tユタカ\taraki yutaka\t男性\t1979-02-10\t1995-08-05\t兄弟\tほかの羊\t村野\t\t\t\t伝\t'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button type="button" onClick={handleBulkImport} disabled={importing || !pasteText.trim()}>
            {importing ? '取り込み中...' : '取り込む'}
          </button>
          {importResult && (
            <div className="paste-import-result">
              <p>{importResult.added}件を登録しました。</p>
              {importResult.warnings.length > 0 && (
                <ul>
                  {importResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </details>
      )}

      {isAdmin && (
        <details className="paste-import">
          <summary>年間・月間要求時間を立場ごとに一括設定する</summary>
          <p className="paste-import-hint">
            選んだ立場の在籍者全員に、同じ年間要求時間・月間要求時間をまとめて設定します。個別に調整したい人は、この後で1人ずつ編集してください（一括設定を再度行うと、個別調整した値も上書きされます）。
          </p>
          <div className="publisher-form-grid">
            <label>
              立場
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as (typeof PIONEER_TARGET_STATUSES)[number])}>
                {PIONEER_TARGET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              年間要求時間(h)
              <input type="number" value={bulkAnnual} onChange={(e) => setBulkAnnual(e.target.value)} />
            </label>
            <label>
              月間要求時間(h)
              <input type="number" value={bulkMonthly} onChange={(e) => setBulkMonthly(e.target.value)} />
            </label>
          </div>
          <button type="button" onClick={handleBulkTargetApply} disabled={bulkApplying}>
            {bulkApplying ? '適用中...' : '一括適用する'}
          </button>
          {bulkResult && <p className="paste-import-result">{bulkResult}</p>}
        </details>
      )}

      <div className="date-nav">
        <input
          className="crud-search"
          type="text"
          placeholder="氏名で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          グループ
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">すべて</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          資格
          <select value={qualificationFilter} onChange={(e) => setQualificationFilter(e.target.value)}>
            <option value="">すべて</option>
            <option value="(なし)">(なし)</option>
            {QUALIFICATIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          立場
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">すべて</option>
            {PIONEER_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          並び替え
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
            <option value="romaji">ローマ字順</option>
            <option value="lastName">姓名順</option>
            <option value="group">グループ順</option>
            <option value="qualification">資格順</option>
            <option value="status">立場順</option>
          </select>
        </label>
      </div>
      <table className="crud-table crud-table--sticky-header crud-table--zebra roster-table">
        <thead>
          <tr>
            <th>姓</th>
            <th>名</th>
            <th>グループ</th>
            <th>資格</th>
            <th>立場</th>
            <th>在籍</th>
            {isAdmin && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {isAdmin && editingId === NEW_ROW_ID && (
            <tr>
              <td colSpan={7}>
                <div className="publisher-inline-form">
                  <h2>新規追加</h2>
                  {error && <p className="error-text">{error}</p>}
                  <PublisherFormFields draft={draft} setDraft={setDraft} groups={groups} />
                  <div className="publisher-form-actions">
                    <button type="button" onClick={handleSubmit}>
                      保存
                    </button>
                    <button type="button" onClick={cancel}>
                      取消
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
          {visiblePublishers.map((p) =>
            isAdmin && editingId === p.id ? (
              <tr key={p.id}>
                <td colSpan={7}>
                  <div className="publisher-inline-form">
                    <h2>編集</h2>
                    {error && <p className="error-text">{error}</p>}
                    <PublisherFormFields draft={draft} setDraft={setDraft} groups={groups} />
                    <div className="publisher-form-actions">
                      <button type="button" onClick={handleSubmit}>
                        保存
                      </button>
                      <button type="button" onClick={cancel}>
                        取消
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>{p.last_name}</td>
                <td>{p.first_name}</td>
                <td>{groupName(p.group_id)}</td>
                <td>{p.qualification ?? ''}</td>
                <td>{p.pioneer_status}</td>
                <td>{p.is_active ? '在籍' : '転出/休止'}</td>
                {isAdmin && (
                  <td className="row-actions">
                    <RowActionsMenu onEdit={() => startEdit(p)} onDelete={() => handleDelete(p)} />
                  </td>
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
