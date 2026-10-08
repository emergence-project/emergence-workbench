import { useEffect, useState } from 'react'
import { githubRepos, type GitHubRepoList } from './api'
import { lang, plural, t } from './i18n'

/**
 * 설정 › 계정 › GitHub (10/4 19:43 "구글 계정은 계정으로 바꾸고, 깃허브 계정도 관리하자").
 * 앱은 GitHub 로그인을 따로 저장하지 않는다. 맥의 gh 로그인이나 git이 쓰는 키체인 로그인을 그대로 쓰고,
 * 여기서는 그 로그인으로 저장소 목록을 읽을 수 있는지만 보여 준다 (프로젝트 등록의 "GitHub에서"가 같은 것을 쓴다).
 */
export function GitHubAccount() {
  const [list, setList] = useState<GitHubRepoList | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setList(null); setErr(''); githubRepos().then(setList).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  const owner = list?.ok ? mostCommon(list.repos.map((r) => r.owner)) : ''
  const via = list?.ok ? ({ gh: t('gh 로그인', 'gh login'), git: t('맥 키체인의 git 로그인', 'git login in the Mac keychain'), sample: t('예제 목록', 'Sample list') })[list.source] : ''
  return (
    <div className="set-rows" data-ui="GitHub 계정">
      <div className="set-row">
        <div>
          <div className="set-name">{list?.ok ? `${t('연결됨', 'Connected')}${owner ? `: ${owner}` : ''}` : list || err ? t('연결 안 됨', 'Not connected') : t('확인하는 중…', 'Checking…')}</div>
          <div className="set-desc">
            {err && err}
            {list?.ok && <>{via} · {t(`저장소 ${list.repos.length}개`, plural(list.repos.length, 'repository', 'repositories'))}</>}
            {list && !list.ok && (lang === 'ko' ? <>{list.reason} 맥 터미널에서 <code>gh auth login</code>을 하면 연결됩니다.</> : <>{list.reason} Run <code>gh auth login</code> in the Mac terminal to connect.</>)}
          </div>
          <div className="set-desc">{t('프로젝트 등록의 "GitHub에서" 목록과 저장소 받기·올리기에 씁니다. 앱은 로그인 정보를 따로 저장하지 않습니다.', 'Used for the "From GitHub" list when adding a project, and for pulling and pushing repositories. The app does not store login details.')}</div>
        </div>
        <button className="btn" onClick={load}>{t('다시 확인', 'Check again')}</button>
      </div>
    </div>
  )
}

function mostCommon(xs: string[]): string {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}
