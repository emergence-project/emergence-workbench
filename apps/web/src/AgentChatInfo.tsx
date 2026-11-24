import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, CENTRAL_RID, type Chat, type ChatItem } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { SideTabs, type PaneTab, type SideTab, type useSideColumn } from './WorkAside'
import { secondsName } from './WorkLog'
import { scopeName } from './AgentProjectPick'
import { AgentChip, effortsOf, familyName, familyOf, isClaude, useModels } from './AgentPick'
import { useReviewers } from './AgentReview'
import { EFFORT_NAME, effortLabel } from './ChatComposer'
import { costName, useChat } from './AgentChats'
import { tokensName } from './agentTokens'

/** 요약하는 선(없으면 컨텍스트 창)의 이만큼 차면 곧 요약된다고 알린다 */
const COMPACT_HINT = 0.8

/**
 * 「이 대화」 칸 (10/28 20:10 피드백 "컨텍스트 윈도우, 기본정보등이 다 있으면", 시안 1절):
 * 컨텍스트 창 막대 · 모델 · 범위 · 쓴 토큰과 가격 · 일한 시간 · 시작과 마지막 · 작업 폴더(앱 고치기). 차례가 끝나기 전에도 보인다
 */
export function ChatInfo({ chat }: { chat: Chat }) {
  const models = useModels(chat.agent)
  const topics = useQuery({ queryKey: qk.topics(chat.rid), queryFn: () => api.research(chat.rid).topics(), enabled: chat.scope.kind === 'topic' }).data
  const results = chat.items.filter((i): i is Extract<ChatItem, { kind: 'result' }> => i.kind === 'result')
  const cost = results.reduce((s, r) => s + (r.cost ?? 0), 0)
  const secs = results.reduce((s, r) => s + (r.seconds ?? 0), 0)
  const tokens = results.reduce((s, r) => s + (r.tokens ? r.tokens.in + r.tokens.out : 0), 0)
  const context = [...results].reverse().find((r) => r.context)?.context
  // 막대는 요약하는 선까지 (11/23: 1M 창 대비 9%로 보이다 갑자기 요약돼서)
  const limit = context ? context.compactAt ?? context.window : 0
  const share = context ? Math.min(1, context.used / limit) : 0
  const when = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  return (
    <section className="ac-info" data-ui="이 대화 정보">
      <h3>{t('이 대화', 'This conversation')}</h3>
      <div className="ac-work-row"><span>{t('컨텍스트', 'Context')}</span>
        <span className="muted" title={context?.compactAt ? t(`${tokensName(context.compactAt)}쯤 되면 앞 내용을 요약합니다 (모델 컨텍스트 창 ${tokensName(context.window)})`, `Summarized around ${tokensName(context.compactAt)} (model context window ${tokensName(context.window)})`) : undefined}>{context ? `${tokensName(context.used)} / ${tokensName(limit)} · ${Math.round(share * 100)}%` : t('첫 차례가 끝나면 보입니다', 'Shown after the first turn')}</span></div>
      {context && <div className="ac-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t('컨텍스트', 'Context')}><i style={{ width: `${share * 100}%` }} /></div>}
      {context && share >= COMPACT_HINT && isClaude(chat.agent) && <span className="muted ac-hint">{context.compactAt ? t('곧 앞 내용을 자동으로 요약합니다. 나눌 만한 곳이면 /compact로 먼저 요약할 수 있습니다', 'Earlier turns will be summarized soon. At a good break, /compact summarizes them now') : t('컨텍스트가 많이 찼습니다. /compact로 앞 내용을 요약할 수 있습니다', 'The context window is nearly full. /compact summarizes earlier turns')}</span>}
      <dl className="ac-info-list">
        <dt>{t('모델', 'Model')}</dt><dd><AgentChip agent={chat.agent} /> {familyName(chat.model, models)}{isClaude(chat.agent) ? effortsOf(chat.model, models).length > 0 && ` · ${EFFORT_NAME[chat.effort]}` : familyOf(chat.model, models).suffix && ` · ${effortLabel(familyOf(chat.model, models).suffix)}`}</dd>
        <dt>{t('범위', 'Scope')}</dt><dd>{scopeName(chat.scope, topics)}</dd>
        <dt>{t('사용 토큰', 'Tokens used')}</dt><dd>{tokens > 0 ? `${tokensName(tokens)} (${t(`차례 ${results.length}번`, `${results.length} turn${results.length > 1 ? 's' : ''}`)})` : t('아직 없음', 'None yet')}{cost > 0 && <span className="muted" title={costName(cost)}> · {t(`API 가격 약 $${cost.toFixed(2)}`, `about $${cost.toFixed(2)} at API prices`)}</span>}</dd>
        {secs > 0 && <><dt>{t('일한 시간', 'Time worked')}</dt><dd>{secondsName(secs)}</dd></>}
        <dt>{t('시작', 'Started')}</dt><dd>{when(chat.created)} <span className="muted">· {t('마지막', 'last')} {when(chat.updated)}</span></dd>
        {chat.branch && <><dt>{t('작업 폴더', 'Work folder')}</dt><dd className="mono ac-file" title={chat.branch}>{chat.branch}</dd></>}
      </dl>
    </section>
  )
}

/** 사이드바 맨 위 아이콘 줄 (11/23 시안 chat-head-icons 안 B, chat-resolve-circle 2, side-icons-review-changes 안 가): 왼쪽에 이 대화 · 검토(돋보기 안 체크, 검토자가 있는 Claude 대화),
 *  오른쪽 끝에 변경사항(둥근 네모 안 ±, 고친 곳이 있으면 초록 점, +n −n은 툴팁) · 터미널. 토론 · 중앙은 세부 패널이 한 칸뿐이라 그 칸과 터미널만 */
export function ChatSideTabs({ id, col }: { id: string; col: ReturnType<typeof useSideColumn> }) {
  const chat = useChat(id).data
  const reviewers = useReviewers()
  if (!chat) return null
  const [added, removed] = chat.items.reduce(([a, r], i) => (i.kind === 'edit' ? [a + i.added, r + i.removed] : [a, r]), [0, 0])
  const single = !!chat.debate || chat.rid === CENTRAL_RID
  const tab = (key: PaneTab, ui: string, icon: ReactNode, label: string, tip: string): SideTab => ({ key, ui, icon, label, tip, on: single ? col.tab !== null : col.tab === key, onClick: () => col.show(key) })
  const tabs: SideTab[] = [
    tab('info', '이 대화 칸 버튼', Icon.info, t('이 대화', 'This conversation'), single ? t('이 대화', 'This conversation') : t('이 대화 (컨텍스트 · 모델 · 사용 중인 파일 · 권한)', 'This conversation (context, model, claimed files, permissions)')),
    ...(single ? [] : [
      ...(reviewers.length > 0 && isClaude(chat.agent) && !chat.machine ? [tab('review', '검토 칸 버튼', Icon.inspect, t('검토', 'Review'), t('검토 (Codex · Gemini가 각자 읽기만 하며 검토 · 지난 검토)', 'Review (Codex, Gemini each review read-only; past reviews)'))] : []),
    ]),
    ...(single ? [] : [{ ...tab('changes', '변경사항 칸 버튼', <>{Icon.diff}{(added > 0 || removed > 0) && <i className="ac-side-dot" />}</>, t('변경사항', 'Changes'), added || removed ? t(`변경사항 +${added} −${removed}`, `Changes +${added} −${removed}`) : t('변경사항 (아직 없음)', 'Changes (none yet)')), end: true }]),
    ...(col.termTab ? [{ ...col.termTab, end: single || undefined }] : []),
  ]
  return <SideTabs tabs={tabs} />
}
