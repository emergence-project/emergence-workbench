import fs from 'node:fs'
import path from 'node:path'
import { FEEDBACK_MISSES, type FeedbackReply, type FeedbackRevision } from '@rw/core/contract/feedback'
import type { FeedbackAnswerBody } from '@rw/core/contract/agentChats'
import { localDate, localTime } from './fsutil.js'
import { t } from './i18n.js'
import YAML from 'yaml'
import { editYamlFile, STATUS_FILE } from './feedback.js'
import { WorkbenchError } from './workbench.js'

/**
 * 피드백 처리 · 답에 붙인 시안 (11/19 "피드백에서 시안을 제대로 볼 수 없어서 결정하지 않은 것"):
 * 에이전트가 작업 폴더 mockups/에 둔 그림과 같은 이름의 .html을 feedback/pictures/로 옮겨 적고, status.yaml의 mockups에 그 경로를 단다.
 * 작업 폴더는 PR이 합쳐지면 지워지므로 피드백 폴더에 사본을 둔다. 화면은 그림을 미리보기로, html은 새 창으로 연다.
 */

/** feedback/pictures/ 안에서 보여 줄 수 있는 파일 (그림 · 시안 html). 그림 경로 /api/feedback/picture가 쓴다 */
export const MOCKUP_FILE = String.raw`[\p{L}\p{N}_.-]+\.(?:png|jpe?g|webp|gif|html)`
const COPY_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'html']
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', html: 'text/html; charset=utf-8' }
export const mockupType = (file: string) => TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
/** status.yaml의 mockups: feedback/ 기준 경로. 폴더 없이 이름만 적었으면 pictures/ 안 */
export function readMockups(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.flatMap((x) => (typeof x === 'string' && x.trim() ? [x.includes('/') ? x : `pictures/${x}`] : []))
  return out.length ? out : undefined
}
const withMockups = (v: unknown) => { const m = readMockups(v); return m ? { mockups: m } : {} }
/** 그 처리의 전후 그림 (경로는 시안과 같이 읽는다) */
const withPictures = (v: unknown) => { const m = readMockups(v); return m ? { pictures: m } : {} }

const isRec = (r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object'

export function readReplies(v: unknown): FeedbackReply[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter(isRec).flatMap((r) => {
    const note = str(r.note)
    const by = str(r.by)
    return r.at != null && r.to != null && note ? [{ at: String(r.at), to: String(r.to), note, ...(by && { by }), ...withMockups(r.mockups) }] : []
  })
  return out.length ? out : undefined
}

export function readRevisions(v: unknown): FeedbackRevision[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter(isRec).filter((r) => r.at != null).map((r): FeedbackRevision => {
    const by = str(r.by)
    const lesson = str(r.lesson)
    const miss = FEEDBACK_MISSES.find((m) => m === r.miss)
    return {
      at: String(r.at),
      ...(typeof r.understood === 'string' && { understood: r.understood }),
      ...(typeof r.cause === 'string' && { cause: r.cause }),
      ...(typeof r.note === 'string' && { note: r.note }),
      ...(r.commit != null && { commit: String(r.commit) }),
      ...(r.handled_at != null && { handled_at: String(r.handled_at) }),
      ...(by && { by }),
      ...(miss && { miss }),
      ...(lesson && { lesson: lesson.trim() }),
      ...withPictures(r.pictures),
      ...withMockups(r.mockups),
    }
  })
  return out.length ? out : undefined
}

/**
 * 작업 폴더 mockups/의 시안을 feedback/pictures/로 옮겨 적고 그 경로를 돌려준다.
 * 이름은 확장자가 있어도 없어도 된다: 같은 이름의 그림과 .html을 함께 옮긴다. 하나도 없으면 있는 이름을 알려 주며 거절한다.
 */
export function copyMockups(worktree: string, fbDir: string, names: string[], now = new Date()): string[] {
  const src = path.join(worktree, 'mockups')
  const have = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => COPY_EXT.includes(path.extname(f).slice(1).toLowerCase())) : []
  const out: string[] = []
  const stamp = `${localDate(now)}-${localTime(now).replace(':', '')}`
  for (const name of names) {
    const stem = name.replace(/\.(?:png|jpe?g|webp|gif|html)$/i, '')
    const files = have.filter((f) => path.basename(f, path.extname(f)) === stem)
    if (!files.length) {
      const stems = [...new Set(have.map((f) => path.basename(f, path.extname(f))))]
      throw new WorkbenchError(400, t(`mockups/에 시안 ${stem}이 없습니다. 있는 것: ${stems.join(', ') || '없음'}`, `No mockup ${stem} in mockups/. There is: ${stems.join(', ') || 'nothing'}`))
    }
    fs.mkdirSync(path.join(fbDir, 'pictures'), { recursive: true })
    // 이름 앞 날짜는 붙일 시각과 겹치므로 뺀다
    const short = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    for (const f of files) {
      const rel = `pictures/${stamp}-mockup-${short}${path.extname(f).toLowerCase()}`
      fs.copyFileSync(path.join(src, f), path.join(fbDir, rel))
      out.push(rel)
    }
  }
  return out
}

/** feedback_answer의 mockups · replies[].mockups를 옮겨 적은 경로로 바꾼다 (작업 폴더가 없으면 시안을 붙일 수 없다) */
export function answerMockups(b: FeedbackAnswerBody, worktree: string | undefined, fbDir: string, now = new Date()) {
  const asks = !!b.mockups?.length || !!b.replies?.some((r) => r.mockups?.length)
  if (asks && !worktree) throw new WorkbenchError(409, t('작업 폴더가 없는 대화라 시안을 붙일 수 없습니다', 'This conversation has no work folder to take mockups from'))
  const copy = (names?: string[]) => (names?.length ? copyMockups(worktree!, fbDir, names, now) : undefined)
  const mockups = copy(b.mockups)
  return {
    ...(mockups && { mockups }),
    ...(b.replies && { replies: b.replies.map((r) => { const m = copy(r.mockups); return { to: r.to, note: r.note, ...(m && { mockups: m }) } }) }),
  }
}

/**
 * 쓰지 않게 된 시안을 그 항목의 피드백 답에서 뗀다 (11/24 사용자 「적용도 안 됐고 반영할 예정도 아니니 전후 그림만」).
 * 피드백 답은 에이전트가 쓴 것이라 에이전트가 뗄 수 있다. 떼는 것은 mockups 칸(지금 처리 · 지난 처리 revised · 답 replies)의
 * 그 시안 경로뿐이고, 사용자의 원문 · 판정 · 코멘트와 전후 그림(pictures)은 건드리지 않는다. 그림 파일은 지우지 않는다(이력).
 * 이름은 시안 이름(확장자 · 날짜 없이, 예 agent-side-views). 뗀 경로 수를 돌려준다
 */
export function dropMockups(fbDir: string, key: string, names: string[]): number {
  const stems = new Set(names.map((n) => n.replace(/\.[a-z]+$/i, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')))
  const hit = (p: unknown) => typeof p === 'string' && stems.has(path.basename(p, path.extname(p)).replace(/^\d{4}-\d{2}-\d{2}-\d{4}-mockup-/, ''))
  return editYamlFile(fbDir, STATUS_FILE, (doc) => {
    const item = doc.get(key, true)
    if (!YAML.isMap(item)) throw new WorkbenchError(404, t('그 항목의 피드백 답이 없습니다', 'That item has no feedback answer'))
    let n = 0
    const clean = (m: unknown) => {
      if (!YAML.isMap(m)) return
      const seq = m.get('mockups', true)
      if (!YAML.isSeq(seq)) return
      const keep = seq.items.filter((x) => !(YAML.isScalar(x) && hit(x.value)))
      n += seq.items.length - keep.length
      if (keep.length) seq.items = keep
      else m.delete('mockups')
    }
    clean(item)
    for (const list of ['revised', 'replies']) {
      const seq = item.get(list, true)
      if (YAML.isSeq(seq)) for (const x of seq.items) clean(x)
    }
    if (!n) throw new WorkbenchError(400, t(`그 이름의 시안이 이 항목에 없습니다: ${[...stems].join(', ')}`, `No mockup by that name on this item: ${[...stems].join(', ')}`))
    return n
  })
}
