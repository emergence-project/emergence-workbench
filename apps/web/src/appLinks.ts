/**
 * 대화 글 속 앱 안 이름을 링크로 나눈다 (11/19 사용자 "10ac153f 이게 뭔데 대화야? 피드백이야? 링크를 주고, 앱 안에서 바로 볼 수 있어야").
 *   대화 id   2026-11-19-10ac153f · 10ac153f      → #/agent/<대화>  (짧은 꼴은 아는 대화일 때만)
 *   피드백 키 2026-11-19 12:14 에이전트 › 대화    → #/feedback/<키> (아는 키 전체, 또는 그 시각이 한 항목뿐일 때 "날짜 시각")
 *   PR       #488                                → 앱 저장소의 그 PR (저장소 주소를 알 때만)
 */
export type AppLinkPart =
  | { kind: 'text'; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'feedback'; key: string; text: string }
  | { kind: 'pr'; n: number; url: string; text: string }

export type AppLinkKnown = {
  /** 아는 대화 id (전체 꼴) */
  chats: readonly string[]
  /** 아는 피드백 키 */
  feedback: readonly string[]
  /** 앱 저장소 주소 (https://github.com/<주인>/<저장소>) */
  repo?: string
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CHAT_RE = /(?<![\w-])(?:(\d{4}-\d{2}-\d{2})-)?([0-9a-f]{8})(?![\w-])/g
const PR_RE = /(?<![\w&#/])#(\d{1,6})(?!\w)/g
const WHEN_RE = /(?<!\d)(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?!\d)/g

type Hit = { at: number; end: number; part: Exclude<AppLinkPart, { kind: 'text' }> }

/** 이름을 찾는 표 (글마다가 아니라 아는 목록이 바뀔 때 한 번 만든다) */
export function appLinkIndex(known: AppLinkKnown) {
  const short = new Map<string, string>()
  for (const id of known.chats) { const s = /-([0-9a-f]{8})$/.exec(id)?.[1]; if (s) short.set(s, short.has(s) ? '' : id) }
  const keys = [...new Set(known.feedback)].sort((a, b) => b.length - a.length)
  const keyRe = keys.length ? new RegExp(keys.map(esc).join('|'), 'g') : null
  // "날짜 시각"만 적었을 때: 그 시각의 항목이 하나뿐이면 그 항목
  const when = new Map<string, string>()
  for (const k of keys) { const w = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) /.exec(k)?.[1]; if (w) when.set(w, when.has(w) ? '' : k) }
  return { chats: new Set(known.chats), short, keyRe, when, repo: known.repo?.replace(/\/+$/, '') }
}
export type AppLinkIndex = ReturnType<typeof appLinkIndex>

export function appLinks(text: string, ix: AppLinkIndex): AppLinkPart[] {
  const hits: Hit[] = []
  const free = (at: number, end: number) => hits.every((h) => end <= h.at || at >= h.end)
  const add = (at: number, end: number, part: Hit['part']) => { if (free(at, end)) hits.push({ at, end, part }) }
  if (ix.keyRe) for (const m of text.matchAll(ix.keyRe)) add(m.index!, m.index! + m[0].length, { kind: 'feedback', key: m[0], text: m[0] })
  for (const m of text.matchAll(WHEN_RE)) {
    const key = ix.when.get(m[1]!)
    if (key) add(m.index!, m.index! + m[0].length, { kind: 'feedback', key, text: m[0] })
  }
  for (const m of text.matchAll(CHAT_RE)) {
    const id = m[1] ? m[0] : ix.short.get(m[2]!)
    // 날짜가 붙은 꼴은 대화 id 모양 그대로라 목록(최근 것만)에 없어도 잇는다
    if (id && (m[1] || ix.chats.has(id))) add(m.index!, m.index! + m[0].length, { kind: 'agent', id, text: m[0] })
  }
  if (ix.repo) for (const m of text.matchAll(PR_RE)) add(m.index!, m.index! + m[0].length, { kind: 'pr', n: Number(m[1]), url: `${ix.repo}/pull/${m[1]}`, text: m[0] })
  if (!hits.length) return [{ kind: 'text', text }]
  hits.sort((a, b) => a.at - b.at)
  const out: AppLinkPart[] = []
  let at = 0
  for (const h of hits) {
    if (h.at > at) out.push({ kind: 'text', text: text.slice(at, h.at) })
    out.push(h.part)
    at = h.end
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}

/** PR 주소(…/pull/<n>)에서 저장소 주소 */
export const repoOfPr = (url: string | undefined) => url ? /^(https:\/\/[^/]+\/[^/]+\/[^/]+)\/pull\/\d+/.exec(url)?.[1] : undefined
