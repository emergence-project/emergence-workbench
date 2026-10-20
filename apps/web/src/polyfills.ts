/**
 * 새 브라우저에만 있는 함수를 채운다. pdf.js(pdfjs-dist 5)가 Map·WeakMap의 getOrInsert·getOrInsertComputed를 쓰는데,
 * 조금 오래된 Chromium·Safari에는 없어 PDF를 그리지 못한다 (10/4 서식 미리보기에서 확인).
 * pdfjs-dist 6은 Math.sumPrecise도 쓴다(Safari 26.2 · Chrome 147부터). PDF 작업자(pdf.worker.ts)도 이 파일을 먼저 읽는다.
 */
for (const C of [Map, WeakMap] as unknown as { prototype: Record<string, unknown> }[]) {
  const p = C.prototype as unknown as { has(k: unknown): boolean; get(k: unknown): unknown; set(k: unknown, v: unknown): unknown; getOrInsert?: unknown; getOrInsertComputed?: unknown }
  if (!p.getOrInsert) Object.defineProperty(p, 'getOrInsert', { configurable: true, writable: true, value(this: typeof p, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k) } })
  if (!p.getOrInsertComputed) Object.defineProperty(p, 'getOrInsertComputed', { configurable: true, writable: true, value(this: typeof p, k: unknown, f: (k: unknown) => unknown) { if (!this.has(k)) this.set(k, f(k)); return this.get(k) } })
}
const M = Math as { sumPrecise?: (xs: Iterable<number>) => number }
// 보정 합(Neumaier). 빈 목록은 -0, 무한·NaN이 섞이면 그냥 더한 값 (명세와 같다)
if (!M.sumPrecise) Object.defineProperty(Math, 'sumPrecise', { configurable: true, writable: true, value(xs: Iterable<number>) {
  let sum = -0, c = 0, n = 0
  for (const x of xs) {
    if (typeof x !== 'number') throw new TypeError('Math.sumPrecise: not a number')
    const t = sum + x
    c += Math.abs(sum) >= Math.abs(x) ? (sum - t) + x : (x - t) + sum
    sum = t
    n++
  }
  return n === 0 || !Number.isFinite(sum) || c === 0 ? sum : sum + c
} })
export {}
