import fs from 'node:fs'
import path from 'node:path'
import { conceptRecordTarget, memoUnits } from '@rw/core'
import { addComment, readComments, updateComment, type NewComment } from './comments.js'

/**
 * 개념노트 메모(concepts/<id>.memo.md)를 기록 카드(<라이브러리>/workbench/comments/concept-<id>.md)로 옮긴다
 * (10/18 결정 "지식 라이브러리도 같은 장치로", 사용자 "옮기기 승인"). 카드는 메모 화면의 상자와 같은 단위(memoUnits)다:
 * - 할 일 `- [ ] …`(아래 들여 쓴 줄 포함) → 할 일 카드, `- [x]`는 완료
 * - 본문 글을 골라 단 메모 → 그 글을 인용한 메모 카드, 글 없이 고르기만 했으면 하이라이트
 * - 나머지(목록 항목 · 문단 · 제목 아래 절) → 메모 카드. 기록 카드에는 제목 줄을 쓸 수 없어 제목은 굵은 글로 바꾸고,
 *   제목만 있는 절(할 일 목록 위의 "## 할 일" 등)은 버린다
 * 원래 메모 파일은 <라이브러리>/workbench/.trash/concept-memos/로 옮긴다(앱은 읽지 않고, 되살릴 때는 손으로).
 */

export interface MemoCard { input: NewComment; done: boolean }
export interface MemoPlan { id: string; memo: string; target: string; cards: MemoCard[] }

const MEMO_SUFFIX = '.memo.md'
export const MEMO_TRASH = path.join('.trash', 'concept-memos')

/** 개념노트 파일 머리말의 줄 수: 메모 앵커의 줄 번호는 머리말을 뺀 본문 기준이고, 기록은 파일 줄 번호를 쓴다 */
function frontLines(text: string): number {
  if (!text.startsWith('---\n')) return 0
  const end = text.indexOf('\n---', 4)
  return end < 0 ? 0 : text.slice(0, end + 4).split('\n').length
}

/** 메모 글의 제목 줄(#…)을 굵은 글로. 제목만 있으면 빈 글 */
const headingsBold = (text: string) => text.split('\n').every((l) => !l.trim() || /^#{1,6} /.test(l)) ? '' : text.replace(/^#{1,6} +(.+?)[ \t]*#*[ \t]*$/gm, '**$1**')

function titleOf(text: string, id: string): string {
  const m = /^title:\s*(.+)$/m.exec(text.split('\n---')[0] ?? '')
  return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : id
}

/** 라이브러리의 메모 파일마다 무엇이 될지 (쓰지 않는다) */
export function planMemoMigration(lib: string): MemoPlan[] {
  const dir = path.join(lib, 'concepts')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith(MEMO_SUFFIX)).sort().map((f) => {
    const id = f.slice(0, -MEMO_SUFFIX.length)
    const memo = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')
    const notePath = path.join(dir, `${id}.md`)
    const note = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf8').replace(/\r\n/g, '\n') : ''
    const offset = frontLines(note)
    const base = { title: `개념노트 ${titleOf(note, id)}`, source: `concepts/${id}.md` }
    const cards: MemoCard[] = memoUnits(memo).map((u) => {
      if (u.kind === 'task') return { input: { ...base, kind: '할 일', text: [u.text, u.more].filter(Boolean).join('\n') }, done: u.done }
      if (u.anchor) {
        const a = u.anchor
        const anchor = { quote: a.quote, color: a.color, ...(a.line > 0 && { line: a.line + offset }), prefix: a.prefix, suffix: a.suffix }
        return { input: { ...base, kind: u.text ? '메모' : '하이라이트', text: u.text, ...anchor }, done: false }
      }
      const text = headingsBold(u.text)
      return text ? { input: { ...base, kind: '메모', text }, done: false } : null
    }).filter((c): c is MemoCard => c !== null)
    return { id, memo: f, target: conceptRecordTarget(id), cards }
  }).filter((p) => p.cards.length > 0)
}

/** 옮긴다: 카드를 기록 파일에 쓰고 원래 메모 파일을 휴지통으로. 시각은 메모 파일을 마지막으로 고친 때 */
export function applyMemoMigration(lib: string, plans = planMemoMigration(lib)): { files: number; cards: number } {
  const root = path.join(lib, 'workbench')
  let cards = 0
  for (const p of plans) {
    const memoPath = path.join(lib, 'concepts', p.memo)
    const when = fs.statSync(memoPath).mtime
    for (const c of p.cards) {
      const { entry } = addComment(root, p.target, c.input, when)
      // 옛 완료는 오늘 끝낸 일이 아니라 일지에 쓰지 않는다
      if (c.done) updateComment(root, p.target, entry.id, { state: '끝냄' }, readComments(root, p.target).hash, { journal: false })
      cards++
    }
    const trash = path.join(root, MEMO_TRASH, p.memo)
    fs.mkdirSync(path.dirname(trash), { recursive: true })
    fs.renameSync(memoPath, trash)
  }
  return { files: plans.length, cards }
}
