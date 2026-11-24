/**
 * 승인 장부 (11/24): 시안마다 번호 · 승인 대기 · 승인 · 반려, 그리고 사용자가 대화에 직접 말한 때.
 *
 * 왜: 승인이 대화 글 속 자유 문장이었고 중앙이 chat_send로 전했다. 사용자가 다른 일에 한 「제안대로 진행해」가 승인을 기다리던
 * 다른 시안의 승인으로 전해져 구현 · 병합된 일이 있었다 (#670). 그래서 승인을 대화 · 시안에 묶인 기록으로 두고, 누가 한 말인지를
 * 서버가 가린다 (agentGate.ts). 이 파일은 장부 파일과 글 읽기만 한다 (대화를 모른다).
 *
 * 장부는 대화 폴더 안 gate/approvals.json: 대화 폴더의 *.json은 모두 대화로 읽으므로 하위 폴더에 둔다.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { Approval } from '@rw/core/contract/agentGate'

/** 시안으로 보는 파일 (routes/agentMockups.ts의 MOCKUP_EXT와 같다) */
export const MOCKUP_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.html', '.css']
/** 내용까지 지문에 넣는 것: 글로 된 시안. 그림은 같은 html에서 다시 뽑으면 바이트가 달라질 수 있어, 짝이 되는 html이 없을 때만 넣는다 */
const TEXT_EXT = ['.html', '.css', '.svg']
/** 승인으로 읽는 말의 길이: 긴 글은 승인 한마디가 아니라 논의다 */
export const VERDICT_MAX = 80

const BookFile = z.object({ n: z.number().int(), items: z.array(Approval), said: z.record(z.string(), z.string()) })
export type Book = z.infer<typeof BookFile>

export function readBook(file: string): Book | undefined {
  try {
    const v = BookFile.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
    return v.success ? v.data : undefined
  } catch { return undefined }
}

export function writeBook(file: string, b: Book): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(b, null, 2)}\n`)
}

/** 작업 폴더의 mockups/ 안 시안 파일과 지문. 시안이 없으면 undefined */
export function mockupsOf(worktree: string | undefined): { files: string[]; sig: string } | undefined {
  if (!worktree) return undefined
  const dir = path.join(worktree, 'mockups')
  let names: string[]
  try { names = fs.readdirSync(dir).filter((f) => MOCKUP_EXT.includes(path.extname(f).toLowerCase())).sort() } catch { return undefined }
  if (!names.length) return undefined
  const stems = new Set(names.filter((f) => path.extname(f).toLowerCase() === '.html').map((f) => path.basename(f, path.extname(f))))
  const h = crypto.createHash('sha1')
  for (const f of names) {
    h.update(`${f}\n`)
    const ext = path.extname(f).toLowerCase()
    if (!TEXT_EXT.includes(ext) && stems.has(path.basename(f, path.extname(f)))) continue
    try { h.update(fs.readFileSync(path.join(dir, f))) } catch { /* 읽는 사이 사라진 파일은 이름만 */ }
  }
  return { files: names, sig: h.digest('hex').slice(0, 16) }
}

const YES = /(승인|진행\s*해|진행\s*하|진행\s*합|진행\s*$|진행\s*[.!~]|이대로|그대로\s*(가|해|만들|구현)|구현\s*해|만들어\s*줘|go\s*ahead|approved?\b|proceed|ship\s*it|lgtm)/i
const NO = /(반려|다시\s*(만들|그려|해)|reject)/i
/** 승인처럼 보여도 승인이 아닌 말: 부정 · 조건 · 물음 */
const NOT = /(하지\s*마|말고|말아|보류|중단|멈춰|아직|않|안\s*돼|기다려|취소|전에|먼저|[?？]|\bdon.?t\b|\bdo not\b|\bnot\b|\bwait\b|\bhold\b|\bbefore\b)/i

/** 「시안 <이름>: 말」(화면의 시안 보기에서 보낸 말)이면 이름과 말을 나눈다 */
export function mockupSaid(text: string): { mockup?: string; words: string } {
  const m = /^\s*(?:시안|mockup)\s+([^:：\n]{1,120})[:：]\s*([\s\S]*)$/i.exec(text)
  return m ? { mockup: m[1]!.trim(), words: m[2]!.trim() } : { words: text.trim() }
}

/**
 * 그 대화에 사용자가 직접 한 말이 승인 · 반려인가. 짧고 분명한 말만: 「진행해」 「이대로 승인」 「2안으로 구현해 줘」.
 * 안을 고르기만 한 말(「2안이 낫네」)· 물음 · 조건이 붙은 말은 승인이 아니다.
 */
export function verdictOf(text: string): 'approve' | 'reject' | undefined {
  const { words } = mockupSaid(text)
  if (!words || words.length > VERDICT_MAX) return undefined
  if (/[?？]/.test(words)) return undefined
  if (NO.test(words)) return 'reject'
  if (NOT.test(words)) return undefined
  return YES.test(words) ? 'approve' : undefined
}

/**
 * 중앙에서 한 말 속의 번호 붙은 판정: 「승인 3」 「3번 승인」 「시안 3 진행」 「#3 승인」 「반려 4」 「승인 3, 5」.
 * 번호가 없는 「진행해」는 어느 시안인지 알 수 없으므로 아무것도 승인하지 않는다 (#670의 일).
 */
export function numberedVerdicts(text: string): { n: number; verdict: 'approve' | 'reject' }[] {
  const out = new Map<number, 'approve' | 'reject'>()
  const word = (w: string): 'approve' | 'reject' => (/반려|reject/i.test(w) ? 'reject' : 'approve')
  for (const line of text.split('\n')) {
    if (NOT.test(line)) continue
    // 「승인 3, 5」 「반려 #4」
    for (const m of line.matchAll(/(승인|반려|approve|reject)\s*((?:#?\d+\s*번?\s*[,·와과]?\s*)+)/gi)) for (const d of m[2]!.matchAll(/\d+/g)) out.set(Number(d[0]), word(m[1]!))
    // 「3번 승인」 「시안 3 진행」 「#3 승인」
    for (const m of line.matchAll(/(?:시안\s*)?#?(\d+)\s*번?\s*(?:은|는|을|를|도)?\s*(승인|반려|진행)/g)) if (!out.has(Number(m[1]))) out.set(Number(m[1]), word(m[2]!))
  }
  return [...out].map(([n, verdict]) => ({ n, verdict }))
}
