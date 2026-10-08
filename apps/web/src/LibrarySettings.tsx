import { useCallback, useEffect, useState } from 'react'
import { api, conceptsApi, figuresApi, type FigureBrief, type LibraryInfo, type RepoInfo } from './api'
import { PdfFolderSettings } from './PdfFolderSettings'
import { plural, t } from './i18n'

export const LIBRARY_SECTIONS = [
  { id: 'library-folder', label: t('라이브러리 폴더', 'Library folder') },
  { id: 'library-knowledge', label: t('지식', 'Knowledge') },
  { id: 'library-papers', label: t('논문', 'Papers') },
  { id: 'library-figures', label: t('그림', 'Figures') },
] as const

/** 기존 읽기 API만 사용한다. 라이브러리 경로를 쓰는 공개 API는 없다. */
export function LibrarySettings({ onSaved, section }: { onSaved(message: string): void; section?: string }) {
  const [info, setInfo] = useState<LibraryInfo | null>(null)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [figures, setFigures] = useState<FigureBrief | null>(null)
  const [conceptTotal, setConceptTotal] = useState<number>()
  const [errors, setErrors] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [foldersLoaded, setFoldersLoaded] = useState(false)
  const onFoldersReady = useCallback(() => setFoldersLoaded(true), [])
  useEffect(() => {
    let active = true
    // KnowledgeList의 라이브러리 정보와 같은 색인 집계: 빈 노트 포함, 옛 LaTeX 노트 제외.
    void Promise.allSettled([api.library(), conceptsApi.libraryRepo(), figuresApi.brief(1), conceptsApi.list({ showEmpty: true, limit: 1 })]).then(([library, git, brief, concepts]) => {
      if (!active) return
      if (library.status === 'fulfilled') setInfo(library.value)
      if (git.status === 'fulfilled') setRepo(git.value)
      if (brief.status === 'fulfilled') setFigures(brief.value)
      if (concepts.status === 'fulfilled') setConceptTotal(concepts.value.total)
      setErrors([library, git, brief, concepts].flatMap((r, i) => r.status === 'rejected'
        ? [t(`${['라이브러리', 'Git 상태', '그림 수', '개념노트 수'][i]}를 읽지 못했습니다: ${String(r.reason instanceof Error ? r.reason.message : r.reason)}`, `Couldn't read ${['library', 'Git status', 'figure count', 'concept note count'][i]}: ${String(r.reason instanceof Error ? r.reason.message : r.reason)}`)] : []))
      setLoaded(true)
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (loaded && foldersLoaded) document.getElementById(section === 'library' || !section ? 'library-folder' : section)?.scrollIntoView({ block: 'start' })
  }, [section, loaded, foldersLoaded])

  return (
    <div className="library-settings" data-ui="라이브러리 관리 묶음">
      {errors.map((error) => <div key={error} className="banner danger">{error}</div>)}
      <section id="library-folder" data-ui="라이브러리 폴더">
        <div className="sec-head"><h2>{t('라이브러리 폴더', 'Library folder')}</h2></div>
        <p className="set-desc">{t('글과 작은 그림을 Git으로 보관하는 공유 라이브러리입니다.', 'A shared library that keeps text and small figures in Git.')}</p>
        {info?.path ? <ReadOnlyPath label={t('라이브러리 경로', 'Library path')} path={info.path} />
          : <p className="set-desc">{!loaded ? t('라이브러리를 읽는 중…', 'Reading the library…') : info ? t('라이브러리 폴더가 연결되지 않았습니다.', 'No library folder is linked.') : t('라이브러리 경로를 확인할 수 없습니다.', 'Couldn\'t find the library path.')}</p>}
        {info?.path && <p className="set-desc" data-ui="라이브러리 Git 상태">{!loaded ? t('Git 상태를 확인하는 중…', 'Checking Git status…') : <GitState repo={repo} />}</p>}
        <p className="set-desc" title={t('기본 설정 파일: ~/.config/research-workspace/config.yaml', 'Default settings file: ~/.config/research-workspace/config.yaml')}>{t('경로는 앱 설정 파일 ', 'The path is set in the app settings file ')}<code>config.yaml</code>{t('의 ', ', under ')}<code>library:</code>{t('에서 정합니다.', '.')}</p>
      </section>

      <section id="library-knowledge" data-ui="지식 저장">
        <div className="sec-head"><h2>{t('지식', 'Knowledge')}</h2></div>
        <p className="set-desc">{t('개념노트는 라이브러리의 ', 'Concept notes are kept in Git in the library\'s ')}<code>concepts/</code>{t('에 Git으로 보관합니다.', '.')}</p>
        {conceptTotal !== undefined && <p className="set-desc">{t(`개념노트 ${conceptTotal}개`, plural(conceptTotal, 'concept note'))}</p>}
        {info?.study ? <>
          <p className="set-desc">{t('Obsidian Study · 읽기 전용 원본', 'Obsidian Study · read-only source')}</p>
          <ReadOnlyPath label={t('Obsidian Study 경로', 'Obsidian Study path')} path={info.study} />
        </> : info && <p className="set-desc">{t('Obsidian Study가 연결되지 않았습니다.', 'Obsidian Study is not linked.')}</p>}
      </section>

      <section id="library-papers" data-ui="논문 PDF 폴더 묶음">
        <div className="sec-head"><h2>{t('논문', 'Papers')}</h2></div>
        <p className="set-desc">{t('참고문헌 ', 'References ')}<code>references.bib</code>{t('는 라이브러리에 Git으로 보관하고, PDF는 아래 폴더에 둡니다.', ' are kept in Git in the library; PDFs go in the folders below.')}</p>
        <PdfFolderSettings onSaved={onSaved} onReady={onFoldersReady} />
      </section>

      <section id="library-figures" data-ui="그림 저장">
        <div className="sec-head"><h2>{t('그림', 'Figures')}</h2></div>
        <p className="set-desc">{t('tikz · svg 원본과 작은 그림(한 장 1MB 아래)은 Git으로 보관합니다. 사진 · 스캔 폴더 연결은 나중에 지원합니다.', 'tikz and svg sources and small figures (under 1 MB each) are kept in Git. Linking photo and scan folders is coming later.')}</p>
        {figures && <p className="set-desc">{t(`공용 그림 ${figures.store.library}개 · 프로젝트 ${figures.store.projects}곳에 ${figures.store.inProjects}개`, `${plural(figures.store.library, 'shared figure')} · ${figures.store.inProjects} in ${plural(figures.store.projects, 'project')}`)}</p>}
        {['iCloud', 'Google Drive'].map((cloud) => (
          <div key={cloud} className="library-cloud-row" data-ui="그림 폴더 연결" data-ui-item={cloud}>
            <span className="set-name">{cloud}</span>
            <span className="set-desc">{t('연결 안 함', 'Not linked')}</span>
            <span title={t('사진 · 스캔 폴더 연결은 나중에 지원합니다', 'Linking photo and scan folders is coming later')} data-tip={t('사진 · 스캔 폴더 연결은 나중에 지원합니다', 'Linking photo and scan folders is coming later')}>
              <button className="btn" disabled data-tip={t('사진 · 스캔 폴더 연결은 나중에 지원합니다', 'Linking photo and scan folders is coming later')}>{t('연결하기', 'Link')}</button>
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}

function ReadOnlyPath({ label, path }: { label: string; path: string }) {
  return <div className="library-path-row mono" aria-label={label} title={path}>{path}</div>
}

function GitState({ repo }: { repo: RepoInfo | null }) {
  if (!repo) return <>{t('Git 상태를 확인할 수 없습니다.', 'Couldn\'t check Git status.')}</>
  if (repo.state !== 'ok') return <>{t('Git 저장소가 아님', 'Not a Git repository')}</>
  const changed = (repo.dirty ?? 0) + (repo.untracked ?? 0)
  return <>Git · {repo.branch ?? t('브랜치 없음', 'No branch')} · {changed ? t(`커밋하지 않은 파일 ${changed}개`, `${plural(changed, 'uncommitted file')}`) : t('커밋하지 않은 파일 없음', 'No uncommitted files')}
    {repo.upstream ? t(` · 올릴 커밋 ${repo.ahead ?? '?'}개 · 받을 커밋 ${repo.behind ?? '?'}개`, ` · ${repo.ahead ?? '?'} to push · ${repo.behind ?? '?'} to pull`) : t(' · 원격 추적 브랜치 없음', ' · No remote tracking branch')}</>
}
