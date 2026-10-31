import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from './api'
import { relativeTime } from './format'
import { plural, t } from './i18n'
import { repoBehindAhead, SyncButton, useRepoState } from './ProjectInfoPage'
import { qk } from './queries'
import { go } from './router'

/**
 * 모든 저장소 (10/29 10:00 제안 진행 · 10/30 16:59 "에이전트 아래 저장소도 두자", 시안 3절 안 B):
 * 레일의 폴더 아이콘. 등록한 프로젝트마다 한 줄로 브랜치 · GitHub와 같은지 · 커밋 안 한 변경 · 마지막 확인과 동기화하기.
 * 동기화하기는 여기 한 곳에만 두고, 현황과 저장소 쪽은 이 화면으로 가는 링크만 둔다. 이름을 누르면 그 프로젝트의 저장소 쪽(파일 탭)으로
 */
const useProjects = () => useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches

export function ReposPage() {
  const projects = useProjects()
  return (
    <main className="stage full" data-ui="모든 저장소">
      <section className="pane">
        <div className="scroll">
          <div className="page-body repos-page">
            <div className="info-head">
              <h1>{t('저장소', 'Repositories')}</h1>
              <p className="muted">{t('프로젝트마다 GitHub와 같은지 봅니다. 동기화하기는 새 커밋을 받고 이 컴퓨터에만 있는 커밋을 올립니다.', 'Whether each project matches GitHub. Sync pulls new commits and pushes commits that exist only on this computer.')}</p>
            </div>
            {!projects ? <p className="muted">{t('읽는 중…', 'Loading…')}</p>
              : !projects.length ? <p className="empty">{t('등록한 프로젝트가 없습니다', 'No registered projects')}</p>
                : <table className="repos-table">
                  <thead><tr>
                    <th>{t('프로젝트', 'Project')}</th><th>{t('브랜치', 'Branch')}</th><th>{t('GitHub와', 'With GitHub')}</th>
                    <th>{t('커밋 안 한 변경', 'Uncommitted')}</th><th className="repos-col-when">{t('확인', 'Checked')}</th><th aria-label={t('동기화하기', 'Sync')} />
                  </tr></thead>
                  <tbody>{projects.map((p) => <RepoRow key={p.id} rid={p.id} title={p.title} />)}</tbody>
                </table>}
          </div>
        </div>
      </section>
    </main>
  )
}

function RepoRow({ rid, title }: { rid: string; title: string }) {
  const rapi = api.research(rid)
  const state = useRepoState(rapi, 0)
  const { repo, updateError } = state
  const ok = repo?.state === 'ok'
  const ba = repoBehindAhead(repo)
  const changes = ok ? (repo.dirty ?? 0) + (repo.untracked ?? 0) : 0
  const compare = repo === undefined ? <span className="muted">…</span>
    : !ok ? <span className="muted">{repo === null ? t('읽지 못함', 'Unreadable') : t('git 저장소 아님', 'Not a git repository')}</span>
      : !repo.remote ? <span className="muted">{t('원격 없음', 'No remote')}</span>
        : !ba ? <span className="muted">{t('따라가는 브랜치 없음', 'Not tracking')}</span>
          : !ba.ahead && !ba.behind ? <span><span className="repo-ok">✓</span> {t('같음', 'Same')}</span>
            : <span><span className="turn-dot" aria-hidden /> {ba.behind > 0 && `↓${ba.behind}`}{ba.behind > 0 && ba.ahead > 0 && ' '}{ba.ahead > 0 && `↑${ba.ahead}`}</span>
  return (
    <tr data-ui="저장소 줄" data-ui-item={title}>
      <td className="repos-name"><button className="a" title={t(`${title} — 저장소 쪽(파일)으로`, `${title}: open its repository (files)`)} onClick={() => go({ page: 'repo', rid })}>{title}</button>
        {updateError && <div className="repo-err">! {updateError}</div>}
        {ok && repo.fetchError && <div className="repo-err" title={repo.fetchDetail}>! {repo.fetchError}</div>}</td>
      <td>{ok && repo.branch ? <code>{repo.branch}</code> : <span className="muted">—</span>}</td>
      <td title={ba && ba.behind && ba.ahead ? t('양쪽에 새 커밋이 있어 터미널의 git pull로 합쳐 주세요', 'Both sides have new commits; merge with git pull in a terminal') : ba ? t(`GitHub에 새 커밋 ${ba.behind} · 올리지 않은 커밋 ${ba.ahead}`, `${ba.behind} new on GitHub · ${ba.ahead} unpushed`) : undefined}>{compare}</td>
      <td>{changes > 0 ? t(`${changes}개`, plural(changes, 'change')) : <span className="muted">{t('없음', 'None')}</span>}</td>
      <td className="repos-col-when muted">{ok && repo.fetchedAt ? relativeTime(repo.fetchedAt) : '—'}</td>
      <td className="repos-sync">{ok && repo.remote ? <SyncButton state={state} /> : null}</td>
    </tr>
  )
}

/** 레일 폴더 아이콘의 주황 점: GitHub와 다른(받거나 올릴 커밋이 있는) 프로젝트가 있을 때. 다른 레일 버튼처럼 볼 것이 있다는 표시 */
export function ReposRailCount() {
  const projects = useProjects() ?? []
  const repos = useQueries({ queries: projects.map((p) => ({ queryKey: qk.repo(p.id), queryFn: () => api.research(p.id).repo().catch(() => null), refetchInterval: 60_000 })) })
  const n = repos.filter((r) => { const ba = repoBehindAhead(r.data); return !!ba && (ba.behind > 0 || ba.ahead > 0) }).length
  return n ? <span className="rail-count" title={t(`GitHub와 다른 프로젝트 ${n}개`, `${n} project(s) differ from GitHub`)}>{n}</span> : null
}
