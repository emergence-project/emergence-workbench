import type { UiSettings } from '@rw/core'
import { useEffect, useState } from 'react'
import { api, googleApi, req, type GoogleStatus, type GoogleSync, type SyncedResearch } from './api'
import { parseGoogleClient } from './googleClient'
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
      if (s.connected && !s.expired) setSync(await googleApi.sync().catch((e) => { setErr((e as Error).message); return null }))
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { void load() }, [])

  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setErr(null); setMsg(null)
    try { const m = await f(); if (m) setMsg(m); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (!st) return <p className="muted">{err ?? t('구글 연결 상태를 읽는 중…', 'Checking Google connection…')}</p>

  const saveClient = (cid = id, csecret = secret) => run(async () => {
    await googleApi.setClient(cid, csecret)
    setEditClient(false); setId(''); setSecret('')
    return t('클라이언트 ID를 저장했습니다. 이제 구글에 연결하세요.', 'Saved the client ID. Now connect to Google.')
  })

  // 받은 JSON을 붙여 넣거나 파일로 고르면 두 칸을 채우고 바로 저장한다
  const fromJson = (text: string): boolean => {
    const c = parseGoogleClient(text)
    if (!c) return false
    setId(c.id); setSecret(c.secret); void saveClient(c.id, c.secret)
    return true
  }
  const pickJson = (file: File | undefined) => {
    if (!file) return
    void file.text().then((text) => { if (!fromJson(text)) setErr(t('구글 클라이언트 JSON이 아닙니다. Google Cloud에서 "JSON 다운로드"로 받은 파일을 고르세요.', 'Not a Google client JSON. Pick the file from "Download JSON" in Google Cloud.')) })
  }
  const clientForm = editClient || (!st.mock && !st.configured)

  return (
    <div className="g-set" data-ui="구글 계정">
      <div className="set-rows">
        <div className="set-row" data-ui="구글 연결">
          <div>
            <div className="set-name">{st.connected && st.expired ? t(`로그인이 만료됨: ${st.email ?? '구글 계정'} — 다시 연결해 주세요`, `Sign-in expired: ${st.email ?? 'Google account'}. Connect again`)
              : st.connected ? t(`연결됨: ${st.email ?? '구글 계정'}`, `Connected: ${st.email ?? 'Google account'}`) : t('연결 안 됨', 'Not connected')}{st.mock && <span className="muted">{t(' (예제 모드의 가짜 구글)', ' (fake Google in sample mode)')}</span>}</div>
            <div className="set-desc">{t('홈의 한 일 달력에 구글 캘린더 일정을 함께 보여 주고(읽기만), 설정과 프로젝트 목록을 구글 드라이브의 앱 전용 공간에 보관합니다. 연결할 때 구글 계정의 이름 · 이메일 · 사진으로 내 이름과 네트워킹 내 페이지의 빈 칸을 채웁니다(적어 둔 값은 그대로).', 'Shows Google Calendar events on the Home activity calendar (read only), and keeps settings and the project list in the app folder on Google Drive. When you connect, empty fields of your name and your Networking page are filled from your Google name, email and photo (values you typed stay).')}
              {st.connected && st.filled && <span data-ui="구글에서 채운 것">{t(` 구글 계정에서 채움: ${st.filled.items.map(filledName).join(' · ')} (${new Date(st.filled.at).toLocaleDateString(locale())}).`, ` Filled from Google: ${st.filled.items.map(filledName).join(', ')} (${new Date(st.filled.at).toLocaleDateString(locale())}).`)}</span>}
              {st.connected && !st.expired && !st.name && <span>{t(' 이름 · 사진을 채우려면 연결을 끊고 다시 연결해 이름 · 사진 권한을 허용해 주세요.', ' To fill your name and photo, disconnect and connect again to allow name and photo access.')}</span>}</div>
          </div>
          {st.connected && st.expired && <a className="btn primary" data-ui="구글 다시 연결" href={googleApi.connectUrl()}>{t('다시 연결', 'Reconnect')}</a>}
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
            {!clientForm && <button className="btn" onClick={() => setEditClient(true)}>{t('바꾸기', 'Change')}</button>}
          </div>
        )}
        {clientForm && (
          <div className="set-row g-client" data-ui="클라이언트 넣기">
            <div className="g-fields">
              <label className="btn g-file">{t('받은 JSON 파일 고르기', 'Choose the downloaded JSON file')}
                <input type="file" accept=".json,application/json" hidden onChange={(e) => { pickJson(e.target.files?.[0]); e.target.value = '' }} /></label>
              <span className="set-desc">{t('또는 JSON 내용이나 ID · 비밀번호를 붙여 넣습니다.', 'Or paste the JSON content, or the ID and secret.')}</span>
              <input className="input" placeholder={t('클라이언트 ID (….apps.googleusercontent.com)', 'Client ID (….apps.googleusercontent.com)')} value={id} onChange={(e) => setId(e.target.value)} onPaste={(e) => { if (fromJson(e.clipboardData.getData('text'))) e.preventDefault() }} autoComplete="off" spellCheck={false} />
              <input className="input" type="password" placeholder={t('클라이언트 보안 비밀번호', 'Client secret')} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
              <div className="g-actions">
                <button className="btn primary" disabled={busy || !id.trim() || !secret.trim()} onClick={() => void saveClient()}>{t('저장', 'Save')}</button>
                {st.configured && <button className="btn" onClick={() => setEditClient(false)}>{t('취소', 'Cancel')}</button>}
              </div>
            </div>
          </div>
        )}

        {st.connected && !st.expired && (
          <div className="set-row" data-ui="설정 동기화">
            <div>
              <div className="set-name">{t('설정과 프로젝트 목록', 'Settings and project list')}</div>
              <div className="set-desc">
                {sync?.remote
                  ? <>{t('구글에 저장된 것: ', 'Saved on Google: ')}{new Date(sync.remote.savedAt).toLocaleString(locale())} · {sync.remote.machine} · {t(`프로젝트 ${sync.remote.researches.length}개`, plural(sync.remote.researches.length, 'project'))}.</>
                  : t('구글에 아직 저장된 설정이 없습니다.', 'No settings saved on Google yet.')}
                {st.synced ? t(' 이 컴퓨터에서 바꾸면 자동으로 올립니다.', ' Changes on this computer are uploaded automatically.') : t(' 올리거나 불러오면 그다음부터 자동으로 올립니다.', ' After you upload or restore once, changes are uploaded automatically.')}
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
            <li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">{t('새 프로젝트 만들기', 'Create a new project')}</a>{t(' (이름 예: research-workspace).', ' (for example research-workspace).')}</li>
            <li><a href="https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com,drive.googleapis.com" target="_blank" rel="noreferrer">{t('캘린더 · 드라이브 API 켜기', 'Enable the Calendar and Drive APIs')}</a>{t(' (두 API를 한 번에 켭니다).', ' (both at once).')}</li>
            <li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">{t('동의 화면 정하기', 'Set up the consent screen')}</a>{t(': 사용자 유형 ', ': user type ')}<b>{t('외부', 'External')}</b>{t(', 앱 이름, 그리고 대상 › 테스트 사용자에 내 구글 주소.', ', an app name, and your Google address under Audience › Test users.')}</li>
            <li><a href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">{t('클라이언트 만들기', 'Create a client')}</a>{t(': 애플리케이션 유형 ', ': application type ')}<b>{t('데스크톱 앱', 'Desktop app')}</b>{t(' → 만든 뒤 ', ' → after creating, ')}<b>{t('JSON 다운로드', 'Download JSON')}</b>.</li>
            <li>{t('받은 파일을 위의 "받은 JSON 파일 고르기"로 고르면 끝입니다. 이 맥의 ~/.config/research-workspace/google.yaml에만 저장됩니다.', 'Choose that file with "Choose the downloaded JSON file" above and you are done. It is saved only in ~/.config/research-workspace/google.yaml on this Mac.')}</li>
          </ol>
        </details>
      )}
    </div>
  )
}

const filledName = (k: 'name' | 'email' | 'photo') => ({ name: t('이름', 'name'), email: t('이메일', 'email'), photo: t('사진', 'photo') })[k]

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
