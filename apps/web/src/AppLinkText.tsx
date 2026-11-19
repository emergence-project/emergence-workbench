import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api } from './api'
import { agentChatsApi } from './api/agentChats'
import { appLinkIndex, appLinks, repoOfPr, type AppLinkIndex, type AppLinkPart } from './appLinks'
import { feedbackSummary } from './feedbackFormat'
import { t } from './i18n'
import { qk } from './queries'
import { CodeText } from './repoPaths'
import { href } from './router'

/**
 * 에이전트 대화 글 속 대화 id · 피드백 키 · PR 번호를 앱 안 링크로 (11/19 "링크를 주고, 앱 안에서 바로 볼 수 있어야").
 * 대화 화면만 감싼다: 다른 메모 글은 그대로 (아는 대화 목록을 읽을 까닭이 없다).
 */
type Links = { ix: AppLinkIndex; tips: Map<string, string> }
const AppLinkContext = createContext<Links | null>(null)

/** feedback: 피드백 키도 찾을지 (중앙 · 앱 고치기 대화) */
export function AppLinkProvider({ feedback, children }: { feedback: boolean; children: ReactNode }) {
  const chats = useQuery({ queryKey: qk.agentChatList(), queryFn: () => agentChatsApi.list() }).data?.chats
  const entries = useQuery({ queryKey: qk.feedbackAll, queryFn: () => api.feedbackAll(), enabled: feedback }).data?.entries
  const value = useMemo<Links>(() => {
    const tips = new Map<string, string>()
    for (const c of chats ?? []) tips.set(c.id, c.title)
    for (const e of entries ?? []) tips.set(e.key, feedbackSummary(e.status?.clean ?? e.text))
    const repo = repoOfPr((chats ?? []).find((c) => c.pr)?.pr?.url)
    return { ix: appLinkIndex({ chats: (chats ?? []).map((c) => c.id), feedback: (entries ?? []).map((e) => e.key), repo }), tips }
  }, [chats, entries])
  return <AppLinkContext.Provider value={value}>{children}</AppLinkContext.Provider>
}

function Link({ p, tips, children }: { p: Exclude<AppLinkPart, { kind: 'text' }>; tips: Map<string, string>; children: ReactNode }) {
  if (p.kind === 'pr') return <a className="a" data-ui="PR 링크" href={p.url} target="_blank" rel="noreferrer" title={t(`PR #${p.n} (GitHub)`, `PR #${p.n} (GitHub)`)}>{children}</a>
  const [to, tip] = p.kind === 'agent'
    ? [href({ page: 'agent', id: p.id }), `${t('대화', 'Chat')} ${p.id}${tips.get(p.id) ? ` · ${tips.get(p.id)}` : ''}`]
    : [href({ page: 'feedback', key: p.key }), `${t('피드백', 'Feedback')} ${p.key}${tips.get(p.key) ? ` · ${tips.get(p.key)}` : ''}`]
  return <a className="a" data-ui={p.kind === 'agent' ? '대화 링크' : '피드백 링크'} href={to} title={tip}>{children}</a>
}

/** 보통 글: 감싼 곳 밖이면 그대로 */
export function AppLinkText({ text }: { text: string }) {
  const ctx = useContext(AppLinkContext)
  if (!ctx) return <>{text}</>
  return <>{appLinks(text, ctx.ix).map((p, i) => (p.kind === 'text' ? p.text : <Link key={i} p={p} tips={ctx.tips}>{p.text}</Link>))}</>
}

/** `코드` 글 전체가 대화 id · 피드백 키면 그 링크, 아니면 보통 코드 (저장소 경로 링크 포함) */
export function AppLinkCode({ text }: { text: string }) {
  const ctx = useContext(AppLinkContext)
  const parts = ctx ? appLinks(text, ctx.ix) : []
  const only = parts.length === 1 ? parts[0]! : null
  if (!ctx || !only || only.kind === 'text') return <CodeText text={text} />
  return <Link p={only} tips={ctx.tips}><code className="memo-code">{text}</code></Link>
}
