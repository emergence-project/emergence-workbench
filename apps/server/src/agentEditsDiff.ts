import { t } from './i18n.js'
import { frontMatterLines } from '@rw/core'

// ── 문단 나누기와 비교 ─────────────────────────────────────────────

/**
 * 글을 문단 조각으로 나눈다. 조각을 이어 붙이면 원래 글과 바이트까지 같다 (조각은 뒤따르는 빈 줄을 갖는다).
 * 빈 줄이 문단을 나누지만 머리말(---), 코드 블록(```), 표시 수식($$ … $$), 빈 줄로 띄운 목록은 한 조각이다.
 */
export function splitBlocks(text: string, ignoreMath = false): string[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const out: string[] = []
  let cur = ''
  let fence = false
  let math = false
  const frontEnd = frontMatterLines(text)
  let list = false
  let env = 0
  let blankRun = false
  // 수식·환경이 열린 조각의 자리. 끝까지 닫히지 않으면(짝 없는 $$ 하나) 그 뒤 전체가 한 조각이 되므로, 거기서부터 수식을 보지 않고 다시 나눈다
  let openedAt = -1
  const isBlank = (l: string) => !l.trim()
  const isListLine = (l: string) => /^\s*(?:[-*+]|\d+[.)])\s/.test(l) || /^\s{2,}\S/.test(l)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (i < frontEnd) { cur += l; continue }
    if (blankRun && !isBlank(l)) {
      // 빈 줄 뒤 새 문단: 목록이 이어지면 같은 조각
      if (!(list && isListLine(l))) { out.push(cur); cur = ''; list = false }
      blankRun = false
    }
    if (!cur.trim() && !isBlank(l)) list = isListLine(l)
    cur += l
    if (/^\s*(```|~~~)/.test(l)) fence = !fence
    else if (!fence && !ignoreMath) {
      const wasOpen = math || env > 0
      const n = (l.match(/\$\$/g) ?? []).length
      if (n % 2 === 1) math = !math
      // LaTeX 환경 (\begin{…} … \end{…}) 안의 빈 줄도 나누지 않는다. document는 글 전체라 세지 않는다
      const code = l.replace(/(^|[^\\])%.*$/, '$1')
      env += (code.match(/\\begin\{(?!document\})/g) ?? []).length - (code.match(/\\end\{(?!document\})/g) ?? []).length
      if (env < 0) env = 0
      if (!wasOpen && (math || env > 0)) openedAt = out.length
    }
    if (isBlank(l) && !fence && !math && !env && cur.trim()) blankRun = true
  }
  if (cur) out.push(cur)
  if ((math || env > 0) && openedAt >= 0) {
    const head = out.slice(0, openedAt)
    return [...head, ...splitBlocks(text.slice(head.join('').length), true)]
  }
  return out
}

/** 조각을 비교하는 열쇠 (뒤 빈 줄 차이는 무시) */
const keyOf = (b: string) => b.trim()

export interface Hunk {
  /** 기준판 조각 [b0, b1)과 지금 조각 [c0, c1) */
  id: string
  b0: number; b1: number; c0: number; c1: number
  base: string
  current: string
  /** 바뀐 곳이 든 절 (머리 제목 이어 붙임, 「Setup › Symbols」). 절 밖이면 없다 */
  section?: string
  /** 앞 · 뒤의 바뀌지 않은 문단 (지금 글). 그 자리에 다른 바뀐 곳이 붙어 있거나 글 끝이면 없다 */
  prev?: string
  next?: string
  /** 에이전트가 이 바뀐 곳의 글을 쓸 때 남긴 이유 (10/14) */
  reason?: { reason: string; by?: string; at: string }
}

/**
 * 글 앞부분이 끝나는 자리의 절 이름: Markdown `## 제목`, LaTeX `\section{제목}` · `\subsection{…}`.
 * 맨 위 단계(# 노트 제목)는 아래 단계가 있으면 뺀다. 머리말과 코드 울타리 안의 # 줄은 제목이 아니다.
 */
export function sectionAt(prefix: string): string | undefined {
  const stack: { level: number; title: string }[] = []
  let fence = false
  // 머리말(--- … ---)의 # 줄은 주석이다
  const body = prefix.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '')
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence) continue
    const md = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    const tex = /^\s*\\(sub){0,2}section\*?\{(.+)\}/.exec(line)
    const head = md ? { level: md[1]!.length, title: md[2]! } : tex ? { level: 2 + (tex[0].match(/sub/g)?.length ?? 0), title: tex[2]! } : null
    if (!head) continue
    while (stack.length && stack[stack.length - 1]!.level >= head.level) stack.pop()
    stack.push(head)
  }
  const shown = stack.length > 1 && stack[0]!.level === 1 ? stack.slice(1) : stack
  // 제목 뒤 \label{…}은 이름이 아니다
  return shown.length ? shown.map((h) => h.title.replace(/\s*\\label\{[^}]*\}/g, '').trim()).join(' › ') : undefined
}

/** 바뀐 곳마다 든 절을 붙인다 (지금 글 기준, 지운 문단은 기준판 기준). 바뀐 곳 첫 조각이 제목이면 그 제목 아래로 본다 */
export function withSections(hunks: Hunk[], base: string[], cur: string[]): Hunk[] {
  return hunks.map((h) => {
    const [blocks, at, end] = h.c1 > h.c0 ? [cur, h.c0, h.c1] : [base, h.b0, h.b1]
    const first = end > at ? blocks[at]!.split('\n').find((l) => l.trim()) ?? '' : ''
    const section = sectionAt(blocks.slice(0, at).join('') + (/^\s*(#{1,6}\s|\\(sub){0,2}section)/.test(first) ? first : ''))
    return section ? { ...h, section } : h
  })
}

/** 두 문단이 얼마나 닮았나 (낱말 모음의 Dice 계수, 0–1) */
export function similarity(a: string, b: string): number {
  const words = (s: string) => s.match(/[\p{L}\p{N}]+|\S/gu) ?? []
  const wa = words(a), wb = words(b)
  if (!wa.length || !wb.length) return wa.length === wb.length ? 1 : 0
  const count = new Map<string, number>()
  for (const w of wa) count.set(w, (count.get(w) ?? 0) + 1)
  let common = 0
  for (const w of wb) { const n = count.get(w) ?? 0; if (n > 0) { common++; count.set(w, n - 1) } }
  return (2 * common) / (wa.length + wb.length)
}

/** 이만큼 닮아야 고친 문단 하나로 짝짓는다 (덜 닮으면 지운 문단 · 새 문단) */
const PAIR_MIN = 0.3

/**
 * 맞지 않는 연속 구간 [b0, b1) · [c0, c1)을 문단 하나씩의 바뀐 곳으로 나눈다 (10/13 시안: 붙은 고침도 문단마다 따로 승인 · 되돌리기).
 * 수가 같으면 차례대로 짝짓고, 다르면 닮은 문단끼리 짝지은 뒤(순서를 지키는 최대 짝) 남은 것은 지운 문단 · 새 문단이 된다.
 * 짝 사이에 남은 수가 같으면 그것도 차례대로 짝짓는다.
 */
export function pairBlocks(base: string[], cur: string[], b0: number, b1: number, c0: number, c1: number): [number, number][] {
  const nb = b1 - b0, nc = c1 - c0
  if (nb === nc) return Array.from({ length: nb }, (_, k) => [b0 + k, c0 + k])
  if (!nb || !nc) return []
  // S[i][j] = base[b0+i..] · cur[c0+j..]에서 얻는 닮음 합의 최대
  const sim = (i: number, j: number) => similarity(base[b0 + i]!.trim(), cur[c0 + j]!.trim())
  const S: number[][] = Array.from({ length: nb + 1 }, () => new Array<number>(nc + 1).fill(0))
  for (let i = nb - 1; i >= 0; i--) for (let j = nc - 1; j >= 0; j--) {
    const s = sim(i, j)
    S[i]![j] = Math.max(S[i + 1]![j]!, S[i]![j + 1]!, s >= PAIR_MIN ? s + S[i + 1]![j + 1]! : -1)
  }
  const pairs: [number, number][] = []
  let i = 0, j = 0
  while (i < nb && j < nc) {
    const s = sim(i, j)
    if (s >= PAIR_MIN && S[i]![j] === s + S[i + 1]![j + 1]!) { pairs.push([b0 + i, c0 + j]); i++; j++ }
    else if (S[i]![j] === S[i + 1]![j]) i++
    else j++
  }
  // 짝 사이 남은 구간: 수가 같으면 차례대로 짝짓는다
  const out: [number, number][] = []
  let pb = b0, pc = c0
  for (const [b, c] of pairs.concat([[b1, c1]])) {
    if (b - pb === c - pc) for (let k = 0; k < b - pb; k++) out.push([pb + k, pc + k])
    if (b < b1) out.push([b, c])
    pb = b + 1; pc = c + 1
  }
  return out
}

/** 바뀐 곳마다 앞뒤의 바뀌지 않은 문단을 하나씩 붙인다 (화면의 펼치기). 머리말 · 제목 조각은 맥락으로 보이지 않는다 */
export function withContext(hunks: Hunk[], cur: string[]): Hunk[] {
  const text = (k: number) => {
    const b = cur[k]
    // 제목 줄은 절 헤더가 이미 보이므로 맥락으로 펼치지 않는다
    return b === undefined || (k === 0 && /^---\r?\n/.test(b)) || /^\s*(#{1,6}\s|\\(sub){0,2}section)/.test(b) ? undefined : b.trim() || undefined
  }
  return hunks.map((h, k) => {
    const before = hunks[k - 1], after = hunks[k + 1]
    const prev = before && before.c1 === h.c0 && before.b1 === h.b0 ? undefined : text(h.c0 - 1)
    const next = after && after.c0 === h.c1 && after.b0 === h.b1 ? undefined : text(h.c1)
    return { ...h, ...(prev && { prev }), ...(next && { next }) }
  })
}

/** 기준판과 지금 글의 다른 곳 (가장 긴 공통 부분열로 맞춘 뒤 맞지 않는 연속 구간을 문단 하나씩으로 나눈다) */
export function diffBlocks(base: string[], cur: string[]): Hunk[] {
  const a = base.map(keyOf), b = cur.map(keyOf)
  const n = a.length, m = b.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
  const hunks: Hunk[] = []
  let i = 0, j = 0
  let start: [number, number] | null = null
  const close = () => {
    if (!start) return
    const [b0, c0] = start
    const piece = (pb0: number, pb1: number, pc0: number, pc1: number) =>
      hunks.push({ id: `${pb0}:${pb1}:${pc0}:${pc1}`, b0: pb0, b1: pb1, c0: pc0, c1: pc1, base: base.slice(pb0, pb1).join('').trim(), current: cur.slice(pc0, pc1).join('').trim() })
    // 짝 사이에 남은 문단은 하나씩 지운 문단(기준판) · 새 문단(지금 글)
    let pb = b0, pc = c0
    for (const [b, c] of pairBlocks(base, cur, b0, i, c0, j).concat([[i, j]])) {
      for (; pb < b; pb++) piece(pb, pb + 1, pc, pc)
      for (; pc < c; pc++) piece(pb, pb, pc, pc + 1)
      if (b < i) piece(b, b + 1, c, c + 1)
      pb = b + 1; pc = c + 1
    }
    start = null
  }
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { close(); i++; j++; continue }
    start ??= [i, j]
    if (j >= m || (i < n && L[i + 1]![j]! >= L[i]![j + 1]!)) i++
    else j++
  }
  close()
  return hunks
}

/** 조각을 다시 이어 붙인다. 가운데 조각이 빈 줄로 끝나지 않으면(옮겨 온 마지막 조각 등) 빈 줄을 채운다 */
export function joinBlocks(blocks: string[]): string {
  return blocks.map((b, k) => (k < blocks.length - 1 && !/\n\s*\n$/.test(b) ? b.replace(/\n?$/, '\n\n') : b)).join('')
}

// ── 대상 읽기와 쓰기 ────────────────────────────────────────────────
