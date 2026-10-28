import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type ProjectInfo, type RepoTree, type ResearchApi } from './api'
import { FileTree, meaningOf } from './FileTree'
import { flash } from './flash'
import { t } from './i18n'
import { takeRepoWant, useRepoPage, useRepoWant, useSideShown } from './noteScreen'
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
 * 그 아래는 VS Code처럼 연 파일이 탭으로 쌓인다. 폴더 나무는 왼쪽 사이드바의 「파일」 탭 한 곳에만 있다(FileTree.tsx, 사이드바를 접으면 본문 왼쪽).
 * 읽기만 한다(고치기 · 옮기기 · 지우기 없음). "탭으로 열기"는 작업 화면의 읽기 전용 파일 탭으로 연다.
 */

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
  const side = useSideShown()
  // 연 파일 탭 (VS Code처럼). 프로젝트마다 기억한다
  const [tabs, setTabs] = useState<string[]>(() => store.get<string[]>(TABS_KEY(rid), []))
  const [picked, setPicked] = useState<string | null>(() => tabs[0] ?? null)

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
  useRepoPage(rid, current)
  const openFile = (path: string) => { setTabs((prev) => (prev.includes(path) ? prev : [...prev, path])); setPicked(path) }
  // 왼쪽 「파일」 탭에서 누른 파일
  const want = useRepoWant()
  useEffect(() => {
    if (!want || want.rid !== rid) return
    setTabs((prev) => (prev.includes(want.path) ? prev : [...prev, want.path])); setPicked(want.path); takeRepoWant()
  }, [want, rid])
  const closeTab = (path: string) => {
    const i = tabs.indexOf(path)
    const rest = tabs.filter((p) => p !== path)
    setTabs(rest)
    if (current === path) setPicked(rest[Math.min(i, rest.length - 1)] ?? null)
  }
  const name = (p: string) => p.split('/').pop() ?? p

  return (
    <div className="ws-doc files-page" data-ui="저장소 쪽">
      <div className="pane-head repo-strip" data-ui="저장소 상태 줄">
        <RepoBrief state={repo} root={root} rid={rid} />
        <span className="sp" />
        <button className="btn sm" aria-expanded={more} onClick={() => setMore((v) => !v)}>{more ? t('자세히 접기', 'Hide details') : t('자세히', 'Details')}</button>
      </div>
      {more && <section className="info-sec repo-more" data-ui="저장소 정보"><RepoDetails state={repo} root={root} /></section>}
      <div className="fv-body">
        {!side && <FileTree rid={rid} current={current} onOpen={openFile} />}
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
