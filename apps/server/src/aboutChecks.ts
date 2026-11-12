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
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { git } from './git.js'
import { parseSubject } from './appupdate.js'

export interface AboutCheck { checked?: number; at?: string; sentPr?: number; sent?: string }

export const ABOUT_CHECK_FILE = 'about.yaml'
const file = (dir: string) => path.join(dir, ABOUT_CHECK_FILE)
const HEAD = '# 소개 절을 확인한 기록 (소개 화면의 「맞아요」 · 연필로 고쳐 보냄). 키는 <쪽>/<절>\n'

const num = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
const str = (v: unknown) => typeof v === 'string' && v ? v : v instanceof Date ? v.toISOString().slice(0, 16) : undefined

/** 기록이 있는지(파일이 있는지)와 절마다의 기록. 파일이 없으면 아직 확인을 시작하지 않은 것 */
export function readAboutChecks(dir: string): { exists: boolean; sections: Record<string, AboutCheck> } {
  let doc: unknown
  try { doc = YAML.parse(fs.readFileSync(file(dir), 'utf8')) } catch { return { exists: false, sections: {} } }
  const sections: Record<string, AboutCheck> = {}
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const r = v as Record<string, unknown>
      const c: AboutCheck = {}
      const checked = num(r.checked); if (checked !== undefined) c.checked = checked
      const at = str(r.at); if (at) c.at = at
      const sentPr = num(r.sentPr); if (sentPr !== undefined) c.sentPr = sentPr
      const sent = str(r.sent); if (sent) c.sent = sent
      sections[k] = c
    }
  }
  return { exists: true, sections }
}

/** 절 하나의 기록을 고친다. check: 확인함으로(고쳐 보낸 표시는 지움), sent: 고쳐 보냄. 다른 절과 다른 칸은 그대로 둔다 */
export function writeAboutCheck(dir: string, key: string, action: 'check' | 'sent', pr: number, now = new Date()): AboutCheck {
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
  } else {
    doc.setIn([key, 'sentPr'], pr)
    doc.setIn([key, 'sent'], local.slice(0, 16))
  }
  fs.writeFileSync(file(dir), doc.toString({ lineWidth: 0 }))
  return readAboutChecks(dir).sections[key] ?? {}
}

/** 앱 저장소의 PR 번호 → 합친 날(YYYY-MM-DD). 이력 보기의 날짜에 쓴다. 저장소가 없으면 빈 표 */
export async function prDates(root: string, running: string): Promise<Record<string, string>> {
  const log = await git(root, ['log', '--first-parent', '--date=format-local:%Y-%m-%d', '--format=%cd%x09%s', running]).catch(() => '')
  const out: Record<string, string> = {}
  for (const line of log.split('\n')) {
    const [date, ...rest] = line.split('\t')
    const pr = parseSubject(rest.join('\t')).pr
    if (date && pr && !out[pr]) out[pr] = date
  }
  return out
}
