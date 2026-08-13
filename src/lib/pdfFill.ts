import { PDFDocument, TextAlignment, type PDFFont, type PDFForm, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type {
  CongregationSummaryCardData,
  PublisherCardData,
  PublisherCardYearBlock,
  PublisherYearData,
  SummaryCardYearBlock,
} from './printData'
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
const TABLE1_REMARKS_TOTAL = 'Text 193'

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
const TABLE2_REMARKS_TOTAL = 'Text 297'

// PDF内の静的ラベルの実サイズに合わせたフィールドフォントサイズ(pypdf/PyMuPDFで実測)
const DEFAULT_FONT_SIZE = 9
const TITLE_FONT_SIZE = 15 // タイトルと同程度を狙ったが、上側配置にすると縦が見切れるため縮小
const NAME_LABEL_FONT_SIZE = 12 // 「氏名：」「生年月日：」「バプテスマの日付：」と同じ
const MONTH_FONT_SIZE = 11 // 「9月」等の月表示と同じ

interface TextOptions {
  fontSize?: number
  align?: 'left' | 'center' | 'right'
}

function setText(form: PDFForm, name: string, value: string, options: TextOptions = {}) {
  const field = form.getTextField(name)
  field.setFontSize(options.fontSize ?? DEFAULT_FONT_SIZE)
  if (options.align === 'center') field.setAlignment(TextAlignment.Center)
  if (options.align === 'right') field.setAlignment(TextAlignment.Right)
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

// 備考欄などに収まりきらない長さのテキストを表示するための下限フォントサイズ。
// これ以上は縮小しない(可読性の限界)
const FIT_MIN_FONT_SIZE = 6

function charsLineWidth(font: PDFFont, text: string, fontSize: number) {
  return font.widthOfTextAtSize(text, fontSize)
}

function drawCharsLine(page: PDFPage, font: PDFFont, text: string, x: number, y: number, fontSize: number) {
  let cx = x
  for (const char of text) {
    page.drawText(char, { x: cx, y, size: fontSize, font })
    cx += font.widthOfTextAtSize(char, fontSize)
  }
}

// 与えられた幅に収まるよう、1文字ずつ詰めてmaxLines行までに折り返す
function wrapToLines(text: string, font: PDFFont, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const char of text) {
    const trial = current + char
    if (current && charsLineWidth(font, trial, fontSize) > maxWidth) {
      lines.push(current)
      current = char
      if (lines.length === maxLines) break
    } else {
      current = trial
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  return lines
}

// 末尾に「…」を付けつつ幅に収める(縮小・折り返しでも入りきらない場合の最終手段)
function appendEllipsis(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  let result = text
  while (result.length > 0 && charsLineWidth(font, `${result}…`, fontSize) > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}

// 備考欄などの固定サイズの箱にテキストを収める。まず1行のままフォントサイズを
// 縮小して収まるか試し、それでも収まらない場合は2行に折り返しながら縮小する。
// 箱の高さ・幅は変更しない
function drawFittedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rect: { x: number; y: number; width: number; height: number },
  baseFontSize: number,
) {
  const padding = 1
  const maxWidth = rect.width - padding * 2
  const maxHeight = rect.height - padding * 2

  let fontSize = baseFontSize
  while (fontSize > FIT_MIN_FONT_SIZE && charsLineWidth(font, text, fontSize) > maxWidth) {
    fontSize -= 0.5
  }
  if (charsLineWidth(font, text, fontSize) <= maxWidth) {
    const fontHeight = font.heightAtSize(fontSize, { descender: false })
    const y = rect.y + padding + ((rect.height - padding * 2) / 2 - fontHeight / 2)
    drawCharsLine(page, font, text, rect.x + padding, y, fontSize)
    return
  }

  // 1行では収まらないため、高さの範囲内で2行に折り返せるフォントサイズまで縮小する
  fontSize = baseFontSize
  let lines: string[] = []
  while (fontSize > FIT_MIN_FONT_SIZE) {
    const fontHeight = font.heightAtSize(fontSize, { descender: false })
    const lineStep = fontHeight * 1.25
    if (lineStep * 2 <= maxHeight) {
      lines = wrapToLines(text, font, fontSize, maxWidth, 2)
      if (lines.length <= 2) break
    }
    fontSize -= 0.5
  }
  if (lines.length === 0) {
    fontSize = FIT_MIN_FONT_SIZE
    lines = wrapToLines(text, font, fontSize, maxWidth, 2)
  }
  // 折り返した2行に収まりきらず、元のテキストが途中で切れた場合は「…」を付ける
  const consumedLength = lines.reduce((sum, l) => sum + l.length, 0)
  if (consumedLength < text.length && lines.length > 0) {
    lines[lines.length - 1] = appendEllipsis(lines[lines.length - 1], font, fontSize, maxWidth)
  }

  const fontHeight = font.heightAtSize(fontSize, { descender: false })
  const lineStep = fontHeight * 1.25
  const stackHeight = fontHeight + lineStep * (lines.length - 1)
  let y = rect.y + padding + ((rect.height - padding * 2) / 2 + stackHeight / 2 - fontHeight)
  for (const line of lines) {
    drawCharsLine(page, font, line, rect.x + padding, y, fontSize)
    y -= lineStep
  }
}

function setCheckbox(form: PDFForm, name: string, checked: boolean) {
  const box = form.getCheckBox(name)
  if (checked) box.check()
  else box.uncheck()
}

interface PendingDraw {
  text: string
  rect: { x: number; y: number; width: number; height: number }
  fontSize: number
}

// pdf-libのフィールドAPI(updateFieldAppearances)は、英数字混在の短い文字列
// (例:「AP15」)で、まれに文字間に不要な空白が入って描画されることを実機PDFで確認した
// (widthOfTextAtSizeの計算自体は正しいため、pdf-lib内部の複数文字レイアウト処理側の問題と
// 見られる)。フィールドは空のままにしておき、後で1文字ずつ手動描画することで回避する
function queueTextDraw(form: PDFForm, name: string, text: string, fontSize: number, pending: PendingDraw[]) {
  if (text) {
    const field = form.getTextField(name)
    const rect = field.acroField.getWidgets()[0].getRectangle()
    pending.push({ text, rect, fontSize })
  }
  setText(form, name, '')
}

function fillTable(
  form: PDFForm,
  block: PublisherCardYearBlock,
  yearField: string,
  rows: MonthFieldSet[],
  totalField: string,
  remarksTotalField: string,
  pendingRemarks: PendingDraw[],
  showTotals = true,
) {
  setText(form, yearField, String(block.year), { fontSize: MONTH_FONT_SIZE, align: 'center' })
  let totalHours = 0
  let totalConsidered = 0
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

    totalConsidered += report?.considered_hours ?? 0
    queueTextDraw(form, fields.remarks, report?.remarks ?? '', DEFAULT_FONT_SIZE, pendingRemarks)
  })
  if (showTotals) {
    setText(form, totalField, String(totalHours), { fontSize: MONTH_FONT_SIZE, align: 'center' })
    if (totalConsidered > 0) {
      setText(form, remarksTotalField, `奉仕時間${totalHours}h+加算時間${totalConsidered}h=${totalHours + totalConsidered}時間`)
    }
  }
}

async function loadTemplate(formFile = 's21-form.pdf') {
  const [templateBytes, fontBytes] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}forms/${formFile}`).then((r) => r.arrayBuffer()),
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

export async function fillPublisherCardPdf(
  data: PublisherCardData,
  options: { showSelectedYearTotals?: boolean } = {},
): Promise<Uint8Array> {
  const { pdfDoc, japaneseFont, form } = await loadTemplate()
  const pendingRemarks: PendingDraw[] = []

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

  // 上段(前の奉仕年度)の集計欄は常に表示。下段(選択した奉仕年度)は年度途中の
  // 場合など、集計欄を非表示にしたいことがあるため呼び出し側から切り替えられるようにする
  fillTable(form, data.blocks[0], TABLE1_YEAR, TABLE1_ROWS, TABLE1_TOTAL_HOURS, TABLE1_REMARKS_TOTAL, pendingRemarks)
  fillTable(
    form,
    data.blocks[1],
    TABLE2_YEAR,
    TABLE2_ROWS,
    TABLE2_TOTAL_HOURS,
    TABLE2_REMARKS_TOTAL,
    pendingRemarks,
    options.showSelectedYearTotals ?? true,
  )

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
  for (const { text, rect, fontSize } of pendingRemarks) {
    drawFittedText(page, japaneseFont, text, rect, fontSize)
  }

  return pdfDoc.save()
}

function fillSummaryTable(
  form: PDFForm,
  block: SummaryCardYearBlock,
  yearField: string,
  rows: MonthFieldSet[],
  totalField: string,
  pendingRemarks: PendingDraw[],
) {
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

    queueTextDraw(form, fields.remarks, m.count > 0 ? `${m.count}名` : '', DEFAULT_FONT_SIZE, pendingRemarks)
  })
  setText(form, totalField, String(totalHours), { fontSize: MONTH_FONT_SIZE, align: 'center' })
}

// 会衆集計(伝道者記録と同じS-21相当PDFを使い、個人の代わりに集計値を差し込む版)。
// 生年月日・バプテスマ・性別・希望・資格・立場のチェックボックス、宣教/補助開拓の月次チェックボックスは
// 使用しない(触れずデフォルトの空/未チェックのままにする)
export async function fillCongregationSummaryCardPdf(data: CongregationSummaryCardData): Promise<Uint8Array> {
  const { pdfDoc, japaneseFont, form } = await loadTemplate()
  const pendingRemarks: PendingDraw[] = []

  setText(form, 'Text 73', data.label, { fontSize: NAME_LABEL_FONT_SIZE })

  fillSummaryTable(form, data.blocks[0], TABLE1_YEAR, TABLE1_ROWS, TABLE1_TOTAL_HOURS, pendingRemarks)
  fillSummaryTable(form, data.blocks[1], TABLE2_YEAR, TABLE2_ROWS, TABLE2_TOTAL_HOURS, pendingRemarks)

  form.updateFieldAppearances(japaneseFont)
  form.flatten()

  const page = pdfDoc.getPage(0)
  for (const { text, rect, fontSize } of pendingRemarks) {
    drawFittedText(page, japaneseFont, text, rect, fontSize)
  }

  return pdfDoc.save()
}

// 「年度末お知らせ用紙.pdf」(ユーザー作成のフィールド入り版)のフィールド名対応表。
// PDFのアノテーション座標を解析して特定した
const YEAR_END_YEAR_FIELD = 'Text 1'
const YEAR_END_NAME_FIELD = 'Text 3'
const YEAR_END_MONTH_FIELDS = [
  'Text 10',
  'Text 11',
  'Text 12',
  'Text 13',
  'Text 14',
  'Text 15',
  'Text 22',
  'Text 23',
  'Text 24',
  'Text 25',
  'Text 26',
  'Text 27',
]
const YEAR_END_CONSIDERED_FIELD = 'Text 29'
const YEAR_END_TOTAL_HOURS_FIELD = 'Text 31'
const YEAR_END_ACHIEVED_FIELD = 'Text 33'
const YEAR_END_REMAINING_TOTAL_FIELD = 'Text 35'
const YEAR_END_REMAINING_PER_MONTH_FIELD = 'Text 36'

const YEAR_END_MONTH_FONT_SIZE = 18
const YEAR_END_LABEL_FONT_SIZE = 14
// 差し込むデータ全体を、枠の中央よりやや上に見せるための共通オフセット
const YEAR_END_SHIFT_UP = 5

function shiftFieldUp(form: PDFForm, name: string, offset: number) {
  const field = form.getTextField(name)
  for (const widget of field.acroField.getWidgets()) {
    const rect = widget.getRectangle()
    widget.setRectangle({ x: rect.x, y: rect.y + offset, width: rect.width, height: rect.height })
  }
}

// 「要求時間［600］時間まで　残り［1］ヶ月で」の数字部分は、フォームフィールドではなく
// 固定文言の間の空白部分に直接描画する(PDF側にフィールドが用意されていないため)。
// 座標はPyMuPDFで実測した固定文言の位置(PDFページ座標系、原点は左下)
const YEAR_END_TARGET_GAP = { x0: 214, x1: 263, yTop: 638, yBottom: 655 }
const YEAR_END_REMAINING_MONTHS_GAP = { x0: 373, x1: 394, yTop: 638, yBottom: 655 }
// 「奉仕年度」ラベルの直前に年度の数字を入れる。フィールド(Text 1)の箱の高さに
// 合わせて自動配置すると、フィールドとラベルとで基準にする行の高さが違うために
// 縦位置がずれて見えたため、ラベル自体の実測位置に合わせて直接描画する
const YEAR_END_TITLE_LABEL = { yTop: 119, yBottom: 138, labelStartX: 137 }

function drawCenteredInGap(
  page: PDFPage,
  font: PDFFont,
  text: string,
  gap: { x0: number; x1: number; yTop: number; yBottom: number },
  pageHeight: number,
  fontSize: number,
) {
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  const gapWidth = gap.x1 - gap.x0
  const x = gap.x0 + Math.max(0, (gapWidth - textWidth) / 2)
  const boxHeight = gap.yBottom - gap.yTop
  const fontHeight = font.heightAtSize(fontSize, { descender: false })
  const y = pageHeight - gap.yBottom + (boxHeight / 2 - fontHeight / 2) + YEAR_END_SHIFT_UP
  page.drawText(text, { x, y, size: fontSize, font })
}

// 右端(rightEdgeX)に接するように右揃えで、指定した行の高さ(yTop〜yBottom)に
// 縦中央揃えでテキストを描画する
function drawRightAlignedBeforeX(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightEdgeX: number,
  yTop: number,
  yBottom: number,
  pageHeight: number,
  fontSize: number,
  gap = 6,
) {
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  const x = rightEdgeX - gap - textWidth
  const boxHeight = yBottom - yTop
  const fontHeight = font.heightAtSize(fontSize, { descender: false })
  const y = pageHeight - yBottom + (boxHeight / 2 - fontHeight / 2) + YEAR_END_SHIFT_UP
  page.drawText(text, { x, y, size: fontSize, font })
}

// 年度末お知らせ。伝道者記録と違い、対象は開拓者本人の要求時間に対する進捗確認用の
// 簡易な帳票で、月ごとの奉仕時間・考慮時間・達成時間・要求時間までの残りだけを表示する
export async function fillYearEndNoticePdf(data: PublisherYearData): Promise<Uint8Array> {
  const { pdfDoc, japaneseFont, form } = await loadTemplate('year-end-notice-form.pdf')

  const { publisher, year, months } = data
  const totalHours = months.reduce((sum, m) => sum + (m.report?.hours ?? 0), 0)
  const consideredHours = months.reduce((sum, m) => sum + (m.report?.considered_hours ?? 0), 0)
  const achieved = totalHours + consideredHours
  const target = publisher.annual_hour_target ?? 0
  const reportedMonths = months.filter((m) => m.report !== null).length
  const remainingMonths = months.length - reportedMonths

  // 年度の数字はフィールド(Text 1)の箱ではなく「奉仕年度」ラベルの実測位置に合わせて
  // 直接描画するため(理由は下のdrawRightAlignedBeforeXの呼び出し箇所を参照)、
  // フィールド自体は空のままにしておく
  setText(form, YEAR_END_YEAR_FIELD, '')
  setText(form, YEAR_END_NAME_FIELD, `${publisher.last_name} ${publisher.first_name}`, {
    fontSize: YEAR_END_LABEL_FONT_SIZE,
    align: 'center',
  })

  months.forEach((m, i) => {
    setText(form, YEAR_END_MONTH_FIELDS[i], m.report ? String(m.report.hours) : '', {
      fontSize: YEAR_END_MONTH_FONT_SIZE,
      align: 'center',
    })
  })

  setText(form, YEAR_END_CONSIDERED_FIELD, String(consideredHours), { fontSize: YEAR_END_MONTH_FONT_SIZE, align: 'center' })
  setText(form, YEAR_END_TOTAL_HOURS_FIELD, String(totalHours), { fontSize: YEAR_END_MONTH_FONT_SIZE, align: 'center' })
  setText(form, YEAR_END_ACHIEVED_FIELD, String(achieved), { fontSize: YEAR_END_MONTH_FONT_SIZE, align: 'center' })

  if (target > 0) {
    const remainingTotal = target - achieved
    setText(form, YEAR_END_REMAINING_TOTAL_FIELD, `${remainingTotal} 時間`, { fontSize: YEAR_END_MONTH_FONT_SIZE, align: 'center' })
    if (remainingMonths > 0) {
      const remainingPerMonth = remainingTotal / remainingMonths
      setText(form, YEAR_END_REMAINING_PER_MONTH_FIELD, `${remainingPerMonth.toFixed(1)} 時間/月`, {
        fontSize: YEAR_END_MONTH_FONT_SIZE,
        align: 'center',
      })
    }
  }

  // 差し込んだ値を枠の中央よりやや上に見せるため、対象フィールドをまとめて上へずらす
  const shiftedFields = [
    YEAR_END_NAME_FIELD,
    ...YEAR_END_MONTH_FIELDS,
    YEAR_END_CONSIDERED_FIELD,
    YEAR_END_TOTAL_HOURS_FIELD,
    YEAR_END_ACHIEVED_FIELD,
    YEAR_END_REMAINING_TOTAL_FIELD,
    YEAR_END_REMAINING_PER_MONTH_FIELD,
  ]
  shiftedFields.forEach((name) => shiftFieldUp(form, name, YEAR_END_SHIFT_UP))

  form.updateFieldAppearances(japaneseFont)
  form.flatten()

  const page = pdfDoc.getPage(0)
  const pageHeight = page.getHeight()
  drawRightAlignedBeforeX(
    page,
    japaneseFont,
    String(year),
    YEAR_END_TITLE_LABEL.labelStartX,
    YEAR_END_TITLE_LABEL.yTop,
    YEAR_END_TITLE_LABEL.yBottom,
    pageHeight,
    YEAR_END_MONTH_FONT_SIZE,
  )
  if (target > 0) {
    drawCenteredInGap(page, japaneseFont, String(target), YEAR_END_TARGET_GAP, pageHeight, YEAR_END_MONTH_FONT_SIZE)
  }
  drawCenteredInGap(page, japaneseFont, String(remainingMonths), YEAR_END_REMAINING_MONTHS_GAP, pageHeight, YEAR_END_MONTH_FONT_SIZE)

  return pdfDoc.save()
}
