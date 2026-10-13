/**
 * 고침 검토의 바뀐 낱말 칠하기 (10/13 시안 ⑤): 전 · 후 문단을 평소처럼 다 그린 뒤, 보이는 글자끼리 낱말 단위로 비교해
 * 빠진 낱말(전)과 들어간 낱말(후)에 색을 입힌다. 그린 뒤에 칠하므로 Markdown · 수식 문법을 깨지 않고, 비교가 틀려도 색이 어긋날 뿐이다.
 * - 수식(KaTeX) · 그림 · 넣은 파일은 한 덩어리: 조금이라도 바뀌면 통째로 칠한다(그림은 테두리).
 * - 절반 넘게 바뀐 문단은 칠하지 않는다 (낱말마다 칠하면 오히려 읽기 어렵다).
 */

/** 비교 단위 하나: 글 조각(어느 글 노드의 [start, end)) 또는 덩어리(수식 · 그림) */
export interface Atom { key: string; node?: Text; start?: number; end?: number; el?: Element }

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null

/** 글을 낱말 · 기호로 나눈다 (빈칸은 뺀다). 한국어는 어절 안의 조사도 브라우저의 단어 나누기를 따른다 */
export function wordsOf(text: string): { start: number; end: number; key: string }[] {
  const out: { start: number; end: number; key: string }[] = []
  if (segmenter) {
    for (const s of segmenter.segment(text)) if (s.segment.trim()) out.push({ start: s.index, end: s.index + s.segment.length, key: s.segment })
    return out
  }
  for (const m of text.matchAll(/[\p{L}\p{N}]+|\S/gu)) out.push({ start: m.index!, end: m.index! + m[0].length, key: m[0] })
  return out
}

/** 두 열의 바뀐 자리 (가장 긴 공통 부분열 밖). 너무 길면 null (칠하지 않는다) */
export function changedFlags(a: string[], b: string[]): { a: boolean[]; b: boolean[] } | null {
  const n = a.length, m = b.length
  if (n * m > 4_000_000) return null
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
  const fa = new Array<boolean>(n).fill(true), fb = new Array<boolean>(m).fill(true)
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { fa[i] = false; fb[j] = false; i++; j++ }
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++
    else j++
  }
  return { a: fa, b: fb }
}

/** 칠할지: 양쪽 다 낱말이 있고, 어느 쪽도 절반 넘게 바뀌지 않았을 때 */
export function worthPainting(flags: { a: boolean[]; b: boolean[] }): boolean {
  const share = (f: boolean[]) => (f.length ? f.filter(Boolean).length / f.length : 1)
  return flags.a.length > 0 && flags.b.length > 0 && share(flags.a) <= 0.5 && share(flags.b) <= 0.5
}

/** 같은 글 노드 안의 바뀐 낱말을 이어 붙인 칠할 구간 (사이 빈칸도 함께 칠해 한 덩어리로 보인다) */
export function rangesOf(words: { start: number; end: number }[], changed: boolean[]): [number, number][] {
  const out: [number, number][] = []
  words.forEach((w, k) => {
    if (!changed[k]) return
    const last = out[out.length - 1]
    if (last && k > 0 && changed[k - 1]) last[1] = w.end
    else out.push([w.start, w.end])
  })
  return out
}

/** 띄어쓰기 · 줄바꿈만 다른가 */
export const onlySpacing = (a: string, b: string) => a !== b && a.replace(/\s+/g, '') === b.replace(/\s+/g, '')

// ── 그린 화면에 칠하기 ────────────────────────────────────────────

const ATOM = '.katex, img, canvas, .ob-embed'

/** 그린 글의 비교 단위: 글 노드는 낱말로, 수식 · 그림은 덩어리 하나로 */
function atomsOf(root: Element): Atom[] {
  const out: Atom[] = []
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const tn = n as Text
      for (const w of wordsOf(tn.data)) out.push({ key: `t:${w.key}`, node: tn, start: w.start, end: w.end })
      return
    }
    if (!(n instanceof Element)) return
    if (n.matches(ATOM)) {
      const tex = n.querySelector('annotation[encoding="application/x-tex"]')?.textContent
      out.push({ key: `a:${tex ?? n.getAttribute('src') ?? n.getAttribute('data-src') ?? n.textContent ?? ''}`, el: n })
      return
    }
    n.childNodes.forEach(walk)
  }
  walk(root)
  return out
}

function paintAtoms(atoms: Atom[], changed: boolean[], cls: string) {
  // 글 노드마다 모아 뒤에서부터 감싼다 (앞쪽 자리가 밀리지 않게)
  const byNode = new Map<Text, { words: { start: number; end: number }[]; changed: boolean[] }>()
  atoms.forEach((a, k) => {
    if (a.el) { if (changed[k]) a.el.classList.add(cls); return }
    const g = byNode.get(a.node!) ?? { words: [], changed: [] }
    g.words.push({ start: a.start!, end: a.end! })
    g.changed.push(changed[k]!)
    byNode.set(a.node!, g)
  })
  for (const [node, g] of byNode) {
    for (const [s, e] of rangesOf(g.words, g.changed).reverse()) {
      const range = document.createRange()
      range.setStart(node, s)
      range.setEnd(node, e)
      const mark = document.createElement('span')
      mark.className = cls
      range.surroundContents(mark)
    }
  }
}

/** 전 · 후 칸의 그린 글을 비교해 칠한다. 칠한 것이 있으면 true */
export function paintDiff(base: Element, current: Element): boolean {
  const a = atomsOf(base), b = atomsOf(current)
  const flags = changedFlags(a.map((x) => x.key), b.map((x) => x.key))
  if (!flags || !worthPainting(flags)) return false
  paintAtoms(a, flags.a, 'ae-del')
  paintAtoms(b, flags.b, 'ae-ins')
  return true
}
