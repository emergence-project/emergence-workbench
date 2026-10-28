import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { api, type ProjectInfo, type RepoTree } from './api'
import { plural, t } from './i18n'
import { useProjectInfo } from './projectQueries'
import { qk } from './queries'
import { type Route } from './router'
import { store } from './store'

/**
 * 저장소의 파일 나무 (왼쪽 사이드바 「파일」 탭, 10/28 시안 6절). 나무는 이 한 곳에만 두고, 누르면 저장소 쪽이 그 파일을 탭으로 연다.
 * 폴더 옆 회색 말은 앱에서 그것이 무엇인지(주제 · 노트 · 흐름 점 · 기록 · 규칙 · 참고문헌 …), 주황 점은 커밋 안 한 변경.
 * 지금 연 파일(저장소 쪽의 탭, 또는 지금 연 노트 · 파일 탭)이 골라져 있고 그 위 폴더는 펼쳐진다. 펼친 폴더는 프로젝트마다 기억한다.
 */

export interface Dir { name: string; path: string; dirs: Map<string, Dir>; files: { name: string; path: string; size: number }[] }
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

const OPEN_KEY = (rid: string) => `rw-repo-open-${rid}`

export function FileTree({ rid, current, onOpen }: { rid: string; current: string | null; onOpen(path: string): void }) {
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree() })
  const sources = useProjectInfo(rid).data?.sources
  const [open, setOpen] = useState<Set<string>>(() => new Set(store.get<string[]>(OPEN_KEY(rid), ['workbench'])))
  const [query, setQuery] = useState('')
  useEffect(() => store.set(OPEN_KEY(rid), [...open]), [rid, open])
  // 지금 연 파일의 위 폴더를 펼친다
  useEffect(() => {
    if (!current) return
    const seg = current.split('/').slice(0, -1)
    const ups = seg.map((_, i) => seg.slice(0, i + 1).join('/'))
    setOpen((s) => (ups.every((p) => s.has(p)) ? s : new Set([...s, ...ups])))
  }, [current])
  useEffect(() => {
    document.querySelector<HTMLElement>('.fv-tree .fv-row.on')?.scrollIntoView({ block: 'nearest' })
  }, [current, tree.data])

  const data = tree.data
  const root = useMemo(() => (data ? buildTree(data.files) : null), [data])
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
        aria-current={current === f.path ? 'true' : undefined} onClick={() => onOpen(f.path)}>
        <span className="fv-name">{showPath ? f.path : f.name}</span>
        {changed.has(f.path) && <span className="fv-mod" role="img" aria-label={t('커밋 안 한 변경', 'Uncommitted change')} />}
        {m && <span className="fv-mean">{m.label}</span>}
      </button>
    )
  }
  const dirRows = (d: Dir, depth: number): ReactNode[] => {
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

  return (
    <div className="fv-side" data-ui="파일 나무">
      <input className="fv-find" type="search" data-ui="파일 찾기" value={query} placeholder={t('파일 이름 찾기', 'Find a file name')} aria-label={t('파일 이름 찾기', 'Find a file name')} onChange={(e) => setQuery(e.target.value)} />
      <nav className="fv-tree" aria-label={t('파일 나무', 'File tree')}>
        {tree.error ? <p className="empty">{(tree.error as Error).message}</p>
          : !root ? <p className="muted fv-pad">{t('읽는 중…', 'Reading…')}</p>
            : found ? (found.length ? found.map((f) => fileRow({ name: f.path, path: f.path }, 0, true)) : <p className="muted fv-pad">{t('맞는 파일이 없습니다', 'No matching files')}</p>)
              : dirRows(root, 0)}
      </nav>
      {data && <p className="fv-count muted">{data.source === 'git'
        ? t(`git이 추적하는 파일과 새 파일 ${data.files.length}개`, `${plural(data.files.length, 'file')} tracked by git or new`)
        : t(`폴더의 파일 ${data.files.length}개`, `${plural(data.files.length, 'file')} in the folder`)}{data.truncated ? t(' (앞부분만)', ' (first part only)') : ''}</p>}
    </div>
  )
}
