import { PDFDocument, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { isBoldRenderable } from './pdfBoldChars'

// PDFに埋め込む日本語フォント。帳票を作る各所で共有する。
//
// 標準フォント(Helvetica)は日本語をエンコードできないため Noto Sans JP を埋め込む。
// pdf-lib の subset:true はサブセット処理の不具合で一部の文字が描画されないため使えない
// (AcroFormの有無とは無関係に再現することを確認済み)。そのため本文用は全文字を埋め込む。
// 太字は帳票の見出しなど決まった文字にしか使わないので、その文字だけに絞った軽量版
// (fontToolsで生成、public/fonts/NotoSansJP-Bold-Labels.ttf)を別に用意している。

export interface PdfFonts {
  regular: PDFFont
  bold: PDFFont
}

// 5MB超あるため、帳票を作り直すたびに取得し直さないよう保持する
let cache: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | undefined

function loadFontBytes() {
  if (!cache) {
    cache = Promise.all([
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Bold-Labels.ttf`).then((r) => r.arrayBuffer()),
    ]).then(([regular, bold]) => ({ regular, bold }))
    cache.catch(() => {
      cache = undefined
    })
  }
  return cache
}

/** フォントを埋め込んだ空のPDFを作る(ページはまだ無い) */
export async function createPdfWithFonts(): Promise<{ pdfDoc: PDFDocument; fonts: PdfFonts }> {
  const bytes = await loadFontBytes()
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const fonts: PdfFonts = {
    // embedFont が元の ArrayBuffer を変更しないとは限らないため複製を渡す
    regular: await pdfDoc.embedFont(bytes.regular.slice(0), { subset: false }),
    bold: await pdfDoc.embedFont(bytes.bold.slice(0), { subset: false }),
  }
  return { pdfDoc, fonts }
}

/**
 * 太字フォントは見出し用に収録文字を絞ってある。**pdf-lib は未収録の文字でも例外を投げず、
 * 黙って空白として描いてしまう**ため、描く前に必ずこれで確認すること
 * (実際に「立場別の集計」が「立場 の 計」と欠けて出る不具合を起こした)。
 * 収録文字の一覧は pdfBoldChars.ts に自動生成されている。
 */
export function canRenderWithBold(_font: PDFFont, text: string): boolean {
  return isBoldRenderable(text)
}
