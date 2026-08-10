import { PDFDocument, TextAlignment, type PDFFont, type PDFForm, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { CongregationSummaryCardData, PublisherCardData, PublisherCardYearBlock, SummaryCardYearBlock } from './printData'
import { formatJapaneseDate, formatShortQualDate, formatShortYearMonth, yearsSince } from './dateFormat'

// 「S-21 会衆の伝道者記録.pdf」(ユーザー作成のフィールド入り版)のフィールド名対応表。
// PDFのアノテーション座標を解析して特定した(1ページに情報欄1つ+奉仕年度表2つ)。
interface MonthFieldSet {
  preached: string
  studies: string
  aux: string
  hours: string
  remarks: string
}

const TABLE1_ROWS: MonthFieldSet[] = [
  { preached: 'CheckBox 20', studies: 'Text 98', aux: 'CheckBox 21', hours: 'Text 100', remarks: 'Text 101' },
  { preached: 'CheckBox 22', studies: 'Text 106', aux: 'CheckBox 23', hours: 'Text 108', remarks: 'Text 109' },
  { preached: 'CheckBox 24', studies: 'Text 114', aux: 'CheckBox 25', hours: 'Text 116', remarks: 'Text 117' },
  { preached: 'CheckBox 26', studies: 'Text 122', aux: 'CheckBox 27', hours: 'Text 124', remarks: 'Text 125' },
  { preached: 'CheckBox 28', studies: 'Text 130', aux: 'CheckBox 30', hours: 'Text 132', remarks: 'Text 133' },
  { preached: 'CheckBox 31', studies: 'Text 138', aux: 'CheckBox 32', hours: 'Text 140', remarks: 'Text 141' },
  { preached: 'CheckBox 33', studies: 'Text 146', aux: 'CheckBox 34', hours: 'Text 148', remarks: 'Text 149' },
  { preached: 'CheckBox 35', studies: 'Text 154', aux: 'CheckBox 36', hours: 'Text 156', remarks: 'Text 157' },
  { preached: 'CheckBox 37', studies: 'Text 162', aux: 'CheckBox 38', hours: 'Text 164', remarks: 'Text 165' },
  { preached: 'CheckBox 39', studies: 'Text 170', aux: 'CheckBox 40', hours: 'Text 172', remarks: 'Text 173' },
  { preached: 'CheckBox 42', studies: 'Text 178', aux: 'CheckBox 44', hours: 'Text 180', remarks: 'Text 181' },
  { preached: 'CheckBox 45', studies: 'Text 186', aux: 'CheckBox 47', hours: 'Text 188', remarks: 'Text 189' },
]
const TABLE1_YEAR = 'Text 90'
const TABLE1_TOTAL_HOURS = 'Text 192'

const TABLE2_ROWS: MonthFieldSet[] = [
  { preached: 'CheckBox 48', studies: 'Text 202', aux: 'CheckBox 49', hours: 'Text 204', remarks: 'Text 205' },
  { preached: 'CheckBox 50', studies: 'Text 210', aux: 'CheckBox 51', hours: 'Text 212', remarks: 'Text 213' },
  { preached: 'CheckBox 52', studies: 'Text 218', aux: 'CheckBox 53', hours: 'Text 220', remarks: 'Text 221' },
  { preached: 'CheckBox 54', studies: 'Text 226', aux: 'CheckBox 55', hours: 'Text 228', remarks: 'Text 229' },
  { preached: 'CheckBox 56', studies: 'Text 234', aux: 'CheckBox 57', hours: 'Text 236', remarks: 'Text 237' },
  { preached: 'CheckBox 58', studies: 'Text 242', aux: 'CheckBox 59', hours: 'Text 244', remarks: 'Text 245' },
  { preached: 'CheckBox 60', studies: 'Text 250', aux: 'CheckBox 61', hours: 'Text 252', remarks: 'Text 253' },
  { preached: 'CheckBox 62', studies: 'Text 258', aux: 'CheckBox 63', hours: 'Text 260', remarks: 'Text 261' },
  { preached: 'CheckBox 64', studies: 'Text 266', aux: 'CheckBox 65', hours: 'Text 268', remarks: 'Text 269' },
  { preached: 'CheckBox 66', studies: 'Text 274', aux: 'CheckBox 67', hours: 'Text 276', remarks: 'Text 277' },
  { preached: 'CheckBox 69', studies: 'Text 282', aux: 'CheckBox 70', hours: 'Text 284', remarks: 'Text 285' },
  { preached: 'CheckBox 71', studies: 'Text 290', aux: 'CheckBox 72', hours: 'Text 292', remarks: 'Text 293' },
]
const TABLE2_YEAR = 'Text 194'
const TABLE2_TOTAL_HOURS = 'Text 296'

// PDF内の静的ラベルの実サイズに合わせたフィールドフォントサイズ(pypdf/PyMuPDFで実測)
const DEFAULT_FONT_SIZE = 9
const TITLE_FONT_SIZE = 15 // タイトルと同程度を狙ったが、上側配置にすると縦が見切れるため縮小
const NAME_LABEL_FONT_SIZE = 12 // 「氏名：」「生年月日：」「バプテスマの日付：」と同じ
const MONTH_FONT_SIZE = 11 // 「9月」等の月表示と同じ

interface TextOptions {
  fontSize?: number
  align?: 'left' | 'center'
}

function setText(form: PDFForm, name: string, value: string, options: TextOptions = {}) {
  const field = form.getTextField(name)
  field.setFontSize(options.fontSize ?? DEFAULT_FONT_SIZE)
  if (options.align === 'center') field.setAlignment(TextAlignment.Center)
  field.setText(value)
}

// pdf-libはテキストフィールドを枠の上下中央に配置する仕様で、上下の配置を直接指定するAPIがない。
// そのため、枠(Rect)自体の高さを詰めて上端をそろえることで上側配置に見せる
function alignFieldToTop(form: PDFForm, name: string, height: number) {
  const field = form.getTextField(name)
  for (const widget of field.acroField.getWidgets()) {
    const rect = widget.getRectangle()
    const top = rect.y + rect.height
    widget.setRectangle({ x: rect.x, y: top - height, width: rect.width, height })
  }
}

// pdf-libのテキストフィールドAPIには字間(トラッキング)を指定する方法がないため、
// フィールドは空のままにし、代わりにページへ1文字ずつ位置をずらしながら描画する。
// 縦位置はpdf-libのdefaultTextFieldAppearanceProvider(layoutSinglelineText)と同じ計算式で
// 上端そろえ後の枠の中央に来るようにし、見た目が既存の調整結果と変わらないようにしている
function drawNameWithTracking(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rect: { x: number; y: number; width: number; height: number },
  fontSize: number,
  tracking: number,
) {
  const padding = 1
  const fontHeight = font.heightAtSize(fontSize, { descender: false })
  const boxHeight = rect.height - padding * 2
  const y = rect.y + padding + (boxHeight / 2 - fontHeight / 2)
  let x = rect.x + padding
  for (const char of text) {
    page.drawText(char, { x, y, size: fontSize, font })
    x += font.widthOfTextAtSize(char, fontSize) + tracking
  }
}

function setCheckbox(form: PDFForm, name: string, checked: boolean) {
  const box = form.getCheckBox(name)
  if (checked) box.check()
  else box.uncheck()
}

function fillTable(form: PDFForm, block: PublisherCardYearBlock, yearField: string, rows: MonthFieldSet[], totalField: string) {
  setText(form, yearField, String(block.year), { fontSize: MONTH_FONT_SIZE, align: 'center' })
  let totalHours = 0
  block.months.forEach(({ report }, i) => {
    const fields = rows[i]
    setCheckbox(form, fields.preached, report?.preached ?? false)
    setCheckbox(form, fields.aux, report?.pioneer_status_snapshot === '補助開拓者')
    setText(form, fields.studies, report ? String(report.bible_studies) : '', { fontSize: MONTH_FONT_SIZE, align: 'center' })

    const hoursOptions: TextOptions = { fontSize: MONTH_FONT_SIZE, align: 'center' }
    if (!report) {
      setText(form, fields.hours, '', hoursOptions)
    } else if (report.hours > 0) {
      setText(form, fields.hours, String(report.hours), hoursOptions)
      totalHours += report.hours
    } else {
      setText(form, fields.hours, '―', hoursOptions)
    }

    setText(form, fields.remarks, report?.remarks ?? '')
  })
  setText(form, totalField, String(totalHours), { fontSize: MONTH_FONT_SIZE, align: 'center' })
}

async function loadTemplate() {
  const [templateBytes, fontBytes] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}forms/s21-form.pdf`).then((r) => r.arrayBuffer()),
    fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`).then((r) => r.arrayBuffer()),
  ])
  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)
  // 日本語(氏名・備考など)を埋め込むため、フォーム欄の既定フォント(Helvetica)では
  // エンコードできない文字がある。Noto Sans JP(SIL Open Font License)を埋め込んで使う。
  // subset:true だと updateFieldAppearances() で使う文字の一部がサブセットに含まれず
  // 欠落する不具合を確認したため、subset:false でフルフォントを埋め込む(ファイルサイズは増えるが確実)
  const japaneseFont = await pdfDoc.embedFont(fontBytes, { subset: false })
  const form = pdfDoc.getForm()
  return { pdfDoc, japaneseFont, form }
}

export async function fillPublisherCardPdf(data: PublisherCardData): Promise<Uint8Array> {
  const { pdfDoc, japaneseFont, form } = await loadTemplate()

  const { publisher } = data
  const furigana = `${publisher.last_name_kana ?? ''} ${publisher.first_name_kana ?? ''}`.trim()
  const age = yearsSince(publisher.birth_date)
  const yearsBaptized = yearsSince(publisher.baptism_date)

  // 氏名は文字間を広げるため(pdf-libのフィールドAPIには字間指定がない)、フィールド自体は空のままにし、
  // flatten後にページへ直接1文字ずつ描画する。位置合わせのため枠だけ先に上端そろえしておく
  alignFieldToTop(form, 'Text 73', TITLE_FONT_SIZE * 1.4)
  const nameFieldRect = form.getTextField('Text 73').acroField.getWidgets()[0].getRectangle()
  setText(form, 'Text 74', furigana ? `（${furigana}）` : '', { fontSize: NAME_LABEL_FONT_SIZE })
  setText(
    form,
    'Text 75',
    [formatJapaneseDate(publisher.birth_date), age !== null ? `(${age})` : ''].filter(Boolean).join('  '),
    { fontSize: NAME_LABEL_FONT_SIZE, align: 'center' },
  )
  setText(
    form,
    'Text 76',
    [formatJapaneseDate(publisher.baptism_date), yearsBaptized !== null ? `(${yearsBaptized})` : ''].filter(Boolean).join('  '),
    { fontSize: NAME_LABEL_FONT_SIZE, align: 'center' },
  )

  setCheckbox(form, 'CheckBox 10', publisher.gender === '男性')
  setCheckbox(form, 'CheckBox 11', publisher.gender === '女性')
  setCheckbox(form, 'CheckBox 12', publisher.hope === 'ほかの羊')
  setCheckbox(form, 'CheckBox 13', publisher.hope === '天に行く者')
  setCheckbox(form, 'CheckBox 14', publisher.qualification === '長老')
  setCheckbox(form, 'CheckBox 16', publisher.qualification === '援助奉仕者')
  setCheckbox(form, 'CheckBox 17', publisher.pioneer_status === '正規開拓者')
  setCheckbox(form, 'CheckBox 18', publisher.pioneer_status === '特別開拓者')
  setCheckbox(form, 'CheckBox 19', publisher.pioneer_status === '野外の宣教者')

  setText(form, 'Text 298', publisher.qualification === '長老' ? formatShortQualDate(publisher.elder_qualified_on) : '')
  setText(form, 'Text 299', publisher.qualification === '援助奉仕者' ? formatShortQualDate(publisher.servant_qualified_on) : '')
  setText(form, 'Text 300', publisher.pioneer_status === '正規開拓者' ? formatShortYearMonth(publisher.pioneer_started_on) : '')
  setText(form, 'Text 301', publisher.pioneer_status === '特別開拓者' ? formatShortYearMonth(publisher.pioneer_started_on) : '')
  setText(form, 'Text 302', publisher.pioneer_status === '野外の宣教者' ? formatShortYearMonth(publisher.pioneer_started_on) : '')

  fillTable(form, data.blocks[0], TABLE1_YEAR, TABLE1_ROWS, TABLE1_TOTAL_HOURS)
  fillTable(form, data.blocks[1], TABLE2_YEAR, TABLE2_ROWS, TABLE2_TOTAL_HOURS)

  form.updateFieldAppearances(japaneseFont)
  form.flatten()

  const page = pdfDoc.getPage(0)
  drawNameWithTracking(
    page,
    japaneseFont,
    `${publisher.last_name} ${publisher.first_name}`,
    nameFieldRect,
    TITLE_FONT_SIZE,
    5,
  )

  return pdfDoc.save()
}

function fillSummaryTable(form: PDFForm, block: SummaryCardYearBlock, yearField: string, rows: MonthFieldSet[], totalField: string) {
  setText(form, yearField, String(block.year), { fontSize: MONTH_FONT_SIZE, align: 'center' })
  let totalHours = 0
  block.months.forEach((m, i) => {
    const fields = rows[i]
    setText(form, fields.studies, m.count > 0 ? String(m.studies) : '', { fontSize: MONTH_FONT_SIZE, align: 'center' })

    const hoursOptions: TextOptions = { fontSize: MONTH_FONT_SIZE, align: 'center' }
    if (m.count === 0) {
      setText(form, fields.hours, '', hoursOptions)
    } else if (m.hours > 0) {
      setText(form, fields.hours, String(m.hours), hoursOptions)
      totalHours += m.hours
    } else {
      // 伝道者バケットなどは時間報告が不要なため、個人の記録と同じく「―」で表す
      setText(form, fields.hours, '―', hoursOptions)
    }

    setText(form, fields.remarks, m.count > 0 ? `${m.count}名` : '')
  })
  setText(form, totalField, String(totalHours), { fontSize: MONTH_FONT_SIZE, align: 'center' })
}

// 会衆集計(伝道者記録と同じS-21相当PDFを使い、個人の代わりに集計値を差し込む版)。
// 生年月日・バプテスマ・性別・希望・資格・立場のチェックボックス、宣教/補助開拓の月次チェックボックスは
// 使用しない(触れずデフォルトの空/未チェックのままにする)
export async function fillCongregationSummaryCardPdf(data: CongregationSummaryCardData): Promise<Uint8Array> {
  const { pdfDoc, japaneseFont, form } = await loadTemplate()

  setText(form, 'Text 73', data.label, { fontSize: NAME_LABEL_FONT_SIZE })

  fillSummaryTable(form, data.blocks[0], TABLE1_YEAR, TABLE1_ROWS, TABLE1_TOTAL_HOURS)
  fillSummaryTable(form, data.blocks[1], TABLE2_YEAR, TABLE2_ROWS, TABLE2_TOTAL_HOURS)

  form.updateFieldAppearances(japaneseFont)
  form.flatten()
  return pdfDoc.save()
}
