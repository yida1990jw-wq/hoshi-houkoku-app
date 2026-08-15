import { rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { canRenderWithBold, createPdfWithFonts, type PdfFonts } from './pdfFonts'

// 画面の一覧表をA4 1ページのPDFにするための共通処理。
// 行数に応じて行の高さと文字サイズを自動で縮め、必ず1ページに収める。

const A4_SHORT = 595.28
const A4_LONG = 841.89
const MARGIN = 28

const BLACK = rgb(0, 0, 0)
const LINE = rgb(0.6, 0.6, 0.6)
const HEADER_BG = rgb(0.93, 0.91, 0.98)
const ZEBRA_BG = rgb(0.97, 0.97, 0.97)

export type Align = 'left' | 'center' | 'right'

export interface TableColumn {
  header: string
  /** 列幅の比率 */
  flex: number
  align?: Align
}

export interface TableCell {
  text: string
  /** 背景色(#rrggbb)。開拓者進捗の不足の色分けに使う */
  bg?: string
  align?: Align
  bold?: boolean
}

export interface TableBlock {
  caption?: string
  columns: TableColumn[]
  rows: TableCell[][]
  /** 表の幅(印刷領域に対する比率)。集計表のような小さい表を左寄せで置くのに使う */
  widthRatio?: number
  /** 1行おきに薄い背景を敷く */
  zebra?: boolean
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** 列幅に収まるよう末尾を削る(入りきらない備考などのため) */
function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (!text) return ''
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

function drawCellText(
  page: PDFPage,
  fonts: PdfFonts,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  align: Align,
  bold: boolean,
) {
  if (!text) return
  // 太字フォントは収録文字を絞ってあるため、無い文字が来たら本文用にする
  const font = bold && canRenderWithBold(fonts.bold, text) ? fonts.bold : fonts.regular
  const pad = size * 0.35
  const shown = fitText(font, text, size, width - pad * 2)
  const w = font.widthOfTextAtSize(shown, size)
  let tx = x + pad
  if (align === 'center') tx = x + (width - w) / 2
  else if (align === 'right') tx = x + width - pad - w
  page.drawText(shown, { x: tx, y, size, font, color: BLACK })
}

export interface RenderOptions {
  orientation: 'portrait' | 'landscape'
  title: string
  subtitle?: string
  blocks: TableBlock[]
  /** 右下に小さく入れる補足(出力日など) */
  note?: string
}

export async function renderTablesPdf(options: RenderOptions): Promise<Uint8Array> {
  const { pdfDoc, fonts } = await createPdfWithFonts()
  const landscape = options.orientation === 'landscape'
  const pageWidth = landscape ? A4_LONG : A4_SHORT
  const pageHeight = landscape ? A4_SHORT : A4_LONG
  const page = pdfDoc.addPage([pageWidth, pageHeight])
  const contentWidth = pageWidth - MARGIN * 2

  const titleSize = 15
  const captionSize = 9.5
  const noteSize = 7.5
  const blockGap = 14

  // 見出し・補足を除いた高さを、全ブロックの行数で分け合う
  let used = titleSize + 14
  if (options.note) used += noteSize + 6
  for (const b of options.blocks) used += (b.caption ? captionSize + 5 : 0) + blockGap
  const totalRows = options.blocks.reduce((sum, b) => sum + b.rows.length + 1, 0)
  const available = pageHeight - MARGIN * 2 - used
  const rowHeight = Math.max(7, Math.min(18, available / Math.max(totalRows, 1)))
  const fontSize = Math.max(5.5, Math.min(10.5, rowHeight * 0.6))

  let y = pageHeight - MARGIN - titleSize
  page.drawText(options.title, {
    x: MARGIN,
    y,
    size: titleSize,
    font: canRenderWithBold(fonts.bold, options.title) ? fonts.bold : fonts.regular,
    color: BLACK,
  })
  if (options.subtitle) {
    const f = fonts.regular
    const w = f.widthOfTextAtSize(options.subtitle, captionSize + 1)
    page.drawText(options.subtitle, {
      x: pageWidth - MARGIN - w,
      y,
      size: captionSize + 1,
      font: f,
      color: BLACK,
    })
  }
  y -= 14

  for (const block of options.blocks) {
    if (block.caption) {
      y -= captionSize
      drawCellText(page, fonts, block.caption, MARGIN, y, contentWidth, captionSize, 'left', true)
      y -= 5
    }

    const tableWidth = contentWidth * (block.widthRatio ?? 1)
    const flexTotal = block.columns.reduce((sum, c) => sum + c.flex, 0)
    const widths = block.columns.map((c) => (c.flex / flexTotal) * tableWidth)
    const xs: number[] = []
    let x = MARGIN
    for (const w of widths) {
      xs.push(x)
      x += w
    }

    const drawRow = (cells: TableCell[], top: number, isHeader: boolean, index: number) => {
      const rowY = top - rowHeight
      if (isHeader) {
        page.drawRectangle({ x: MARGIN, y: rowY, width: tableWidth, height: rowHeight, color: HEADER_BG })
      } else if (block.zebra && index % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: rowY, width: tableWidth, height: rowHeight, color: ZEBRA_BG })
      }
      cells.forEach((cell, i) => {
        if (i >= widths.length) return
        const bg = cell.bg ? hexToRgb(cell.bg) : undefined
        if (bg) page.drawRectangle({ x: xs[i], y: rowY, width: widths[i], height: rowHeight, color: bg })
        const baseline = rowY + (rowHeight - fonts.regular.heightAtSize(fontSize, { descender: false })) / 2
        drawCellText(
          page,
          fonts,
          cell.text,
          xs[i],
          baseline,
          widths[i],
          fontSize,
          cell.align ?? block.columns[i]?.align ?? 'left',
          isHeader || !!cell.bold,
        )
      })
      // 横罫線
      page.drawLine({
        start: { x: MARGIN, y: rowY },
        end: { x: MARGIN + tableWidth, y: rowY },
        thickness: 0.4,
        color: LINE,
      })
      return rowY
    }

    const tableTop = y
    y = drawRow(
      block.columns.map((c) => ({ text: c.header, align: c.align ?? 'center' })),
      y,
      true,
      -1,
    )
    block.rows.forEach((row, i) => {
      y = drawRow(row, y, false, i)
    })

    // 縦罫線と外枠
    page.drawLine({ start: { x: MARGIN, y: tableTop }, end: { x: MARGIN + tableWidth, y: tableTop }, thickness: 0.4, color: LINE })
    for (let i = 0; i <= widths.length; i += 1) {
      const lx = i === widths.length ? MARGIN + tableWidth : xs[i]
      page.drawLine({ start: { x: lx, y: tableTop }, end: { x: lx, y }, thickness: 0.4, color: LINE })
    }
    y -= blockGap
  }

  if (options.note) {
    const w = fonts.regular.widthOfTextAtSize(options.note, noteSize)
    page.drawText(options.note, {
      x: pageWidth - MARGIN - w,
      y: MARGIN - noteSize,
      size: noteSize,
      font: fonts.regular,
      color: rgb(0.4, 0.4, 0.4),
    })
  }

  return pdfDoc.save()
}
