// 설정 › 에이전트 › 대화 종류별 계정 (11/20 사용자 "그러면 그렇게하자": 계정은 나와 로그인, 설정은 앱이 어떻게 도는지).
// 로그인은 계정 페이지에서만 하고, 여기서는 이미 등록된 계정 가운데 기본 계정과 대화 종류마다 쓸 계정을 고르기만 한다
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { claudeAccountsApi, codexAccountsApi, type AccountKind, type ClaudeAccounts } from './api'
import { ACCOUNT_ROLES, ROLE, accountLabel, useAgentAccounts } from './ClaudeAccountsSettings'
import { t } from './i18n'
import { qk } from './queries'
import { href } from './router'

const API = { claude: claudeAccountsApi, codex: codexAccountsApi }
const KEY = { claude: qk.claudeAccounts, codex: qk.codexAccounts }
const NAME: Record<AccountKind, string> = { claude: 'Claude', codex: 'Codex' }

export function AgentAccountRoles() {
  return (<>
    <h3 className="set-h3">{t('대화 종류별 계정', 'Account per conversation kind')}</h3>
    <p className="set-desc">{t('기본 계정과 대화 종류마다 어느 계정으로 돌지 고릅니다. 대화 하나는 입력란 아래에서 바꿉니다. 계정 추가 · 로그인은 ', 'Choose the default account and which account each kind of conversation uses. Change one conversation under its input box. Add accounts and sign in on the ')}<a className="a" href={href({ page: 'account' })}>{t('계정', 'Accounts')}</a>{t(' 페이지에서 합니다.', ' page.')}</p>
    <KindRoles kind="claude" />
    <KindRoles kind="codex" />
  </>)
}

function KindRoles({ kind }: { kind: AccountKind }) {
  const client = useQueryClient()
  const s = useAgentAccounts(kind).data
  const [err, setErr] = useState<string | null>(null)
  const run = useMutation({
    mutationFn: (f: () => Promise<ClaudeAccounts>) => f(),
    onSuccess: (v) => { setErr(null); client.setQueryData(KEY[kind], v) },
    onError: (e: Error) => setErr(e.message),
  })
  if (!s) return null
  const api = API[kind]
  if (s.accounts.length < 2) return <p className="muted set-desc" data-ui="계정 고르기">{t(`${NAME[kind]}: 계정이 하나라 모든 대화가 「${s.accounts[0]?.name ?? '이 컴퓨터'}」로 돕니다.`, `${NAME[kind]}: there is one account, so every conversation uses "${s.accounts[0]?.name ?? 'this computer'}".`)}</p>
  return (
    <><div className="acct-roles-kind">{NAME[kind]}</div>
    <div className="set-rows" data-ui="계정 고르기">
      <RolePick s={s} name={t('기본 계정', 'Default account')} desc={t('아래에서 고르지 않은 대화와 그 밖의 일(제목 짓기 · 묻기 등)', 'Conversations not chosen below and other work (titles, questions)')} on={s.base} ui="기본 계정" pick={(id) => run.mutate(() => api.setRole('base', id))} />
      {ACCOUNT_ROLES.map((r) => {
        const [name, desc] = ROLE[r]()
        return <RolePick key={r} s={s} name={name} desc={desc} on={s.roles[r] ?? s.base} ui="대화 종류 계정" pick={(id) => run.mutate(() => api.setRole(r, id))} />
      })}
      {err && <p className="error-text">{err}</p>}
    </div></>
  )
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
