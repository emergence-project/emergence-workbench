import type { BlockStatus } from '@rw/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agentHooksApi, type HookSession, type HookView } from './api'
import { t } from './i18n'
import { qk } from './queries'
import { when } from './SetupChecklist'
import { StatusDot } from './StatusDot'

/** 상태 점: 일하는 중 파랑 · 사용자를 기다림 주황(사용자 차례) · 차례 끝남 청록 */
const DOT: Record<HookSession['state'], BlockStatus> = { working: 'in-progress', waiting: 'blocked', done: 'solved' }
const STATE: Record<HookSession['state'], () => string> = {
  working: () => t('일하는 중', 'Working'),
  waiting: () => t('나를 기다림', 'Waiting for you'),
  done: () => t('차례 끝남', 'Turn done'),
}
const AGENT: Record<HookSession['agent'], string> = { 'claude-code': 'Claude Code', codex: 'Codex' }

/**
 * 설정 › 에이전트 › 상태 알리기 (10/30, 오르카의 에이전트 상태 훅): 터미널에서 도는 Claude Code · Codex가 일하는 중 · 나를 기다림 · 차례 끝남을
 * 앱에 알리게 한다. 에이전트가 앱 MCP를 부르지 않아도 보인다. 켜면 그 에이전트의 사용자 설정에 앱의 훅 한 줄을 넣고, 끄면 그 줄만 뺀다.
 */
export function AgentHooks({ onSaved }: { onSaved(message: string): void }) {
  const client = useQueryClient()
  const view = useQuery({ queryKey: qk.agentHooks, queryFn: agentHooksApi.get, refetchInterval: 60_000 })
  const [err, setErr] = useState<string | null>(null)
  const set = async (agent: HookSession['agent'], on: boolean) => {
    setErr(null)
    try {
      client.setQueryData<HookView>(qk.agentHooks, await agentHooksApi.install({ agent, on }))
      onSaved(on ? t(`${AGENT[agent]}에 상태 알리기를 넣었습니다. 새로 연 세션부터 알립니다`, `Added status reports to ${AGENT[agent]}. New sessions report from now on`) : t(`${AGENT[agent]}의 상태 알리기를 뺐습니다`, `Removed status reports from ${AGENT[agent]}`))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  const v = view.data
  return (<>
    <h3 className="set-h3">{t('상태 알리기', 'Status reports')}</h3>
    <div className="set-rows" data-ui="상태 알리기">
      {(['claude-code', 'codex'] as const).map((a) => {
        const on = v?.installed[a] === true
        const busy = v?.installed[a] === 'busy'
        return <div key={a} className="set-row" data-ui={a === 'codex' ? 'Codex 상태 알리기' : 'Claude Code 상태 알리기'}>
          <div>
            <div className="set-name">{AGENT[a]}</div>
            <div className="set-desc">{a === 'codex'
              ? t('터미널의 Codex가 차례를 마칠 때마다 앱에 알립니다(~/.codex/config.toml의 notify 한 줄).', 'Codex in a terminal tells the app whenever it finishes a turn (one notify line in ~/.codex/config.toml).')
              : t('터미널의 Claude Code가 지시를 받을 때 · 허락이나 입력을 기다릴 때 · 차례를 마칠 때 앱에 알립니다(~/.claude/settings.json의 훅). 앱 MCP를 부르지 않는 세션도 보입니다.', 'Claude Code in a terminal tells the app when it gets an instruction, waits for permission or input, and finishes a turn (hooks in ~/.claude/settings.json). Sessions that never call the app MCP show too.')}</div>
            {busy && <div className="muted">{t('다른 notify가 있어 넣지 않았습니다. Codex는 notify를 하나만 받습니다.', 'Another notify is set, so nothing was added. Codex takes only one notify.')}</div>}
          </div>
          <div className="segmented small" role="radiogroup" data-ui="고르기">
            <button role="radio" aria-checked={on} className={on ? 'on' : ''} disabled={!v || busy} onClick={() => void set(a, true)}>{t('켬', 'On')}</button>
            <button role="radio" aria-checked={!on} className={!on ? 'on' : ''} disabled={!v || busy} onClick={() => void set(a, false)}>{t('끔', 'Off')}</button>
          </div>
        </div>
      })}
      {err && <p className="error-text">{err}</p>}
      <div className="set-row" data-ui="밖에서 도는 에이전트">
        <div>
          <div className="set-name">{t('밖에서 도는 에이전트', 'Agents running outside the app')}</div>
          <div className="set-desc">{t('최근 12시간에 알린 세션입니다. 세션을 닫으면 빠집니다.', 'Sessions that reported in the last 12 hours. A session leaves the list when it closes.')}</div>
          {v && !v.sessions.length && <div className="muted">{t('아직 알린 세션이 없습니다.', 'No session has reported yet.')}</div>}
          {v?.sessions.map((s) => (
            <div key={`${s.agent}-${s.session}`} className="hook-row" data-ui="밖 세션" data-ui-item={s.session}>
              <StatusDot s={DOT[s.state]} name={STATE[s.state]()} label />
              <span className="hook-who">{AGENT[s.agent]} · {s.project ?? s.cwd}</span>
              <span className="muted">{when(s.at)}</span>
              {s.note && <span className="hook-note muted" title={s.note}>{s.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  </>)
}
