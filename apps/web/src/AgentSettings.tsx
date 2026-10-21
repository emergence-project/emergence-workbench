import { INSTRUCTION_HOURS, INSTRUCTION_MODES, type InstructionMode } from '@rw/core'
import type { AgentSettings as Settings } from '@rw/core/contract/settings'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, setupApi, type SetupView } from './api'
import { t } from './i18n'
import { qk } from './queries'
import { CopyButton, Row, when } from './SetupChecklist'

const MODE: Record<InstructionMode, () => string> = {
  manual: () => t('직접 부탁', 'When asked'),
  instant: () => t('바로', 'Right away'),
  daily: () => t('하루 한 번', 'Once a day'),
}

/**
 * 설정 › 에이전트 (10/16 사용자 결정 "설정에서 조절할 수 있게 하자"): 기록에 남긴 지시를 이 맥의 Claude가 언제 하는지.
 * 맥의 Claude는 한 번에 하나씩 하고, 파일은 직접 고치지 않는다(노트 고침은 답에 적고 "노트에 적용"으로).
 */
export function AgentSettings({ onSaved }: { onSaved(message: string): void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.agentSettings().then(setS).catch((e: Error) => setErr(e.message)) }, [])
  const save = (patch: Partial<Settings>) => {
    setErr(null)
    api.saveAgentSettings(patch).then(setS).catch((e: Error) => setErr(e.message))
  }
  return (<>
    <AgentConnections onSaved={onSaved} />
    <h3 className="set-h3">{t('맥에서 하는 일', 'On this Mac')}</h3>
    {!s ? <p className="muted">{err ?? t('설정을 읽는 중…', 'Reading settings…')}</p> :
    <div className="set-rows" data-ui="에이전트">
      <div className="set-row" data-ui="지시 처리">
        <div>
          <div className="set-name">{t('지시 처리', 'Instructions')}</div>
          <div className="set-desc">{t('기록에 남긴 지시를 이 맥의 Claude가 언제 할지 고릅니다. 직접 부탁이면 맥은 하지 않고, 다음에 일하는 에이전트가 집어 갑니다. 한 번에 하나씩 하고, 노트 고침은 답에 적어 "노트에 적용"으로 반영합니다. 지시 하나마다 Claude 사용량이 듭니다.', 'Choose when Claude on this Mac carries out instructions left in records. With "When asked", the Mac does nothing and the next agent session picks them up. One runs at a time, and note changes come in the answer for you to apply with "Apply to note". Each instruction uses Claude usage.')}</div>
          {err && <div className="error-text">{err}</div>}
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          {INSTRUCTION_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={s.instructions === m} className={s.instructions === m ? 'on' : ''} onClick={() => save({ instructions: m })}>{MODE[m]()}</button>
          ))}
        </div>
      </div>
      {s.instructions === 'daily' && <div className="set-row" data-ui="지시 처리 시각">
        <div>
          <div className="set-name">{t('시각', 'Time')}</div>
          <div className="set-desc">{t('이 시각에 모든 프로젝트의 대기 중인 지시를 모아 합니다. 그때 맥과 앱이 켜져 있어야 합니다.', 'At this time, waiting instructions from every project are carried out. The Mac and the app must be running then.')}</div>
        </div>
        <select value={s.at} aria-label={t('시각', 'Time')} onChange={(e) => save({ at: e.target.value })}>
          {INSTRUCTION_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>}
    </div>}
  </>)
}

/**
 * 연결 (10/21 사용자 "Codex 연결이랑 Claude 연결이랑 Claude API 연결까지 구분해서"): 에이전트마다 한 줄.
 * Claude Code · Codex는 이 앱을 MCP로 부른다: 등록됐는지와 마지막으로 부른 때, 등록 안 됐으면 명령 한 줄.
 * Claude API는 앱이 직접 Claude를 부르는 것으로 아직 없다(자리만). 계정 › 시작 준비에는 몇 개 연결됐는지만 보인다.
 */
function AgentConnections({ onSaved }: { onSaved(message: string): void }) {
  const setup = useQuery({ queryKey: qk.setup, queryFn: setupApi.get, refetchOnMount: 'always' })
  return (<>
    <h3 className="set-h3">{t('연결', 'Connections')}</h3>
    <div className="setup set-rows" data-ui="에이전트 연결 묶음">
      {setup.data ? setup.data.agents.map((a) => <McpRow key={a.key} a={a} onSaved={onSaved} />)
        : <p className="muted setup-row">{setup.error?.message ?? t('읽는 중…', 'Reading…')}</p>}
      <Row ok={false} optional name="Claude API" sub={t('앱이 직접 부름 · 나중에', 'the app calls Claude itself · later')} ui="Claude API 연결">
        {t('아직 없음. 앱이 스스로 Claude에게 묻는 기능(예: 지시 처리)을 만들 때 API 키를 넣는 자리입니다. 키는 이 맥의 키체인에만 둡니다.', 'Not yet. This is where the API key goes once the app asks Claude by itself (for example to carry out instructions). The key will stay in this Mac\'s keychain only.')}
      </Row>
    </div>
  </>)
}

/** 등록과 부름은 다르다 (10/21): 등록했으면 명령 대신 "등록됨", 부른 때는 MCP 도구가 앱을 부를 때 적힌다 */
function McpRow({ a, onSaved }: { a: SetupView['agents'][number]; onSaved(message: string): void }) {
  return (
    <Row ok={a.registered || !!a.at} optional name={a.name} sub="MCP" ui={a.key === 'codex' ? 'Codex 연결' : 'Claude Code 연결'}
      action={!a.registered && <CopyButton text={a.command} onSaved={onSaved} />}>
      {a.registered ? t('등록됨. ', 'Registered. ') : null}
      {a.at ? t(`${when(a.at)}에 불렀습니다.`, `Last called ${when(a.at)}.`)
        : a.registered ? t('아직 부른 적 없음: 등록하기 전에 열어 둔 세션은 다시 열어야 앱 도구를 씁니다.', 'Not called yet: sessions opened before registering need to be reopened to use the app tools.')
        : <>{t('아직 등록 안 됨. 터미널에 한 줄: ', 'Not registered yet. One line in the terminal: ')}<code className="setup-cmd">{a.command}</code></>}
    </Row>
  )
}
