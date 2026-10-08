/**
 * 새 브라우저에만 있는 함수를 채운다. pdf.js(pdfjs-dist 5)가 Map·WeakMap의 getOrInsert·getOrInsertComputed를 쓰는데,
 * 조금 오래된 Chromium·Safari에는 없어 PDF를 그리지 못한다 (10/4 서식 미리보기에서 확인).
 */
for (const C of [Map, WeakMap] as unknown as { prototype: Record<string, unknown> }[]) {
  const p = C.prototype as unknown as { has(k: unknown): boolean; get(k: unknown): unknown; set(k: unknown, v: unknown): unknown; getOrInsert?: unknown; getOrInsertComputed?: unknown }
  if (!p.getOrInsert) Object.defineProperty(p, 'getOrInsert', { configurable: true, writable: true, value(this: typeof p, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k) } })
  if (!p.getOrInsertComputed) Object.defineProperty(p, 'getOrInsertComputed', { configurable: true, writable: true, value(this: typeof p, k: unknown, f: (k: unknown) => unknown) { if (!this.has(k)) this.set(k, f(k)); return this.get(k) } })
}
export {}
