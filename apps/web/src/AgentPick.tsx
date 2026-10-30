// 에이전트 대화의 에이전트 · 모델 고르기 (AgentChats.tsx에서 나눔, 10/30 "Codex · Gemini 연결", 시안 https://claude.ai/artifact/3NBbEmtfj3LYnw4J2ypr4u)
// 대화를 시작할 때 Claude · Codex · Gemini 중 하나를 고르고, 시작한 대화는 그 에이전트로 고정한다 (세션이 에이전트마다 따로라서)
import { useQuery } from '@tanstack/react-query'
import { agentChatsApi, type AgentKind, type ChatEffort, type ChatModel, type ModelChoice } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'

export const AGENT_KINDS: AgentKind[] = ['claude-code', 'codex', 'gemini']
export const AGENT_NAME: Record<AgentKind, string> = { 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }
const AGENT_CLASS: Record<AgentKind, string> = { 'claude-code': 'cc', codex: 'cx', gemini: 'gm' }
/** 저장된 값이 모르는 에이전트면 Claude */
export const agentOf = (v: string | undefined): AgentKind => (v === 'codex' || v === 'gemini' ? v : 'claude-code')
/** Claude만 되는 것 (계획 모드 · 되돌리기 · 탐색 하위 에이전트 · 맥락 막대) */
export const isClaude = (v: string | undefined) => agentOf(v) === 'claude-code'

/** 에이전트 이름 표 (에이전트 색, 디자인 문서 2절) */
export function AgentChip({ agent }: { agent: string }) {
  const a = agentOf(agent)
  return <span className={`ag-chip ${AGENT_CLASS[a]}`}>{AGENT_NAME[a]}</span>
}

const BASIC_EFFORTS: ChatEffort[] = ['low', 'medium', 'high']
/** 맥의 Claude Code에게 모델을 묻지 못했을 때 (별칭 넷). Codex · Gemini는 기본 하나 */
const FALLBACK_MODELS: ModelChoice[] = [
  { value: 'default', name: t('기본 모델', 'Default model'), desc: '', efforts: BASIC_EFFORTS },
  { value: 'opus', name: 'Opus', desc: '', efforts: BASIC_EFFORTS },
  { value: 'sonnet', name: 'Sonnet', desc: '', efforts: BASIC_EFFORTS },
  { value: 'haiku', name: 'Haiku', desc: '', efforts: BASIC_EFFORTS },
]
const FALLBACK_OTHER: ModelChoice[] = [{ value: 'default', name: t('기본 모델', 'Default model'), desc: '', efforts: [] }]

/** 고를 수 있는 모델: 그 에이전트가 아는 것 (Claude는 버전까지, 예: Opus 5.5 · Opus 5) */
export function useModels(agent?: string): ModelChoice[] {
  const a = agentOf(agent)
  const got = useQuery({ queryKey: qk.agentModels(a), queryFn: () => agentChatsApi.models(a), staleTime: 30 * 60_000 }).data
  return got?.length ? got : a === 'claude-code' ? FALLBACK_MODELS : FALLBACK_OTHER
}
/** 이 맥에서 대화를 맡길 수 있는 에이전트 */
export function useAgentKinds() {
  return useQuery({ queryKey: qk.agentKinds, queryFn: agentChatsApi.agents, staleTime: 5 * 60_000 }).data
}
/** 모델 이름: 기본은 실제로 도는 모델을 붙여 "기본 (Opus 5.5)", 목록에 없는 id는 그대로 */
export function modelName(value: ChatModel, list: ModelChoice[]): string {
  const m = list.find((x) => x.value === value)
  if (value !== 'default') return m?.name ?? value
  const real = m?.resolved && list.find((x) => x.value !== 'default' && x.resolved === m.resolved)?.name
  return real ? t(`기본 (${real})`, `Default (${real})`) : t('기본 모델', 'Default model')
}
/** 모델을 바꿀 때: 새 모델이 지금 생각 깊이를 받지 않으면 보통(없으면 첫째)으로 */
export const fitEffort = (now: ChatEffort, efforts: ChatEffort[]): { effort?: ChatEffort } => (!efforts.length || efforts.includes(now) ? {} : { effort: efforts.includes('medium') ? 'medium' : efforts[0]! })
/** 그 모델이 받는 생각 깊이 (목록에 없는 모델은 기본 셋, 받지 않으면 빈 목록) */
export const effortsOf = (value: ChatModel, list: ModelChoice[]): ChatEffort[] => { const m = list.find((x) => x.value === value); return m ? m.efforts ?? [] : BASIC_EFFORTS }

/**
 * 모델 메뉴 맨 위의 에이전트 줄. fixed = 이미 시작한 대화 (바꾸지 못하고 새 대화에서 고른다).
 * 깔리지 않은 에이전트는 흐리게 「설치 안 됨」 (설정 › 에이전트에 깔 명령)
 */
export function AgentChoices({ agent, fixed, onPick }: { agent: string; fixed?: boolean; onPick(a: AgentKind): void }) {
  const kinds = useAgentKinds()
  const now = agentOf(agent)
  const shown = fixed ? [now] : AGENT_KINDS
  return <>
    <div className="ac-pop-h">{t('에이전트', 'Agent')}</div>
    {shown.map((a) => {
      const k = kinds?.find((x) => x.id === a)
      const missing = !!k && !k.installed
      return (
        <button key={a} role="menuitemradio" aria-checked={now === a} className={now === a ? 'on' : ''} disabled={missing || (fixed && now !== a)} data-ui="에이전트 고르기" onClick={() => onPick(a)}>
          <span className="ac-pop-check" aria-hidden>{now === a ? Icon.check : null}</span><AgentChip agent={a} />
          {missing && <span className="muted ac-key">{t('설치 안 됨', 'Not installed')}</span>}
        </button>
      )
    })}
    {fixed && <div className="muted ac-pop-note">{t('다른 에이전트는 새 대화에서', 'Pick another agent in a new conversation')}</div>}
  </>
}
