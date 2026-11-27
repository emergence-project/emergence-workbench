/**
 * 에이전트에게 건네는 소개 (2026-11-27 사용자 결정 "소개를 읽고 일을 시작하게").
 * 절 파일(apps/web/src/about/<쪽>/<절>.md, about-md.ts)을 받아, 고칠 파일 · 쓸 MCP 도구 · 절 이름으로 관련 절을 찾고 글로 만든다.
 * 파일을 읽는 것은 부르는 쪽(서버 aboutGuide.ts, 스크립트 agent-about.mjs)이 한다. 여기서는 계산만.
 */
import { aboutGlobMatch, aboutLineText, parseAboutMd, type AboutMd } from './about-md.js'

export interface AboutEntry {
  /** <쪽>/<파일 이름> (about/prs 조각 · 확인 기록과 같은 키) */
  key: string
  md: AboutMd
}

export interface AboutQuery {
  /** 절 키(<쪽>/<절>), 옛 절 키(was), 절 id, 또는 쪽 이름 */
  section?: string
  /** 저장소 기준 파일 경로 */
  file?: string
  /** MCP 도구 이름 */
  tool?: string
}

/** 파일들을 절로. 읽지 못한 파일은 errors에 (한 파일이 틀려도 나머지는 건넨다) */
export function aboutEntries(files: { key: string; text: string }[]): { entries: AboutEntry[]; errors: string[] } {
  const entries: AboutEntry[] = []
  const errors: string[] = []
  for (const f of [...files].sort((a, b) => a.key.localeCompare(b.key))) {
    try { entries.push({ key: f.key, md: parseAboutMd(f.text) }) } catch (e) { errors.push(`${f.key}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return { entries, errors }
}

const norm = (file: string) => file.replace(/\\/g, '/').replace(/^\.\//, '')

/** 물음에 맞는 절. 물음이 비면 모두 */
export function aboutFind(entries: AboutEntry[], q: AboutQuery): AboutEntry[] {
  return entries.filter((e) => {
    if (q.section) {
      const s = q.section.replace(/\.md$/, '')
      const part = e.key.split('/')[0]
      if (!(e.key === s || e.md.was.includes(s) || e.md.id === s || part === s || e.key.endsWith(`/${s}`))) return false
    }
    if (q.file && !e.md.code.some((g) => aboutGlobMatch(g, norm(q.file!)))) return false
    if (q.tool && !e.md.mcp.includes(q.tool)) return false
    return true
  })
}

type Lang = 'ko' | 'en'

/** 규범 절: 어느 파일을 고치든 걸리는 원칙 (앱 고치기 대화에 처음 한 번, 목록 맨 위) */
export const aboutNorms = (entries: AboutEntry[]): AboutEntry[] => entries.filter((e) => e.md.kind === 'norm')

/** 절 목록: 먼저 읽을 규범 · 용어와 기호 · 기능 순으로 묶어 한 줄씩 */
export function aboutList(entries: AboutEntry[], lang: Lang = 'ko'): string {
  const ko = lang === 'ko'
  const groups: [string, AboutEntry[]][] = [
    [ko ? '먼저 읽을 것 (어느 파일을 고치든 지킬 원칙)' : 'Read first (principles that apply to any change)', aboutNorms(entries)],
    [ko ? '용어와 기호' : 'Terms and symbols', entries.filter((e) => e.md.kind === 'reference')],
    [ko ? '기능 (고칠 파일 · 쓸 도구로 찾음)' : 'Features (found by file or tool)', entries.filter((e) => e.md.kind === 'feature')],
  ]
  return groups.filter(([, xs]) => xs.length).map(([head, xs]) => [`## ${head}`, ...xs.map((e) => aboutListLine(e, lang))].join('\n')).join('\n\n')
}

/** 목록 한 줄: 키 · 제목 · 요약 */
export function aboutListLine(e: AboutEntry, lang: Lang = 'ko'): string {
  return `- ${e.key} · ${e.md.title[lang]}${e.md.summary ? ` — ${e.md.summary[lang]}` : ''}`
}

/** 절 하나를 글로. full이 아니면 요약과 지킬 것만 (훅이 건네는 짧은 안내). 규범 절은 항목이 곧 지킬 것이라 늘 넣는다 */
export function aboutText(e: AboutEntry, o: { lang?: Lang; full?: boolean } = {}): string {
  const lang = o.lang ?? 'ko'
  const b = e.md[lang]
  const ko = lang === 'ko'
  const lines = [`## ${e.md.title[lang]} (${e.key})`]
  if (e.md.summary) lines.push(e.md.summary[lang])
  const list = (head: string, xs: typeof b.items) => (xs.length ? ['', `### ${head}`, ...xs.map((x) => `- ${aboutLineText(x)}`)] : [])
  if (o.full || e.md.kind === 'norm') lines.push(...list(e.md.kind === 'norm' ? (ko ? '원칙' : 'Principles') : ko ? '지금 동작' : 'How it works', b.items))
  lines.push(...list(ko ? '지킬 것' : 'Keep', b.keep))
  if (o.full) {
    lines.push(...list(ko ? '결정' : 'Decisions', b.decisions))
    if (e.md.code.length) lines.push('', `### ${ko ? '구현' : 'Code'}`, ...e.md.code.map((c) => `- ${c}`))
    if (e.md.mcp.length) lines.push('', `### MCP`, `- ${e.md.mcp.join(', ')}`)
  }
  return lines.join('\n')
}
