/**
 * 메모에 쓰는 가벼운 마크다운. 메모는 짧은 생각이라 목록·굵게·코드·수식만 다룬다.
 *   - 항목 / * 항목      글머리 목록 (앞 공백 2칸마다 한 단계 들여쓰기)
 *   1. 항목             번호 목록
 *   **굵게**, `코드`, $수식$ · \(수식\)
 *   $$수식$$ · \[수식\]   가운데 한 줄 수식 (여러 줄에 걸쳐도 된다. 에이전트 대화의 답, 10/28 19:02 피드백)
 *   ```언어 … ```       코드 블록 (에이전트 대화의 답에 오는 셸 명령 등, 11/19. 닫지 않았으면 끝까지: 답이 오는 중)
 *   | 머리 | 머리 |       표 (GFM: 머리 줄 다음에 |---|:--:| 줄. 에이전트 대화의 답, 11/18 피드백)
 * 그 밖의 줄은 문단이며, 문단 안 줄바꿈은 그대로 둔다.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'math'; tex: string; display?: boolean }

export type MemoBlock =
  | { kind: 'para'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; items: Array<{ depth: number; inline: Inline[] }> }
  | { kind: 'math'; tex: string }
  | { kind: 'pre'; lang: string; text: string }
  | { kind: 'table'; align: TableAlign[]; head: Inline[][]; rows: Inline[][][] }

export type TableAlign = 'left' | 'center' | 'right' | null

const BULLET = /^(\s*)[-*]\s+(.*)$/
const NUMBER = /^(\s*)\d+[.)]\s+(.*)$/

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /(\$\$[^$\n]+\$\$)|(\\\[.+?\\\])|(\\\(.+?\\\))|(\$[^$\n]+\$)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    const tok = m[0]
    if (m[1] || m[2]) out.push({ kind: 'math', tex: tok.slice(2, -2), display: true })
    else if (m[3]) out.push({ kind: 'math', tex: tok.slice(2, -2) })
    else if (m[4]) out.push({ kind: 'math', tex: tok.slice(1, -1) })
    else if (m[5]) out.push({ kind: 'code', text: tok.slice(1, -1) })
    else out.push({ kind: 'bold', text: tok.slice(2, -2) })
    last = m.index! + tok.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** 표 한 줄을 칸으로 나눈다. 앞뒤 |는 떼고, \| · `코드` · $수식$ 안의 |는 칸을 나누지 않는다 ($5 | $6 같은 돈은 수식이 아니다) */
export function memoTableCells(line: string): string[] {
  const s = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\' && s[i + 1] === '|') { cell += '|'; i++; continue }
    if (c === '|') { cells.push(cell.trim()); cell = ''; continue }
    // 코드와 수식은 닫는 짝까지 한 덩어리로 (수식은 $ 바로 안쪽이 공백이 아니고 닫는 $ 뒤가 숫자가 아닐 때만)
    let end = -1
    if (c === '`') end = s.indexOf('`', i + 1)
    else if (c === '$' && /\S/.test(s[i + 1] ?? ' ')) {
      for (let j = i + 2; j < s.length; j++) if (s[j] === '$' && s[j - 1] !== ' ' && !/\d/.test(s[j + 1] ?? '')) { end = j; break }
    }
    if (end > i) { cell += s.slice(i, end + 1); i = end; continue }
    cell += c
  }
  cells.push(cell.trim())
  return cells
}

const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** lines[i]가 표 머리이고 다음 줄이 구분 줄이면 표와 그 다음 줄 번호 */
function readTable(lines: string[], i: number): { table: Extract<MemoBlock, { kind: 'table' }>; next: number } | null {
  const headLine = lines[i]!
  const rule = lines[i + 1]
  if (!headLine.includes('|') || rule === undefined || !rule.includes('|') || !TABLE_RULE.test(rule)) return null
  const head = memoTableCells(headLine)
  const align = memoTableCells(rule).map((c): TableAlign => c.startsWith(':') ? (c.endsWith(':') ? 'center' : 'left') : c.endsWith(':') ? 'right' : null)
  if (align.length !== head.length) return null
  const rows: Inline[][][] = []
  let j = i + 2
  for (; j < lines.length && lines[j]!.trim() !== '' && lines[j]!.includes('|'); j++) {
    const cells = memoTableCells(lines[j]!)
    rows.push(head.map((_, k) => parseInline(cells[k] ?? '')))
  }
  return { table: { kind: 'table', align, head: head.map(parseInline), rows }, next: j }
}

export function parseMemo(text: string): MemoBlock[] {
  const blocks: MemoBlock[] = []
  // 가운데 수식 블록: $$ · \[ 로 연 줄부터 $$ · \] 로 닫는 줄까지 (한 줄 안에서 닫히면 문단 안 수식으로 둔다)
  let math: { close: string; lines: string[] } | null = null
  // 코드 블록: 연 울타리(``` · ~~~)와 같은 글자로 같은 길이 이상인 줄이 닫는다. 연 줄의 들여쓰기만큼 줄 앞을 덜어 낸다
  let pre: { fence: string; indent: number; lang: string; lines: string[] } | null = null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    if (pre) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(raw)
      if (close && close[1]![0] === pre.fence[0] && close[1]!.length >= pre.fence.length) {
        blocks.push({ kind: 'pre', lang: pre.lang, text: pre.lines.join('\n') })
        pre = null
      } else pre.lines.push(raw.replace(new RegExp(`^ {0,${pre.indent}}`), ''))
      continue
    }
    const fence = math ? null : /^( *)(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/.exec(raw)
    if (fence) { pre = { fence: fence[2]!, indent: fence[1]!.length, lang: fence[3]!.toLowerCase(), lines: [] }; continue }
    if (math) {
      const end = raw.indexOf(math.close)
      if (end < 0) { math.lines.push(raw); continue }
      math.lines.push(raw.slice(0, end))
      blocks.push({ kind: 'math', tex: math.lines.join('\n').trim() })
      math = null
      continue
    }
    const open = /^\s*(\$\$|\\\[)(.*)$/.exec(raw)
    if (open && !(open[1] === '$$' ? open[2]!.includes('$$') : open[2]!.includes('\\]'))) {
      math = { close: open[1] === '$$' ? '$$' : '\\]', lines: [open[2]!] }
      continue
    }
    const table = readTable(lines, i)
    if (table) { blocks.push(table.table); i = table.next - 1; continue }
    const whole = /^\s*(?:\$\$([^$]+)\$\$|\\\[((?:(?!\\\]).)+)\\\])\s*$/.exec(raw)
    if (whole) { blocks.push({ kind: 'math', tex: (whole[1] ?? whole[2]!).trim() }); continue }
    const b = BULLET.exec(raw)
    const n = b ? null : NUMBER.exec(raw)
    const item = b ?? n
    const last = blocks[blocks.length - 1]
    if (item) {
      const ordered = !!n
      const entry = { depth: Math.floor(item[1]!.replace(/\t/g, '  ').length / 2), inline: parseInline(item[2]!) }
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(entry)
      else blocks.push({ kind: 'list', ordered, items: [entry] })
    } else if (raw.trim() === '') {
      blocks.push({ kind: 'para', lines: [] }) // 빈 줄은 문단을 끊는다 (아래에서 정리)
    } else if (last?.kind === 'para' && last.lines.length > 0) {
      last.lines.push(parseInline(raw))
    } else {
      blocks.push({ kind: 'para', lines: [parseInline(raw)] })
    }
  }
  if (pre) blocks.push({ kind: 'pre', lang: pre.lang, text: pre.lines.join('\n') })
  // 닫지 않은 수식 블록은 원문 그대로 문단으로
  if (math) blocks.push({ kind: 'para', lines: [[{ kind: 'text', text: (math.close === '$$' ? '$$' : '\\[') + math.lines.join('\n') }]] })
  return blocks.filter((b) => b.kind !== 'para' || b.lines.length > 0)
}
