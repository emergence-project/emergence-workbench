import type { UiSettings } from '@rw/core'
import { useQuery } from '@tanstack/react-query'
import { accountApi } from './api'
import { ClaudeAccountsSettings, DEFAULT_ACCOUNT, useClaudeAccounts } from './ClaudeAccountsSettings'
import { t } from './i18n'
import { qk } from './queries'
import { useMe, usePeople } from './network/people'
import { SetupAccounts } from './SetupChecklist'

/**
 * 계정 (11/19 01:01 피드백 「왼쪽 띠 아래 계정 아이콘」, 09:17 진행 "설정 톱니 위에 두고, 계정 페이지는 유일한 페이지로"):
 * GitHub 로그인 · 계정 동기화 · 내 이름 · 구글(옛 설정 › 계정)과 Claude 계정(옛 설정 › 에이전트)을 이 한 페이지에서 본다.
 * 옛 주소 #/settings/google은 여기로 연다 (router.ts).
 */
export function AccountPage({ onUi, onSaved }: { onUi(patch: Partial<UiSettings>): void; onSaved(message: string): void }) {
  return (
    <main className="stage full set-page" data-ui="계정">
      <section className="pane">
        <div className="scroll">
          <div className="page-body">
            <section data-ui="구글 계정 묶음">
              <div className="sec-head"><h2>{t('계정', 'Accounts')}</h2></div>
              <SetupAccounts onSaved={onSaved} onUiRestored={onUi} />
              <ClaudeAccountsSettings onSaved={onSaved} />
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}

/** 띠의 계정 단추 얼굴: GitHub 사진, 없으면 이름 머리글자. 로그인이 풀린 Claude 계정(더한 계정만, 이 컴퓨터 계정은 설정 › 에이전트 연결이 본다)이나 동기화 오류가 있으면 빨간 점 */
export function AccountRailIcon() {
  const account = useQuery({ queryKey: qk.account, queryFn: accountApi.get }).data
  const claude = useClaudeAccounts().data
  const me = useMe(usePeople().data)
  const gh = account?.github
  const name = gh?.name || me?.name || gh?.login || ''
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  const broken = !!account?.sync?.error || !!claude?.accounts.some((a) => a.id !== DEFAULT_ACCOUNT && !a.login && !a.signing)
  return (
    <span className="rail-account">
      {gh?.avatar ? <img src={gh.avatar} alt="" /> : <span className="rail-account-letters">{letters || '?'}</span>}
      {broken && <span className="rail-account-dot" data-ui="계정 끊김 점" />}
    </span>
  )
}
