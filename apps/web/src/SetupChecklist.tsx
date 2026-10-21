import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { githubRepos, setupApi, type GitHubRepoItem, type GitHubRepoList, type PersonView, type SetupView } from './api'
import { Dialog } from './dialogs'
import { ElsewhereHomeCard, ElsewhereSection } from './ElsewhereProjects'
import { GoogleSettings } from './GoogleSettings'
import { Icon } from './icons'
import { lang, plural, t } from './i18n'
import { PersonEditDialog } from './network/PersonEditDialog'
import { announce, usePeople, useMe } from './network/people'
import { qk } from './queries'
import { go } from './router'
import type { UiSettings } from '@rw/core'

/**
 * 시작 준비 (10/20 15:35 피드백 "공개한 앱을 누가 받아도 바로 쓸 수 있게", 10/21 시안대로):
 * 설정 › 계정을 꼭 할 것(GitHub 로그인 · 커밋 이름 · 내 이름과 소속 · 첫 프로젝트)과 선택(개인 저장소 · 에이전트 · TeX · 구글) 목록으로 보인다.
 * 점 색은 상태 색 그대로: 청록 됨, 주황 할 차례, 회색 고리 선택(안 해도 됨). 홈은 꼭 할 것이 남았을 때만 카드 하나.
 * 앱은 로그인 정보를 갖지 않는다: GitHub는 gh 로그인에 맡기고, 안 됐을 때 할 명령만 보인다.
 */
export function useSetup() {
  const setup = useQuery({ queryKey: qk.setup, queryFn: setupApi.get, refetchOnMount: 'always' })
  const github = useQuery({ queryKey: qk.githubRepos, queryFn: githubRepos })
  const people = usePeople()
  const me = useMe(people.data)
  const s = setup.data
  const gitOk = !!(s?.git.name && s.git.email)
  const meOk = !!(me?.name && me.affiliations.length)
  const must = [
    { key: 'github', ok: !!github.data?.ok, label: t('GitHub 로그인', 'GitHub sign-in') },
    { key: 'git', ok: gitOk, label: t('커밋에 적힐 이름', 'Name on commits') },
    { key: 'me', ok: meOk, label: t('내 이름·소속', 'Your name and affiliation') },
    { key: 'project', ok: (s?.projects ?? 0) > 0, label: t('첫 프로젝트', 'First project') },
  ]
  const loaded = !!s && !!github.data && !!people.data
  return { setup, github, people: people.data, me, must, done: must.filter((m) => m.ok).length, loaded }
}

/** 설정 › 에이전트의 연결 줄 수: Claude Code · Codex · Claude API (AgentSettings.tsx) */
export const AGENT_ROWS = 3

const Dot = ({ ok, optional }: { ok: boolean; optional?: boolean }) =>
  <span className={`g ${ok ? 'solved' : optional ? 'stopped' : 'blocked'}`} role="img" aria-label={ok ? t('됨', 'Done') : optional ? t('선택', 'Optional') : t('할 차례', 'To do')} title={ok ? t('됨', 'Done') : optional ? t('선택: 쓰고 싶을 때만', 'Optional: only if you want it') : t('할 차례', 'To do')} />

export function Row({ ok, optional, name, sub, children, action, ui }: { ok: boolean; optional?: boolean; name: string; sub?: string; children: ReactNode; action?: ReactNode; ui: string }) {
  return (
    <div className="setup-row" data-ui={ui}>
      <Dot ok={ok} optional={optional && !ok} />
      <div className="setup-main">
        <div className="set-name">{name}{sub && <small className="setup-sub">{sub}</small>}</div>
        <div className="setup-desc">{children}</div>
      </div>
      {action && <div className="setup-act">{action}</div>}
    </div>
  )
}

const Edit = ({ label, onClick }: { label: string; onClick(): void }) =>
  <button className="icon-btn" data-tip={label} aria-label={label} onClick={onClick}>{Icon.pencil}</button>

export function SetupAccounts({ onSaved, onUiRestored }: { onSaved(message: string): void; onUiRestored(ui: UiSettings): void }) {
  const { setup, github, people, me, must, done } = useSetup()
  const client = useQueryClient()
  const [editing, setEditing] = useState<'git' | 'me' | 'personal' | 'library' | null>(null)
  const s = setup.data
  const put = (v: SetupView) => client.setQueryData(qk.setup, v)
  const left = must.filter((m) => !m.ok)
  const connected = s?.agents.filter((a) => a.registered || a.at).length ?? 0
  return (
    <div className="setup" data-ui="시작 준비">
      <div className="setup-ready" data-ui="시작 준비 요약">
        <span className="set-name">{t('시작 준비', 'Getting started')} <b className={left.length ? 'setup-left' : 'setup-all'}>{done} / {must.length}</b></span>
        <span className="setup-desc">{left.length
          ? t(`꼭 할 것 넷 중 ${['하나가', '둘이', '셋이', '넷이'][left.length - 1]} 남았습니다. 선택 항목은 쓰고 싶을 때만.`, `${left.length} of 4 required steps left. Optional items only if you want them.`)
          : t('꼭 할 것을 모두 마쳤습니다. 선택 항목은 쓰고 싶을 때만.', 'All required steps are done. Optional items only if you want them.')}</span>
      </div>

      <h3 className="set-h3">{t('꼭 할 것', 'Required')}</h3>
      <div className="set-rows">
        <GitHubRow list={github.data} error={github.error?.message} onCheck={() => void github.refetch()} checking={github.isFetching} />
        <Row ok={!!(s?.git.name && s.git.email)} name={t('커밋에 적힐 이름·이메일', 'Name and email on commits')} ui="커밋 이름"
          action={<Edit label={t('고치기', 'Edit')} onClick={() => setEditing('git')} />}>
          {s?.git.name && s.git.email ? <><b>{s.git.name}</b> &lt;{s.git.email}&gt;. </> : <>{t('설정 안 됨. ', 'Not set. ')}</>}
          {t('앱이 기록·노트를 연구 저장소에 올릴 때 이 이름으로 적힙니다. 비어 있으면 git이 커밋을 거절해 올리기가 멈춥니다.', 'Records and notes the app pushes to research repositories are signed with this name. If empty, git refuses to commit and pushing stops.')}
        </Row>
        <Row ok={!!(me?.name && me.affiliations.length)} name={t('내 이름·소속', 'Your name and affiliation')} ui="내 이름 소속"
          action={people && <Edit label={t('고치기', 'Edit')} onClick={() => setEditing('me')} />}>
          {me?.name ? <><b>{me.name}</b>{me.affiliations.length ? ` · ${me.affiliations[0]}` : t(' · 소속 없음', ' · no affiliation')}. </> : t('비어 있음. ', 'Empty. ')}
          {t('원고 저자, 코멘트 작성자, ', 'Used as manuscript author, comment author, and on ')}<button className="a" onClick={() => go({ page: 'network' })}>{t('네트워킹', 'Networking')}</button>{t(' 내 페이지가 함께 씁니다.', ' (your page).')}
        </Row>
        <Row ok={(s?.projects ?? 0) > 0} name={t('첫 프로젝트', 'First project')} ui="첫 프로젝트">
          {s && s.projects > 0 ? t(`${s.projects}개 등록됨. `, `${plural(s.projects, 'project', 'projects')} registered. `) : t('아직 없음. ', 'None yet. ')}
          {s?.elsewhere.length ? t('아래 "다른 컴퓨터의 프로젝트"에서 받거나, ', 'Download one from "Projects on your other computers" below, or ') : ''}{t('홈의 "＋ 프로젝트 등록"으로 GitHub 저장소나 이 컴퓨터 폴더를 더합니다.', 'Add a GitHub repository or a folder on this computer with "＋ Register project" on Home.')}
        </Row>
      </div>

      <ElsewhereSection setup={s} />

      <h3 className="set-h3">{t('선택', 'Optional')}</h3>
      <div className="set-rows">
        <InstallRow install={s?.install} onSaved={onSaved} />
        <Row ok={!!s?.personal.remote} optional name={t('개인 저장소', 'Personal repository')} sub={t('피드백·백업을 올릴 곳', 'where feedback and backups go')} ui="개인 저장소"
          action={<Edit label={t('고치기', 'Edit')} onClick={() => setEditing('personal')} />}>
          {s?.personal.remote
            ? <><code>{s.personal.remote}</code>{s.personal.active ? '. ' : t('. 앱을 다시 시작하면 받아 둡니다. ', '. It is cloned the next time the app restarts. ')}{t('피드백과 설정 백업을 이 비공개 저장소에 올립니다.', 'Feedback and settings backups are pushed to this private repository.')}</>
            : t('없음: 피드백과 설정 백업이 이 컴퓨터에만 남습니다. 비공개 저장소 주소를 넣으면 앱이 비공개인지 확인하고 받아 둡니다.', 'None: feedback and settings backups stay on this computer only. Enter a private repository address; the app checks that it is private and clones it.')}
        </Row>
        <Row ok={!!s?.library.path} optional name={t('공용 라이브러리', 'Shared library')} sub={t('개념노트 · 논문 · 그림', 'concept notes, papers, figures')} ui="공용 라이브러리"
          action={s?.library.suggest
            ? <button className="btn" onClick={() => void setupApi.setLibrary({ path: s.library.suggest! }).then((v) => { put(v); onSaved(t('공용 라이브러리를 연결했습니다', 'Shared library connected')) }).catch((e: Error) => onSaved(e.message))}>{t('연결', 'Connect')}</button>
            : <Edit label={t('고치기', 'Edit')} onClick={() => setEditing('library')} />}>
          {s?.library.path ? <><code>{s.library.path}</code>. </>
            : s?.library.suggest ? <>{t('다른 컴퓨터가 쓰는 라이브러리를 이 컴퓨터에서 찾았습니다: ', 'Found the library your other computer uses on this computer: ')}<code>{s.library.suggest}</code>. </>
            : t('없음. ', 'None. ')}
          {t('지식 · 논문 · 그림 화면과 원고의 공용 서식이 이 폴더를 씁니다.', 'The Knowledge, Papers and Figures screens and shared manuscript styles use this folder.')}
        </Row>
        {/* 줄마다 자세한 것은 설정 › 에이전트 (10/21 사용자 "설정에서 에이전트 탭으로 빼자"). 여기는 몇 개 연결됐는지만 */}
        <Row ok={connected > 0} optional name={t('에이전트 연결', 'Agent connection')} sub={`${connected} / ${AGENT_ROWS}`} ui="에이전트 연결">
          {connected ? t(`${s!.agents.filter((a) => a.registered || a.at).map((a) => a.name).join(' · ')} 연결됨. `, `${s!.agents.filter((a) => a.registered || a.at).map((a) => a.name).join(', ')} connected. `) : t('아직 연결 안 됨. ', 'Not connected yet. ')}
          {t('에이전트마다 등록 명령과 부른 때는 ', 'Each agent\'s registration command and last call are in ')}<button className="a" onClick={() => go({ page: 'settings', part: 'agents' })}>{t('에이전트 탭', 'the Agents tab')}</button>{t('에 있습니다.', '.')}
        </Row>
        <Row ok={!!s?.tex} optional name="TeX" sub={t('PDF 컴파일', 'PDF compile')} ui="TeX"
          action={<button className="btn" disabled={setup.isFetching} onClick={() => void setup.refetch()}>{t('다시 확인', 'Check again')}</button>}>
          {s?.tex ? t('latexmk 있음. ', 'latexmk found. ') : t('latexmk 없음. ', 'latexmk not found. ')}
          {t('원고·노트를 PDF로 만들 때만 필요합니다. MacTeX를 깔면 저절로 찾습니다.', 'Needed only to make PDFs of manuscripts and notes. Install MacTeX and the app finds it.')}
        </Row>
      </div>
      <h3 className="set-h3">{t('구글 (선택)', 'Google (optional)')}</h3>
      <GoogleSettings onUiRestored={onUiRestored} />

      {editing === 'git' && s && <GitDialog init={s.git} me={me} onClose={() => setEditing(null)} onDone={(v) => { put(v); setEditing(null); onSaved(t('커밋 이름을 저장했습니다', 'Commit name saved')) }} />}
      {editing === 'personal' && s && <PersonalDialog init={s.personal.remote ?? ''} repos={github.data?.ok ? github.data.repos : []} onClose={() => setEditing(null)} onDone={(v) => { put(v); setEditing(null); onSaved(v.personal.remote ? t('개인 저장소를 저장했습니다', 'Personal repository saved') : t('개인 저장소를 뺐습니다', 'Personal repository removed')) }} />}
      {editing === 'library' && s && <LibraryDialog init={s.library.path ?? ''} onClose={() => setEditing(null)} onDone={(v) => { put(v); setEditing(null); onSaved(t('공용 라이브러리를 저장했습니다', 'Shared library saved')) }} />}
      {editing === 'me' && people && <PersonEditDialog person={me ?? blankAuthor} people={people} location={`${t('설정', 'Settings')} › ${t('계정', 'Accounts')}`} onSaved={onSaved} onDone={() => { setEditing(null); announce() }} />}
    </div>
  )
}

/** 이 컴퓨터에 설치 (scripts/install.sh): 앱 아이콘 · Dock · 서비스. 빠진 것이 있으면 설치 명령을 보인다. 에이전트 등록도 그 명령이 한다 */
function InstallRow({ install, onSaved }: { install?: SetupView['install']; onSaved(m: string): void }) {
  const parts = install ? [
    { ok: install.app, name: t('앱 아이콘', 'App icon') },
    { ok: install.dock, name: 'Dock' },
    { ok: install.service, name: t('백그라운드 서비스', 'Background service') },
  ] : []
  const missing = parts.filter((p) => !p.ok)
  return (
    <Row ok={!!install && !missing.length} optional name={t('이 컴퓨터에 설치', 'Installed on this computer')} sub={t('앱 아이콘 · Dock · 서비스', 'app icon, Dock, service')} ui="이 컴퓨터에 설치"
      action={install && missing.length > 0 && <CopyButton text={install.command} onSaved={onSaved} />}>
      {!install ? t('확인하는 중… ', 'Checking… ')
        : missing.length ? <>{t(`빠진 것: ${missing.map((p) => p.name).join(' · ')}. `, `Missing: ${missing.map((p) => p.name).join(', ')}. `)}{t('터미널에서 ', 'Run ')}<code>{install.command}</code>{t('을 한 번 실행하면 마저 합니다. ', ' once in the terminal to finish. ')}</>
          : t('앱 아이콘(응용 프로그램 · Spotlight · 바탕화면), Dock, 백그라운드 서비스가 있습니다. ', 'App icon (Applications, Spotlight, Desktop), Dock and background service are in place. ')}
      {t('설치 명령은 이 컴퓨터에 깔린 Claude Code · Codex에 이 앱을 등록하는 일도 하고, 이미 된 것은 건너뜁니다.', 'The installer also registers this app with Claude Code and Codex where they are installed, and skips what is already done.')}
    </Row>
  )
}

/** 저자가 아직 없을 때 고치기 창에 넘기는 빈 사람 (저장하면 첫 저자로 더한다: PersonEditDialog) */
const blankAuthor: PersonView = { id: '', name: '', aliases: [], author: true, affiliations: [], orgs: [], tags: [], emails: [], added: false, star: false }

export const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function GitHubRow({ list, error, onCheck, checking }: { list?: GitHubRepoList; error?: string; onCheck(): void; checking: boolean }) {
  const owner = list?.ok ? mostCommon(list.repos.map((r) => r.owner)) : ''
  const via = list?.ok ? ({ gh: t('gh 로그인', 'gh login'), git: t('키체인의 git 로그인', 'git login in the keychain'), sample: t('예제 목록', 'Sample list') })[list.source] : ''
  return (
    <Row ok={!!list?.ok} name={t('GitHub 로그인', 'GitHub sign-in')} ui="GitHub 계정"
      action={<button className="btn" disabled={checking} onClick={onCheck}>{t('다시 확인', 'Check again')}</button>}>
      {list?.ok ? <>{t('연결됨', 'Connected')}{owner && <>: <b>{owner}</b></>} · {via} · {t(`저장소 ${list.repos.length}개. `, `${plural(list.repos.length, 'repository', 'repositories')}. `)}</>
        : list ? (lang === 'ko' ? <>{list.reason} 터미널에서 <code>gh auth login</code>을 하면 연결됩니다. </> : <>{list.reason} Run <code>gh auth login</code> in the terminal to connect. </>)
          : error ? `${error} ` : t('확인하는 중… ', 'Checking… ')}
      {t('연구 저장소를 받고 올리는 데 씁니다. 앱은 로그인 정보를 저장하지 않습니다.', 'Used to pull and push research repositories. The app does not store login details.')}
    </Row>
  )
}

function mostCommon(xs: string[]): string {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

export function CopyButton({ text, onSaved }: { text: string; onSaved(m: string): void }) {
  return <button className="btn" onClick={() => navigator.clipboard.writeText(text).then(
    () => onSaved(t('복사했습니다. 터미널에 붙여 넣으세요', 'Copied. Paste it in the terminal')),
    () => onSaved(t(`복사하지 못했습니다: ${text}`, `Could not copy: ${text}`)))}>{t('명령 복사', 'Copy command')}</button>
}

function GitDialog({ init, me, onClose, onDone }: { init: SetupView['git']; me?: PersonView; onClose(): void; onDone(v: SetupView): void }) {
  const [name, setName] = useState(init.name || me?.name || '')
  const [email, setEmail] = useState(init.email || me?.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try { onDone(await setupApi.setGit({ name, email })) } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return (
    <Dialog title={t('커밋에 적힐 이름·이메일', 'Name and email on commits')} ui="커밋 이름" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !name.trim() || !email.trim()} onClick={() => void save()}>{t('저장', 'Save')}</button>
    </>}>
      <label className="field"><span>{t('이름', 'Name')}</span><input value={name} autoFocus onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{t('이메일', 'Email')}</span><input value={email} type="email" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} /></label>
      <p className="setup-desc">{t('이 컴퓨터의 git 전체 설정(git config --global)에 적습니다. 다른 git 작업에도 같은 이름이 쓰입니다.', 'Written to this computer\'s global git settings (git config --global), so other git work uses the same name.')}</p>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}

/**
 * 개인 저장소 고르기 (10/22 피드백 "주소를 적기보다 마우스로 고르거나, 없으면 바로 만들 수 있게"):
 * GitHub 로그인으로 받은 내 비공개 저장소 중에서 누르거나, 새 비공개 저장소를 만든다. 주소를 직접 적는 칸은 아래에 남긴다
 */
function PersonalDialog({ init, repos, onClose, onDone }: { init: string; repos: GitHubRepoItem[]; onClose(): void; onDone(v: SetupView): void }) {
  const [remote, setRemote] = useState(init)
  const [name, setName] = useState('workbench-private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const own = repos.filter((r) => r.private && !r.registeredId)
  const call = async (f: () => Promise<SetupView>) => {
    setBusy(true); setError('')
    try { onDone(await f()) } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  const save = (value: string) => call(() => setupApi.setPersonal({ remote: value }))
  return (
    <Dialog title={t('개인 저장소', 'Personal repository')} onClose={onClose} footer={<>
      {init && <button className="btn" disabled={busy} onClick={() => void save('')}>{t('빼기', 'Remove')}</button>}
      <span className="sp" />
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !remote.trim()} onClick={() => void save(remote)}>{t('저장', 'Save')}</button>
    </>}>
      <p className="setup-desc">{t('피드백과 설정 백업을 올릴 비공개 저장소입니다. 공개 저장소는 받지 않습니다. 앱을 다시 시작하면 받아 둡니다.', 'A private repository for feedback and settings backups. Public repositories are refused. The app clones it on the next restart.')}</p>
      {own.length > 0 && <>
        <div className="setup-pick-h">{t('내 비공개 저장소에서 고르기', 'Pick one of your private repositories')}</div>
        <div className="setup-pick" data-ui="개인 저장소 고르기">
          {own.map((r) => <button key={r.url} type="button" className={`setup-pick-row${remote === r.url ? ' on' : ''}`} onClick={() => setRemote(r.url)}>
            <span><span className="muted">{r.owner} /</span> {r.name}</span>{r.description && <span className="muted setup-pick-desc">{r.description}</span>}
          </button>)}
        </div>
      </>}
      <div className="setup-pick-h">{t('새로 만들기', 'Create a new one')}</div>
      <div className="setup-create" data-ui="개인 저장소 만들기">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('새 저장소 이름', 'New repository name')} />
        <button className="btn" disabled={busy || !name.trim()} onClick={() => void call(() => setupApi.createPersonal({ name }))}>{t('비공개로 만들기', 'Create as private')}</button>
      </div>
      <label className="field"><span>{t('또는 주소 적기', 'Or enter an address')}</span>
        <input value={remote} placeholder="https://github.com/name/my-workbench-private" onChange={(e) => setRemote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && remote.trim()) void save(remote) }} /></label>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}

function LibraryDialog({ init, onClose, onDone }: { init: string; onClose(): void; onDone(v: SetupView): void }) {
  const [dir, setDir] = useState(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try { onDone(await setupApi.setLibrary({ path: dir })) } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return (
    <Dialog title={t('공용 라이브러리', 'Shared library')} onClose={onClose} footer={<>
      <span className="sp" />
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !dir.trim()} onClick={() => void save()}>{t('저장', 'Save')}</button>
    </>}>
      <label className="field"><span>{t('이 컴퓨터의 라이브러리 폴더 (절대 경로)', 'Library folder on this computer (absolute path)')}</span>
        <input value={dir} autoFocus placeholder="/Users/name/GitHub/research-library" onChange={(e) => setDir(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && dir.trim()) void save() }} /></label>
      <p className="setup-desc">{t('개념노트(concepts/) · 논문 · 서식(preamble/)이 든 저장소 폴더입니다. 아직 없으면 홈의 "＋ 프로젝트 등록"과 같은 GitHub 목록에서 받아 둔 뒤 그 경로를 적습니다.', 'The repository folder that holds concept notes (concepts/), papers and styles (preamble/). If it is not on this computer yet, clone it first, then enter its path.')}</p>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}

/** 한국어 주격 조사: 마지막 글자에 받침이 있으면 이, 없으면 가 */
const subjectParticle = (word: string) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return c >= 0 && c < 11172 && c % 28 !== 0 ? '이' : '가'
}

/** 홈의 시작 준비 카드: 꼭 할 것이 남았을 때만 (10/21 시안 "후 · 홈 첫 화면") */
export function SetupHomeCard() {
  const { must, done, loaded, setup } = useSetup()
  const left = must.filter((m) => !m.ok)
  if (!loaded) return null
  if (!left.length) return <ElsewhereHomeCard setup={setup.data} />
  return (<>
    <div className="setup-home card" data-ui="시작 준비 카드">
      <span className="set-name">{t('시작 준비', 'Getting started')} <b className="setup-left">{done} / {must.length}</b></span>
      <span className="setup-desc">{t(`${left.map((m) => m.label).join(', ')}${subjectParticle(left[left.length - 1]!.label)} 남았습니다.`, `Left: ${left.map((m) => m.label.toLowerCase()).join(', ')}.`)}</span>
      <button className="a" onClick={() => go({ page: 'settings', part: 'google' })}>{t('설정 › 계정 열기', 'Open Settings › Accounts')}</button>
    </div>
    <ElsewhereHomeCard setup={setup.data} />
  </>)
}
