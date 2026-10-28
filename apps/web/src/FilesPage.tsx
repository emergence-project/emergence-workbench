import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { api, type ProjectInfo, type RepoTree, type ResearchApi } from './api'
import { flash } from './flash'
import { plural, t } from './i18n'
import { useSideTree } from './noteScreen'
import { RepoBrief, RepoDetails, useRepoState } from './ProjectInfoPage'
import { useProjectInfo } from './projectQueries'
import { qk } from './queries'
import { useRepoFile } from './repoPaths'
import { RepoFileBody } from './RepoFileTab'
import { go, type Route } from './router'
import { store } from './store'

/**
 * 프로젝트 정보 › 저장소 (10/28 08:28 · 17:22 · 17:28, 시안 1-2절: 예전 저장소 쪽과 파일 쪽을 합침).
 * 맨 위 한 줄은 저장소 상태(폴더 · 브랜치 · GitHub와 같은지 · 동기화하기, 「자세히」로 원격 · 마지막 커밋),
 * 그 아래는 VS Code처럼 연 파일이 탭으로 쌓인다. 폴더 나무는 왼쪽 사이드바의 「목차」 탭에 있다(사이드바를 접으면 본문 왼쪽).
 * 읽기만 한다(고치기 · 옮기기 · 지우기 없음). 폴더 옆 회색 말은 앱에서 그것이 무엇인지(주제 · 노트 · 흐름 점 · 기록 · 규칙 · 참고문헌 …),
 * 주황 점은 커밋 안 한 변경. "탭으로 열기"는 작업 화면의 읽기 전용 파일 탭으로 연다.
 */

interface Dir { name: string; path: string; dirs: Map<string, Dir>; files: { name: string; path: string; size: number }[] }
interface Meaning { label: string; to?: Route }

function buildTree(files: RepoTree['files']): Dir {
  const root: Dir = { name: '', path: '', dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let d = root
    for (const p of parts.slice(0, -1)) {
      let next = d.dirs.get(p)
      if (!next) { next = { name: p, path: d.path ? `${d.path}/${p}` : p, dirs: new Map(), files: [] }; d.dirs.set(p, next) }
      d = next
    }
    d.files.push({ name: parts[parts.length - 1]!, path: f.path, size: f.size })
  }
  return root
}

/** 앱에서 이 경로가 무엇인지 (모르는 것은 null). 폴더는 바로 아래 개수를 붙인다 */
export function meaningOf(rid: string, path: string, dir: Dir | null, sources: ProjectInfo['sources'] | undefined): Meaning | null {
  const n = (k: number) => (k ? ` ${k}` : '')
  const kids = dir ? dir.files.length : 0
  const subdirs = dir ? dir.dirs.size : 0
  const seg = path.split('/')
  if (seg[0] === 'workbench') {
    const [, a, b, c] = seg
    if (seg.length === 1) return { label: t('앱 기록', 'App records') }
    if (a === 'research.yaml') return { label: t('프로젝트 정보', 'Project info'), to: { page: 'info', rid } }
    if (a === 'topics' && seg.length === 2) return { label: t(`주제${n(subdirs)}`, `Topics${n(subdirs)}`) }
    if (a === 'topics' && b && seg.length === 3 && dir) return { label: t('주제', 'Topic'), to: { page: 'topic', rid, tid: b } }
    if (a === 'topics' && c && seg.length === 4 && dir) return { label: t('노트', 'Note') }
    if (a === 'notes' && seg.length === 2) return { label: t(`노트${n(subdirs)}`, `Notes${n(subdirs)}`) }
    if (a === 'notes' && b && seg.length === 3 && dir) return { label: t('노트', 'Note') }
    if (seg.length === 2 && dir) {
      if (a === 'flow') return { label: t(`흐름 점${n(kids)}`, `Flow dots${n(kids)}`), to: { page: 'flow', rid } }
      if (a === 'comments') return { label: t(`기록${n(kids)}`, `Records${n(kids)}`), to: { page: 'records', rid } }
      if (a === 'tasks') return { label: t(`맡긴 일${n(kids)}`, `Delegated tasks${n(kids)}`), to: { page: 'records', rid } }
      if (a === 'log') return { label: t(`일지${n(kids)}`, `Journal${n(kids)}`), to: { page: 'records', rid } }
      if (a === 'decisions') return { label: t(`결정${n(kids)}`, `Decisions${n(kids)}`), to: { page: 'agents', rid } }
      if (a === 'rules') return { label: t('규칙', 'Rules'), to: { page: 'agents', rid } }
      if (a === 'figures') return { label: t('그림', 'Figures') }
    }
  }
  if (path === 'AGENTS.md' || path === 'CLAUDE.md') return { label: t('규칙', 'Rules'), to: { page: 'agents', rid } }
  if (sources) {
    const hit = (xs: string[]) => xs.some((x) => x.replace(/\/$/, '') === path)
    if (hit(sources.canon.map((c) => c.path))) return { label: t('정본 문서', 'Canonical document') }
    if (hit(sources.bib)) return { label: t('참고문헌', 'References') }
    if (hit(sources.materials)) return { label: t('자료', 'Materials') }
    if (hit(sources.reviews)) return { label: t('검토 문서', 'Review documents') }
    if (sources.tasks && hit([sources.tasks])) return { label: t('작업 목록', 'Task list') }
  }
  return null
}

const kb = (size: number) => (size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`)

/** 처음 고를 파일: README, 없으면 research.yaml */
const firstPick = (files: RepoTree['files']) =>
  files.find((f) => /^readme\.md$/i.test(f.path))?.path ?? files.find((f) => f.path === 'workbench/research.yaml')?.path ?? null

const TABS_KEY = (rid: string) => `rw-repo-tabs-${rid}`

export function FilesPage({ rid, rapi, root, version }: { rid: string; rapi: ResearchApi; root: string; version: number }) {
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree(), refetchOnMount: 'always' })
  const sources = useProjectInfo(rid).data?.sources
  const repo = useRepoState(rapi, version)
  const [more, setMore] = useState(false)
  const { slot, side } = useSideTree()
  const [open, setOpen] = useState<Set<string>>(() => new Set(['workbench']))
  // 연 파일 탭 (VS Code처럼). 프로젝트마다 기억한다
  const [tabs, setTabs] = useState<string[]>(() => store.get<string[]>(TABS_KEY(rid), []))
  const [picked, setPicked] = useState<string | null>(() => tabs[0] ?? null)
  const [query, setQuery] = useState('')

  const data = tree.data
  // 저장소에 없는 파일의 탭은 지우고, 처음이면 README(없으면 research.yaml)를 연다
  useEffect(() => {
    if (!data) return
    const have = new Set(data.files.map((f) => f.path))
    setTabs((prev) => {
      const kept = prev.filter((p) => have.has(p))
      const first = firstPick(data.files)
      return kept.length ? kept : first ? [first] : []
    })
  }, [data])
  useEffect(() => store.set(TABS_KEY(rid), tabs), [rid, tabs])
  const current = picked && tabs.includes(picked) ? picked : tabs[0] ?? null
  const openFile = (path: string) => { setTabs((prev) => (prev.includes(path) ? prev : [...prev, path])); setPicked(path) }
  const closeTab = (path: string) => {
    const i = tabs.indexOf(path)
    const rest = tabs.filter((p) => p !== path)
    setTabs(rest)
    if (current === path) setPicked(rest[Math.min(i, rest.length - 1)] ?? null)
  }

  const root_ = useMemo(() => (data ? buildTree(data.files) : null), [data])
  // 바뀐 파일과 그 위 폴더 모두에 점
  const changed = useMemo(() => {
    const s = new Set<string>()
    for (const p of data?.changed ?? []) { const seg = p.split('/'); for (let i = 1; i <= seg.length; i++) s.add(seg.slice(0, i).join('/')) }
    return s
  }, [data])
  const q = query.trim().toLowerCase()
  const found = q && data ? data.files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 300) : null

  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })

  const fileRow = (f: { name: string; path: string }, depth: number, showPath = false) => {
    const m = meaningOf(rid, f.path, null, sources)
    return (
      <button key={f.path} className={`fv-row file${current === f.path ? ' on' : ''}`} style={{ '--fv-depth': depth } as CSSProperties} title={f.path}
        aria-current={current === f.path ? 'true' : undefined} onClick={() => openFile(f.path)}>
        <span className="fv-name">{showPath ? f.path : f.name}</span>
        {changed.has(f.path) && <span className="fv-mod" role="img" aria-label={t('커밋 안 한 변경', 'Uncommitted change')} />}
        {m && <span className="fv-mean">{m.label}</span>}
      </button>
    )
  }
  const dirRows = (d: Dir, depth: number): React.ReactNode[] => {
    const dirs = [...d.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
    const files = [...d.files].sort((a, b) => a.name.localeCompare(b.name))
    return [
      ...dirs.flatMap((x) => {
        const opened = open.has(x.path)
        const m = meaningOf(rid, x.path, x, sources)
        return [
          <button key={x.path} className={`fv-row dir${opened ? ' open' : ''}`} style={{ '--fv-depth': depth } as CSSProperties} aria-expanded={opened} title={x.path} onClick={() => toggle(x.path)}>
            <span className="fv-chev" aria-hidden>›</span><span className="fv-name">{x.name}/</span>
            {changed.has(x.path) && <span className="fv-mod" role="img" aria-label={t('커밋 안 한 변경이 있음', 'Has uncommitted changes')} />}
            {m && <span className="fv-mean">{m.label}</span>}
          </button>,
          ...(opened ? dirRows(x, depth + 1) : []),
        ]
      }),
      ...files.map((f) => fileRow(f, depth)),
    ]
  }

  const treeView = (
    <div className="fv-side" data-ui="파일 나무">
      <input className="fv-find" type="search" data-ui="파일 찾기" value={query} placeholder={t('파일 이름 찾기', 'Find a file name')} aria-label={t('파일 이름 찾기', 'Find a file name')} onChange={(e) => setQuery(e.target.value)} />
      <nav className="fv-tree" aria-label={t('파일 나무', 'File tree')}>
        {tree.error ? <p className="empty">{(tree.error as Error).message}</p>
          : !root_ ? <p className="muted fv-pad">{t('읽는 중…', 'Reading…')}</p>
            : found ? (found.length ? found.map((f) => fileRow({ name: f.path, path: f.path }, 0, true)) : <p className="muted fv-pad">{t('맞는 파일이 없습니다', 'No matching files')}</p>)
              : dirRows(root_, 0)}
      </nav>
      {data && <p className="fv-count muted">{data.source === 'git'
        ? t(`git이 추적하는 파일과 새 파일 ${data.files.length}개`, `${plural(data.files.length, 'file')} tracked by git or new`)
        : t(`폴더의 파일 ${data.files.length}개`, `${plural(data.files.length, 'file')} in the folder`)}{data.truncated ? t(' (앞부분만)', ' (first part only)') : ''}</p>}
    </div>
  )
  const name = (p: string) => p.split('/').pop() ?? p

  return (
    <div className="ws-doc files-page" data-ui="저장소 쪽">
      <div className="pane-head repo-strip" data-ui="저장소 상태 줄">
        <RepoBrief state={repo} root={root} />
        <span className="sp" />
        <button className="btn sm" aria-expanded={more} onClick={() => setMore((v) => !v)}>{more ? t('자세히 접기', 'Hide details') : t('자세히', 'Details')}</button>
      </div>
      {more && <section className="info-sec repo-more" data-ui="저장소 정보"><RepoDetails state={repo} root={root} /></section>}
      {slot && createPortal(treeView, slot)}
      <div className="fv-body">
        {!side && treeView}
        <section className="fv-main">
          {tabs.length > 0 && <div className="fv-tabs" role="tablist" data-ui="열린 파일 탭">
            {tabs.map((p) => (
              <span key={p} className={`fv-tab${p === current ? ' on' : ''}`} title={p}>
                <button role="tab" aria-selected={p === current} className="fv-tab-name" onClick={() => setPicked(p)}>{name(p)}</button>
                <button className="fv-tab-x" aria-label={t(`닫기: ${name(p)}`, `Close: ${name(p)}`)} onClick={() => closeTab(p)}>×</button>
              </span>
            ))}
          </div>}
          <Preview rid={rid} path={current} size={data?.files.find((f) => f.path === current)?.size} sources={sources} />
        </section>
      </div>
    </div>
  )
}

function Preview({ rid, path, size, sources }: { rid: string; path: string | null; size?: number; sources: ProjectInfo['sources'] | undefined }) {
  if (!path) return <section className="fv-preview" data-ui="파일 미리 보기"><p className="empty center">{t('나무에서 파일을 고르세요', 'Pick a file in the tree')}</p></section>
  return <PreviewFile key={path} rid={rid} path={path} size={size} sources={sources} />
}

function PreviewFile({ rid, path, size, sources }: { rid: string; path: string; size?: number; sources: ProjectInfo['sources'] | undefined }) {
  const file = useRepoFile(rid, path, true)
  // 앱이 아는 파일이면 그 화면으로 (노트 폴더 안 파일은 그 노트)
  const seg = path.split('/')
  const owner = seg.length >= 2 ? meaningOf(rid, seg.slice(0, -1).join('/'), { name: '', path: '', dirs: new Map(), files: [] }, sources) : null
  const own = meaningOf(rid, path, null, sources)
  const target = own?.to ? own : owner?.to ? owner : null
  return (
    <section className="fv-preview file-tab" data-ui="파일 미리 보기">
      <div className="fv-head" data-ui="미리 보기 머리줄">
        <span className="crumb fv-path" title={path}><b>{path}</b>{size !== undefined && <span className="muted"> · {kb(size)}</span>}</span>
        <span className="sp" />
        {target && <button className="btn sm" onClick={() => go(target.to!)}>{t(`${target.label}에서 보기`, `View in ${target.label}`)}</button>}
        <button className="btn sm" onClick={() => go({ page: 'file', rid, path })}>{t('탭으로 열기', 'Open in a tab')}</button>
        <button className="btn sm" onClick={() => { api.research(rid).openRepoFile(path).catch((e: Error) => flash(e.message)) }}>{t('맥 앱으로 열기', 'Open in Mac app')}</button>
      </div>
      <div className="scroll fv-content">
        {file.error ? <p className="empty center">{(file.error as Error).message}</p>
          : file.data ? <RepoFileBody rid={rid} data={file.data} /> : null}
      </div>
    </section>
  )
}
