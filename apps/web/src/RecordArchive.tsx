// 완료 기록 보관 (11/23 사용자 결정 "보관으로 옮기고"): 기록 목록의 「완료 n」 아래 접힌 줄 「보관 n」.
// 90일 지난 완료 기록을 보관으로 옮기고(지우지 않는다), 보관한 것을 읽고, 하나씩 꺼낸다. 옮긴 뒤에는 알림의 「되돌리기」
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ArchiveMove } from '@rw/core/contract/comments'
import { commentsApi } from './api'
import { flash } from './flash'
import { t } from './i18n'
import { qk } from './queries'
import { kindLabel } from './recordLabels'
import { recordDate } from './recordsPanelHelpers'

const archiveKey = (rid: string) => [...qk.records(rid), 'archive'] as const

/** target을 주면 그 대상의 보관한 기록만 보인다 (정리는 늘 프로젝트 전체) */
export function RecordArchive({ rid, target, onChanged }: { rid: string; target?: string; onChanged(): void }) {
  const client = useQueryClient()
  const q = useQuery({ queryKey: archiveKey(rid), queryFn: () => commentsApi(rid).archive() })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const data = q.data
  if (!data) return null
  const files = data.files.filter((f) => !target || f.target === target)
  const count = files.reduce((n, f) => n + f.comments.length, 0)
  if (!count && !data.ready) return null
  const done = async (work: () => Promise<string | void>) => {
    setBusy(true)
    try { await work() } catch (e) { flash(e instanceof Error ? e.message : String(e), undefined, { error: true }) } finally {
      setBusy(false)
      void client.invalidateQueries({ queryKey: qk.records(rid) })
      onChanged()
    }
  }
  const restore = (moves: ArchiveMove[]) => done(async () => { const r = await commentsApi(rid).restoreArchive(moves); flash(t(`기록 ${r.restored}개를 꺼냈습니다`, `Took ${r.restored} record(s) out of the archive`)) })
  const tidy = () => done(async () => {
    const { moved } = await commentsApi(rid).archiveOld()
    const n = moved.reduce((sum, m) => sum + m.ids.length, 0)
    flash(t(`완료 기록 ${n}개를 보관으로 옮겼습니다`, `Moved ${n} done record(s) to the archive`), n ? { label: t('되돌리기', 'Undo'), run: () => void restore(moved) } : undefined)
  })
  return (
    <details className="record-done-fold record-archive" data-ui="보관한 기록" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t('보관', 'Archive')} <span className="n">{count}</span>{data.ready > 0 && <span className="record-archive-ready"> · {t(`옮길 수 있는 기록 ${data.ready}`, `${data.ready} ready to move`)}</span>}</summary>
      {open && <>
        {data.ready > 0 && <div className="record-archive-tidy">
          <span className="muted">{t(`쓴 지 ${data.days}일 지난 완료 기록 ${data.ready}개 (이 프로젝트 전체). 지우지 않고 보관으로 옮깁니다.`, `${data.ready} done record(s) written more than ${data.days} days ago (whole project). They are moved to the archive, not deleted.`)}</span>
          <button className="btn small" disabled={busy} onClick={() => void tidy()}>{t('보관으로 옮기기', 'Move to archive')}</button>
        </div>}
        {files.map((f) => f.comments.map((c) => (
          <article key={`${f.target}:${c.id}`} className="record-row done record-archive-row" data-ui="보관한 기록 줄">
            <div className="record-archive-head"><span className="muted">{kindLabel(c.kind === '코멘트' || c.kind === '하이라이트' ? '메모' : c.kind)} · {recordDate(c.id)}{!target && ` · ${f.title}`}</span>
              <button className="a" disabled={busy} onClick={() => void restore([{ target: f.target, ids: [c.id] }])}>{t('꺼내기', 'Take out')}</button></div>
            <div className="record-archive-body">{c.body}</div>
            {c.answers.map((a, i) => <div key={i} className="record-archive-answer"><span className="muted">{t('답', 'Answer')} · {a.by} · {a.at}</span><div>{a.body}</div></div>)}
          </article>
        )))}
      </>}
    </details>
  )
}
