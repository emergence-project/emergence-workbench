// 소개 절 파일(apps/web/src/about/<쪽>/<절>.md)을 읽어 에이전트에게 건넨다 (2026-11-27 사용자 결정 "소개를 읽고 일을 시작하게").
// 계산은 core about-guide.ts. 여기는 파일 읽기만: API(routes/about.ts) · 앱 고치기 대화의 훅(agentRunner.ts)이 쓴다
import fs from 'node:fs'
import path from 'node:path'
import { aboutEntries, aboutFind, aboutText, type AboutEntry } from '@rw/core'
import { appFile } from './agentPaths.js'

export const ABOUT_DIR = 'apps/web/src/about'

/** root(앱 저장소 · 그 작업 폴더) 아래 절 파일. 폴더가 없으면(묶은 앱) 빈 목록 */
export function readAboutEntries(root = appFile('')): { entries: AboutEntry[]; errors: string[]; found: boolean } {
  const dir = path.join(root, ABOUT_DIR)
  if (!fs.existsSync(dir)) return { entries: [], errors: [], found: false }
  const files: { key: string; text: string }[] = []
  for (const part of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!part.isDirectory() || part.name === 'prs') continue
    for (const f of fs.readdirSync(path.join(dir, part.name))) {
      if (f.endsWith('.md')) files.push({ key: `${part.name}/${f.slice(0, -3)}`, text: fs.readFileSync(path.join(dir, part.name, f), 'utf8') })
    }
  }
  return { ...aboutEntries(files), found: true }
}

/**
 * 앱 고치기 대화의 훅: 에이전트가 읽거나 고친 파일을 구현으로 적은 절의 요약 · 지킬 것을 한 번씩 건넨다.
 * 대화마다 하나 만들고(seen이 대화 동안 이어진다), 파일 경로(작업 폴더 기준 또는 절대)를 넘긴다
 */
export function aboutNotifier(root: string): (file: string) => string | undefined {
  const seen = new Set<string>()
  let cache: AboutEntry[] | undefined
  return (file) => {
    const rel = path.isAbsolute(file) ? path.relative(root, file) : file
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.startsWith(`${ABOUT_DIR}/`)) return undefined
    cache ??= readAboutEntries(root).entries
    const fresh = aboutFind(cache, { file: rel.split(path.sep).join('/') }).filter((e) => !seen.has(e.key))
    if (!fresh.length) return undefined
    for (const e of fresh) seen.add(e.key)
    return [
      `About (the app's source of truth) describes ${rel} in the section(s) below. Keep the change consistent with it, and update the section in the same PR if the behavior changes. Full text: \`pnpm agent:about ${fresh[0]!.key}\`.`,
      ...fresh.map((e) => aboutText(e)),
    ].join('\n\n')
  }
}
