// 要求時間に対する不足/超過分を、黄色→赤色の線形グラデーションで表す。
// excessが1(基準を1時間下回る/上回る)からthreshold(基準の50%)の範囲で徐々に赤くなり、
// threshold以上になると赤で固定。excessが1未満(=問題なし)ならundefined(色を変えない)。
const WARNING_RGB: [number, number, number] = [245, 166, 35] // #f5a623
const DANGER_RGB: [number, number, number] = [208, 2, 27] // #d0021b

export function shortfallColor(excess: number, threshold: number): string | undefined {
  if (!Number.isFinite(excess) || excess < 1 || !Number.isFinite(threshold) || threshold <= 0) return undefined
  const t = threshold <= 1 ? 1 : Math.min(1, (excess - 1) / (threshold - 1))
  const [r, g, b] = WARNING_RGB.map((c, i) => Math.round(c + (DANGER_RGB[i] - c) * t))
  return `rgb(${r}, ${g}, ${b})`
}
