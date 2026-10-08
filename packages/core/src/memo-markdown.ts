/**
 * 메모에 쓰는 가벼운 마크다운. 메모는 짧은 생각이라 목록·굵게·코드·수식만 다룬다.
 *   - 항목 / * 항목      글머리 목록 (앞 공백 2칸마다 한 단계 들여쓰기)
 *   1. 항목             번호 목록
 *   **굵게**, `코드`, $수식$
 * 그 밖의 줄은 문단이며, 문단 안 줄바꿈은 그대로 둔다.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'math'; tex: string }

export type MemoBlock =
  | { kind: 'para'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; items: Array<{ depth: number; inline: Inline[] }> }

const BULLET = /^(\s*)[-*]\s+(.*)$/
const NUMBER = /^(\s*)\d+[.)]\s+(.*)$/

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /(\$[^$\n]+\$)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    const tok = m[0]
    if (m[1]) out.push({ kind: 'math', tex: tok.slice(1, -1) })
    else if (m[2]) out.push({ kind: 'code', text: tok.slice(1, -1) })
    else out.push({ kind: 'bold', text: tok.slice(2, -2) })
    last = m.index! + tok.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

export function parseMemo(text: string): MemoBlock[] {
  const blocks: MemoBlock[] = []
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
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
  return blocks.filter((b) => b.kind === 'list' || b.lines.length > 0)
}
