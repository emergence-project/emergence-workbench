import { useEffect, useMemo, useState } from 'react'
import { githubRepos, req, type GitHubRepoItem, type GitHubRepoList } from './api'
import { Dialog, PreamblePicker, type Inspection, type LibraryPreamble } from './dialogs'
import { relativeTime } from './format'
import { Icon } from './icons'
import { ProjectProfileFields } from './ProjectProfileFields'
import type { ProjectKind, ResearchListItem } from './api'
import { locale, t } from './i18n'

type Way = 'github' | 'folder'

/** 저장소를 고친 때: 올해면 "어제", "9/21", 해가 다르면 "2025. 12. 1." */
function updatedLabel(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return d.getFullYear() === new Date().getFullYear() ? relativeTime(ms) : t(`${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`, d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' }))
}

/** GitHub 저장소 한 줄: 이름, 주인, 비공개, 설명, 고친 때. 등록한 것은 "등록됨"으로 고를 수 없다 */
function RepoRow({ r, picked, onPick }: { r: GitHubRepoItem; picked: boolean; onPick(): void }) {
  const done = !!r.registeredId
  return (
    <button type="button" className={`repo-row${picked ? ' on' : ''}`} disabled={done} onClick={onPick}
      data-ui="저장소 줄" data-ui-item={`${r.owner}/${r.name}`} aria-pressed={picked}>
      <span className="repo-main">
        <span className="repo-name"><span className="repo-owner">{r.owner} /</span> {r.name}</span>
        {r.private && <span className="soon">{t('비공개', 'Private')}</span>}
        <span className="repo-when">{updatedLabel(r.updatedAt)}</span>
      </span>
      {r.description && <span className="repo-desc">{r.description}</span>}
      {done ? <span className="repo-mark">{t('등록됨', 'Added')}</span> : r.localPath ? <span className="repo-mark">{t('이 컴퓨터에 있음', 'On this computer')}</span> : null}
    </button>
  )
}

/**
 * 프로젝트 등록 (10/4 19:22 피드백 "등록 UI/UX 개선, 계정으로 온라인 등록").
 * 두 길: GitHub에서(이 컴퓨터의 GitHub 로그인으로 내 저장소 목록 → 받아 와서 등록) · 이 컴퓨터 폴더(경로).
 * 어느 길이든 마지막은 같다: 경로 검사 → (workbench가 없으면 만들지 확인) → 등록
 */
export function RegisterDialog({ sandbox, all, onClose, onRegistered }: { sandbox?: boolean; all: ResearchListItem[]; onClose(): void; onRegistered(id: string): void }) {
  const [way, setWay] = useState<Way>('github')
  const [path, setPath] = useState('')
  const [ins, setIns] = useState<Inspection | null>(null)
  const [create, setCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [kind, setKind] = useState<ProjectKind>('research')
  const [fields, setFields] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [library, setLibrary] = useState<{ path: string | null; preambles: LibraryPreamble[] }>({ path: null, preambles: [] })
  const [libPicked, setLibPicked] = useState<string[]>([])
  const [repoPicked, setRepoPicked] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/library').then((r) => r.json()).then((l) => { setLibrary(l); setLibPicked(l.preambles.map((p: LibraryPreamble) => p.name)) }).catch(() => undefined)
  }, [])
  const toggle = (list: string[], set: (v: string[]) => void, item: string) => set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  // GitHub에서: 내 저장소 목록 (gh 또는 맥의 git 로그인). 못 읽으면 주소 칸과 한 줄 안내
  const [repos, setRepos] = useState<GitHubRepoList | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<GitHubRepoItem | null>(null)
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState('')
  const [cloning, setCloning] = useState(false)
  useEffect(() => {
    githubRepos().then((l) => { setRepos(l); setParent(l.parent) })
      .catch((e: Error) => setRepos({ ok: false, reason: e.message, parent: '' }))
  }, [])
  const shown = useMemo(() => {
    if (!repos?.ok) return []
    const q = query.trim().toLowerCase()
    return q ? repos.repos.filter((r) => `${r.owner}/${r.name} ${r.description}`.toLowerCase().includes(q)) : repos.repos
  }, [repos, query])

  const inspect = async (target: string) => {
    setError(null)
    try {
      const res = await req('/api/researches/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: target }) })
      const body = await res.json()
      if (!res.ok) return setError(body.error)
      setIns(body)
      setTitle(body.suggestedTitle)
      setCreate(false)
      setRepoPicked(body.repoPreambles ?? [])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /** 고른 저장소(또는 붙여 넣은 주소)를 받을 폴더 아래로 받아 온 뒤 그 폴더를 검사한다 */
  const cloneSource = picked?.url ?? url.trim()
  const clone = async () => {
    if (!cloneSource) return
    setError(null)
    setCloning(true)
    try {
      const res = await req('/api/researches/clone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: cloneSource, parent: parent.trim() }) })
      const body = await res.json()
      if (!res.ok) return setError(body.error)
      setPath(body.path)
      await inspect(body.path)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCloning(false)
    }
  }

  const pick = (r: GitHubRepoItem) => {
    setUrl('')
    setError(null)
    // 같은 이름의 폴더가 이미 받을 폴더에 있으면 받지 않고 그 폴더를 등록한다
    if (r.localPath) { setPicked(r); setPath(r.localPath); void inspect(r.localPath); return }
    setPicked(picked?.url === r.url ? null : r)
  }

  const register = async () => {
    if (!ins) return
    try {
      const res = await req('/api/researches', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: ins.path, createWorkbench: create, title, question, kind, fields, libraryPreambles: create ? libPicked : [], repoPreambles: create ? repoPicked : [] }),
      })
      const body = await res.json()
      if (!res.ok) return setError(body.error)
      onRegistered(body.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /** 검사 결과를 지우고 고르기로 돌아간다 */
  const back = () => { setIns(null); setError(null); if (way === 'github') { setPicked(null); setPath('') } }

  const canRegister = !!ins && ins.errors.length === 0 && (ins.hasWorkbench || create)
  const primary = ins
    ? <button className="btn primary" disabled={!canRegister} onClick={() => void register()}>{t('등록', 'Add')}</button>
    : way === 'github'
      ? <button className="btn primary" disabled={cloning || !cloneSource || !parent.trim()} onClick={() => void clone()}>{cloning ? t('받는 중…', 'Cloning…') : t('받아 오기', 'Clone')}</button>
      : <button className="btn primary" disabled={!path.trim()} onClick={() => void inspect(path.trim())}>{t('확인', 'Check')}</button>

  return (
    <Dialog title={t('프로젝트 등록', 'Add project')} ui="연구 등록" wide onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      {primary}
    </>}>
      {sandbox && <div className="notes err">{t('지금은 ', 'This is ')}<b>{t('개발용 예제 모드', 'sample mode for development')}</b>{t('입니다. 여기서 등록하면 저장소에 workbench/는 실제로 생기지만, 등록 기록은 .sandbox/ 설정에만 남아 실사용 앱에는 나오지 않습니다. 실제 연구는 실사용 모드(주소 :5174)에서 등록하세요.', '. Adding here really creates workbench/ in the repository, but the record stays only in the .sandbox/ settings and does not appear in the real app. Add real projects in the real app (port :5174).')}</div>}
      {ins ? (
        <div className="reg-chosen" data-ui="등록할 폴더">
          <span className="muted">{t('등록할 폴더', 'Folder to add')}</span>
          <span className="mono reg-path">{ins.path}</span>
          <button type="button" className="a" onClick={back}>{t('다시 고르기', 'Choose again')}</button>
        </div>
      ) : <>
        <div className="segmented reg-way" role="radiogroup" aria-label={t('등록 방법', 'How to add')} data-ui="등록 방법 고르기">
          <button role="radio" aria-checked={way === 'github'} className={way === 'github' ? 'on' : ''} onClick={() => { setWay('github'); setError(null) }}>{t('GitHub에서', 'From GitHub')}</button>
          <button role="radio" aria-checked={way === 'folder'} className={way === 'folder' ? 'on' : ''} onClick={() => { setWay('folder'); setError(null) }}>{t('이 컴퓨터 폴더', 'Folder on this computer')}</button>
        </div>
        {way === 'github' ? <>
          {repos === null && <p className="muted reg-hint">{t('GitHub 저장소 목록을 읽는 중…', 'Loading GitHub repositories…')}</p>}
          {repos?.ok && <>
            <label className="reg-search" data-ui="저장소 찾기">
              {Icon.search}
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('저장소 이름으로 찾기', 'Search by repository name')} aria-label={t('저장소 찾기', 'Search repositories')} />
              <span className="muted">{t(`${shown.length}개`, `${shown.length}`)}</span>
            </label>
            <div className="repo-list" data-ui="GitHub 저장소 목록">
              {shown.length === 0
                ? <p className="muted reg-empty">{query ? t('찾는 이름의 저장소가 없습니다.', 'No repository with that name.') : t('GitHub 계정에 저장소가 없습니다.', 'The GitHub account has no repositories.')}</p>
                : shown.map((r) => <RepoRow key={r.url} r={r} picked={picked?.url === r.url} onPick={() => pick(r)} />)}
            </div>
          </>}
          {repos && !repos.ok && <p className="muted reg-hint" data-ui="목록 안내">{repos.reason} {t('맥 터미널에서', 'Run')} <code>gh auth login</code>{t('을 하면 내 저장소 목록이 보입니다. 지금은 아래에 주소를 붙여 넣으세요.', ' in a Mac terminal to see your repositories. For now, paste the address below.')}</p>}
          <label className="field" data-ui="GitHub 주소"><span>{repos?.ok ? t('목록에 없으면 GitHub 주소 붙여 넣기', 'Not in the list? Paste the GitHub address') : t('GitHub 주소', 'GitHub address')}</span>
            <input className="mono" value={url} placeholder={t('https://github.com/이름/저장소', 'https://github.com/name/repo')} autoFocus={!!repos && !repos.ok}
              onChange={(e) => { setUrl(e.target.value); setPicked(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) void clone() }} />
          </label>
          {cloneSource && <>
            <label className="field" data-ui="받을 폴더"><span>{t('받을 폴더 — 이 안에 저장소 이름의 폴더가 생깁니다', 'Clone into: a folder named after the repository is created inside')}</span>
              <input className="mono" value={parent} onChange={(e) => setParent(e.target.value)} />
            </label>
            <p className="muted reg-hint">{t('이 컴퓨터로 받아 온(git clone) 뒤 그 폴더를 등록합니다. 비공개 저장소도 이 컴퓨터의 GitHub 로그인을 그대로 씁니다.', "Clones to this computer (git clone) and then adds that folder. Private repositories use this computer's GitHub login.")}</p>
          </>}
        </> : <>
          <label className="field"><span>{t('연구 저장소 폴더 (절대 경로)', 'Project repository folder (absolute path)')}</span>
            <input autoFocus className="mono" value={path} placeholder="/Users/…/GitHub/my-research"
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && path.trim()) void inspect(path.trim()) }} />
          </label>
          <p className="muted reg-hint">{t('저장소는 옮기지 않습니다. 경로만 이 컴퓨터의 설정에 기록합니다.', "The repository is not moved. Only its path is saved in this computer's settings.")}</p>
        </>}
      </>}
      {ins && ins.errors.length > 0 && <div className="notes err"><ul>{ins.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {ins && ins.warnings.length > 0 && <div className="notes warn"><ul>{ins.warnings.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {ins && ins.errors.length === 0 && (
        <div className="field" data-ui="태그 고르기"><span>{t('성격과 분야 — 홈에서 성격으로 거릅니다', 'Kind and fields: Home filters by kind')}</span>
          <ProjectProfileFields kind={kind} fields={fields} all={all}
            onChange={(p) => { if (p.kind) setKind(p.kind); if (p.fields) setFields(p.fields) }} />
        </div>
      )}
      {ins && ins.errors.length === 0 && !ins.hasWorkbench && <>
        <label className="check"><input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
          <span>{t('이 저장소 안에 ', 'Create a ')}<code>workbench/</code>{t(' 폴더를 만듭니다. 저장소의 다른 파일은 건드리지 않습니다.', ' folder in this repository. Other files in the repository are not touched.')}</span></label>
        {create && <>
          <label className="field"><span>{t('연구 제목', 'Project title')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>{t('연구 목표 한 문장 (선택)', 'Project goal in one sentence (optional)')}</span><input value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
          <PreamblePicker
            library={library.preambles}
            repo={ins.repoPreambles.map((f) => ({ file: f, ...(ins.repoPreambleDetails[f] ?? { commands: [], environments: [] }) }))}
            libPicked={libPicked} repoPicked={repoPicked}
            onToggleLib={(n) => toggle(libPicked, setLibPicked, n)}
            onToggleRepo={(f) => toggle(repoPicked, setRepoPicked, f)} />
        </>}
      </>}
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}
