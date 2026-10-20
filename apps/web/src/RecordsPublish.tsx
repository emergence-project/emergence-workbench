import { syncEveryLabel } from '@rw/core'
import { useEffect, useRef, useState } from 'react'
import { commentsApi } from './api'
import { flash } from './flash'
import { t } from './i18n'

const pushLabel = (busy: boolean, again = false) => (busy ? t('올리는 중…', 'Pushing…') : again ? t('다시 올리기', 'Push again') : t('지금 올리기', 'Push now'))

async function pushRecords(rid: string): Promise<void> {
  await commentsApi(rid).publish()
  flash(t('GitHub에 올렸습니다', 'Pushed to GitHub'))
}

/**
 * 기록 탭 맨 위 한 줄 (10/19 시안 댓글 안 B: 오른쪽 사이드바에서 옮김): 안 올린 기록이 있으면
 * "이 프로젝트의 안 올린 기록 n · 30초 뒤 올림 · 지금 올리기"(수동이면 시간 없이), 올리기에 실패했으면 그 까닭과 "다시 올리기".
 * 자동이어도 바로 올릴 수 있다. 다 올라가 있으면 아무것도 보이지 않는다. 개발용 예제 모드는 올리지 않아 보이지 않는다.
 */
export function PendingRecords({ rid, version }: { rid: string; version: number }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [delay, setDelay] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // 저절로 올린 뒤에는 파일 알림이 없어서, 기다리는 시간이 지나면 한 번 더 읽는다
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!pending || delay === null) return
    const timer = setTimeout(() => setTick((x) => x + 1), (delay + 5) * 1000)
    return () => clearTimeout(timer)
  }, [pending, delay, version])
  useEffect(() => {
    let active = true
    const api = commentsApi(rid)
    api.publishState().then(async (s) => {
      if (!active) return
      setError(s.autoPublish ? s.last?.error ?? null : null)
      setDelay(s.delay ?? null)
      // 이 앱이 올리는 경우(실사용)만 안 올린 기록 수를 본다
      const files = s.autoPublish ? await api.unpublished().catch(() => null) : null
      if (active) setPending(files?.length ?? 0)
    }).catch(() => undefined)
    return () => { active = false }
  }, [rid, version, tick])
  if (!error && !pending) return null
  const push = async () => {
    setBusy(true)
    try { await pushRecords(rid); setError(null); setPending(0) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
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
 * 지금 프로젝트만 본다: 서버가 실패가 생기거나 풀릴 때 알림(records-publish)을 보내 version이 오른다.
 */
export function usePublishFailureFlash(rid: string | null, version: number): void {
  const shown = useRef(new Set<string>())
  useEffect(() => {
    if (!rid) return
    let active = true
    commentsApi(rid).publishState().then((s) => {
      const error = s.autoPublish ? s.last?.error ?? null : null
      if (!active || !error || !s.last) return
      const key = `${rid}|${s.last.at}`
      if (shown.current.has(key)) return
      shown.current.add(key)
      flash(t('기록을 GitHub에 올리지 못했습니다', 'Records were not pushed to GitHub'), {
        label: t('다시 올리기', 'Push again'),
        run: () => { void pushRecords(rid).catch((e: Error) => flash(e.message)) },
      })
    }).catch(() => undefined)
    return () => { active = false }
  }, [rid, version])
}
