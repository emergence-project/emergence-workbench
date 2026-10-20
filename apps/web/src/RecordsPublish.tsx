import { LIBRARY_RID, syncEveryLabel } from '@rw/core'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { commentsApi } from './api'
import { qk } from './queries'
import { flash } from './flash'
import { t } from './i18n'

const pushLabel = (busy: boolean, again = false) => (busy ? t('올리는 중…', 'Pushing…') : again ? t('다시 올리기', 'Push again') : t('지금 올리기', 'Push now'))

/** 기록 올리기의 마지막 결과 (화면 캐시 qk.recordsPublish, records-publish 알림에 다시 받는다) */
export function usePublishState(rid: string | null, fresh = false) {
  return useQuery({ queryKey: qk.recordsPublish(rid ?? ''), queryFn: () => commentsApi(rid!).publishState(), enabled: !!rid && rid !== LIBRARY_RID, ...(fresh && { refetchOnMount: 'always' as const }) })
}

/** 안 올린 기록 파일. 그 기능이 없는 서버면 null (기록 · 일지 파일 알림에 다시 받는다) */
export function useUnpublished(rid: string, enabled = true, fresh = false) {
  return useQuery({ queryKey: qk.recordsUnpublished(rid), queryFn: () => commentsApi(rid).unpublished(), enabled: enabled && rid !== LIBRARY_RID, ...(fresh && { refetchOnMount: 'always' as const }) })
}

async function pushRecords(rid: string): Promise<void> {
  await commentsApi(rid).publish()
  flash(t('GitHub에 올렸습니다', 'Pushed to GitHub'))
}

/**
 * 기록 탭 맨 위 한 줄 (10/19 시안 댓글 안 B: 오른쪽 사이드바에서 옮김): 안 올린 기록이 있으면
 * "이 프로젝트의 안 올린 기록 n · 30초 뒤 올림 · 지금 올리기"(수동이면 시간 없이), 올리기에 실패했으면 그 까닭과 "다시 올리기".
 * 자동이어도 바로 올릴 수 있다. 다 올라가 있으면 아무것도 보이지 않는다. 개발용 예제 모드는 올리지 않아 보이지 않는다.
 */
export function PendingRecords({ rid }: { rid: string }) {
  const client = useQueryClient()
  // 저절로 올린 것은 알림이 없어서, 이 줄이 보일 때마다 새로 받는다
  const state = usePublishState(rid, true)
  const s = state.data
  // 이 앱이 올리는 경우(실사용)만 안 올린 기록 수를 본다
  const files = useUnpublished(rid, !!s?.autoPublish, true)
  // 지금 올리기의 결과는 다음에 받은 자료가 올 때까지 그대로 보인다
  const stamp = `${state.dataUpdatedAt}|${files.dataUpdatedAt}`
  const [pushed, setPushed] = useState<{ stamp: string; error: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const own = pushed?.stamp === stamp ? pushed : null
  const error = own ? own.error : s?.autoPublish ? s.last?.error ?? null : null
  const pending = own ? 0 : s?.autoPublish ? files.data?.length ?? 0 : 0
  const delay = s ? s.delay ?? null : null
  // 저절로 올린 뒤에는 파일 알림이 없어서, 기다리는 시간이 지나면 한 번 더 읽는다
  useEffect(() => {
    if (!pending || delay === null) return
    const timer = setTimeout(() => { void client.invalidateQueries({ queryKey: qk.recordsPublish(rid) }) }, (delay + 5) * 1000)
    return () => clearTimeout(timer)
  }, [pending, delay, stamp, client, rid])
  if (!error && !pending) return null
  const push = async () => {
    setBusy(true)
    try { await pushRecords(rid); setPushed({ stamp, error: null }) } catch (e) { setPushed({ stamp, error: (e as Error).message }) } finally { setBusy(false) }
  }
  if (error) return <div className="records-publish-error" data-ui="기록 올리기 실패" role="status">
    <span title={error}>{t('기록을 GitHub에 올리지 못했습니다', 'Records were not pushed to GitHub')}: {error}</span>
    <button className="a" disabled={busy} onClick={() => void push()}>{pushLabel(busy, true)}</button>
  </div>
  return <div className="records-publish-pending" data-ui="안 올린 기록" role="status">
    <span>{t(`이 프로젝트의 안 올린 기록 ${pending}`, `${pending} not pushed in this project`)}{delay !== null && <span className="muted"> · {t(`${syncEveryLabel(delay)} 뒤 올림`, `pushing in ${syncEveryLabel(delay, false)}`)}</span>}</span>
    <button className="a" disabled={busy} onClick={() => void push()}>{pushLabel(busy)}</button>
  </div>
}

/**
 * 저절로 올리다 실패하면 화면 아래 작은 알림 한 번 (10/19 시안 댓글 안 B). 같은 실패는 다시 띄우지 않는다.
 * 지금 프로젝트만 본다: 서버가 실패가 생기거나 풀릴 때 알림(records-publish)을 보내 qk.recordsPublish를 다시 받는다.
 */
export function usePublishFailureFlash(rid: string | null): void {
  const shown = useRef(new Set<string>())
  const s = usePublishState(rid).data
  useEffect(() => {
    if (!rid || !s) return
    const error = s.autoPublish ? s.last?.error ?? null : null
    if (!error || !s.last) return
    const key = `${rid}|${s.last.at}`
    if (shown.current.has(key)) return
    shown.current.add(key)
    flash(t('기록을 GitHub에 올리지 못했습니다', 'Records were not pushed to GitHub'), {
      label: t('다시 올리기', 'Push again'),
      run: () => { void pushRecords(rid).catch((e: Error) => flash(e.message)) },
    })
  }, [rid, s])
}
