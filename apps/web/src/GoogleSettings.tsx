import type { UiSettings } from '@rw/core'
import { useEffect, useState } from 'react'
import { api, googleApi, req, type GoogleStatus, type GoogleSync, type SyncedResearch } from './api'
import { t, plural, locale } from './i18n'

/**
 * 설정 화면의 "구글 계정" 묶음.
 * 1) 클라이언트 ID 넣기(처음 한 번) 2) 구글에 연결 3) 설정 올리기·불러오기, 이 컴퓨터에 없는 프로젝트 받아 오기.
 * 연구 파일 내용은 구글로 가지 않는다. 화면 설정과 프로젝트 목록(GitHub 주소·태그)만 간다.
 */
export function GoogleSettings({ onUiRestored }: { onUiRestored(ui: UiSettings): void }) {
  const [st, setSt] = useState<GoogleStatus | null>(null)
  const [sync, setSync] = useState<GoogleSync | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editClient, setEditClient] = useState(false)
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')

  const load = async () => {
    try {
      const s = await googleApi.status()
      setSt(s)
      if (s.connected) setSync(await googleApi.sync().catch((e) => { setErr((e as Error).message); return null }))
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { void load() }, [])

  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setErr(null); setMsg(null)
    try { const m = await f(); if (m) setMsg(m); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (!st) return <p className="muted">{err ?? t('구글 연결 상태를 읽는 중…', 'Checking Google connection…')}</p>

  const saveClient = () => run(async () => {
    await googleApi.setClient(id, secret)
    setEditClient(false); setId(''); setSecret('')
    return t('클라이언트 ID를 저장했습니다. 이제 구글에 연결하세요.', 'Saved the client ID. Now connect to Google.')
  })

  return (
    <div className="g-set" data-ui="구글 계정">
      <div className="set-rows">
        <div className="set-row" data-ui="구글 연결">
          <div>
            <div className="set-name">{st.connected ? t(`연결됨: ${st.email ?? '구글 계정'}`, `Connected: ${st.email ?? 'Google account'}`) : t('연결 안 됨', 'Not connected')}{st.mock && <span className="muted">{t(' (예제 모드의 가짜 구글)', ' (fake Google in sample mode)')}</span>}</div>
            <div className="set-desc">{t('홈의 한 일 달력에 구글 캘린더 일정을 함께 보여 주고(읽기만), 설정과 프로젝트 목록을 구글 드라이브의 앱 전용 공간에 보관합니다.', 'Shows Google Calendar events on the Home activity calendar (read only), and keeps settings and the project list in the app folder on Google Drive.')}</div>
          </div>
          {st.connected
            ? <button className="btn" disabled={busy} onClick={() => void run(async () => { await googleApi.disconnect(); setSync(null); return t('연결을 끊었습니다.', 'Disconnected.') })}>{t('연결 끊기', 'Disconnect')}</button>
            : <a className={`btn primary${st.configured ? '' : ' disabled'}`} aria-disabled={!st.configured} href={st.configured ? googleApi.connectUrl() : undefined}>{t('구글에 연결', 'Connect to Google')}</a>}
        </div>

        {!st.mock && (
          <div className="set-row" data-ui="구글 클라이언트">
            <div>
              <div className="set-name">{t('구글 클라이언트 ID', 'Google client ID')}</div>
              <div className="set-desc">
                {st.configured ? <>{t('저장됨: ', 'Saved: ')}<code>{st.clientId}</code></> : <>{t('Google Cloud에서 처음 한 번 만듭니다. 만드는 법은 아래에 있습니다.', 'Create it once in Google Cloud. Steps are below.')}</>}
              </div>
            </div>
            {!editClient && <button className="btn" onClick={() => setEditClient(true)}>{st.configured ? t('바꾸기', 'Change') : t('넣기', 'Enter')}</button>}
          </div>
        )}
        {editClient && (
          <div className="set-row g-client" data-ui="클라이언트 넣기">
            <div className="g-fields">
              <input className="input" placeholder={t('클라이언트 ID (….apps.googleusercontent.com)', 'Client ID (….apps.googleusercontent.com)')} value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" spellCheck={false} />
              <input className="input" type="password" placeholder={t('클라이언트 보안 비밀번호', 'Client secret')} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
              <div className="g-actions">
                <button className="btn primary" disabled={busy || !id.trim() || !secret.trim()} onClick={() => void saveClient()}>{t('저장', 'Save')}</button>
                <button className="btn" onClick={() => setEditClient(false)}>{t('취소', 'Cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {st.connected && (
          <div className="set-row" data-ui="설정 동기화">
            <div>
              <div className="set-name">{t('설정과 프로젝트 목록', 'Settings and project list')}</div>
              <div className="set-desc">
                {sync?.remote
                  ? <>{t('구글에 저장된 것: ', 'Saved on Google: ')}{new Date(sync.remote.savedAt).toLocaleString(locale())} · {sync.remote.machine} · {t(`프로젝트 ${sync.remote.researches.length}개`, plural(sync.remote.researches.length, 'project'))}.</>
                  : t('구글에 아직 저장된 설정이 없습니다.', 'No settings saved on Google yet.')}
                {st.synced ? t(' 이 컴퓨터에서 바꾸면 저절로 올립니다.', ' Changes on this computer are uploaded automatically.') : t(' 올리거나 불러오면 그다음부터 저절로 올립니다.', ' After you upload or restore once, changes are uploaded automatically.')}
                {st.lastPush?.error && <span className="g-err">{t(' 마지막 올리기 실패: ', ' Last upload failed: ')}{st.lastPush.error}</span>}
              </div>
            </div>
            <div className="g-actions">
              {sync?.remote && <button className="btn" disabled={busy} onClick={() => void run(async () => {
                const r = await googleApi.restore()
                onUiRestored(await api.settings())
                return t(`불러왔습니다. 화면 설정과 태그 ${r.restored}개 프로젝트를 맞췄습니다.${r.missing.length ? ` 이 컴퓨터에 없는 프로젝트 ${r.missing.length}개는 아래에서 받아 오세요.` : ''}`, `Restored display settings and tags for ${plural(r.restored, 'project')}.${r.missing.length ? ` Download the ${plural(r.missing.length, 'project')} missing on this computer below.` : ''}`)
              })}>{t('구글에서 불러오기', 'Restore from Google')}</button>}
              <button className="btn" disabled={busy} onClick={() => void run(async () => { await googleApi.push(); return t('이 컴퓨터의 설정을 구글에 올렸습니다.', 'Uploaded this computer\'s settings to Google.') })}>{t('구글에 올리기', 'Upload to Google')}</button>
            </div>
          </div>
        )}
      </div>

      {sync && sync.missing.length > 0 && (
        <div className="g-missing" data-ui="없는 프로젝트">
          <div className="set-name">{t('이 컴퓨터에 없는 프로젝트', 'Projects not on this computer')}</div>
          {sync.missing.map((r) => <MissingRow key={r.id} r={r} onDone={(m) => { setMsg(m); void load() }} onError={setErr} />)}
        </div>
      )}

      {msg && <p className="g-msg" role="status">{msg}</p>}
      {err && <p className="g-err" role="alert">{err}</p>}

      {!st.mock && !st.configured && (
        <details className="g-help" data-ui="클라이언트 만드는 법" open>
          <summary>{t('구글 클라이언트 ID 만드는 법 (처음 한 번, 5분)', 'How to create a Google client ID (once, 5 minutes)')}</summary>
          <ol>
            <li>{t('', 'Create a new project in ')}<a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud</a>{t('에서 새 프로젝트를 만듭니다 (이름 예: research-workspace).', ' (for example, name it research-workspace).')}</li>
            <li>{t('API 라이브러리에서 ', 'In the API Library, enable ')}<b>Google Calendar API</b>{t('와 ', ' and ')}<b>Google Drive API</b>{t('를 켭니다.', '.')}</li>
            <li>{t('OAuth 동의 화면: 사용자 유형 ', 'OAuth consent screen: user type ')}<b>{t('외부', 'External')}</b>{t(', 앱 이름을 적고, 테스트 사용자에 내 구글 주소를 더합니다.', ', enter an app name, and add your Google address as a test user.')}</li>
            <li>{t('사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 애플리케이션 유형 ', 'Credentials → Create credentials → OAuth client ID → application type ')}<b>{t('데스크톱 앱', 'Desktop app')}</b>.</li>
            <li>{t('나온 클라이언트 ID와 보안 비밀번호를 위의 "넣기"에 붙여 넣습니다. 이 맥의 ~/.config/research-workspace/google.yaml에만 저장됩니다.', 'Paste the client ID and secret into "Enter" above. They are saved only in ~/.config/research-workspace/google.yaml on this Mac.')}</li>
          </ol>
        </details>
      )}
    </div>
  )
}

/** 구글에 있는데 이 컴퓨터에 없는 프로젝트: GitHub에서 받아 등록한다 */
function MissingRow({ r, onDone, onError }: { r: SyncedResearch; onDone(msg: string): void; onError(msg: string): void }) {
  const [busy, setBusy] = useState(false)
  const post = async (url: string, body: unknown) => {
    const res = await req(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const b = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((b as { error?: string }).error ?? t(`요청 실패 (${res.status})`, `Request failed (${res.status})`))
    return b
  }
  const fetchIt = async () => {
    if (!r.remote) return
    setBusy(true)
    try {
      const gh = await post('/api/researches/github', { url: r.remote }) as { parent: string }
      const { path } = await post('/api/researches/clone', { url: r.remote, parent: gh.parent }) as { path: string }
      await post('/api/researches', { path, tags: r.tags })
      onDone(t(`${r.title}을(를) ${path}에 받아 등록했습니다.`, `Downloaded ${r.title} to ${path} and registered it.`))
    } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="g-mrow">
      <span className="g-mt">{r.title}</span>
      <span className="muted g-mr">{r.remote ?? t('GitHub 주소 없음', 'No GitHub address')}</span>
      {r.remote && <button className="btn" disabled={busy} onClick={() => void fetchIt()}>{busy ? t('받는 중…', 'Downloading…') : t('받아 오기', 'Download')}</button>}
    </div>
  )
}
