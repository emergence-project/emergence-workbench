import { tr } from './i18n.js'
/**
 * Claude가 노트 질문에 답하며 제안한 고침 (10/7 사용자 요청: 노트 지적을 앱에서 에이전트에게 보내기).
 * 답 안의 ```before 블록(노트 원문 그대로)과 바로 뒤 ```after 블록(바꾼 글)이 한 쌍이다. ~~~ 울타리도 받는다.
 * 앱은 사용자가 "노트에 적용"을 누를 때만, before가 노트에 꼭 한 곳 있을 때 바꾼다.
 */
export interface NoteFix { before: string; after: string }

export function parseNoteFixes(body: string): NoteFix[] {
  return splitNoteFixes(body).fixes
}

/** 답을 고침과 나머지 글로 나눈다 (화면은 나머지 글을 메모처럼, 고침은 바꿀 글 · 바꾼 글로 그린다) */
export function splitNoteFixes(body: string): { text: string; fixes: NoteFix[] } {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks: { info: string; text: string; from: number; to: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z]+)\s*$/.exec(lines[i]!)
    if (!open) continue
    const fence = open[1]!
    const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`)
    const end = lines.findIndex((l, j) => j > i && close.test(l))
    if (end === -1) break
    blocks.push({ info: open[2]!.toLowerCase(), text: lines.slice(i + 1, end).join('\n'), from: i, to: end })
    i = end
  }
  const fixes: NoteFix[] = []
  const drop = new Set<number>()
  for (let i = 0; i + 1 < blocks.length; i++) {
    const [b, a] = [blocks[i]!, blocks[i + 1]!]
    if (b.info === 'before' && a.info === 'after' && b.text.trim()) {
      fixes.push({ before: b.text, after: a.text })
      for (let l = b.from; l <= a.to; l++) if (l <= b.to || l >= a.from || !lines[l]!.trim()) drop.add(l)
      i++
    }
  }
  const text = lines.filter((_, l) => !drop.has(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, fixes }
}

const count = (text: string, part: string) => { let n = 0; for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + part.length)) n++; return n }

/** 고침을 차례로 적용한다. 원문이 그사이 바뀌었거나 같은 글이 여러 곳이면 무엇이 문제인지 돌려준다 (아무것도 바꾸지 않음) */
export function applyNoteFixes(text: string, fixes: NoteFix[]): { text: string } | { error: string } {
  let out = text
  for (const [i, fix] of fixes.entries()) {
    const where = fixes.length > 1 ? tr(`${i + 1}번째 고침: `, `Fix ${i + 1}: `) : ''
    const n = count(out, fix.before)
    if (n === 0) return { error: tr(`${where}노트에서 바꿀 글을 찾지 못했습니다. 그사이 노트가 바뀌었을 수 있습니다`, `${where}Could not find the text to replace in the note. The note may have changed in the meantime`) }
    if (n > 1) return { error: tr(`${where}바꿀 글이 노트에 ${n}곳 있어 어디를 바꿀지 모릅니다`, `${where}The text to replace appears ${n} times in the note, so it is unclear which to change`) }
    out = out.replace(fix.before, () => fix.after)
  }
  return { text: out }
}
