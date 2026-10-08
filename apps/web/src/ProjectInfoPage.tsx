import { useEffect, useState, type ReactNode } from 'react'
import type { ManuscriptInfo, ProjectInfo, RepoInfo, ResearchApi, ResearchListItem, ResearchSummary } from './api'
import { projectColor, relativeTime, statusLabel, statusOf } from './format'
import { AUX_NOTE } from './notes'
import { go } from './router'
import { ProjectStateDot, type ProfilePatch } from './ProjectProfileFields'
import { Icon } from './icons'
import { ProjectEditDialog } from './ProjectEditDialog'
import { PROJECT_KIND_LABEL } from './projectProfile'
import { locale, plural, t } from './i18n'

function PathName({ path }: { path: string }) {
  const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
  return <code className="info-path" title={path}>{name}</code>
}

/**
 * 프로젝트 정보: 이 프로젝트가 무엇이고 어디에 무엇이 있는지 (2026-10-03 13:48 피드백 — 첫 화면에서 따로 뗌).
 * 읽기가 기본이며 제목 옆 연필로 첫 화면과 같은 고치기 창을 연다 (10/6 D3).
 * 제목·설명·시작일·카드 그림은 research.yaml, 성격·분야·진행 상태는 이 컴퓨터의 설정에 쓴다.
 */
export function ProjectInfoPage({ rid, rapi, summary, manuscripts, version, project: listed, all, onProfile, onChanged, onSaved }: {
  rid: string
  rapi: ResearchApi
  summary: ResearchSummary
  manuscripts: ManuscriptInfo[]
  version: number
  /** 이 프로젝트의 등록 정보 (성격 · 분야 · 진행 상태, 이 컴퓨터의 설정) */
  project?: ResearchListItem
  all: ResearchListItem[]
  onProfile(patch: ProfilePatch, message: string): Promise<void>
  onChanged(): void
  onSaved(message: string): void
}) {
  const { research, blocks, statements, root } = summary
  const [editing, setEditing] = useState(false)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  useEffect(() => { rapi.project().then(setProject).catch(() => setProject(null)) }, [rapi, version])
  const n = (s: string) => blocks.filter((b) => statusOf(b.status) === s).length
  const src = project?.sources
  const list = (xs: string[] | undefined) => xs?.length ? xs.map((x) => <PathName key={x} path={x} />) : <span className="muted">{t('없음', 'None')}</span>

  return (
    <div className="ws-doc" data-ui="프로젝트 정보">
      <section className="pane" data-ui="본문">
        <div className="scroll">
          <div className="page-body info-page">
            <header className="info-head">
              <div className="info-title" data-ui="제목 칸">
                <h1 className="h-title" data-ui="연구 제목">{research.title}</h1>
                {listed && <button className="icon-btn" data-ui="프로젝트 정보 고치기" data-tip={t('고치기', 'Edit')} aria-label={t('프로젝트 고치기', 'Edit project')} onClick={() => setEditing(true)}>{Icon.pencil}</button>}
              </div>
              <div data-ui="설명 칸">
                {research.question ? <p className="info-desc">{research.question}</p> : <p className="info-desc muted">{t('설명이 없습니다 · 연필로 더하기', 'No description · Add one with the pencil')}</p>}
              </div>
            </header>

            <section className="info-sec" data-ui="기본 정보">
              <h2>{t('기본', 'Basics')}</h2>
              <dl>
                <dt>{t('시작', 'Started')}</dt><dd data-ui="시작일 칸">{research.started || <span className="muted">—</span>}</dd>
                <dt>{t('카드 그림', 'Card image')}</dt><dd data-ui="카드 그림 칸">{research.image ? <PathName path={research.image} /> : <span className="muted">{t('없음 — 홈 카드에 프로젝트 색만', 'None. The home card shows only the project color')}</span>}</dd>
                <dt>{t('앱 기록', 'App records')}</dt><dd><code>workbench/</code> {t('(research.yaml, 노트, 일지)', '(research.yaml, notes, journal)')}</dd>
              </dl>
            </section>

            {listed && (
              <section className="info-sec" data-ui="태그">
                <h2>{t('성격과 분야', 'Kind and fields')} <span className="muted">{t('이 컴퓨터의 설정', 'Settings on this computer')}</span></h2>
                <dl data-ui="프로젝트 성격과 분야">
                  <dt>{t('성격', 'Kind')}</dt><dd>{PROJECT_KIND_LABEL[listed.kind]}</dd>
                  <dt>{t('분야', 'Fields')}</dt><dd className="info-fields">{listed.fields.length ? listed.fields.map((f) => <span key={f} className="pc-field">{f}</span>) : <span className="muted">{t('없음', 'None')}</span>}</dd>
                  <dt>{t('진행 상태', 'Progress')}</dt><dd><span className="info-state"><ProjectStateDot state={listed.state} label /></span></dd>
                </dl>
              </section>
            )}

            <RepoSection rapi={rapi} root={root} version={version} />

            <section className="info-sec" data-ui="노트 정보">
              <h2>{t('노트', 'Notes')}</h2>
              <dl>
                <dt>{t('원고', 'Manuscript')}</dt>
                <dd>{manuscripts.length ? manuscripts.map((m) => (
                  <div key={m.key}><button className="a info-manuscript" onClick={() => m.parts[0] && go({ page: 'part', rid, file: m.parts[0].file })}>{Icon.manuscript} {m.name}</button> <PathName path={m.main} /> <span className="muted">· {t(`${m.parts.length}장`, plural(m.parts.length, 'chapter'))}{m.hasPdf ? t(' · PDF 있음', ' · has PDF') : ''}</span></div>
                )) : <span className="muted">{t('없음 — 첫 화면에서 정합니다', 'None. Set it on the first screen')}</span>}</dd>
                <dt>{AUX_NOTE}</dt>
                <dd>{blocks.length} <span className="muted">({(['solved', 'in-progress', 'blocked', 'stopped'] as const).filter((s) => n(s) > 0).map((s) => `${statusLabel(s)} ${n(s)}`).join(' · ') || t('없음', 'None')})</span></dd>
                <dt>{t('진술', 'Statements')}</dt><dd>{statements.length || <span className="muted">{t('없음', 'None')}</span>}</dd>
              </dl>
            </section>

            <section className="info-sec" data-ui="자료 위치">
              <h2>{t('자료 위치', 'Material locations')} <span className="muted">research.yaml sources</span></h2>
              {!src ? <p className="muted">{t('읽는 중…', 'Loading…')}</p> : (
                <dl>
                  <dt>{t('정본 문서', 'Canonical documents')}</dt><dd>{src.canon.length ? src.canon.map((c) => <div key={c.path}><PathName path={c.path} />{c.note && <span className="muted"> · {c.note}</span>}</div>) : <span className="muted">{t('없음', 'None')}</span>}</dd>
                  <dt>{t('작업 목록', 'Task list')}</dt><dd>{src.tasks ? <PathName path={src.tasks} /> : <span className="muted">{t('없음', 'None')}</span>}</dd>
                  <dt>{t('참고문헌', 'References')}</dt><dd className="codes">{list(src.bib)}</dd>
                  <dt>{t('자료', 'Materials')}</dt><dd className="codes">{list(src.materials)}</dd>
                  <dt>{t('검토 문서', 'Review documents')}</dt><dd className="codes">{list(src.reviews)}</dd>
                  <dt>{t('에이전트용 현황', 'Status for agents')}</dt><dd>{project.agentStatus ? <>{t('', 'The app writes ')}<code>STATUS.md</code>{t('를 앱이 씁니다', '')}</> : <span className="muted">{t('쓰지 않음', 'Not written')}</span>}</dd>
                </dl>
              )}
            </section>
          </div>
        </div>
      </section>
      {editing && listed && <ProjectEditDialog rapi={rapi} summary={summary} listed={listed} all={all} pc={projectColor(rid)}
        onProfile={onProfile} onChanged={onChanged} onSaved={onSaved} onDone={() => setEditing(false)} />}
    </div>
  )
}

/**
 * 저장소: 폴더, 브랜치, GitHub 주소, 마지막 커밋, 커밋 안 한 변경, GitHub와 같은지 (10/4 19:25 피드백 "깃도 포함시키고 최신상태 여부도").
 * GitHub 확인(git fetch)은 "확인하기"를 눌렀을 때만 한다. 올리기는 하지 않는다.
 * 받아오기는 "업데이트"(홈 카드와 같은 빨리 감기만, 10/5 "개별 프로젝트에서 git 최신화를 확인하고 업데이트할 수 있도록").
 */
function RepoSection({ rapi, root, version }: { rapi: ResearchApi; root: string; version: number }) {
  const [repo, setRepo] = useState<RepoInfo | null | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => { rapi.repo().then(setRepo).catch(() => setRepo(null)) }, [rapi, version])
  // "N분 전"이 흘러가게
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(t) }, [])
  const check = () => {
    setChecking(true)
    rapi.repo(true).then(setRepo).catch(() => setRepo(null)).finally(() => setChecking(false))
  }
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const update = () => {
    setUpdating(true); setUpdateError(null)
    rapi.update().then(() => rapi.repo()).then(setRepo).catch((e: Error) => setUpdateError(e.message)).finally(() => setUpdating(false))
  }
  // summary.root는 workbench/ 폴더다. 보여 줄 것은 그 위의 저장소 폴더
  const folder = <><dt>{t('폴더', 'Folder')}</dt><dd><PathName path={root.replace(/\/workbench\/?$/, '')} /></dd></>
  const body = (() => {
    if (repo === undefined) return <dl>{folder}<dt>git</dt><dd className="muted">{t('읽는 중…', 'Loading…')}</dd></dl>
    if (repo === null) return <dl>{folder}<dt>git</dt><dd className="muted">{t('저장소 정보를 읽지 못했습니다', 'Could not read repository info')}</dd></dl>
    if (repo.state === 'none') return <dl>{folder}<dt>git</dt><dd className="muted">{t('git 저장소가 아닙니다. 버전 기록과 GitHub 비교가 없습니다', 'Not a git repository. No version history or GitHub comparison')}</dd></dl>
    if (repo.state === 'inside') return <dl>{folder}<dt>git</dt><dd><span className="muted">{t('다른 저장소', 'A folder inside another repository')} {repo.top && <PathName path={repo.top} />} {t('안의 폴더라 여기서는 git 정보를 보이지 않습니다', 'so git info is not shown here')}</span></dd></dl>
    const web = repo.remote?.web ?? null
    const gh = !!web && /github\.com/.test(web)
    const changes = [repo.dirty ? t(`커밋 안 한 변경 ${repo.dirty}개`, `${plural(repo.dirty, 'uncommitted change')}`) : '', repo.untracked ? t(`새 파일 ${repo.untracked}개`, plural(repo.untracked, 'new file')) : ''].filter(Boolean).join(' · ')
    return (
      <dl>
        {folder}
        <dt>{t('브랜치', 'Branch')}</dt>
        <dd>{repo.branch
          ? <span>{gh && repo.upstream ? <a className="a" href={`${web}/tree/${encodeURI(repo.upstream.slice(repo.upstream.indexOf('/') + 1))}`} target="_blank" rel="noreferrer"><code>{repo.branch}</code></a> : <code>{repo.branch}</code>}
            {repo.upstream ? <span className="muted"> · {t('따라가는 브랜치', 'Tracking')} {repo.upstream}</span> : <span className="muted"> · {t('GitHub 브랜치를 따라가지 않음', 'Not tracking a GitHub branch')}</span>}</span>
          : <span className="muted">{t('브랜치가 아닌 커밋을 꺼내 둔 상태', 'A commit is checked out, not a branch')}</span>}</dd>
        <dt>{t('원격', 'Remote')}</dt>
        <dd>{repo.remote
          ? <span>{web ? <a className="a" href={web} target="_blank" rel="noreferrer">{repo.remote.shown}</a> : <code>{repo.remote.shown}</code>}{repo.remote.name !== 'origin' && <span className="muted"> · {repo.remote.name}</span>}</span>
          : <span className="muted">{t('없음 — 이 컴퓨터에만 있는 저장소입니다', 'None. This repository exists only on this computer')}</span>}</dd>
        <dt>{t('마지막 커밋', 'Last commit')}</dt>
        <dd>{repo.last
          ? <span className="repo-commit">
            {gh ? <a className="a" href={`${web}/commit/${repo.last.sha}`} target="_blank" rel="noreferrer"><code>{repo.last.sha}</code></a> : <code>{repo.last.sha}</code>}
            {' '}{repo.last.subject}
            <span className="muted" title={new Date(repo.last.date).toLocaleString(locale())}> · {relativeTime(new Date(repo.last.date).getTime())}</span>
          </span>
          : <span className="muted">{t('아직 커밋이 없습니다', 'No commits yet')}</span>}</dd>
        <dt>{t('변경', 'Changes')}</dt>
        <dd>{changes || <span className="muted">{t('없음 — 모두 커밋했습니다', 'None. Everything is committed')}</span>}</dd>
        <dt>{t('GitHub와 비교', 'Compared with GitHub')}</dt>
        <dd data-ui="GitHub와 비교"><RepoCompare repo={repo} checking={checking} onCheck={check} updating={updating} updateError={updateError} onUpdate={update} /></dd>
      </dl>
    )
  })()
  return (
    <section className="info-sec" data-ui="저장소 정보">
      <h2>{t('저장소', 'Repository')}</h2>
      {body}
    </section>
  )
}

/** GitHub와 같은지 한 줄 + "확인하기". 결과 줄은 성공 ✓, 오류 ! (디자인 시스템 4절) */
function RepoCompare({ repo, checking, onCheck, updating, updateError, onUpdate }: { repo: RepoInfo; checking: boolean; onCheck(): void; updating: boolean; updateError: string | null; onUpdate(): void }) {
  if (!repo.remote) return <span className="muted">{t('원격 저장소가 없어 비교할 수 없습니다', 'No remote repository to compare with')}</span>
  const button = <button className="btn" disabled={checking} title={t('GitHub에 새 커밋이 있는지 확인합니다. 받아오거나 올리지는 않습니다', 'Check GitHub for new commits. Does not pull or push')} onClick={onCheck}>{checking ? t('확인하는 중…', 'Checking…') : t('확인하기', 'Check')}</button>
  const when = repo.fetchedAt ? t(`마지막 확인 ${relativeTime(repo.fetchedAt)}`, `Last checked ${relativeTime(repo.fetchedAt)}`) : t('아직 확인하지 않았습니다 — 앞서 받아 둔 기록과 비교한 것입니다', 'Not checked yet. Compared with the history fetched earlier')
  let line: ReactNode
  if (repo.upstream == null || repo.ahead == null || repo.behind == null) line = <span className="muted">{repo.branch ? t(`${repo.branch} 브랜치가 GitHub 브랜치를 따라가지 않아 비교할 수 없습니다`, `Cannot compare: branch ${repo.branch} does not track a GitHub branch`) : t('브랜치가 아니라 비교할 수 없습니다', 'Cannot compare: not on a branch')}</span>
  else if (!repo.ahead && !repo.behind) line = <span><span className="repo-ok">✓</span> {t('GitHub와 같습니다', 'Same as GitHub')}</span>
  else line = <span>{[repo.behind ? t(`GitHub에 새 커밋 ${repo.behind}개`, `${plural(repo.behind, 'new commit')} on GitHub`) : '', repo.ahead ? t(`올리지 않은 커밋 ${repo.ahead}개`, plural(repo.ahead, 'unpushed commit')) : ''].filter(Boolean).join(' · ')}
    {!!repo.behind && (!repo.ahead && !repo.dirty && !repo.fetchError
      ? <> <button className="btn" disabled={updating} title={t('GitHub의 새 커밋을 받아옵니다. 빨리 감기만 하고, 이 컴퓨터의 파일을 덮어쓰거나 합치지 않습니다', 'Pull the new commits from GitHub. Fast-forward only; files on this computer are never overwritten or merged')} onClick={onUpdate}>{updating ? t('받는 중…', 'Pulling…') : t('업데이트', 'Update')}</button></>
      : <span className="muted">{t(' — 이 컴퓨터에 커밋이나 커밋 안 한 변경이 있어 앱에서 받지 않습니다. 터미널의 git pull로 합쳐 주세요', '. This computer has commits or uncommitted changes, so the app does not pull. Merge with git pull in a terminal')}</span>)}</span>
  return (
    <div className="repo-compare">
      <div className="repo-line">{line}{button}</div>
      {updateError && <span className="repo-err">! {updateError}</span>}
      {repo.fetchError
        ? <span className="repo-err" title={repo.fetchDetail}>! {repo.fetchError}. {t('앞서 받아 둔 기록과 비교한 것입니다', 'Compared with the history fetched earlier')}</span>
        : <span className="muted">{when}</span>}
    </div>
  )
}
