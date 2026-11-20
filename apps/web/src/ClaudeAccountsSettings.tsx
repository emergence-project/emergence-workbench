// 계정 › Claude 계정 (11/16 사용자 "pro 계정을 주로 답변용으로" · "로그인 정보를 담아두고 쉽게 로그인 · 전환"):
// 계정마다 한 번 로그인해 두면(계정마다 따로 된 폴더), 대화 종류마다 어느 계정으로 돌지 고른다. 대화 하나만 바꾸려면 입력란 아래 계정 고르기
// Codex도 같은 모양 (11/20 시안 4절), 계정 줄마다 5시간 · 이번 주 한도 막대 (80%를 넘으면 주황, 못 읽으면 「아직 모름」)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { claudeAccountsApi, codexAccountsApi, type AccountKind, type AccountRole, type ClaudeAccountRow, type ClaudeAccounts, type LimitWindow } from './api'
import { askConfirm } from './askText'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { Row } from './SetupChecklist'

/** 서버 계약(contract/claudeAccounts.ts)과 같은 값. 화면 번들에 zod를 넣지 않으려고 값은 여기 다시 적는다 */
export const DEFAULT_ACCOUNT = 'default'
const ACCOUNT_ROLES: readonly AccountRole[] = ['central', 'feedback', 'app', 'project']

const ROLE: Record<AccountRole, () => [string, string]> = {
  central: () => [t('중앙', 'Central'), t('맨 위 「중앙」 대화: 묻는 말에 답하고 하위 대화를 엽니다', 'The Central conversation at the top: answers and opens sub-conversations')],
  feedback: () => [t('피드백 처리', 'Feedback'), t('피드백 하위 대화와 「에이전트에게 맡기기」', 'Feedback sub-conversations and Hand to agent')],
  app: () => [t('앱 고치기', 'App fixes'), t('앱을 고쳐 PR을 여는 대화', 'Conversations that fix the app and open a pull request')],
  project: () => [t('프로젝트 대화', 'Project conversations'), t('프로젝트 · 지식 라이브러리의 대화', 'Conversations in projects and the knowledge library')],
}

/** 계정 이름 (이 컴퓨터 계정은 「이 컴퓨터」, 요금제가 보이면 함께) */
export const accountLabel = (a: ClaudeAccountRow) => a.plan ? `${a.name} · ${a.plan}` : a.name

const API = { claude: claudeAccountsApi, codex: codexAccountsApi }
const KEY = { claude: qk.claudeAccounts, codex: qk.codexAccounts }

export function useAgentAccounts(kind: AccountKind) {
  return useQuery({ queryKey: KEY[kind], queryFn: API[kind].get, refetchInterval: (q) => q.state.data?.accounts.some((a) => a.signing && !a.signing.error) ? 2000 : false })
}
export const useClaudeAccounts = () => useAgentAccounts('claude')

export function ClaudeAccountsSettings({ onSaved, kind = 'claude' }: { onSaved(m: string): void; kind?: AccountKind }) {
  const client = useQueryClient()
  const q = useAgentAccounts(kind)
  const api = API[kind]
  const [err, setErr] = useState<string | null>(null)
  const run = useMutation({
    mutationFn: (f: () => Promise<ClaudeAccounts>) => f(),
    onSuccess: (v) => { setErr(null); client.setQueryData(KEY[kind], v) },
    onError: (e: Error) => setErr(e.message),
  })
  const s = q.data
  return (<>
    <h3 className="set-h3">{kind === 'codex' ? t('Codex 계정', 'Codex accounts') : t('Claude 계정', 'Claude accounts')}</h3>
    <p className="set-desc">{t('계정마다 한 번 로그인해 두면 다시 묻지 않습니다. 아래에서 대화 종류마다 어느 계정으로 돌지 고르고, 대화 하나는 입력란 아래에서 바꿉니다. 한도는 그 계정으로 마지막에 돈 때의 값입니다.', 'Sign in once per account and it is remembered. Below, choose which account each kind of conversation uses; change one conversation under its input box. Limits are from the last time the account ran.')}</p>
    <div className="setup set-rows" data-ui={kind === 'codex' ? 'Codex 계정' : 'Claude 계정'}>
      {!s ? <p className="muted setup-row">{q.error?.message ?? t('읽는 중…', 'Reading…')}</p>
        : s.accounts.map((a) => <AccountRow key={a.id} kind={kind} a={a} busy={run.isPending} onRun={(f) => run.mutate(f)} onSaved={onSaved} />)}
      {s && <AddAccount kind={kind} cli={s.cli} busy={run.isPending} onAdd={(name) => run.mutate(() => api.add(name))} />}
      {err && <p className="error-text setup-row">{err}</p>}
    </div>
    {s && s.accounts.length > 1 && <div className="set-rows" data-ui="계정 고르기">
      <RolePick s={s} name={t('기본 계정', 'Default account')} desc={t('아래에서 고르지 않은 대화와 그 밖의 일(제목 짓기 · 묻기 등)', 'Conversations not chosen below and other work (titles, questions)')} on={s.base} ui="기본 계정" pick={(id) => run.mutate(() => api.setRole('base', id))} />
      {ACCOUNT_ROLES.map((r) => {
        const [name, desc] = ROLE[r]()
        return <RolePick key={r} s={s} name={name} desc={desc} on={s.roles[r] ?? s.base} ui="대화 종류 계정" pick={(id) => run.mutate(() => api.setRole(r, id))} />
      })}
    </div>}
  </>)
}

/** 계정 고르기 한 줄: 3개까지 버튼, 넘으면 select (10/30 규칙) */
function RolePick({ s, name, desc, on, ui, pick }: { s: ClaudeAccounts; name: string; desc: string; on: string; ui: string; pick(id: string): void }) {
  return (
    <div className="set-row" data-ui={ui}>
      <div>
        <div className="set-name">{name}</div>
        <div className="set-desc">{desc}</div>
      </div>
      {s.accounts.length <= 3
        ? <div className="segmented small" role="radiogroup" data-ui="고르기">
          {s.accounts.map((a) => <button key={a.id} role="radio" aria-checked={on === a.id} className={on === a.id ? 'on' : ''} onClick={() => pick(a.id)}>{a.name}</button>)}
        </div>
        : <select className="rs-select set-select" value={on} aria-label={name} onChange={(e) => pick(e.target.value)}>
          {s.accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
        </select>}
    </div>
  )
}

/** 한도 막대 하나: 쓴 % · 80%를 넘으면 주황 */
function LimitBar({ name, w }: { name: string; w: LimitWindow }) {
  return (
    <span className="acct-limit" data-ui="한도 막대">
      <span className="acct-limit-name">{name}</span>
      <span className={`acct-meter${w.used > 80 ? ' high' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.used} aria-label={name}><i style={{ width: `${Math.min(100, w.used)}%` }} /></span>
      <span className="acct-limit-num">{Math.round(w.used)}%</span>
    </span>
  )
}

/** 다시 차는 시각: 11/24 09:00 (24시간, 브라우저 언어와 상관없이) */
const when = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}` }

/** 5시간 · 이번 주 한도 (그 계정으로 마지막에 돈 때의 값). 못 읽으면 「아직 모름」 */
function Limits({ l }: { l: ClaudeAccountRow['limits'] }) {
  if (!l || (!l.five && !l.week)) return <span className="acct-limits muted" data-ui="한도">{t('한도: 아직 모름', 'Limits: not known yet')}</span>
  return (
    <span className="acct-limits" data-ui="한도">
      {l.five && <LimitBar name={t('5시간', '5 hours')} w={l.five} />}
      {l.week && <LimitBar name={t('이번 주', 'This week')} w={l.week} />}
      {l.week?.resetsAt && <span className="muted acct-limit-reset">{t(`이번 주 한도는 ${when(l.week.resetsAt)}에 다시 참`, `Weekly limit resets ${when(l.week.resetsAt)}`)}</span>}
    </span>
  )
}

function AccountRow({ kind, a, busy, onRun, onSaved }: { kind: AccountKind; a: ClaudeAccountRow; busy: boolean; onRun(f: () => Promise<ClaudeAccounts>): void; onSaved(m: string): void }) {
  const [code, setCode] = useState('')
  const api = API[kind]
  const extra = a.id !== DEFAULT_ACCOUNT
  const remove = async () => {
    if (!await askConfirm({ title: t(`「${a.name}」 계정을 제거할까요?`, `Remove the account "${a.name}"?`), hint: t('이 앱에서 그 계정을 로그아웃하고 로그인 폴더를 지웁니다. 대화와 기록은 그대로이고, 그 계정을 쓰던 대화 종류는 기본 계정으로, 기본 계정이었으면 이 컴퓨터 계정으로 돕니다.', 'Signs that account out of this app and deletes its sign-in folder. Conversations and records stay; kinds of conversations that used it go back to the default account.'), ok: t('삭제', 'Delete') })) return
    onRun(() => api.remove(a.id))
    onSaved(t(`「${a.name}」 계정을 제거했습니다`, `Removed "${a.name}"`))
  }
  return (
    <Row ok={a.login} optional={extra} name={a.name} sub={a.plan} ui={kind === 'codex' ? 'Codex 계정 줄' : 'Claude 계정 줄'}
      action={extra && <span className="setup-acts">
        {(!a.login || a.signing?.error) && !(a.signing && !a.signing.error) && <button className="btn" disabled={busy} onClick={() => onRun(() => api.login(a.id))}>{t('로그인', 'Sign in')}</button>}
        <button className="icon-btn" data-tip={t('계정 제거', 'Remove account')} aria-label={t('계정 제거', 'Remove account')} onClick={() => void remove()}>{Icon.trash}</button>
      </span>}>
      {a.email ?? (extra ? t('로그인하지 않았습니다.', 'Not signed in.') : kind === 'codex'
        ? t('이 컴퓨터의 Codex에 로그인한 계정입니다. 설정 › 에이전트의 「ChatGPT로 연결」로 로그인하세요.', 'The account signed in to Codex on this computer. Sign in with Connect ChatGPT under Settings › Agents.')
        : t('이 컴퓨터의 Claude Code에 로그인한 계정입니다. 터미널에서 claude를 열고 /login으로 로그인하세요.', 'The account signed in to Claude Code on this computer. Open claude in a terminal and sign in with /login.'))}
      {!extra && a.email && <span className="muted">{kind === 'codex' ? t(' · 터미널의 codex와 같은 계정', ' · Same as codex in the terminal') : t(' · 터미널의 claude와 같은 계정', ' · Same as claude in the terminal')}</span>}
      {a.login && <Limits l={a.limits} />}
      {a.signing && !a.signing.error && <span className="ac-acct-signing">
        {' '}{t('브라우저에서 로그인하는 중입니다.', 'Signing in in the browser.')}
        {a.signing.url && <> <a className="a" href={a.signing.url} target="_blank" rel="noreferrer">{t('브라우저가 열리지 않았으면 여기', 'If no browser opened, here')}</a></>}
        {kind === 'claude' && <span className="ac-acct-code">
          <input className="input" value={code} placeholder={t('브라우저가 보여 준 코드', 'Code shown in the browser')} aria-label={t('로그인 코드', 'Sign-in code')} onChange={(e) => setCode(e.target.value)} />
          <button className="btn" disabled={!code.trim() || busy} onClick={() => { onRun(() => api.code(a.id, code)); setCode('') }}>{t('코드 넣기', 'Enter code')}</button>
        </span>}
      </span>}
      {a.signing?.error && <span className="error-text"> {a.signing.error}</span>}
    </Row>
  )
}

function AddAccount({ kind, cli, busy, onAdd }: { kind: AccountKind; cli: boolean; busy: boolean; onAdd(name: string): void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  if (!cli) return <p className="muted setup-row">{kind === 'codex' ? t('이 컴퓨터에 Codex가 없어 계정을 추가하지 못합니다. 설정 › 에이전트에서 먼저 ChatGPT로 연결하세요.', 'Codex is not on this computer, so accounts cannot be added. Connect ChatGPT under Settings › Agents first.') : t('이 컴퓨터에 Claude Code가 없어 계정을 추가하지 못합니다.', 'Claude Code is not on this computer, so accounts cannot be added.')}</p>
  if (!open) return <div className="setup-row ac-acct-add"><button className="btn" data-ui="계정 추가" onClick={() => setOpen(true)}>{Icon.plus} {t('계정 추가', 'Add account')}</button></div>
  const add = () => { if (name.trim()) { onAdd(name.trim()); setOpen(false); setName('') } }
  return (
    <div className="setup-row ac-acct-add" data-ui="계정 추가">
      <input className="input" autoFocus value={name} maxLength={30} placeholder={kind === 'codex' ? t('이름 (예: Plus)', 'Name (e.g. Plus)') : t('이름 (예: Pro)', 'Name (e.g. Pro)')} aria-label={t('계정 이름', 'Account name')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); if (e.key === 'Escape') setOpen(false) }} />
      <button className="btn primary" disabled={!name.trim() || busy} onClick={add}>{t('추가하고 로그인', 'Add and sign in')}</button>
      <button className="btn" onClick={() => setOpen(false)}>{t('취소', 'Cancel')}</button>
    </div>
  )
}
