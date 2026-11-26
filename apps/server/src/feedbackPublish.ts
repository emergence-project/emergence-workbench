import fs from 'node:fs'
import { assertPrivateRemote } from './personalRepo.js'
import path from 'node:path'
import YAML from 'yaml'
import { localDate } from './fsutil.js'
import { feedbackMergeFor } from './feedbackMerge.js'
import { currentBranch, locate, pendingPaths, PathSyncError, publishPaths, upstreamText } from './pathsync.js'
import { t } from './i18n.js'
import { git, GIT_TIMEOUT } from './git.js'
import type { FeedbackPublished as PublishResult } from '@rw/core/contract/feedback'

/**
 * 피드백 폴더만 커밋하고 GitHub(추적 중인 원격 브랜치)에 올린다. 클라우드의 에이전트가 읽을 수 있게.
 * - 피드백 폴더 밖의 파일은 커밋하지도 올리지도 않는다. 이미 스테이징된 다른 변경도 그대로 둔다.
 * - 원격에 더 새 커밋이 있어도 작업 트리는 바꾸지 않고, 원격 최신 커밋 위에 피드백만 얹어 올린다(pathsync.ts).
 *   원격에서도 같은 피드백 파일이 바뀌었으면 항목 단위로 합쳐 본다(feedbackMerge.ts). 같은 항목의 같은 칸을 서로 다르게 고쳤으면 멈춘다.
 */
export async function publishFeedback(dir: string, now = new Date()): Promise<PublishResult> {
  if (!fs.existsSync(dir)) return { commit: null, pushed: false, message: t('아직 남긴 피드백이 없습니다', 'No feedback yet') }
  const where = await feedbackRepo(dir)
  // 앱 폴더가 다른 브랜치에 있으면(손으로 바꿔 둔 경우) 그 브랜치에 커밋하지 않는다
  const branch = await currentBranch(where.top)
  if (branch !== 'main') throw new PublishError(t(`앱 폴더가 main이 아닌 ${branch || '분리된 HEAD'}에 있어 피드백을 올리지 않았습니다. 터미널에서 git switch main 뒤 다시 올려 주세요`, `Feedback not pushed: the app folder is on ${branch || 'a detached HEAD'}, not main. Run git switch main in a terminal, then push again`), null)
  // 피드백은 개인 저장소에 둔다: 공개 저장소면 올리지 않는다 (보안 검토 L4)
  try { await assertPrivateRemote(where.top) } catch (e) { throw new PublishError(e instanceof Error ? e.message : String(e), null) }
  try {
    // 다른 컴퓨터가 먼저 올린 같은 파일은 항목 단위로 합쳐 올린다 (10/22: 같은 날 두 맥에서 남기면 멈췄다)
    const r = await publishPaths(where.top, [where.rel], { message: `Add app feedback (${localDate(now)})`, merge: true, mergeText: feedbackMergeFor })
    return {
      commit: r.commit, pushed: r.pushed,
      message: r.pushed ? t(`피드백을 GitHub에 올렸습니다${r.commit ? ` (${r.commit})` : ''}`, `Pushed feedback to GitHub${r.commit ? ` (${r.commit})` : ''}`) : t('올릴 피드백이 없습니다. 이미 GitHub에 있습니다', 'No feedback to push. It is already on GitHub'),
    }
  } catch (e) {
    if (e instanceof PathSyncError) throw new PublishError(e.message, e.commit)
    throw e
  }
}

/**
 * 아직 GitHub에 올리지 않은 피드백 파일 (저장소 기준 경로)과 그 안의 피드백 수.
 * 수는 파일 수가 아니라 항목 수다: 날짜 파일은 새로 쓰거나 고친 "## 시각" 항목, reviews.yaml·status.yaml은 바뀐 항목(키).
 * 승인·코멘트를 여럿 남겨도 reviews.yaml 한 파일이라 파일 수로 세면 늘 1이었다. 그림은 그 항목에 딸린 것이라 세지 않는다.
 */
export async function unpublishedFeedback(dir: string): Promise<{ files: string[]; count: number }> {
  if (!fs.existsSync(dir)) return { files: [], count: 0 }
  const where = await feedbackRepo(dir).catch(() => null)
  if (!where) return { files: [], count: 0 }
  const files = await pendingPaths(where.top, [where.rel])
  let count = 0
  for (const f of files) {
    if (/\.(png|jpe?g|gif|webp)$/i.test(f)) continue
    const local = fs.existsSync(path.join(where.top, f)) ? fs.readFileSync(path.join(where.top, f), 'utf8') : ''
    count += changedEntries(f, await upstreamText(where.top, f) ?? '', local)
  }
  return { files, count: files.length && !count ? files.length : count }
}

/** 두 판 사이에 바뀐 피드백 항목 수 (날짜 파일은 "## " 머리마다, YAML은 맨 위 키마다, 그 밖의 파일은 1) */
export function changedEntries(file: string, before: string, after: string): number {
  if (before === after) return 0
  const diff = (a: Map<string, string>, b: Map<string, string>) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).length
  if (file.endsWith('.md')) return diff(mdEntries(before), mdEntries(after))
  if (/\.ya?ml$/.test(file)) {
    const read = (text: string): Record<string, unknown> | null => { try { const v: unknown = YAML.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {} } catch { return null } }
    const a = read(before), b = read(after)
    if (!a || !b) return 1
    const keys = (o: Record<string, unknown>) => new Map(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)]))
    return diff(keys(a), keys(b))
  }
  return 1
}

/** 날짜 파일의 항목: 머리줄(같은 머리가 또 있으면 순번을 붙여) → 그 항목의 글 */
function mdEntries(text: string): Map<string, string> {
  const out = new Map<string, string>()
  let key: string | null = null
  let body: string[] = []
  const flush = () => { if (key !== null) out.set(key, body.join('\n').trim()) }
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      flush()
      let k = line.trim(), n = 2
      while (out.has(k)) k = `${line.trim()} #${n++}`
      key = k; body = []
    } else body.push(line)
  }
  flush()
  return out
}

async function feedbackRepo(dir: string): Promise<{ top: string; rel: string }> {
  try { return await locate(dir) } catch { throw new PublishError(t('피드백 폴더가 git 저장소 안에 있지 않습니다', 'The feedback folder is not inside a git repository')) }
}

export class PublishError extends Error {
  constructor(message: string, readonly commit: string | null = null) { super(message) }
}

/**
 * 피드백을 남기는 사람의 GitHub 계정: 피드백 폴더가 든 저장소의 origin 주인 (github.com/<계정>/…).
 * 피드백 화면에 "사용자 (<계정>)"로 보인다. 모르면 null
 */
export async function feedbackAccount(dir: string): Promise<string | null> {
  try {
    const { top } = await locate(dir)
    const url = await git(top, ['remote', 'get-url', 'origin'], { timeout: GIT_TIMEOUT.read })
    return /github\.com[:/]([^/]+)\//.exec(url)?.[1] ?? null
  } catch { return null }
}

/**
 * 개인 저장소가 꺼져 있던 동안 이 컴퓨터의 설정 폴더(feedback/)에만 쌓인 피드백을 개인 저장소 사본으로 옮긴다
 * (10/21 맥미니: 개인 저장소 사본을 못 알아봐 설정 폴더에 남겼다). 날짜 파일이 양쪽에 있으면 그 날 항목을 끝에 잇고,
 * 다른 파일(그림 등)은 없는 것만 옮긴다. 옮긴 폴더는 지우지 않고 `feedback.moved-<날짜>`로 이름만 바꾼다.
 */
export function adoptLocalFeedback(from: string, to: string, now = new Date()): { files: number; skipped: string[] } {
  if (!fs.existsSync(from) || path.resolve(from) === path.resolve(to)) return { files: 0, skipped: [] }
  let files = 0
  const skipped: string[] = []
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(from, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name)
      const src = path.join(from, r), dst = path.join(to, r)
      if (e.isDirectory()) { walk(r); continue }
      if (!e.isFile()) continue
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); files++; continue }
      if (/^\d{4}-\d{2}-\d{2}\.md$/.test(r)) {
        const body = fs.readFileSync(src, 'utf8').replace(/^# 피드백 \S+\n/, '').trim()
        const have = fs.readFileSync(dst, 'utf8')
        if (body && !have.includes(body)) { fs.writeFileSync(dst, `${have.replace(/\n*$/, '\n')}\n${body}\n`); files++ }
        continue
      }
      if (!fs.readFileSync(src).equals(fs.readFileSync(dst))) skipped.push(r)
    }
  }
  walk('')
  let moved = `${from}.moved-${localDate(now)}`
  for (let i = 2; fs.existsSync(moved); i++) moved = `${from}.moved-${localDate(now)}-${i}`
  fs.renameSync(from, moved)
  return { files, skipped }
}
