/**
 * 소개 절 확인 기록 (11/8 20:47 제안, 11/11 18:48 진행 「안 C′」): 피드백 폴더의 about.yaml.
 * 소개는 절 하나가 확인 단위다. 사용자가 「맞아요」를 누르면 그때 그 절의 마지막 PR 번호(checked)와 날짜(at)를 적고,
 * 연필로 고쳐 보내면 그때의 마지막 PR 번호(sentPr)와 시각(sent)을 적는다. 상태(확인함 · 확인 전 · 반영 대기)는 화면이
 * 절의 prs와 이 기록을 견주어 계산한다(apps/web/src/aboutChecks.ts). 피드백처럼 개인 저장소에 두고 올린다(공개 앱 코드에 섞이지 않게).
 *
 *   agents/the-repository-is-in-charge:
 *     checked: 81        # 확인한 때 그 절의 마지막 PR (PR이 없던 절은 0)
 *     at: 2026-11-03
 *     sentPr: 402        # 고쳐 보낸 때 그 절의 마지막 PR. 이 뒤 그 절을 고친 PR이 들어오면 반영된 것
 *     sent: 2026-11-10T09:30
 *     ok:                # 업데이트 줄마다 「맞아요」 (11/20 시안 2절): PR 번호 → 확인한 날. checked보다 큰 PR만 뜻이 있다
 *       473: 2026-11-20
 * 절은 그 절을 고친 PR이 모두 checked 아래이거나 ok에 있으면 확인함이다. 예전의 절 확인(checked)은 그때까지의 업데이트를 모두 확인한 것으로 읽는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { git } from './git.js'
import { parseSubject } from './appupdate.js'

export interface AboutCheck { checked?: number; at?: string; sentPr?: number; sent?: string; ok?: Record<string, string> }

export const ABOUT_CHECK_FILE = 'about.yaml'
const file = (dir: string) => path.join(dir, ABOUT_CHECK_FILE)
const HEAD = '# 소개 절을 확인한 기록 (소개 화면의 「맞아요」 · 연필로 고쳐 보냄). 키는 <쪽>/<절>\n'

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
const str = (v: unknown) => typeof v === 'string' && v ? v : v instanceof Date ? v.toISOString().slice(0, 16) : undefined

/** 기록이 있는지(파일이 있는지)와 절마다의 기록. 파일이 없으면 아직 확인을 시작하지 않은 것 */
export function readAboutChecks(dir: string): { exists: boolean; sections: Record<string, AboutCheck> } {
  let doc: unknown
  try { doc = YAML.parse(fs.readFileSync(file(dir), 'utf8')) } catch { return { exists: false, sections: {} } }
  const sections: Record<string, AboutCheck> = {}
  if (isRecord(doc)) {
    for (const [k, r] of Object.entries(doc)) {
      if (!isRecord(r)) continue
      const c: AboutCheck = {}
      const checked = num(r.checked); if (checked !== undefined) c.checked = checked
      const at = str(r.at); if (at) c.at = at
      const sentPr = num(r.sentPr); if (sentPr !== undefined) c.sentPr = sentPr
      const sent = str(r.sent); if (sent) c.sent = sent
      if (isRecord(r.ok)) {
        const ok: Record<string, string> = {}
        for (const [n, d] of Object.entries(r.ok)) { const v = str(d); if (/^\d+$/.test(n) && v) ok[n] = v.slice(0, 10) }
        if (Object.keys(ok).length) c.ok = ok
      }
      sections[k] = c
    }
  }
  return { exists: true, sections }
}

/** 절 하나의 기록을 고친다. check: 그 PR까지 모두 확인함으로(고쳐 보낸 표시는 지움), ok: 업데이트 하나만 확인함, sent: 고쳐 보냄. 다른 절과 다른 칸은 그대로 둔다 */
export function writeAboutCheck(dir: string, key: string, action: 'check' | 'ok' | 'sent', pr: number, now = new Date()): AboutCheck {
  fs.mkdirSync(dir, { recursive: true })
  let text = ''
  try { text = fs.readFileSync(file(dir), 'utf8') } catch { text = HEAD }
  let doc = YAML.parseDocument(text)
  // 비었거나 깨진 파일은 머리 주석부터 다시 쓴다
  if (doc.contents !== null && !YAML.isMap(doc.contents)) doc = YAML.parseDocument(HEAD)
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString()
  if (action === 'check') {
    doc.setIn([key, 'checked'], pr)
    doc.setIn([key, 'at'], local.slice(0, 10))
    doc.deleteIn([key, 'sentPr'])
    doc.deleteIn([key, 'sent'])
  } else if (action === 'ok') {
    // 키를 글자로 적어 YAML이 순서대로 읽게 한다
    doc.setIn([key, 'ok', String(pr)], local.slice(0, 10))
  } else {
    doc.setIn([key, 'sentPr'], pr)
    doc.setIn([key, 'sent'], local.slice(0, 16))
  }
  fs.writeFileSync(file(dir), doc.toString({ lineWidth: 0 }))
  return readAboutChecks(dir).sections[key] ?? {}
}

/** 앱 저장소의 PR 번호 → 합친 날(YYYY-MM-DD)과 제목. 이력 보기에 쓴다. 저장소가 없으면 빈 표 */
export async function prInfo(root: string, running: string): Promise<{ prDates: Record<string, string>; prTitles: Record<string, string> }> {
  const log = await git(root, ['log', '--first-parent', '--date=format-local:%Y-%m-%d', '--format=%cd%x09%s', running]).catch(() => '')
  const prDates: Record<string, string> = {}
  const prTitles: Record<string, string> = {}
  for (const line of log.split('\n')) {
    const [date, ...rest] = line.split('\t')
    const { pr, title } = parseSubject(rest.join('\t'))
    if (date && pr && !prDates[pr]) { prDates[pr] = date; prTitles[pr] = title }
  }
  return { prDates, prTitles }
}

/**
 * 업데이트 하나가 소개 글에서 바꾼 것 (11/20 시안 2절: 이력 표의 줄을 누르면 바꾼 문장에 하이라이트, 줄 아래에 요약).
 * 그 PR의 커밋을 앱 저장소의 첫 부모 기록에서 찾아, 소개 글(apps/web/src/about/) 변경에서 새로 생긴 문장과 커밋 본문의 요약 줄을 돌려준다.
 */
export async function prChanges(root: string, running: string, pr: number): Promise<{ sentences: string[]; summary: string[] }> {
  const log = await git(root, ['log', '--first-parent', '--format=%H%x09%s', running]).catch(() => '')
  const hash = log.split('\n').map((l) => l.split('\t')).find(([, ...s]) => parseSubject(s.join('\t')).pr === pr)?.[0]
  if (!hash) return { sentences: [], summary: [] }
  const [diff, body] = await Promise.all([
    git(root, ['diff', '-U0', `${hash}^`, hash, '--', 'apps/web/src/about']).catch(() => ''),
    git(root, ['log', '-1', '--format=%b', hash]).catch(() => ''),
  ])
  return { sentences: changedSentences(diff), summary: summaryLines(body) }
}

/** 소개 소스 한 줄의 글: 태그와 코드를 빼고 글자만. 글이 아니면 빈 문자열 */
function proseOf(line: string): string {
  return line
    .replace(/\bprs\s*:\s*\[[^\]]*\]/g, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/\b(text|title|ui|ask|label|items|prs|figure)\s*:/g, ' ')
    .replace(/[{}[\]`'"]|\bt\(|\),?|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?。])\s+|(?<=다\.)/).map((x) => x.replace(/^[\s,;:]+|[\s,;:]+$/g, '')).filter((x) => x.length >= 8 && /[가-힣]|[a-z]{3,}\s+[a-z]{2,}/i.test(x))

/** git diff에서 새로 생긴 문장: 더한 줄의 문장 중 지운 줄에 없던 것 */
export function changedSentences(diff: string): string[] {
  const added: string[] = []
  const removed = new Set<string>()
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) added.push(...sentencesOf(proseOf(line.slice(1))))
    else if (line.startsWith('-')) for (const x of sentencesOf(proseOf(line.slice(1)))) removed.add(x)
  }
  return [...new Set(added.filter((x) => !removed.has(x)))].slice(0, 200)
}

/** PR 서식의 머리(Before: · After:)는 화면 말 전 · 후로 */
const PR_HEAD: Record<string, string> = { before: '전', after: '후' }

/**
 * 커밋 본문의 요약 줄: 서명 · 링크 · 빈 줄을 빼고 앞의 여섯 줄.
 * PR 서식의 How: · ## Checks부터는 파일 목록과 검사라 읽지 않는다(11/20: 소개 이력에 영어 머리와 파일 경로가 그대로 보였다).
 */
export function summaryLines(body: string): string[] {
  const lines = body.split('\n')
  const end = lines.findIndex((l) => /^\s*(How:?\s*$|##\s)/i.test(l))
  return (end < 0 ? lines : lines.slice(0, end)).map((l) => l.replace(/^\s*[*-]\s+/, '').trim())
    .filter((l) => l && !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(l) && !/^https?:\/\//.test(l) && !/^🤖|^---+$/.test(l))
    .map((l) => { const h = /^(Before|After):?$/i.exec(l); return h ? PR_HEAD[h[1]!.toLowerCase()]! : l })
    .slice(0, 6)
}
