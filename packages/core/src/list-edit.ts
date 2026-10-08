/**
 * 글 입력칸의 목록 쓰기 (Claude 채팅 입력처럼). "- ", "* ", "1. "로 시작한 줄에서
 *   Enter: 다음 항목을 잇는다 (번호는 하나 늘린다). 빈 항목에서 Enter면 기호를 지워 목록을 끝낸다.
 *   Tab / Shift+Tab: 그 줄을 두 칸 들여쓰기 / 내어쓰기 (memo-markdown의 깊이 = 앞 공백 2칸마다 하나).
 * 목록 줄이 아니면 null을 돌려 입력칸이 원래대로 처리한다.
 */
export interface ListEdit { value: string; start: number; end: number }

const ITEM = /^(\s*)([-*]|\d+[.)]) (.*)$/
const INDENT = '  '

function lineAt(value: string, pos: number): { from: number; to: number; text: string } {
  const from = value.lastIndexOf('\n', pos - 1) + 1
  const nl = value.indexOf('\n', pos)
  const to = nl === -1 ? value.length : nl
  return { from, to, text: value.slice(from, to) }
}

export function listKey(value: string, start: number, end: number, key: 'Enter' | 'Tab', shift = false): ListEdit | null {
  const line = lineAt(value, start)
  const m = ITEM.exec(line.text)
  if (!m) return null
  const [, indent, mark, body] = m as unknown as [string, string, string, string]
  if (key === 'Tab') {
    // 여러 줄을 골랐으면 고른 줄마다 (목록이 아닌 줄은 그대로)
    const last = lineAt(value, Math.max(start, end - (end > start && value[end - 1] === '\n' ? 1 : 0)))
    const lines = value.slice(line.from, last.to).split('\n')
    let delta0 = 0
    let total = 0
    const out = lines.map((l, i) => {
      if (!ITEM.test(l)) return l
      if (!shift) { if (i === 0) delta0 = INDENT.length; total += INDENT.length; return INDENT + l }
      const cut = l.startsWith(INDENT) ? INDENT.length : l.startsWith(' ') || l.startsWith('\t') ? 1 : 0
      if (i === 0) delta0 = -cut
      total -= cut
      return l.slice(cut)
    })
    const next = value.slice(0, line.from) + out.join('\n') + value.slice(last.to)
    return { value: next, start: Math.max(line.from, start + delta0), end: Math.max(line.from, end + total) }
  }
  if (start !== end) return null
  if (!body.trim() && start >= line.from + indent.length + mark.length + 1) {
    // 빈 항목: 들여쓴 항목이면 한 단계 내어쓰고, 맨 바깥이면 기호를 지워 목록을 끝낸다
    const replaced = indent.length >= INDENT.length ? `${indent.slice(INDENT.length)}${mark} ` : ''
    const next = value.slice(0, line.from) + replaced + value.slice(line.to)
    const pos = line.from + replaced.length
    return { value: next, start: pos, end: pos }
  }
  const num = /^(\d+)([.)])$/.exec(mark)
  const nextMark = num ? `${Number(num[1]) + 1}${num[2]}` : mark
  const insert = `\n${indent}${nextMark} `
  const next = value.slice(0, start) + insert + value.slice(end)
  const pos = start + insert.length
  return { value: next, start: pos, end: pos }
}
