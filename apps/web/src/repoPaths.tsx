import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type RepoFile } from './api'
import { qk } from './queries'
import { go } from './router'
import { monthDay } from './format'
import { t } from './i18n'

/**
 * 기록 글 속 저장소 경로(`docs/x.md`)를 링크로 (10/19 피드백 09:53, 시안 안 1).
 * `…`로 감싼 글 중 슬래시와 확장자가 있는 것만 경로로 본다. 서버가 찾아 본 뒤에야 링크가 된다:
 * 있으면 그대로, 옮겼으면 "옮김", 지웠으면 "지움"을 옆에 적고, 못 찾으면 글 그대로(툴팁 "저장소에 없는 파일").
 */
export interface RecordRef { target: string; id: string }
export const RepoPathContext = createContext<{ rid: string; from?: RecordRef } | null>(null)

export const looksLikeRepoPath = (s: string): boolean =>
  !/\s/.test(s) && !/^[a-z]+:\/\//i.test(s) && !s.startsWith('/') && /^[^/]+(\/[^/]+)+$/.test(s.replace(/^\.\//, '')) && /\.[A-Za-z0-9]{1,8}$/.test(s)

// 파일 탭이 "기록의 경로를 새 자리로 고치기"에 쓸, 경로를 연 기록 (탭 주소에는 넣지 않는다)
const opened = new Map<string, RecordRef>()
export const openedFrom = (rid: string, path: string): RecordRef | undefined => opened.get(`${rid}|${path}`)

/** 찾아 둔 결과는 30초 쓴다 (파일 알림으로 다시 받지 않는 자료라서) */
export function useRepoFile(rid: string, path: string, body = false) {
  return useQuery({ queryKey: qk.repoFile(rid, path, body), queryFn: () => api.research(rid).repoFile(path, body), staleTime: 30_000, retry: false })
}

export function movedNote(f: Pick<RepoFile, 'status' | 'at'>): string | null {
  const when = f.at ? ` ${monthDay(f.at)}` : ''
  return f.status === 'moved' ? t(`옮김${when}`, `Moved${when}`) : f.status === 'deleted' ? t(`지움${when}`, `Deleted${when}`) : null
}

export function CodeText({ text }: { text: string }) {
  const ctx = useContext(RepoPathContext)
  if (!ctx || !looksLikeRepoPath(text)) return <code className="memo-code">{text}</code>
  return <RepoPathLink rid={ctx.rid} path={text} from={ctx.from} />
}

function RepoPathLink({ rid, path, from }: { rid: string; path: string; from?: RecordRef }) {
  const { data } = useRepoFile(rid, path)
  if (!data || data.status === 'missing') return <code className="memo-code" title={data ? t('저장소에 없는 파일', 'File not in the repository') : undefined}>{path}</code>
  const note = movedNote(data)
  const tip = data.status === 'moved' ? t(`옮긴 파일 · 지금 자리 ${data.path}`, `Moved · now at ${data.path}`)
    : data.status === 'deleted' ? t('지운 파일 · 지우기 전 판을 엽니다', 'Deleted file · opens the last version')
      : t('작업 화면 탭으로 엽니다', 'Opens in a workspace tab')
  return <>
    <button type="button" className="memo-path" title={tip} onClick={(e) => {
      e.stopPropagation()
      if (from) opened.set(`${rid}|${data.asked}`, from)
      go({ page: 'file', rid, path: data.asked })
    }}><code className="memo-code">{path}</code></button>
    {note && <span className="memo-path-note">{note}</span>}
  </>
}
