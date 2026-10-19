import { useState } from 'react'
import { stripFrontMatter } from '@rw/core'
import { useQueryClient } from '@tanstack/react-query'
import { api, commentsApi } from './api'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { openedFrom, useRepoFile } from './repoPaths'
import { monthDay } from './format'
import { flash } from './flash'
import { qk } from './queries'
import { t } from './i18n'

/**
 * 저장소 파일 읽기 탭 (10/19 피드백 09:53, 시안 안 1): 기록 글 속 경로를 누르면 연다. 고치기는 하지 않는다(맥 앱으로 열기).
 * 적힌 자리에 없으면 옮긴 곳을 열고 그 사실을 위에 알린다. 지운 파일은 지우기 전 마지막 판을 보인다(사용자 "옮긴 파일 · 삭제된 파일임을 알게").
 * 경로를 연 기록을 알면 "기록의 경로를 새 자리로 고치기"로 기록 글의 옛 경로를 새 경로로 바꾼다.
 */
export function RepoFileTab({ rid, path }: { rid: string; path: string }) {
  const { data, error } = useRepoFile(rid, path, true)
  const client = useQueryClient()
  const [fixed, setFixed] = useState(false)
  const from = openedFrom(rid, path)
  const rapi = api.research(rid)
  if (error) return <div className="ws-doc"><p className="empty center">{(error as Error).message}</p></div>
  if (!data) return <div className="ws-doc" />
  const when = data.at ? monthDay(data.at) : null
  const fixPath = async () => {
    if (!from) return
    try {
      const file = await commentsApi(rid).read(from.target)
      const record = file.comments.find((c) => c.id === from.id)
      if (!record || !record.body.includes(data.asked)) { flash(t('기록 글에 이 경로가 없습니다', 'The record no longer has this path')); return }
      await commentsApi(rid).update(from.target, from.id, { text: record.body.split(data.asked).join(data.path), baseHash: file.hash })
      void client.invalidateQueries({ queryKey: qk.records(rid) })
      setFixed(true)
      flash(t('기록의 경로를 새 자리로 고쳤습니다', 'Updated the path in the record'))
    } catch (e) { flash((e as Error).message) }
  }
  return (
    <div className="ws-doc file-tab" data-ui="파일 보기">
      <div className="pane-head" data-ui="머리줄">
        <span className="crumb" title={data.path}>{t('파일', 'File')} · <b>{data.path}</b></span>
        <span className="sp" />
        {(data.status === 'here' || data.status === 'moved') &&
          <button className="btn sm" onClick={() => { rapi.openRepoFile(data.path).catch((e: Error) => flash(e.message)) }}>{t('맥 앱으로 열기', 'Open in Mac app')}</button>}
      </div>
      {data.status === 'moved' && <div className="file-notice" data-ui="옮긴 파일 알림">
        <span>{when
          ? t(`기록에 적힌 자리(${data.asked})에는 없어서, git 이력에서 옮긴 곳을 찾아 열었습니다 (${when} 옮김).`, `Not at the path in the record (${data.asked}); opened where git history moved it (moved ${when}).`)
          : t(`기록에 적힌 자리(${data.asked})에는 없어서, 저장소에서 같은 이름의 파일을 찾아 열었습니다.`, `Not at the path in the record (${data.asked}); opened the file with the same name in the repository.`)}</span>
        {from && !fixed && <button className="a" onClick={() => void fixPath()}>{t('기록의 경로를 새 자리로 고치기', 'Update the path in the record')}</button>}
      </div>}
      {data.status === 'deleted' && <div className="file-notice" data-ui="지운 파일 알림">
        <span>{t(`지운 파일입니다${when ? ` (${when} 지움)` : ''}. 지우기 전 마지막 판을 읽기만 합니다.`, `This file was deleted${when ? ` (${when})` : ''}. Showing the last version before deletion, read-only.`)}</span>
      </div>}
      <section className="pane" data-ui="본문">
        <div className="scroll">
          {data.status === 'missing' ? <p className="empty center">{t(`저장소에 없는 파일입니다: ${data.asked}`, `File not in the repository: ${data.asked}`)}</p>
            : data.kind === 'markdown' && data.text !== undefined ? <div className="page-body"><ObsidianMarkdown text={stripFrontMatter(data.text)} /></div>
              : data.kind === 'text' && data.text !== undefined ? <pre className="file-text">{data.text}</pre>
                : data.kind === 'pdf' && data.status !== 'deleted' ? <iframe className="file-frame" title={data.path} src={rapi.repoFileRawUrl(data.path)} />
                  : data.kind === 'image' && data.status !== 'deleted' ? <div className="file-image"><img src={rapi.repoFileRawUrl(data.path)} alt={data.path} /></div>
                    : <p className="empty center">{t('이 종류의 파일은 앱에서 보이지 않습니다. 맥 앱으로 여세요', 'This kind of file is not shown in the app. Open it in the Mac app')}</p>}
          {data.truncated && <p className="muted file-cut">{t('파일이 커서 앞 1MB만 보입니다', 'Large file: showing the first 1 MB')}</p>}
        </div>
      </section>
    </div>
  )
}
