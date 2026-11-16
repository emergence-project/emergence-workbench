import { atomsOf, type Atom } from './diffPaint'

/**
 * 이력 보기의 겹쳐 칠하기 (11/16 시안 N7ik 2절 ③′): 고른 커밋의 전 · 후 노트를 평소처럼 다 그린 뒤,
 * 보이는 낱말끼리 비교해 후 화면에 더한 글은 밑줄 바탕으로 칠하고, 지운 글은 그 자리에 줄 그은 조각으로 끼워 넣는다.
 * 고침 검토(diffPaint.ts)와 같은 단위를 쓴다: 글은 낱말, 수식 · 그림은 덩어리 하나. 그린 뒤에 칠하므로 Markdown · 수식 문법을 깨지 않는다.
 */

/**
 * 두 열의 공통 부분 (Myers 차이). 짝지은 자리 [a의 자리, b의 자리]를 앞에서부터.
 * 바뀐 것이 너무 많으면(limit 넘음) null: 칠하지 않는다
 */
export function commonPairs(a: string[], b: string[], limit = 1500): [number, number][] | null {
  const n = a.length, m = b.length, max = n + m
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  // d번째 단계 앞의 v에서 쓰는 자리는 k = -d-1 … d+1 뿐이라 그만큼만 적어 둔다 (기억 공간 d²)
  const trace: Int32Array[] = []
  const at = (d: number, k: number) => trace[d]![k + d + 1]!
  let found = false
  for (let d = 0; d <= Math.min(max, limit); d++) {
    trace.push(v.slice(off - d - 1, off + d + 2))
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[off + k] = x
      if (x >= n && y >= m) { found = true; break }
    }
    if (found) break
  }
  if (!found) return null
  // 거꾸로 따라가며 대각선(같은 자리)을 모은다
  const pairs: [number, number][] = []
  let x = n, y = m
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const k = x - y
    const prevK = k === -d || (k !== d && at(d, k - 1) < at(d, k + 1)) ? k + 1 : k - 1
    const prevX = d === 0 ? 0 : at(d, prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) { x--; y--; pairs.push([x, y]) }
    if (d > 0) { x = prevX; y = prevY }
  }
  return pairs.reverse()
}

type Op = { at: number; end?: number; node: Text; kind: 'wrap' | 'insert'; make?: () => Node }

/** 지운 조각: 같은 글 노드의 이어진 낱말은 원래 글 그대로, 수식 · 그림은 복사 */
function deletedPiece(atoms: Atom[], delCls: string): HTMLElement {
  const span = document.createElement('span')
  span.className = delCls
  let k = 0
  while (k < atoms.length) {
    const a = atoms[k]!
    if (a.el) { span.append(a.el.cloneNode(true)); k++; continue }
    let j = k
    while (j + 1 < atoms.length && atoms[j + 1]!.node === a.node) j++
    if (span.childNodes.length) span.append(' ')
    span.append(a.node!.data.slice(a.start!, atoms[j]!.end!))
    k = j + 1
  }
  return span
}

/** 후 화면(after)에 칠한다. 바뀐 것이 있으면 true */
export function paintHistory(before: Element, after: Element, insCls: string, delCls: string): boolean {
  const a = atomsOf(before), b = atomsOf(after)
  const pairs = commonPairs(a.map((x) => x.key), b.map((x) => x.key))
  if (!pairs) return false
  const keptB = new Set(pairs.map(([, j]) => j))
  const ops: Op[] = []
  // 더한 낱말: 같은 글 노드에서 이어진 것은 한 덩어리로
  b.forEach((atom, j) => {
    if (keptB.has(j)) return
    if (atom.el) { atom.el.classList.add(...insCls.split(/\s+/).filter(Boolean)); return }
    const last = ops[ops.length - 1]
    if (last?.kind === 'wrap' && last.node === atom.node && j > 0 && !keptB.has(j - 1) && b[j - 1]!.node === atom.node) last.end = atom.end!
    else ops.push({ kind: 'wrap', node: atom.node!, at: atom.start!, end: atom.end! })
  })
  // 지운 낱말: 앞의 같은 낱말(짝) 바로 뒤에 끼운다
  const els: { anchor: Element; where: 'after' | 'before'; piece: HTMLElement }[] = []
  let changed = ops.length > 0 || b.some((x, j) => !keptB.has(j) && !!x.el)
  let pi = 0
  let prevB = -1
  for (let i = 0; i < a.length;) {
    if (pi < pairs.length && pairs[pi]![0] === i) { prevB = pairs[pi]![1]; pi++; i++; continue }
    const run: Atom[] = []
    while (i < a.length && !(pi < pairs.length && pairs[pi]![0] === i)) run.push(a[i++]!)
    changed = true
    const piece = deletedPiece(run, delCls)
    const anchor = prevB >= 0 ? b[prevB] : b[0]
    const where = prevB >= 0 ? 'after' : 'before'
    if (!anchor) { after.append(piece); continue }
    if (anchor.el) { els.push({ anchor: anchor.el, where, piece }); continue }
    const at = where === 'after' ? anchor.end! : anchor.start!
    ops.push({ kind: 'insert', node: anchor.node!, at, make: () => { const s = document.createDocumentFragment(); s.append(where === 'after' ? ' ' : '', piece, where === 'before' ? ' ' : ''); return s } })
  }
  // 글 노드마다 뒤에서부터 (앞 자리가 밀리지 않게, 원래 노드에는 늘 앞부분이 남는다)
  const byNode = new Map<Text, Op[]>()
  for (const op of ops) byNode.set(op.node, [...(byNode.get(op.node) ?? []), op])
  for (const [node, list] of byNode) {
    list.sort((x, y) => (y.at - x.at) || (x.kind === 'insert' ? -1 : 1))
    for (const op of list) {
      if (op.kind === 'wrap') {
        const range = document.createRange()
        range.setStart(node, op.at)
        range.setEnd(node, op.end!)
        const mark = document.createElement('span')
        mark.className = insCls
        range.surroundContents(mark)
      } else {
        const rest = node.splitText(op.at)
        rest.before(op.make!())
      }
    }
  }
  for (const e of els) (e.where === 'after' ? e.anchor.after(e.piece) : e.anchor.before(e.piece))
  return changed
}
