import { useEffect, useState, type ReactNode } from 'react'
import { conceptsApi, type LibraryInfo, type RepoInfo } from './api'
import { relativeTime } from './format'
import { Icon } from './icons'
import { go } from './router'
import { t } from './i18n'

/**
 * 라이브러리 정보 (지식 · 논문 · 그림 첫 화면의 오른쪽 사이드바, requirements §8.1 "라이브러리 저장 위치").
 * 저장 위치 Git · iCloud · Google Drive와 "라이브러리 관리" 길 하나. 글은 Git, 큰 파일은 클라우드.
 * 정상은 무채색, 사용자 차례(올리지 않은 변경 등)만 주황. 다른 곳에 있는 숫자는 두지 않는다.
 * Git 줄의 저장소 상태는 셋이 함께 쓰는 research-library 하나다. iCloud · Google Drive 줄은 화면마다 다르다.
 */
export function LibraryStorage({ info, git, gitMore, icloud, drive, section }: {
  section?: 'knowledge' | 'papers' | 'figures'
  info: LibraryInfo | null
  /** Git 줄의 둘째 줄: 저장소 이름 뒤에 붙는 이 라이브러리의 것 (예: "개념노트 120") */
  git?: string
  /** Git 줄 아래에 더 적을 것 (그림: 프로젝트 저장소에 둔 그림) */
  gitMore?: ReactNode
  icloud: ReactNode
  drive: ReactNode
}) {
  const [repo, setRepo] = useState<RepoInfo | null | undefined>(undefined)
  useEffect(() => { conceptsApi.libraryRepo().then(setRepo).catch(() => setRepo(null)) }, [info])
  const name = (info?.path ?? '').split('/').filter(Boolean).pop() ?? 'research-library'
  const pending = repo?.state === 'ok' ? (repo.ahead ?? 0) + (repo.dirty ?? 0) + (repo.untracked ?? 0) : 0
  return (
    <div className="kh-info">
      <h2 className="kh-side-h">{t('라이브러리 정보', 'Library info')}</h2>
      <div className="kh-side-label">{t('저장 위치', 'Storage')}</div>
      <div className="kh-store" data-ui="저장 위치 Git">
        <span className="kh-store-ico" aria-hidden>{Icon.branch}</span>
        <div className="kh-store-body">
          <div className="kh-store-name">Git</div>
          <div className="kh-store-sub" title={info?.path ?? undefined}>{name}{git ? ` · ${git}` : ''}</div>
          <div className="kh-store-sub">{repo === undefined ? t('확인하는 중…', 'Checking…')
            : !repo || repo.state !== 'ok' ? t('Git 저장소가 아님', 'Not a Git repository')
            : pending > 0 ? <span className="kh-turn" title={t('커밋하지 않은 파일이나 올리지 않은 커밋이 있습니다', 'There are uncommitted files or unpushed commits')}><span className="kh-dot" aria-hidden />{t(`올리지 않은 변경 ${pending}`, `Unpushed changes ${pending}`)}</span>
            : repo.last ? t(`${relativeTime(Date.parse(repo.last.date))} 올림`, `Pushed ${relativeTime(Date.parse(repo.last.date))}`) : t('커밋 없음', 'No commits')}</div>
          {gitMore}
        </div>
      </div>
      <div className="kh-store" data-ui="저장 위치 iCloud">
        <span className="kh-store-ico" aria-hidden>{Icon.cloud}</span>
        <div className="kh-store-body"><div className="kh-store-name">iCloud</div>{icloud}</div>
      </div>
      <div className="kh-store" data-ui="저장 위치 Google Drive">
        <span className="kh-store-ico" aria-hidden>{Icon.drive}</span>
        <div className="kh-store-body"><div className="kh-store-name">Google Drive</div>{drive}</div>
      </div>
      <button className="a kh-manage" data-ui="라이브러리 관리" onClick={() => go({ page: 'settings', part: section ? `library-${section}` : 'library' })}>
        <span className="kh-store-ico" aria-hidden>{Icon.settings}</span>{t('라이브러리 관리', 'Manage library')}</button>
    </div>
  )
}

/** 저장 위치 줄의 작은 글 한 줄. idle이면 쓰지 않는 것(회색 점), turn이면 사용자 차례(주황 점) */
export function StoreLine({ children, idle, turn, title }: { children: ReactNode; idle?: boolean; turn?: boolean; title?: string }) {
  return <div className="kh-store-sub" title={title}>{(idle || turn) && <span className={`kh-dot${idle ? ' idle' : ''}`} aria-hidden />}{children}</div>
}
