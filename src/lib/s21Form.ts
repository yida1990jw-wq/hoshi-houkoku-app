import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  CHECKBOX_RECTS,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  RULES,
  STATIC_LABELS,
  TEXT_RECTS,
  type Rect,
} from './s21Layout'

// S-21相当の用紙を pdf-lib で一から描画する。以前は組織の配布するPDFを
// テンプレートとして読み込みフォーム欄に値を差し込んでいたが、そのPDFが
// 公開URLから誰でも取得できる状態だったため、用紙自体をコードで描くよう変更した。
// 座標は s21Layout.ts(自動生成)が持つ。

const BLACK = rgb(0, 0, 0)

// チェックボックスの枠。元の用紙は手置きで11〜14ptとばらついていたため、
// 月欄と見出し欄の2種類に揃えて描き直す
const MONTH_BOX_SIZE = 12.5
const HEADER_BOX_SIZE = 10.5
const BOX_BORDER_WIDTH = 0.7

// チェックマークの形。ユーザー作成のSVG(「チェックマーク.svg」「配置サンプル.svg」)から
// 取り込んだ輪郭で、枠を単位正方形(0,0)-(1,1)としたときの座標に正規化してある
// (SVGと同じy下向き。pdf-lib の drawSvgPath も y 下向きに解釈するのでそのまま使える)。
// 払いが右に8.5%・上に8.8%はみ出して枠から抜ける配置になっている。
const CHECK_MARK_PATH =
  'M0.0919,0.3374C0.0919,0.3374 0.0609,0.3937 0.1098,0.4545C0.1588,0.5153 0.3194,0.7448 0.3323,0.8226' +
  'C0.3452,0.9004 0.3948,0.9164 0.3948,0.9164C0.3948,0.9164 0.4457,0.9357 0.4844,0.8348' +
  'C0.5232,0.7340 0.6242,0.5007 0.7002,0.3951C0.7792,0.2855 0.8476,0.1473 1.0602,-0.0174' +
  'C1.0602,-0.0174 1.0848,-0.0368 1.0834,-0.0624C1.0821,-0.0879 1.0465,-0.0847 1.0465,-0.0847' +
  'C1.0465,-0.0847 0.8674,-0.0025 0.6573,0.2453C0.4471,0.4931 0.4079,0.6181 0.4079,0.6181' +
  'C0.4079,0.6181 0.2190,0.3780 0.1553,0.3320C0.1069,0.2970 0.0919,0.3374 0.0919,0.3374Z'

// 記入欄の内側の余白。以前フォーム欄を使っていたときの pdf-lib の既定値と
// 揃えてあり、これにより文字の位置が従来と変わらない
const FIELD_PADDING = 1

export interface S21Fonts {
  regular: PDFFont
  bold: PDFFont
}

function boxGeometry(rect: Rect) {
  const [x, y, w, h] = rect
  // 元の用紙では月欄のチェックが約14pt、見出し欄が約11ptで作られていた
  const size = w > 12.5 ? MONTH_BOX_SIZE : HEADER_BOX_SIZE
  return { cx: x + w / 2, cy: y + h / 2, size }
}

/** チェックマークを描く。輪郭を塗りつぶすので、払いの先細りがそのまま出る */
function drawCheckMark(page: PDFPage, cx: number, cy: number, size: number) {
  // drawSvgPath は指定した座標をSVGの原点(0,0)として y 下向きに描くため、
  // 枠の左上を渡し、枠の一辺を拡大率にすると単位正方形が枠にちょうど重なる
  page.drawSvgPath(CHECK_MARK_PATH, {
    x: cx - size / 2,
    y: cy + size / 2,
    scale: size,
    color: BLACK,
    borderWidth: 0,
  })
}

/** 白紙の用紙(罫線・固定ラベル・チェックボックスの枠)を描く */
export function drawBlankForm(page: PDFPage, fonts: S21Fonts) {
  for (const [x, y, width, height] of RULES) {
    page.drawRectangle({ x, y, width, height, color: BLACK })
  }
  for (const rect of Object.values(CHECKBOX_RECTS)) {
    const { cx, cy, size } = boxGeometry(rect)
    page.drawRectangle({
      x: cx - size / 2,
      y: cy - size / 2,
      width: size,
      height: size,
      borderColor: BLACK,
      borderWidth: BOX_BORDER_WIDTH,
    })
  }
  for (const label of STATIC_LABELS) {
    page.drawText(label.text, {
      x: label.x,
      y: label.y,
      size: label.size,
      font: label.bold ? fonts.bold : fonts.regular,
      color: BLACK,
    })
  }
}

/** 指定のチェック欄にチェックを入れる */
export function checkBox(page: PDFPage, name: string) {
  const rect = CHECKBOX_RECTS[name]
  if (!rect) throw new Error(`チェック欄 ${name} がレイアウト定義にありません`)
  const { cx, cy, size } = boxGeometry(rect)
  drawCheckMark(page, cx, cy, size)
}

export function textRect(name: string): Rect {
  const rect = TEXT_RECTS[name]
  if (!rect) throw new Error(`記入欄 ${name} がレイアウト定義にありません`)
  return rect
}

/** 記入欄の上下中央に来るベースライン位置 */
export function baselineIn(rect: Rect, font: PDFFont, fontSize: number) {
  const [, y, , height] = rect
  const fontHeight = font.heightAtSize(fontSize, { descender: false })
  return y + FIELD_PADDING + ((height - FIELD_PADDING * 2) / 2 - fontHeight / 2)
}

function alignedX(rect: Rect, font: PDFFont, text: string, fontSize: number, align: TextAlign) {
  const [x, , width] = rect
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  if (align === 'center') return x + (width - textWidth) / 2
  if (align === 'right') return x + width - FIELD_PADDING - textWidth
  return x + FIELD_PADDING
}

export type TextAlign = 'left' | 'center' | 'right'

/** 名前で指定した記入欄に文字を描く */
export function drawFieldText(
  page: PDFPage,
  font: PDFFont,
  name: string,
  value: string,
  options: { fontSize: number; align?: TextAlign } = { fontSize: 9 },
) {
  if (!value) return
  const rect = textRect(name)
  page.drawText(value, {
    x: alignedX(rect, font, value, options.fontSize, options.align ?? 'left'),
    y: baselineIn(rect, font, options.fontSize),
    size: options.fontSize,
    font,
    color: BLACK,
  })
}

// フォントは5MB超あるため、伝道者を切り替えるたびに取得し直さないよう保持する
let fontCache: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | undefined

function loadFontBytes() {
  if (!fontCache) {
    fontCache = Promise.all([
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Bold-Labels.ttf`).then((r) => r.arrayBuffer()),
    ]).then(([regular, bold]) => ({ regular, bold }))
    // 失敗したものを持ち続けないようにする
    fontCache.catch(() => {
      fontCache = undefined
    })
  }
  return fontCache
}

/**
 * S-21相当の用紙を1ページ持つPDFを作る。
 * subset:true は pdf-lib のサブセット処理の不具合で文字が欠けるため使わない
 * (フォーム欄の有無とは無関係に再現することを確認済み)。太字は固定ラベルにしか
 * 使わないので、その文字だけに絞った軽量フォントを別に用意している。
 */
export async function createS21Document() {
  const bytes = await loadFontBytes()
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const fonts: S21Fonts = {
    // embedFont が元の ArrayBuffer を変更しないとは限らないため複製を渡す
    regular: await pdfDoc.embedFont(bytes.regular.slice(0), { subset: false }),
    bold: await pdfDoc.embedFont(bytes.bold.slice(0), { subset: false }),
  }
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  drawBlankForm(page, fonts)
  return { pdfDoc, page, fonts }
}
