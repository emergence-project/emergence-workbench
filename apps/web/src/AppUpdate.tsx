import { useEffect, useSyncExternalStore } from 'react'
import { req } from './api'
import { go } from './router'
import { plural, t } from './i18n'

/** 피드백 처리 상태의 화면 이름 (값은 status.yaml 그대로) */
const STATE_TEXT: Record<string, string> = { 반영: t('반영', 'Applied'), 답변: t('답변', 'Answered'), 보류: t('보류', 'On hold'), 승인: t('승인', 'Approved') }
const stateText = (s: string) => STATE_TEXT[s] ?? s

interface AppStatus {
  running: string; head: string; branch: string | null; upstream: string | null
  behind: number; blocked: string | null; fetchError?: string; incoming: string[]
  /** 이번 업데이트로 처리 기록이 생기거나 바뀐 피드백 */
  resolved?: { key: string; state: string; text: string; note?: string }[]
}

type Phase = 'idle' | 'checking' | 'updating' | 'restarting'
interface State {
  enabled: boolean | null; status: AppStatus | null; phase: Phase; message: string | null; error: string | null
  /** 마지막 업데이트가 실패한 이유. 확인(check)이 지우지 않고, 다음 업데이트를 누를 때까지 남는다 */
  failed: string | null
}

const short = (c: string) => c.slice(0, 7)

/*
 * 앱 업데이트 상태는 설정 화면과 제목줄 버튼이 함께 쓴다. 한 곳에서만 GitHub를 확인하고 한 번만 업데이트한다.
 * 실사용 앱은 계속 켜 두므로, 몇 분마다와 창으로 돌아올 때 새 버전이 있는지 다시 본다.
 */
const POLL_MS = 5 * 60_000
const FOCUS_MIN_MS = 60_000
/** 받기·설치·빌드가 이보다 오래 걸리면 기다리기를 그만두고 이유를 보여 준다 (서버의 설치·빌드 제한은 각 10분) */
const UPDATE_WAIT_MS = 22 * 60_000

let state: State = { enabled: null, status: null, phase: 'idle', message: null, error: null, failed: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
let lastCheck = 0

export async function checkAppUpdate(): Promise<void> {
  if (state.phase !== 'idle' || state.enabled === false) return
  lastCheck = Date.now()
  set({ phase: 'checking', error: null })
  try {
    const b = await (await req('/api/app/status?fetch=1')).json()
    set({ enabled: !!b.enabled, status: b.status ?? null })
  } catch (e) { set({ error: (e as Error).message }) } finally { set({ phase: 'idle' }) }
}

export async function runAppUpdate(): Promise<void> {
  const status = state.status
  if (!status || state.phase !== 'idle') return
  set({ phase: 'updating', error: null, message: null, failed: null })
  // 실패는 확인으로 덮지 않는다: 전에는 실패 직후의 확인이 오류를 지워, 버튼이 말없이 "새 버전"으로 돌아갔다 (10/5 피드백)
  const fail = async (msg: string) => { set({ phase: 'idle' }); await checkAppUpdate(); set({ failed: msg }) }
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), UPDATE_WAIT_MS)
  try {
    const res = await req('/api/app/update', { method: 'POST', signal: abort.signal })
    const b = await res.json().catch(() => ({ error: t(`업데이트 요청이 실패했습니다 (${res.status})`, `Update request failed (${res.status})`) }))
    if (!res.ok) throw new Error(b.error)
    set({ message: b.message })
    if (!b.restarting) { set({ status: b.status, phase: 'idle', failed: b.status && b.status.head !== b.status.running ? b.message : null }); return }
    set({ phase: 'restarting' })
    // 새 코드로 다시 켜질 때까지 기다렸다가 화면을 새로 읽는다
    const old = status.running
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      try {
        const s = await (await fetch('/api/app/status')).json()
        if (s.status && s.status.running !== old) { location.reload(); return }
      } catch { /* 다시 시작하는 중 */ }
    }
    await fail(t('2분 안에 다시 켜지지 않았습니다. 터미널에서 pnpm service:logs로 확인해 주세요', 'The app did not come back within 2 minutes. Check pnpm service:logs in a terminal'))
  } catch (e) {
    await fail(abort.signal.aborted ? t(`${UPDATE_WAIT_MS / 60_000}분이 지나도 업데이트가 끝나지 않았습니다. 터미널에서 pnpm service:logs로 확인해 주세요`, `The update did not finish within ${UPDATE_WAIT_MS / 60_000} minutes. Check pnpm service:logs in a terminal`) : (e as Error).message)
  } finally { clearTimeout(timer) }
}

function useAppUpdateState(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)
}

/** 받을 새 버전이 있거나, 받았지만 아직 다시 시작하지 않은 상태 */
const hasNew = (s: AppStatus | null) => !!s && (s.behind > 0 || s.head !== s.running)
const canUpdate = (s: AppStatus | null) => !!s && !s.blocked && !s.fetchError && hasNew(s)

/**
 * 왼쪽 띠의 설정 버튼에 붙는 표시: 새 버전이 있을 때 (10/4 18:16 피드백 "다른 요소들도 확인할 변동이 있다면 알림을").
 * 확인은 제목줄의 새 버전 버튼이 하고, 여기서는 같은 상태를 읽기만 한다.
 */
export function AppUpdateRailCount() {
  const s = useAppUpdateState()
  if (!s.enabled || !hasNew(s.status)) return null
  return <span className="rail-count dot" data-ui="새 버전 표시" role="img" aria-label={t('새 버전이 있습니다', 'A new version is available')} title={t('새 버전이 있습니다 — 설정 › 앱 기본정보', 'A new version is available: Settings › About this app')} />
}

/**
 * 제목줄 › 새 버전 버튼: 새 버전이 있을 때만 보인다. 누르면 받아서 빌드하고 앱을 다시 시작한 뒤 화면을 새로 읽는다.
 * 받을 수 없는 상태(맥에서 코드를 고쳐 둔 경우 등)면 설정 › 앱 기본정보로 보내 이유를 보여 준다.
 */
export function AppUpdateButton() {
  const s = useAppUpdateState()
  useEffect(() => {
    if (lastCheck === 0) void checkAppUpdate()
    const timer = setInterval(() => void checkAppUpdate(), POLL_MS)
    const onFocus = () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck > FOCUS_MIN_MS) void checkAppUpdate() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [])

  if (!s.enabled) return null
  const busy = s.phase === 'updating' || s.phase === 'restarting'
  if (!busy && !hasNew(s.status)) return null

  const st = s.status
  const ok = canUpdate(st)
  const fixed = st?.resolved?.length ?? 0
  let label = fixed ? t(`새 버전 · 피드백 ${fixed}건`, `New version · ${plural(fixed, 'feedback item')}`) : t('새 버전', 'New version')
  if (s.phase === 'updating') label = t('업데이트 중…', 'Updating…')
  else if (s.phase === 'restarting') label = t('다시 시작 중…', 'Restarting…')
  else if (s.failed) label = t('업데이트 안 됨 · 이유 보기', 'Update failed · See why')
  else if (!ok) label = t('새 버전 · 확인 필요', 'New version · Needs review')
  const title = busy ? t('받아서 빌드하고 앱을 다시 시작합니다. 켜지면 화면을 새로 읽습니다', 'Pulling, building, and restarting the app. The page reloads when it is back')
    : s.failed ? s.failed
    : s.error ? s.error
      : st?.blocked ?? (st?.fetchError ? t(`GitHub를 확인하지 못했습니다: ${st.fetchError}`, `Could not check GitHub: ${st.fetchError}`) : null)
        ?? `${t('눌러서 업데이트하고 다시 시작', 'Click to update and restart')}${fixed ? `\n\n${t('처리된 피드백', 'Handled feedback')}\n${st!.resolved!.map((r) => `· ${stateText(r.state)} · ${r.text}`).join('\n')}` : ''}${st && st.incoming.length ? `\n\n${t('바뀐 것', 'Changes')}\n${st.incoming.map((c) => `· ${c}`).join('\n')}` : ''}`

  return (
    <>
      <button className={`btn${ok && !s.error && !s.failed ? ' primary' : ''} tb-update`} data-ui="새 버전 버튼" title={title} disabled={busy}
        onClick={() => { if (ok && !s.error && !s.failed) void runAppUpdate(); else go({ page: 'settings' }) }}>
        {label}
      </button>
      <span className="tb-sep" />
    </>
  )
}

/**
 * 설정 › 앱 기본정보 › 업데이트: GitHub에 새 버전이 있는지 보고, 누르면 받아서 빌드하고 앱을 다시 시작한다.
 * 맥에서 남긴 피드백은 함께 커밋해 올린다. 맥에서 코드를 고쳐 두었으면 손대지 않고 이유를 보여 준다.
 */
export function AppUpdate() {
  const { enabled, status, phase, message, error, failed } = useAppUpdateState()
  useEffect(() => { void checkAppUpdate() }, [])

  if (enabled === false) return <p className="set-desc" data-ui="앱 업데이트 안내">{t('개발용 예제 모드에서는 앱 업데이트를 쓰지 않습니다.', 'App updates are off in sample mode for development.')}</p>
  const pending = status && status.behind === 0 && status.head !== status.running
  const busy = phase !== 'idle'

  let line: string
  if (phase === 'checking') line = t('GitHub를 확인하는 중…', 'Checking GitHub…')
  else if (phase === 'updating') line = t('받아서 빌드하는 중… (1분쯤 걸릴 수 있습니다)', 'Pulling and building… (may take about a minute)')
  else if (phase === 'restarting') line = t('앱을 다시 시작하는 중… 켜지면 화면을 새로 읽습니다', 'Restarting the app… The page reloads when it is back')
  else if (!status) line = t('상태를 알 수 없습니다', 'Status unknown')
  else if (status.fetchError) line = t(`GitHub를 확인하지 못했습니다: ${status.fetchError}`, `Could not check GitHub: ${status.fetchError}`)
  else if (status.behind > 0) line = t(`새 버전이 있습니다 (커밋 ${status.behind}개)`, `A new version is available (${plural(status.behind, 'commit')})`)
  else if (pending) line = t('받은 새 버전이 아직 반영되지 않았습니다', 'The pulled version is not applied yet')
  else line = t('최신입니다', 'Up to date')

  return (
    <div className="set-rows" data-ui="앱 업데이트">
      <div className="set-row">
        <div>
          <div className="set-name">{line}</div>
          <div className="set-desc">
            {status ? `${t('지금 버전', 'Current version')} ${short(status.running)}${status.upstream ? ` · ${status.branch} ← ${status.upstream}` : ''}` : ''}
            {status?.blocked && <div className="error-text">{status.blocked}</div>}
            {message && <div>{message}</div>}
            {failed && <div className="error-text">{failed}</div>}
            {error && <div className="error-text">{error}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn" disabled={busy} onClick={() => void checkAppUpdate()}>{t('다시 확인', 'Check again')}</button>
          <button className="btn primary" disabled={busy || !canUpdate(status)} onClick={() => void runAppUpdate()}>{t('업데이트하고 다시 시작', 'Update and restart')}</button>
        </div>
      </div>
      {status?.resolved && status.resolved.length > 0 && (
        <div className="set-row" data-ui="새 버전 피드백">
          <div style={{ minWidth: 0 }}>
            <div className="set-name">{t(`처리된 피드백 ${status.resolved.length}건`, `Handled feedback: ${status.resolved.length}`)}</div>
            <ul className="set-desc" style={{ margin: 0, paddingLeft: 18, maxWidth: 'none' }}>
              {status.resolved.map((r) => <li key={r.key}><b>{stateText(r.state)}</b> · {r.text}{r.note && <div className="muted">{r.note}</div>}</li>)}
            </ul>
          </div>
        </div>
      )}
      {status && status.incoming.length > 0 && (
        <div className="set-row" data-ui="새 버전 내용">
          <ul className="set-desc" style={{ margin: 0, paddingLeft: 18, maxWidth: 'none' }}>
            {status.incoming.map((c, i) => <li key={i}>{c}</li>)}
            {status.behind > status.incoming.length && <li>{t(`외 ${status.behind - status.incoming.length}개`, `+${status.behind - status.incoming.length} more`)}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
