import { FEEDBACK_MERGES, FEEDBACK_MINUTES, FEEDBACK_PICKS, INSTRUCTION_HOURS, INSTRUCTION_MODES, type FeedbackMerge, type FeedbackPick, type InstructionMode } from '@rw/core'
import type { AgentSettings as Settings } from '@rw/core/contract/settings'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { agentChatsApi, api, setupApi, type SetupView } from './api'
import { notifyOn, notifyPermission, setNotifyOn } from './AgentChats'
import { AgentHooks } from './AgentHooks'
import { href } from './router'
import { t } from './i18n'
import { qk } from './queries'
import { CopyButton, Row, when } from './SetupChecklist'

const PICK: Record<FeedbackPick, () => string> = {
  off: () => t('끔', 'Off'),
  manual: () => t('누를 때', 'When I press'),
  instant: () => t('바로', 'Right away'),
}
const MERGE: Record<FeedbackMerge, () => string> = {
  green: () => t('CI 초록이면', 'When CI is green'),
  approved: () => t('승인한 뒤', 'After I approve'),
  never: () => t('늘 내가', 'Always me'),
}

const MODE: Record<InstructionMode, () => string> = {
  manual: () => t('직접 부탁', 'When asked'),
  instant: () => t('바로', 'Right away'),
  daily: () => t('하루 한 번', 'Once a day'),
}

/**
 * 설정 › 에이전트 (10/16 사용자 결정 "설정에서 조절할 수 있게 하자"): 기록에 남긴 질문 · 지시를 이 맥의 Claude가 언제 하는지(질문은 10/27 피드백, 10/29부터 따로 고름).
 * 맥의 Claude는 한 번에 하나씩 하고, 노트 고침은 수정 검토로 간다(「노트에 적용」은 10/28에 없앰).
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
    <AgentHooks onSaved={onSaved} />
    <h3 className="set-h3">{t('맥에서 하는 일', 'On this Mac')}</h3>
    {!s ? <p className="muted">{err ?? t('설정을 읽는 중…', 'Reading settings…')}</p> :
    <div className="set-rows" data-ui="에이전트">
      {/* 질문과 지시를 따로 고른다 (10/28 23:07 피드백, 시안 9oUgyZaGXY74exRk9vUi17 3절) */}
      <div className="set-row" data-ui="질문 처리">
        <div>
          <div className="set-name">{t('질문 처리', 'Questions')}</div>
          <div className="set-desc">{t('기록에 남긴 질문에 이 맥의 Claude가 언제 답할지 고릅니다. 질문은 파일을 읽기만 합니다. 바로면 남기거나 이어 쓰는 즉시 답하고, 직접 부탁이면 다음에 일하는 에이전트가 집어 갑니다. 어느 쪽이든 기록의 반짝이(에이전트에게 보내기)로 지금 보낼 수 있습니다.', 'Choose when Claude on this Mac answers questions left in records. Questions only read files. With "Right away", it answers as soon as you leave or continue one; with "When asked", the next agent session picks them up. Either way you can send one now with the sparkle (Send to agent) on the record.')}</div>
          {err && <div className="error-text">{err}</div>}
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          {INSTRUCTION_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={s.questions === m} className={s.questions === m ? 'on' : ''} onClick={() => save({ questions: m })}>{MODE[m]()}</button>
          ))}
        </div>
      </div>
      <div className="set-row" data-ui="지시 처리">
        <div>
          <div className="set-name">{t('지시 처리', 'Instructions')}</div>
          <div className="set-desc">{t('기록에 남긴 지시를 이 맥의 Claude가 언제 할지 고릅니다. 노트를 고치면 수정 검토에서 승인합니다. 한 번에 하나씩 하고, 하나마다 Claude 사용량이 듭니다.', 'Choose when Claude on this Mac carries out instructions left in records. Note changes wait for your approval in Edit review. One runs at a time, and each one uses Claude usage.')}</div>
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          {INSTRUCTION_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={s.instructions === m} className={s.instructions === m ? 'on' : ''} onClick={() => save({ instructions: m })}>{MODE[m]()}</button>
          ))}
        </div>
      </div>
      {(s.instructions === 'daily' || s.questions === 'daily') && <div className="set-row" data-ui="지시 처리 시각">
        <div>
          <div className="set-name">{t('시각', 'Time')}</div>
          <div className="set-desc">{t('하루 한 번으로 고른 질문 · 지시를 이 시각에 모든 프로젝트에서 모아 합니다. 그때 맥과 앱이 켜져 있어야 합니다.', 'At this time, the questions and instructions set to once a day are collected from every project and carried out. The Mac and the app must be running then.')}</div>
        </div>
        <select className="rs-select set-select" value={s.at} aria-label={t('시각', 'Time')} onChange={(e) => save({ at: e.target.value })}>
          {INSTRUCTION_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>}
    </div>}
    <AgentNotify />
    {s && <AppFeedback s={s} save={save} />}
  </>)
}

/** 대화 알림 (10/22): 이 브라우저에만 저장. 맥이 막았으면 어디서 풀지 알린다 */
function AgentNotify() {
  const [on, setOn] = useState(notifyOn)
  const [perm, setPerm] = useState(notifyPermission)
  const pick = (v: boolean) => {
    setOn(v); setNotifyOn(v)
    if (v && perm === 'default') void Notification.requestPermission().then(setPerm)
  }
  return (<>
    <h3 className="set-h3">{t('알림', 'Notifications')}</h3>
    <div className="set-rows">
      <div className="set-row" data-ui="대화 알림">
        <div>
          <div className="set-name">{t('대화 알림', 'Conversation alerts')}</div>
          <div className="set-desc">{t('앱 창을 보고 있지 않을 때, 에이전트가 답을 마치거나 허락 · 계획 승인을 기다리거나 오류로 멈추면 맥 알림을 띄웁니다. 알림을 누르면 그 대화가 열립니다.', 'When you are not looking at the app window, a Mac notification appears when an agent finishes its reply, waits for approval or a plan, or stops with an error. Click it to open the conversation.')}</div>
          {on && perm === 'denied' && <div className="error-text">{t('브라우저가 이 앱의 알림을 막았습니다. 주소 칸 왼쪽의 사이트 설정에서 알림을 허락하세요.', 'The browser blocks notifications for this app. Allow them in the site settings left of the address bar.')}</div>}
          {on && perm === 'none' && <div className="muted">{t('이 브라우저는 알림을 띄우지 못합니다.', 'This browser cannot show notifications.')}</div>}
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          <button role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => pick(true)}>{t('켬', 'On')}</button>
          <button role="radio" aria-checked={!on} className={!on ? 'on' : ''} onClick={() => pick(false)}>{t('끔', 'Off')}</button>
        </div>
      </div>
    </div>
  </>)
}

/**
 * 앱 피드백 (2단계 다, 10/21 "앱 안 대화 + CI가 시험"): 피드백을 이 맥의 앱 고치기 대화가 언제 맡고, 그 PR을 언제 합치나, 한 차례 한도.
 * 앱 저장소가 있는 맥에서만 보인다. 다시 시작하는 때는 설정 › 동기화의 앱 업데이트가 정한다.
 */
function AppFeedback({ s, save }: { s: Settings; save(patch: Partial<Settings>): void }) {
  const list = useQuery({ queryKey: qk.agentChatList(), queryFn: () => agentChatsApi.list() })
  if (!list.data?.app) return null
  return (<>
    <h3 className="set-h3">{t('앱 피드백', 'App feedback')}</h3>
    <div className="set-rows" data-ui="앱 피드백">
      <div className="set-row" data-ui="피드백 맡기기">
        <div>
          <div className="set-name">{t('맡기기', 'Hand off')}</div>
          <div className="set-desc">{t('에이전트 차례인 피드백을 이 맥의 Claude가 언제 맡을지 고릅니다. 누를 때면 피드백 화면의 「에이전트에게 맡기기」로만, 바로면 새 차례가 생길 때 앱이 맡깁니다(동시에 셋까지). 질문 · 제안은 답만 하고 코드는 고치지 않습니다.', 'Choose when Claude on this Mac takes feedback that is the agent\'s turn. "When I press" uses Hand to agent on the Feedback screen; "Right away" lets the app hand items off as they come (up to three at once). Questions and suggestions are only answered, without code changes.')}</div>
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          {FEEDBACK_PICKS.map((m) => <button key={m} role="radio" aria-checked={s.feedback === m} className={s.feedback === m ? 'on' : ''} onClick={() => save({ feedback: m })}>{PICK[m]()}</button>)}
        </div>
      </div>
      <div className="set-row" data-ui="피드백 합치기">
        <div>
          <div className="set-name">{t('합치기', 'Merge')}</div>
          <div className="set-desc">{t('맡은 대화의 PR을 언제 합칠지 고릅니다. CI가 빨가면 실패 기록을 그 대화에 다시 보내 고치게 하고(두 번까지), 그래도 안 되면 멈춥니다. 잘못 고쳤으면 피드백 화면의 「수정」이 다음 차례가 됩니다.', 'Choose when the conversation\'s PR is merged. If CI fails, the failed log goes back to that conversation to fix (up to twice), then it stops. If the fix is wrong, Revise on the Feedback screen makes it the next turn.')}</div>
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          {FEEDBACK_MERGES.map((m) => <button key={m} role="radio" aria-checked={s.merge === m} className={s.merge === m ? 'on' : ''} onClick={() => save({ merge: m })}>{MERGE[m]()}</button>)}
        </div>
      </div>
      <div className="set-row" data-ui="피드백 한도">
        <div>
          <div className="set-name">{t('한 차례 한도', 'Time limit per turn')}</div>
          <div className="set-desc">{t('넘으면 그 대화를 멈춥니다. 합친 새 버전으로 다시 시작하는 때는 ', 'The conversation stops past this. When the app restarts with a merged version is set in ')}<a className="a" href={href({ page: 'settings', part: 'sync' })}>{t('설정 › 동기화', 'Settings › Sync')}</a>{t('의 앱 업데이트가 정합니다.', ' under App updates.')}</div>
        </div>
        <select className="rs-select set-select" value={s.minutes} aria-label={t('한 차례 한도', 'Time limit per turn')} onChange={(e) => save({ minutes: Number(e.target.value) })}>
          {FEEDBACK_MINUTES.map((m) => <option key={m} value={m}>{t(`${m}분`, `${m} min`)}</option>)}
        </select>
      </div>
    </div>
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
  // 명령이 없으면 등록 명령도 실패한다 (10/21 맥미니): 먼저 까는 명령을 보이고, 깐 뒤 설치 명령을 다시 돌리면 등록까지 한다
  const absent = !a.installed && !a.registered && !a.at
  const install = a.key === 'codex' ? 'npm install -g @openai/codex' : 'npm install -g @anthropic-ai/claude-code'
  return (
    <Row ok={a.registered || !!a.at} optional name={a.name} sub="MCP" ui={a.key === 'codex' ? 'Codex 연결' : 'Claude Code 연결'}
      action={!a.registered && <CopyButton text={absent ? install : a.command} onSaved={onSaved} />}>
      {a.registered ? t('등록됨. ', 'Registered. ') : null}
      {a.at ? t(`${when(a.at)}에 불렀습니다.`, `Last called ${when(a.at)}.`)
        : a.registered ? t('아직 부른 적 없음: 등록하기 전에 열어 둔 세션은 다시 열어야 앱 도구를 씁니다.', 'Not called yet: sessions opened before registering need to be reopened to use the app tools.')
        : absent ? <>{t(`이 컴퓨터에 ${a.name}가 없습니다. 쓰려면 먼저 깔고(`, `${a.name} is not installed on this computer. To use it, install it first (`)}<code className="setup-cmd">{install}</code>{t(') 설치 명령을 다시 실행하면 등록까지 합니다.', '), then run the installer again to register it.')}</>
        : <>{t('아직 등록 안 됨. 터미널에 한 줄: ', 'Not registered yet. One line in the terminal: ')}<code className="setup-cmd">{a.command}</code></>}
    </Row>
  )
}
