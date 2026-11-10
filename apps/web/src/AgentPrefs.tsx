// 설정 › 에이전트의 에이전트마다 줄 (11/9 사용자 결정 "Claude가 쓰고 Codex가 검토", 시안 https://claude.ai/artifact/3rzyEjiuLgnmBvmWLJoER8 2절)
// 접은 목록: 로고 · 이름 · 계정 · "시작 권한 · 하는 일" ›. 줄을 누르면 자세히(계정 · 새 대화의 시작 권한 · 자동 허용 · 하는 일)
// 늘 펼쳐 두지 않고 필요할 때 들어가 본다 (11/9 코멘트)
import { AGENT_ROLES, presetAuto, type AgentPref, type AgentRole, type AgentTrust } from '@rw/core'
import type { AgentSettings, AgentSettingsBody } from '@rw/core/contract/settings'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, type AgentKind } from './api'
import { AgentLogo } from './agentLogos'
import { AGENT_NAME, useAgentKinds, useAgentPrefs } from './AgentPick'
import { TRUST_NAME } from './ChatComposer'
import { t, HERE } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { CopyButton } from './SetupChecklist'

type Kind = NonNullable<ReturnType<typeof useAgentKinds>>[number]
const ROLE_NAME: Record<AgentRole, () => string> = { write: () => t('쓰기', 'Write'), review: () => t('검토', 'Review'), both: () => t('둘 다', 'Both') }
const AUTO_NAME = { read: () => t('읽기', 'Read'), run: () => t('실행', 'Run'), web: () => t('웹 보기', 'Web') } as const
const AUTO_KEYS = ['read', 'run', 'web'] as const
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** 그 에이전트가 고를 수 있는 시작 권한 (계획 모드는 Claude만) */
const trustsOf = (a: AgentKind): AgentTrust[] => (a === 'claude-code' ? ['read', 'ask', 'plan', 'edit'] : ['read', 'ask', 'edit'])
/** 자동 허용의 지금 값: 고친 적 없으면 권한 이름의 기본값 */
export const autoShown = (p: AgentPref) => p.auto ?? (p.trust === 'read' ? presetAuto('read', 'ask') : presetAuto('notes', p.trust))
const account = (k: Kind | undefined) => [k?.email, k?.plan].filter(Boolean).join(' · ')

/** 설정 › 에이전트의 「대화를 맡는 에이전트」: 에이전트마다 한 줄, 자동 검토 */
export function AgentPrefs({ onSaved }: { onSaved(message: string): void }) {
  const kinds = useAgentKinds()
  const prefs = useAgentPrefs()
  const client = useQueryClient()
  const [open, setOpen] = useState<AgentKind | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const save = (patch: AgentSettingsBody) => {
    setErr(null)
    api.saveAgentSettings(patch).then((v: AgentSettings) => client.setQueryData(qk.agentSettings, v)).catch((e) => setErr(msg(e)))
  }
  const k = open && kinds?.find((x) => x.id === open)
  return (<>
    <h3 className="set-h3">{t('대화를 맡는 에이전트', 'Agents for conversations')}</h3>
    {err && <div className="error-text">{err}</div>}
    {!kinds || !prefs ? <p className="muted">{t('읽는 중…', 'Reading…')}</p>
      : k ? <AgentDetail k={k} pref={prefs.per[k.id]} onBack={() => setOpen(null)} save={(p) => save({ per: { [k.id]: p } })} onSaved={onSaved} onError={setErr} />
      : <div className="set-rows ap-list" data-ui="대화 에이전트 묶음">
        {kinds.map((a) => {
          const p = prefs.per[a.id]
          const ready = a.installed && a.login !== false
          return (
            <button key={a.id} className="ap-row" data-ui="대화 에이전트" onClick={() => setOpen(a.id)}>
              <AgentLogo agent={a.id} />
              <span className="ap-main">
                <span className="set-name">{a.name}</span>
                <span className="muted ap-sub">{!a.installed ? t('설치 안 됨', 'Not installed') : a.login === false ? t('로그인 안 됨', 'Not signed in') : account(a) || t('로그인됨', 'Signed in')}</span>
              </span>
              {ready && <span className="muted ap-sum">{TRUST_NAME[p.trust]} · {ROLE_NAME[p.role]()}</span>}
              <span className="ap-go" aria-hidden>{Icon.forward}</span>
            </button>
          )
        })}
        {/* 자동 검토 (처음 값 끔): 켜면 Claude가 파일을 고친 차례가 끝날 때 검토 카드가 붙는다. 넘기기는 늘 사용자가 */}
        <div className="set-row" data-ui="자동 검토">
          <div>
            <div className="set-name">{t('자동 검토', 'Automatic review')}</div>
            <div className="set-desc">{t('Claude가 파일을 고친 차례가 끝날 때마다 Codex가 읽기만 하며 검토 카드를 붙입니다. Claude에게 넘기는 것은 늘 직접 누릅니다.', 'Each time a Claude turn that edited files ends, Codex reads it without editing and adds a review card. You always pass it to Claude yourself.')}</div>
          </div>
          <div className="segmented small" role="radiogroup" data-ui="고르기">
            {(['off', 'edits'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={prefs.review === m} className={prefs.review === m ? 'on' : ''} onClick={() => save({ review: m })}>
                {m === 'off' ? t('끔', 'Off') : t('고친 차례마다', 'After edits')}
              </button>
            ))}
          </div>
        </div>
      </div>}
  </>)
}

/** 한 에이전트의 자세히: 계정 · 새 대화의 시작 권한 · 자동 허용 · 하는 일 */
function AgentDetail({ k, pref, onBack, save, onSaved, onError }: { k: Kind; pref: AgentPref; onBack(): void; save(p: { trust?: AgentTrust; auto?: AgentPref['auto'] | null; role?: AgentRole }): void; onSaved(m: string): void; onError(m: string): void }) {
  const client = useQueryClient()
  const [switching, setSwitching] = useState(false)
  const auto = autoShown(pref)
  // 목록이 아래에 있으면 들어간 자세히가 화면 밖일 수 있다
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollIntoView?.({ block: 'nearest' }) }, [])
  const cli = k.id === 'codex' ? 'codex' : k.id === 'gemini' ? 'gemini' : 'claude'
  const other = async () => {
    setSwitching(true)
    try { await api.switchCodex(); await client.invalidateQueries({ queryKey: qk.agentKinds }); onSaved(t('Codex에서 로그아웃했습니다. 열린 브라우저에서 다른 ChatGPT 계정으로 로그인하세요', 'Signed out of Codex. Sign in with another ChatGPT account in the browser that opened')) } catch (e) { onError(msg(e)) } finally { setSwitching(false) }
  }
  return (
    <div ref={box} className="set-rows ap-detail" data-ui="에이전트 자세히">
      <div className="ap-head">
        <button className="icon-btn sm" data-ui="에이전트 목록으로" aria-label={t('에이전트 목록으로', 'Back to agents')} data-tip={t('에이전트 목록', 'Agents')} onClick={onBack}>{Icon.back}</button>
        <AgentLogo agent={k.id} /><span className="set-name">{AGENT_NAME[k.id]}</span>{k.version && <small className="setup-sub">{k.version}</small>}
      </div>
      <div className="set-row" data-ui="에이전트 계정">
        <div>
          <div className="set-name">{t('계정', 'Account')}</div>
          <div className="set-desc">
            {!k.installed && k.bundled ? t('설정 › 에이전트 위 「질문에 답할 AI」에서 「ChatGPT로 연결」을 누르면 Codex를 받고 ChatGPT 계정으로 로그인합니다.', 'Press Connect ChatGPT under AI for questions above to get Codex and sign in with a ChatGPT account.')
              : !k.installed ? <>{t(`${HERE.ko}에 없습니다. 깔고 터미널에서 ${cli}를 한 번 열어 로그인하세요: `, `Not on ${HERE.en}. Install it and open ${cli} once in the terminal to sign in: `)}<code className="setup-cmd">{k.install}</code></>
              : k.login === false ? (k.bundled ? t('설정 › 에이전트 위 「질문에 답할 AI」에서 ChatGPT로 연결하면 Codex가 그 계정으로 일합니다.', 'Connect ChatGPT under AI for questions above, and Codex works with that account.') : t(`로그인한 흔적이 없습니다. 터미널에서 ${cli}를 한 번 열어 로그인하세요.`, `No sign-in found. Open ${cli} once in the terminal to sign in.`))
              : <span className="ag-name"><AgentLogo agent={k.id} />{k.id === 'codex' && 'ChatGPT · '}{account(k) || t('로그인됨 (계정 이름을 읽지 못함)', 'Signed in (account name not found)')}</span>}
          </div>
        </div>
        {!k.installed && k.install ? <CopyButton text={k.install} onSaved={onSaved} />
          : k.login !== false && (k.id === 'codex'
            ? <button className="btn sm" data-ui="다른 계정으로" disabled={switching} onClick={() => void other()}>{t('다른 계정으로', 'Switch account')}</button>
            : <span className="muted ap-hint">{t(`다른 계정: 터미널에서 ${cli} → /login`, `Switch: run ${cli} → /login in the terminal`)}</span>)}
      </div>
      <div className="set-row" data-ui="새 대화의 시작 권한">
        <div>
          <div className="set-name">{t('새 대화의 시작 권한', 'Starting permission for new chats')}</div>
          <div className="set-desc">{t('대화 안에서 바꾼 권한은 그 대화에만 적용됩니다.', 'A permission changed inside a chat applies to that chat only.')}</div>
        </div>
        <select className="rs-select set-select" value={pref.trust} aria-label={t('새 대화의 시작 권한', 'Starting permission')} onChange={(e) => { const v = trustsOf(k.id).find((x) => x === e.target.value); if (v) save({ trust: v, auto: null }) }}>
          {trustsOf(k.id).map((v) => <option key={v} value={v}>{TRUST_NAME[v]}</option>)}
        </select>
      </div>
      <div className="set-row" data-ui="자동 허용">
        <div>
          <div className="set-name">{t('자동 허용', 'Allow without asking')}</div>
          <div className="set-desc">{t('켠 것은 묻지 않고 합니다. 처음 값은 시작 권한을 따릅니다.', 'What is on runs without asking. The first values follow the starting permission.')}</div>
        </div>
        <div className="ap-autos">
          {AUTO_KEYS.map((x) => (
            <label key={x} className="check"><input type="checkbox" checked={auto[x]} onChange={(e) => save({ auto: { ...auto, [x]: e.target.checked } })} />{AUTO_NAME[x]()}</label>
          ))}
        </div>
      </div>
      <div className="set-row" data-ui="하는 일">
        <div>
          <div className="set-name">{t('하는 일', 'Role')}</div>
          <div className="set-desc">{k.id === 'codex'
            ? t('쓰기는 새 대화를 맡고, 검토는 Claude 대화의 「Codex 검토」만 합니다. 검토할 때는 늘 읽기 전용입니다.', 'Write takes new chats; Review only does "Codex review" in Claude chats. Reviews are always read only.')
            : t('새 대화를 맡습니다. 검토는 Codex만 합니다.', 'Takes new chats. Only Codex reviews.')}</div>
        </div>
        {k.id === 'codex'
          ? <div className="segmented small" role="radiogroup" data-ui="고르기">
            {AGENT_ROLES.map((r) => <button key={r} role="radio" aria-checked={pref.role === r} className={pref.role === r ? 'on' : ''} onClick={() => save({ role: r })}>{ROLE_NAME[r]()}</button>)}
          </div>
          : <span className="muted">{ROLE_NAME.write()}</span>}
      </div>
    </div>
  )
}
