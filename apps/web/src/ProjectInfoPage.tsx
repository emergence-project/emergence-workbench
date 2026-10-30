import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './queries'
import type { BlockStatus } from '@rw/core'
import type { AgentRules, ManuscriptInfo, NoteRow, RepoInfo, ResearchApi, ResearchListItem, ResearchSummary } from './api'
import { isoDay, monthDay, projectColor, relativeTime, statusLabel, statusOf } from './format'
import { go } from './router'
import { ProjectStateDot, type ProfilePatch } from './ProjectProfileFields'
import { Icon } from './icons'
import { ProjectEditDialog } from './ProjectEditDialog'
import { PROJECT_KIND_LABEL } from './projectProfile'
import { locale, plural, t } from './i18n'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { splitStatus, statusBody } from './statusBody'
import { useAgentStatus, useJournal, useProjectInfo, useTaskScan, useTopicsOverview } from './projectQueries'
import { StatusDot } from './StatusDot'
import { StarIcon } from './marks'
import { judgeOrder, taskLine, TASK_DOT, TASK_GROUPS, TASK_STATE_LABEL } from './taskView'
import { reviewStatusLabel } from './reviewStatus'
import { LOOSE_NOTES_LABEL, LOOSE_TOPIC_ID } from './noteKinds'

function PathName({ path }: { path: string }) {
  const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
  return <code className="info-path" title={path}>{name}</code>
}

/** 프로젝트 정보의 하위 쪽 하나의 겉 (개요 · 현황 · 규칙 · 저장소, 10/16 사용자 승인 "네 쪽으로") */
export function InfoShell({ ui, children }: { ui: string; children: ReactNode }) {
  return (
    <div className="ws-doc" data-ui={ui}>
      <section className="pane" data-ui="본문">
        <div className="scroll">
          <div className="page-body info-page">{children}</div>
        </div>
      </section>
    </div>
  )
}

export function SubHead({ title, desc }: { title: string; desc: string }) {
  return (
    <header className="info-head">
      <h1 className="h-title">{title}</h1>
      <p className="info-desc muted">{desc}</p>
    </header>
  )
}

/**
 * 프로젝트 정보 › 개요: 이 프로젝트가 무엇이고 무엇이 들어 있는지 (2026-10-03 13:48 피드백 — 첫 화면에서 따로 뗌).
 * 현황 · 규칙 · 저장소는 사이드바의 하위 쪽으로 나눴다 (10/16 사용자 승인, 시안 "세 가지 시안" 2번).
 * 읽기가 기본이며 제목 옆 연필로 첫 화면과 같은 고치기 창을 연다 (10/6 D3).
 * 제목·설명·시작일·카드 그림은 research.yaml, 성격·분야·진행 상태는 이 컴퓨터의 설정에 쓴다.
 */
export function ProjectInfoPage({ rid, rapi, summary, notes, manuscripts, project: listed, all, onProfile, onChanged, onSaved }: {
  rid: string
  rapi: ResearchApi
  summary: ResearchSummary
  notes: NoteRow[]
  manuscripts: ManuscriptInfo[]
  /** 이 프로젝트의 등록 정보 (성격 · 분야 · 진행 상태, 이 컴퓨터의 설정) */
  project?: ResearchListItem
  all: ResearchListItem[]
  onProfile(patch: ProfilePatch, message: string): Promise<void>
  onChanged(): void
  onSaved(message: string): void
}) {
  const { research, statements } = summary
  const [editing, setEditing] = useState(false)
  const topics = useTopicsOverview(rid).data?.topics
  const n = (s: string) => notes.filter((b) => statusOf(b.status) === s).length

  return (
    <InfoShell ui="프로젝트 정보">
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
        <dl data-ui="프로젝트 성격과 분야">
          {listed && <><dt>{t('진행 상태', 'Progress')}</dt><dd><span className="info-state"><ProjectStateDot state={listed.state} label /></span></dd></>}
          <dt>{t('시작', 'Started')}</dt><dd data-ui="시작일 칸">{research.started || <span className="muted">—</span>}</dd>
          {listed && <>
            <dt>{t('성격', 'Kind')}</dt><dd>{PROJECT_KIND_LABEL[listed.kind]}</dd>
            <dt>{t('분야', 'Fields')}</dt><dd className="info-fields">{listed.fields.length ? listed.fields.map((f) => <span key={f} className="pc-field">{f}</span>) : <span className="muted">{t('없음', 'None')}</span>}</dd>
          </>}
          <dt>{t('카드 그림', 'Card image')}</dt><dd data-ui="카드 그림 칸">{research.image ? <PathName path={research.image} /> : <span className="muted">{t('없음 — 홈 카드에 프로젝트 색만', 'None. The home card shows only the project color')}</span>}</dd>
        </dl>
        {listed && <p className="muted info-note">{t('진행 상태 · 성격 · 분야는 이 컴퓨터의 설정, 나머지는 research.yaml입니다. 연필 하나로 함께 고칩니다.', 'Progress, kind and fields are settings on this computer; the rest is research.yaml. The pencil edits both.')}</p>}
      </section>

      <section className="info-sec" data-ui="노트 정보">
        <h2>{t('들어 있는 것', 'Contents')}</h2>
        <dl>
          <dt>{t('주제', 'Topics')}</dt><dd>{topics === undefined ? <span className="muted">…</span> : topics.length || <span className="muted">{t('없음', 'None')}</span>}</dd>
          <dt>{t('원고', 'Manuscript')}</dt>
          <dd>{manuscripts.length ? manuscripts.map((m) => (
            <div key={m.key}><button className="a info-manuscript" onClick={() => m.parts[0] && go({ page: 'part', rid, file: m.parts[0].file })}>{Icon.manuscript} {m.name}</button> <PathName path={m.main} /> <span className="muted">· {t(`${m.parts.length}장`, plural(m.parts.length, 'chapter'))}{m.hasPdf ? t(' · PDF 있음', ' · has PDF') : ''}</span></div>
          )) : <span className="muted">{t('없음 — 첫 화면에서 정합니다', 'None. Set it on the first screen')}</span>}</dd>
          <dt>{t('노트', 'Notes')}</dt>
          <dd><span>{notes.length} <span className="muted">({(['solved', 'in-progress', 'blocked', 'stopped'] as const).filter((s) => n(s) > 0).map((s) => `${statusLabel(s)} ${n(s)}`).join(' · ') || t('없음', 'None')})</span></span></dd>
          <dt>{t('진술', 'Statements')}</dt><dd>{statements.length || <span className="muted">{t('없음', 'None')}</span>}</dd>
        </dl>
      </section>
      {editing && listed && <ProjectEditDialog rapi={rapi} summary={summary} listed={listed} all={all} pc={projectColor(rid)}
        onProfile={onProfile} onChanged={onChanged} onSaved={onSaved} onDone={() => setEditing(false)} />}
    </InfoShell>
  )
}

/** 현황 글 (화면 캐시, 그 프로젝트의 알림마다 다시 받는다). 읽는 중 undefined, 못 읽으면 null */
function useStatusText(rid: string, rapi: ResearchApi): string | null | undefined {
  const q = useAgentStatus(rid, rapi)
  return q.data === undefined ? undefined : q.data === null ? null : statusBody(q.data)
}

/** 노트 상태별 수를 보이는 순서 (주제 카드와 같은 색 점 + 수) */
const COUNT_ORDER: BlockStatus[] = ['in-progress', 'blocked', 'solved', 'stopped']
/** 현황의 "내 차례"에 보이는 줄 수 */
const TURN_ROWS = 5
const RECENT_DAYS = 7

function Counts({ by }: { by: Partial<Record<BlockStatus, number>> }) {
  const shown = COUNT_ORDER.filter((s) => (by[s] ?? 0) > 0)
  if (!shown.length) return <span className="muted">{t('노트 없음', 'No notes')}</span>
  return <span className="info-counts">{shown.map((s) => <span key={s} title={`${statusLabel(s)} ${by[s]}`}><StatusDot s={s} />{by[s]}</span>)}</span>
}

/**
 * 프로젝트 정보 › 현황: 에이전트가 STATUS.md · `pnpm agent:status` · MCP project_status로 읽는 것과 같은 내용을 칸으로 나눴다
 * (10/11 "정본은 하나, 사람은 앱으로 AI는 파일·MCP로", 10/16 사용자 승인 B안 "칸으로 나눈 요약 + 원문 보기").
 * 칸의 수는 작업 · 주제 · 일지 화면과 같은 자료에서 세고, 맨 아래에서 서버 generateStatus의 글을 그대로 펼쳐 볼 수 있다.
 * 정본 위치는 저장소 쪽에, 규칙 절은 규칙 쪽에 둔다.
 */
export function StatusPage({ rid, rapi }: { rid: string; rapi: ResearchApi }) {
  const tasks = useTaskScan(rid).data?.tasks
  const overview = useTopicsOverview(rid).data
  const { entries, loaded } = useJournal(rapi)
  const text = useStatusText(rid, rapi)
  const turn = tasks ? judgeOrder(tasks) : []
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000)
  const sinceDay = isoDay(since)
  const recent = entries.filter((e) => e.date >= sinceDay).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, TURN_ROWS)
  const toWork = <button className="a info-more" onClick={() => go({ page: 'records', rid })}>{t('기록 ›', 'Records ›')}</button>
  return (
    <InfoShell ui="현황 쪽">
      <SubHead title={t('현황', 'Status')} desc={t('에이전트가 STATUS.md와 MCP로 읽는 것과 같은 내용을 칸으로 나눴습니다.', 'The same content agents read in STATUS.md and over MCP, split into sections.')} />
      <WorkbenchUpload rapi={rapi} />
      <SyncLine rid={rid} rapi={rapi} />

      <section className="info-sec" data-ui="내 차례">
        <h2>{t('내 차례', 'Your turn')} <span className="muted">{tasks ? turn.length : '…'}</span>{turn.length > 0 && toWork}</h2>
        {!tasks ? <p className="muted">{t('읽는 중…', 'Loading…')}</p> : !turn.length ? <p className="muted">{t('판단을 기다리는 맡긴 일이 없습니다', 'No delegated work is waiting for your decision')}</p> : (
          <ul className="info-list">
            {turn.slice(0, TURN_ROWS).map((x) => (
              <li key={x.id}><button className="info-row" onClick={() => go({ page: 'task', rid, task: x.id })}>
                <StatusDot s={TASK_DOT[x.state]} name={TASK_STATE_LABEL[x.state]} /><span className="info-row-title">{x.title}</span><span className="muted info-row-meta">{taskLine(x)}</span>
              </button></li>
            ))}
            {turn.length > TURN_ROWS && <li className="muted info-list-more">{t(`외 ${turn.length - TURN_ROWS}개`, `${turn.length - TURN_ROWS} more`)}</li>}
          </ul>
        )}
      </section>

      <section className="info-sec" data-ui="맡긴 일 수">
        <h2>{t('맡긴 일', 'Delegated work')} <span className="muted">{tasks ? tasks.length : '…'}</span>{toWork}</h2>
        {tasks && (tasks.length
          ? <p className="info-line">{TASK_GROUPS.map((g) => ({ g, n: tasks.filter((x) => (g.states as readonly string[]).includes(x.state)).length })).filter((x) => x.n > 0).map((x) => <span key={x.g.title}>{x.g.title} <b>{x.n}</b></span>)}</p>
          : <p className="muted">{t('맡긴 일이 없습니다', 'No delegated work')}</p>)}
      </section>

      <section className="info-sec" data-ui="주제 진행">
        <h2>{t('주제', 'Topics')} <span className="muted">{overview ? overview.topics.length : '…'}</span></h2>
        {overview && (overview.topics.length || overview.loose.notes ? (
          <ul className="info-list">
            {overview.topics.map((x) => (
              <li key={x.id}><button className="info-row" onClick={() => go({ page: 'topic', rid, tid: x.id })}>
                <span className="info-row-title">{x.star && <><StarIcon on /> </>}{x.title}</span><Counts by={x.byStatus} />
              </button></li>
            ))}
            {overview.loose.notes > 0 && <li><button className="info-row" onClick={() => go({ page: 'topic', rid, tid: LOOSE_TOPIC_ID })}>
              <span className="info-row-title muted">{LOOSE_NOTES_LABEL}</span><Counts by={overview.loose.byStatus} />
            </button></li>}
          </ul>
        ) : <p className="muted">{t('주제와 노트가 없습니다', 'No topics or notes')}</p>)}
      </section>

      <section className="info-sec" data-ui="최근 기록">
        <h2>{t('최근 기록', 'Recent journal')} <span className="muted">{t(`${RECENT_DAYS}일`, `${RECENT_DAYS} days`)}</span><button className="a info-more" onClick={() => go({ page: 'log', rid })}>{t('작업 일지 ›', 'Journal ›')}</button></h2>
        {!loaded && !entries.length ? <p className="muted">{t('읽는 중…', 'Loading…')}</p> : !recent.length ? <p className="muted">{t('최근 기록이 없습니다', 'No recent entries')}</p> : (
          <ul className="info-list">
            {recent.map((e) => <li key={`${e.date}-${e.index}`} className="info-row static"><span className="info-row-title">{e.text.split('\n')[0]}</span><span className="muted info-row-meta">{monthDay(e.date, true)} {e.time}</span></li>)}
          </ul>
        )}
      </section>

      <details className="info-raw" data-ui="현황 원문">
        <summary>{t('에이전트가 읽는 원문 보기 (STATUS.md)', 'Show the text agents read (STATUS.md)')}</summary>
        <div className="info-status">
          {text === undefined ? <p className="muted">{t('읽는 중…', 'Loading…')}</p>
            : text === null ? <p className="muted">{t('현황을 읽지 못했습니다', 'Could not read the status')}</p>
            : <ObsidianMarkdown text={splitStatus(text).status} />}
        </div>
      </details>
    </InfoShell>
  )
}

/** 결정의 status가 끝난 것(뒤집힘·닫힘)이면 흐리게 */
const ENDED = new Set(['superseded', 'closed'])

/**
 * 프로젝트 정보 › 규칙: 에이전트가 이 저장소에서 먼저 읽는 규칙. 저장소의 AGENTS.md · CLAUDE.md와 STATUS.md의 규칙 절,
 * 그리고 그 근거가 된 결정(`workbench/decisions/`, 10/15 "결정은 규칙 쪽 아래에"). 예전 이름 "AGENTS.md" 쪽 (data-ui는 그대로).
 */
export function AgentsPage({ rid, rapi, version }: { rid: string; rapi: ResearchApi; version: number }) {
  const text = useStatusText(rid, rapi)
  const [got, setGot] = useState<AgentRules | null | undefined>(undefined)
  useEffect(() => { rapi.agentRules().then(setGot).catch(() => setGot(null)) }, [rapi, version])
  const files = got === undefined ? undefined : got?.files ?? null
  const decisions = got?.decisions ?? []
  const rules = text ? splitStatus(text).rules : ''
  return (
    <InfoShell ui="AGENTS.md">
      <SubHead title={t('규칙', 'Rules')} desc={t('에이전트가 이 저장소에서 일하기 전에 읽는 규칙입니다. 고치려면 저장소의 파일을 고칩니다.', 'Rules agents read before working in this repository. To change them, edit the files in the repository.')} />
      <div className="info-status">
        {files === undefined ? <p className="muted">{t('읽는 중…', 'Loading…')}</p>
          : !files?.length ? <p className="muted">{t('저장소 맨 위에 AGENTS.md가 없습니다', 'No AGENTS.md at the top of the repository')}</p>
          : files.map((f) => <div key={f.file} className="info-rule-file"><h3><code>{f.file}</code></h3><ObsidianMarkdown text={f.text} /></div>)}
        {rules && <div className="info-rule-file"><h3>{t('함께 읽는 규칙', 'Rules read with it')} <span className="muted">{t('STATUS.md의 규칙 절', 'Rule sections of STATUS.md')}</span></h3><ObsidianMarkdown text={rules} /></div>}
      </div>
      <section className="info-sec" data-ui="결정">
        <h2>{t('결정', 'Decisions')} <span className="muted"><code>workbench/decisions/</code> · {got ? decisions.length : '…'}</span></h2>
        <p className="muted info-note">{t('규칙이 왜 그런지 적은 기록입니다. 뒤집을 때는 고치지 않고 새 결정을 씁니다.', 'Records of why the rules are the way they are. To reverse one, write a new decision instead of editing it.')}</p>
        {got && (decisions.length ? (
          <ul className="info-list">
            {[...decisions].reverse().map((d) => {
              const date = /^(\d{4}-\d{2}-\d{2})-/.exec(d.file.split('/').pop() ?? '')?.[1]
              return <li key={d.file} className={`info-row static${ENDED.has(d.status) ? ' ended' : ''}`} title={d.file}>
                <span className="info-row-title">{d.title}</span>
                <span className="muted info-row-meta">{[d.status && reviewStatusLabel(d.status), date].filter(Boolean).join(' · ')}</span>
              </li>
            })}
          </ul>
        ) : <p className="muted">{t('이 프로젝트에는 결정 기록이 없습니다', 'This project has no decision records')}</p>)}
      </section>
    </InfoShell>
  )
}

/**
 * 저장소의 지금 상태와 「동기화하기」 · 「main 브랜치로 돌리기」. 화면 캐시(qk.repo)에 두어 현황의 동기화 줄,
 * 저장소 쪽, 사이드바 저장소 줄의 ↓↑가 같은 값을 본다. .git 안의 변화는 파일 알림이 없어 1분마다, 그리고 version이 오를 때 다시 읽는다
 */
export interface RepoState { repo: RepoInfo | null | undefined; checking: boolean; updateError: string | null; sync(): void; toMain(): void }
export function useRepoInfo(rapi: ResearchApi) {
  return useQuery({ queryKey: qk.repo(rapi.rid), queryFn: () => rapi.repo().catch(() => null), refetchInterval: 60_000 })
}
export function useRepoState(rapi: ResearchApi, version: number): RepoState {
  const client = useQueryClient()
  const repo = useRepoInfo(rapi).data
  const [checking, setChecking] = useState(false)
  const [, tick] = useState(0)
  const reread = () => client.invalidateQueries({ queryKey: qk.repo(rapi.rid) })
  useEffect(() => { if (version) void reread() }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
  // "N분 전"이 흘러가게
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(t) }, [])
  const [updateError, setUpdateError] = useState<string | null>(null)
  const run = (call: () => Promise<unknown>) => {
    setChecking(true); setUpdateError(null)
    call().catch((e: Error) => setUpdateError(e.message)).then(reread).finally(() => setChecking(false))
  }
  return { repo, checking, updateError, sync: () => run(() => rapi.syncNow()), toMain: () => run(() => rapi.toMain()) }
}

/**
 * workbench/가 git에 없을 때의 안내 (10/30 "워크벤치 폴더를 만들자 · 등록되면 폴더 개설을 권장하는 안내"):
 * 이 컴퓨터에만 있어 다른 컴퓨터 · 클라우드의 에이전트가 노트와 흐름을 보지 못한다. 「커밋하고 올리기」는 workbench/ 안만 커밋해 올린다.
 * 등록 직후 여는 첫 화면과 현황 맨 위에 둔다
 */
export function WorkbenchUpload({ rapi }: { rapi: ResearchApi }) {
  const client = useQueryClient()
  const repo = useRepoInfo(rapi).data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!repo || repo.state !== 'ok' || !repo.workbenchUnpublished) return null
  const upload = () => {
    setBusy(true); setError(null)
    rapi.publishWorkbench()
      .catch((e: Error) => setError(e.message))
      .then(() => client.invalidateQueries({ queryKey: qk.repo(rapi.rid) }))
      .finally(() => setBusy(false))
  }
  return (
    <section className="info-sync wb-upload" data-ui="workbench 올리기 안내">
      <span className="turn-dot" aria-hidden />
      <span className="wb-upload-text">
        <b><code>workbench/</code>{t(' 폴더가 아직 GitHub에 없습니다.', ' is not on GitHub yet.')}</b>{' '}
        <span className="muted">{repo.remote
          ? t('이 컴퓨터에만 있어 다른 컴퓨터와 클라우드의 에이전트가 노트 · 흐름 · 기록을 보지 못합니다. 올리면 workbench/ 안의 파일만 커밋합니다.', 'It exists only on this computer, so other computers and cloud agents cannot see the notes, flow or records. Uploading commits only the files inside workbench/.')
          : t('이 저장소에 GitHub 주소(원격)가 없어 올릴 수 없습니다. 터미널에서 git remote add로 연결한 뒤 올려 주세요.', 'This repository has no GitHub address (remote), so it cannot be uploaded. Link one with git remote add in a terminal first.')}</span>
      </span>
      {repo.remote && <button className="btn primary" data-ui="커밋하고 올리기" disabled={busy} onClick={upload}>{busy ? t('올리는 중…', 'Uploading…') : t('커밋하고 올리기', 'Commit and upload')}</button>}
      {error && <span className="repo-err info-sync-err">! {error}</span>}
    </section>
  )
}

/** 동기화하기 아이콘 버튼 (10/28 안 C: 현황 한 곳에만). 도는 화살표 둘, 도는 동안 돈다 */
const SYNC_TIP = () => t('동기화하기: GitHub를 확인하고, 새 커밋은 받고 이 컴퓨터에만 있는 커밋은 올립니다. 커밋 안 한 변경은 그대로 두고, 합쳐야 하면 멈춥니다', 'Sync: check GitHub, pull new commits and push commits only on this computer. Uncommitted changes stay as they are; stops if a merge is needed')
export function SyncButton({ state }: { state: RepoState }) {
  return <button className={`icon-btn repo-sync${state.checking ? ' busy' : ''}`} disabled={state.checking} aria-label={state.checking ? t('동기화하는 중', 'Syncing') : t('동기화하기', 'Sync')} title={SYNC_TIP()} data-ui="동기화하기" onClick={state.sync}>{Icon.sync}</button>
}

/** 받을 · 올릴 커밋 수 (사이드바 저장소 줄과 현황 동기화 줄) */
export const repoBehindAhead = (repo: RepoInfo | null | undefined) =>
  repo?.state === 'ok' && repo.remote && repo.ahead != null && repo.behind != null ? { behind: repo.behind, ahead: repo.ahead } : null

/**
 * 현황 맨 위의 동기화 줄 (10/28 시안 2절 안 C, 사용자 "C로 하자. 동기화하기는 아이콘으로"):
 * GitHub와 같은지 · 커밋 안 한 변경 · 마지막 확인과 동기화 아이콘. 프로젝트를 열면 먼저 보이는 곳이라 일을 시작하고 끝낼 때 받고 올린다
 */
function SyncLine({ rid, rapi }: { rid: string; rapi: ResearchApi }) {
  const state = useRepoState(rapi, 0)
  const { repo, updateError } = state
  if (!repo || repo.state !== 'ok' || !repo.remote) return null
  const ba = repoBehindAhead(repo)
  const changes = (repo.dirty ?? 0) + (repo.untracked ?? 0)
  const compare = !ba ? <span className="muted">{t('GitHub 브랜치를 따라가지 않음', 'Not tracking a GitHub branch')}</span>
    : !ba.ahead && !ba.behind ? <span><span className="repo-ok">✓</span> {t('GitHub와 같음', 'Same as GitHub')}</span>
      : <span>{(ba.ahead || ba.behind) && <span className="turn-dot" aria-hidden />} {[ba.behind ? t(`GitHub에 새 커밋 ${ba.behind}`, `${plural(ba.behind, 'new commit')} on GitHub`) : '', ba.ahead ? t(`올리지 않은 커밋 ${ba.ahead}`, plural(ba.ahead, 'unpushed commit')) : ''].filter(Boolean).join(' · ')}
        {!!ba.behind && !!ba.ahead && <span className="muted">{t(' — 양쪽에 새 커밋이 있어 터미널의 git pull로 합쳐 주세요', '. Both sides have new commits; merge with git pull in a terminal')}</span>}</span>
  return (
    <section className="info-sync" data-ui="동기화 줄" id="sync">
      {compare}
      {changes > 0 && <span className="muted">{t(`커밋 안 한 변경 ${changes}`, plural(changes, 'uncommitted change'))}</span>}
      {repo.fetchedAt && <span className="muted">{t(`${relativeTime(repo.fetchedAt)} 확인`, `checked ${relativeTime(repo.fetchedAt)}`)}</span>}
      <span className="sp" />
      <button className="a" title={t('저장소 쪽: 폴더 · 브랜치 · 모든 파일', 'Repository: folder, branch, every file')} onClick={() => go({ page: 'repo', rid })}>{t('저장소 ›', 'Repository ›')}</button>
      <SyncButton state={state} />
      {updateError && <span className="repo-err info-sync-err">! {updateError}</span>}
      {repo.fetchError && <span className="repo-err info-sync-err" title={repo.fetchDetail}>! {repo.fetchError}</span>}
    </section>
  )
}

/** summary.root는 workbench/ 폴더다. 보여 줄 것은 그 위의 저장소 폴더 */
const repoFolder = (root: string) => root.replace(/\/workbench\/?$/, '')

/**
 * 저장소 쪽 맨 위 한 줄 (10/28 시안 1-2절): 폴더 · 브랜치 · GitHub와 같은지 · 커밋 안 한 변경. 동기화하기는 현황에만(10/28 안 C).
 * 원격 · 마지막 커밋 같은 자세한 것은 RepoDetails (「자세히」로 펼침)
 */
/** 저장소 쪽 맨 위 줄. GitHub와 다르면 「현황에서 동기화 ›」: 동기화 버튼은 현황 한 곳에만 둔다 (10/29 결정) */
export function RepoBrief({ state, root, rid }: { state: RepoState; root: string; rid?: string }) {
  const { repo, checking, toMain, updateError } = state
  const folder = repoFolder(root)
  const name = <span className="repo-brief-folder" title={folder}><span className="muted">{t('폴더', 'Folder')}</span> <code>{folder.split('/').pop()}</code></span>
  if (repo === undefined) return <span className="repo-brief">{name}<span className="muted">{t('읽는 중…', 'Loading…')}</span></span>
  if (repo === null || repo.state !== 'ok') return <span className="repo-brief">{name}<span className="muted">{repo === null ? t('저장소 정보를 읽지 못했습니다', 'Could not read repository info') : repo.state === 'none' ? t('git 저장소가 아닙니다', 'Not a git repository') : t('다른 저장소 안의 폴더', 'A folder inside another repository')}</span></span>
  const changes = (repo.dirty ?? 0) + (repo.untracked ?? 0)
  const compare = !repo.remote ? <span className="muted">{t('원격 없음', 'No remote')}</span>
    : repo.upstream == null || repo.ahead == null || repo.behind == null ? <span className="muted">{t('GitHub 브랜치를 따라가지 않음', 'Not tracking a GitHub branch')}</span>
      : !repo.ahead && !repo.behind ? <span><span className="repo-ok">✓</span> {t('GitHub와 같음', 'Same as GitHub')}</span>
        : <span>{[repo.behind ? t(`GitHub에 새 커밋 ${repo.behind}`, `${plural(repo.behind, 'new commit')} on GitHub`) : '', repo.ahead ? t(`올리지 않은 커밋 ${repo.ahead}`, plural(repo.ahead, 'unpushed commit')) : ''].filter(Boolean).join(' · ')}</span>
  return (
    <span className="repo-brief">
      {name}
      {repo.branch ? <span><span className="muted">{t('브랜치', 'Branch')}</span> <code>{repo.branch}</code>{repo.defaultBranch && <ToMain repo={repo} main={repo.defaultBranch} busy={checking} onRun={toMain} />}</span>
        : <span className="muted">{t('브랜치가 아님', 'Not on a branch')}</span>}
      {compare}
      {rid && (!!repo.ahead || !!repo.behind) && <button className="a" data-ui="현황에서 동기화" title={t('동기화 버튼은 현황 맨 위에 있습니다', 'The sync button is at the top of Status')} onClick={() => go({ page: 'status', rid })}>{t('현황에서 동기화 ›', 'Sync from Status ›')}</button>}
      {changes > 0 && <span className="muted"><span className="fv-mod" aria-hidden /> {t(`커밋 안 한 변경 ${changes}`, plural(changes, 'uncommitted change'))}</span>}
      {updateError && <span className="repo-err">! {updateError}</span>}
      {repo.fetchError && <span className="repo-err" title={repo.fetchDetail}>! {repo.fetchError}</span>}
    </span>
  )
}

/**
 * 저장소 자세히: 폴더, 브랜치, GitHub 주소, 마지막 커밋, 커밋 안 한 변경, GitHub와 같은지 (10/4 19:25 피드백 "깃도 포함시키고 최신상태 여부도").
 * "동기화하기"(현황 맨 위 아이콘, 10/28 안 C) 하나로 GitHub를 확인하고 받거나 올린다(10/28 07:37 "버튼만 누르면 동기화"). 받기는 홈 카드와 같은 빨리 감기만,
 * 올리기는 이 컴퓨터에만 있는 커밋만. 양쪽에 새 커밋이 있으면 합치지 않고, 커밋 안 한 변경은 커밋하지 않는다.
 * 기본 브랜치가 아닌 브랜치에 있으면 "main으로 돌리기"(아무것도 잃지 않을 때만).
 */
export function RepoDetails({ state, root }: { state: RepoState; root: string }) {
  const { repo, checking, toMain, updateError } = state
  const folder = <><dt>{t('폴더', 'Folder')}</dt><dd><PathName path={repoFolder(root)} /></dd></>
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
          {repo.upstream ? <span className="muted"> · {t('따라가는 브랜치', 'Tracking')} {repo.upstream}</span> : <span className="muted"> · {t('GitHub 브랜치를 따라가지 않음', 'Not tracking a GitHub branch')}</span>}
          {repo.defaultBranch && <ToMain repo={repo} main={repo.defaultBranch} busy={checking} onRun={toMain} />}</span>
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
      <dd data-ui="GitHub와 비교"><RepoCompare repo={repo} updateError={updateError} /></dd>
    </dl>
  )
}

/** 기본 브랜치가 아닌 브랜치에 있을 때: 「main으로 돌리기」. 잃을 것이 있으면 버튼 대신 까닭 (10/28) */
function ToMain({ repo, main, busy, onRun }: { repo: RepoInfo; main: string; busy: boolean; onRun(): void }) {
  const why = repo.dirty || repo.untracked ? t('커밋 안 한 변경이 있어 돌리지 않습니다', 'Not switched: there are uncommitted changes')
    : repo.ahead ? t('GitHub에 올리지 않은 커밋이 있어 돌리지 않습니다', 'Not switched: some commits are not on GitHub') : null
  return <span className="repo-main"> {why
    ? <span className="muted">· {t(`${main} 브랜치가 아님 — ${why}`, `Not on ${main}. ${why}`)}</span>
    : <button className="btn sm" disabled={busy} title={t(`${main} 브랜치로 돌립니다. 이 브랜치의 커밋은 모두 GitHub에 있어 잃는 것이 없습니다`, `Switch to ${main}. Every commit on this branch is on GitHub, so nothing is lost`)} onClick={onRun}>{t(`${main} 브랜치로 돌리기`, `Switch to ${main}`)}</button>}</span>
}

/** GitHub와 같은지 한 줄. 동기화하기는 현황에만(10/28 안 C). 결과 줄은 성공 ✓, 오류 ! (디자인 시스템 4절) */
function RepoCompare({ repo, updateError }: { repo: RepoInfo; updateError: string | null }) {
  if (!repo.remote) return <span className="muted">{t('원격 저장소가 없어 비교할 수 없습니다', 'No remote repository to compare with')}</span>
  const when = repo.fetchedAt ? t(`마지막 확인 ${relativeTime(repo.fetchedAt)}`, `Last checked ${relativeTime(repo.fetchedAt)}`) : t('아직 확인하지 않았습니다 — 앞서 받아 둔 기록과 비교한 것입니다', 'Not checked yet. Compared with the history fetched earlier')
  let line: ReactNode
  if (repo.upstream == null || repo.ahead == null || repo.behind == null) line = <span className="muted">{repo.branch ? t(`${repo.branch} 브랜치가 GitHub 브랜치를 따라가지 않아 비교할 수 없습니다`, `Cannot compare: branch ${repo.branch} does not track a GitHub branch`) : t('브랜치가 아니라 비교할 수 없습니다', 'Cannot compare: not on a branch')}</span>
  else if (!repo.ahead && !repo.behind) line = <span><span className="repo-ok">✓</span> {t('GitHub와 같습니다', 'Same as GitHub')}</span>
  else line = <span>{[repo.behind ? t(`GitHub에 새 커밋 ${repo.behind}개`, `${plural(repo.behind, 'new commit')} on GitHub`) : '', repo.ahead ? t(`올리지 않은 커밋 ${repo.ahead}개`, plural(repo.ahead, 'unpushed commit')) : ''].filter(Boolean).join(' · ')}
    {!!repo.behind && !!repo.ahead && <span className="muted">{t(' — 양쪽에 새 커밋이 있어 합쳐야 합니다. 앱은 합치지 않으니 터미널의 git pull로 합쳐 주세요', '. Both sides have new commits and need merging; the app does not merge, so use git pull in a terminal')}</span>}</span>
  return (
    <div className="repo-compare">
      <div className="repo-line">{line}</div>
      {updateError && <span className="repo-err">! {updateError}</span>}
      {repo.fetchError
        ? <span className="repo-err" title={repo.fetchDetail}>! {repo.fetchError}. {t('앞서 받아 둔 기록과 비교한 것입니다', 'Compared with the history fetched earlier')}</span>
        : <span className="muted">{when}</span>}
    </div>
  )
}
