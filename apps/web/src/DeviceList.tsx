import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi } from './api/agentChats'
import { api, devicesApi, type Device, type DeviceAccount, type Devices, type DeviceServer } from './api'
import { askConfirm } from './askText'
import { relativeTime } from './format'
import { t } from './i18n'
import { qk } from './queries'

/**
 * 설정 › 기기 관리 (11/20 사용자 "클로드 기기관리처럼", "설정에서 관리", "기기 관리로 하자"): 이 앱을 쓰는 컴퓨터마다 한 줄.
 * 다른 컴퓨터는 개인 저장소에 올린 마지막 값이다 (1시간마다 맞춤, 서버 devices.ts).
 * 2단계 (11/20 "진행하자"): 한 컴퓨터를 서버로 정하면 다른 컴퓨터가 1분마다 알려 실시간으로 보이고, 기기마다 로그아웃을 건다 (서버 deviceServer.ts)
 *
 * 다음 단계 규칙 (11/20 사용자 "그러면 그렇게하자"): 컴퓨터마다 쓸 계정을 여기서 고르게 되더라도
 * 로그인은 계정 페이지에서만 한다. 여기서는 계정 페이지에 이미 등록된 계정 가운데 고르기만 하고, 로그인 버튼을 두지 않는다
 */
export function DeviceList() {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.devices, queryFn: devicesApi.get, refetchInterval: (s) => (s.state.data?.server ? 60_000 : 5 * 60_000) })
  const run = useMutation({ mutationFn: (f: () => Promise<Devices>) => f(), onSuccess: (v) => client.setQueryData(qk.devices, v) })
  const d = q.data
  const logout = (x: Device) => void askConfirm({
    title: t(`${x.label ?? x.name}에서 로그아웃할까요?`, `Sign out on ${x.label ?? x.name}?`),
    hint: t('그 컴퓨터가 다음에 서버에 알릴 때(켜져 있으면 1분 안) GitHub · 구글 로그인과 더한 Claude · Codex 계정을 뺍니다. 그 컴퓨터의 기본 Claude Code · Codex 로그인과 연구 파일은 남습니다.', 'The next time that computer reports to the server (within a minute if it is on), it signs out of GitHub and Google and removes the Claude and Codex accounts you added. Its default Claude Code and Codex sign-in and its research files stay.'),
    ok: t('로그아웃', 'Sign out'),
  }).then((y) => { if (y) run.mutate(() => devicesApi.logout(x.name)) })
  const me = d?.devices.find((x) => x.this)
  return (<>
    <h3 className="set-h3">{t('이 앱을 쓰는 컴퓨터', 'Computers using this app')}</h3>
    <p className="set-desc">{d?.server
      ? t('서버로 정한 컴퓨터에 다른 컴퓨터가 1분마다 알립니다. 로그인 열쇠 · 이메일은 보내지 않고 이름 · 시각 · 앱 버전 · 계정 이름만 보냅니다.', 'Every computer reports to the server once a minute. Only names, times, the app version and account names are sent, never sign-in keys or emails.')
      : t('다른 컴퓨터는 개인 저장소에 올린 마지막 값이라 1시간쯤 늦을 수 있습니다. 로그인 열쇠 · 이메일은 올리지 않고 이름 · 시각 · 앱 버전 · 계정 이름만 올립니다.', 'Other computers show what they last uploaded to your personal repository, so it can be up to an hour old. Only names, times, the app version and account names are uploaded, never sign-in keys or emails.')}</p>
    {d && <ServerRow server={d.server} me={me} busy={run.isPending} onMake={() => run.mutate(devicesApi.makeServer)} />}
    {run.error && <p className="set-desc error-text">{withLink(run.error.message)}</p>}
    <div className="setup set-rows dev-list" data-ui="기기 목록">
      {!d ? <p className="muted setup-row">{q.error?.message ?? t('읽는 중…', 'Reading…')}</p>
        : d.devices.map((x) => <DeviceRow key={x.name} d={x} differs={versionDiffers(x, me)} onLogout={d.server && !x.this && !x.logout ? () => logout(x) : undefined} />)}
    </div>
    {d && !d.shared && <p className="muted set-desc">{t('개인 저장소와 맞추지 않아 이 컴퓨터만 보입니다. 계정에서 GitHub에 로그인하고 개인 저장소를 정하면 다른 컴퓨터도 보입니다.', 'Only this computer is shown because it does not sync with a personal repository. Sign in to GitHub and choose a personal repository under Account to see your other computers.')}</p>}
  </>)
}

/** 오류 글 끝의 Tailscale 허락 주소(https://login.tailscale.com/…)는 눌러 열 수 있게 링크로 */
function withLink(msg: string) {
  const m = msg.match(/https:\/\/login\.tailscale\.com\/\S+/)
  if (!m) return msg
  const [before, after] = [msg.slice(0, m.index), msg.slice((m.index ?? 0) + m[0].length)]
  return <>{before}<a className="a" href={m[0]} target="_blank" rel="noreferrer">{t('허락하러 가기', 'Open Tailscale')}</a>{after}</>
}

const KIND: Record<DeviceAccount['kind'], string> = { github: 'GitHub', claude: 'Claude', codex: 'Codex', google: t('구글', 'Google') }
const accountName = (a: DeviceAccount) => [KIND[a.kind], a.name, a.plan].filter(Boolean).join(' · ')

/** 서버 줄: 어느 컴퓨터가 서버인가, 이 컴퓨터가 서버에 닿았는가, 이 컴퓨터를 서버로 */
function ServerRow({ server, me, busy, onMake }: { server: DeviceServer | null; me: Device | undefined; busy: boolean; onMake(): void }) {
  const name = server ? server.label ?? server.machine : null
  const reach = !server || server.this ? null
    : server.error ? <span className="error-text">{t(`닿지 못함: ${server.error}`, `Not reached: ${server.error}`)}</span>
    : server.reached ? <span>{t(`마지막 알림 ${relativeTime(Date.parse(server.reached))}`, `Last report ${relativeTime(Date.parse(server.reached))}`)}</span>
    : <span>{t('아직 알리지 않음', 'Not reported yet')}</span>
  return (
    <div className="setup set-rows dev-server" data-ui="서버 컴퓨터">
      <div className="setup-row">
        <span aria-hidden />
        <div className="setup-main">
          <div className="set-name">{t('서버', 'Server')}</div>
          <div className="setup-desc dev-meta">
            {server ? <span>{name}{server.this && t(' (이 기기)', ' (this device)')}</span> : <span>{t('정하지 않음. 늘 켜 두는 컴퓨터를 서버로 정하면 기기 목록이 실시간이 되고 기기마다 로그아웃할 수 있습니다. Tailscale이 켜져 있어야 합니다.', 'Not set. Make an always-on computer the server to see devices live and sign out per device. Tailscale must be on.')}</span>}
            {reach}
          </div>
        </div>
        {!server?.this && me && <button className="btn" disabled={busy} onClick={onMake}>{busy ? t('켜는 중…', 'Turning on…') : t('이 기기를 서버로', 'Make this device the server')}</button>}
      </div>
    </div>
  )
}


/** 앱 버전이 이 기기와 다른가 (둘 다 알 때만). 버전이 어긋나면 서버에서 도는 대화 화면이 맞지 않을 수 있다 (11/21 맥북의 빈 화면) */
export const versionDiffers = (d: Pick<Device, 'version' | 'this'>, me: Pick<Device, 'version'> | undefined): boolean => !d.this && !!d.version && !!me?.version && d.version !== me.version
/** 앱 버전을 읽는 말로 (11/21): 마지막 업데이트 번호와 시각 "#622 · 11/21 07:58". 이 기기가 모르는 커밋이면 해시 그대로 */
export function versionName(d: Pick<Device, 'version' | 'build'>): string {
  const b = d.build
  if (!b) return d.version ?? ''
  const at = new Date(b.at)
  const when = Number.isNaN(at.getTime()) ? '' : `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return [b.pr ? `#${b.pr}` : d.version, when].filter(Boolean).join(' · ')
}
/** 이 기기와 얼마나 다른가: "업데이트 12개 남음" · "3개 앞섬". 모르면 "버전 다름" */
export function versionGap(d: Pick<Device, 'build'>): string {
  const b = d.build
  if (b && b.behind > 0 && b.ahead === 0) return t(`업데이트 ${b.behind}개 남음`, `${b.behind} update(s) behind`)
  if (b && b.ahead > 0 && b.behind === 0) return t(`업데이트 ${b.ahead}개 앞섬`, `${b.ahead} update(s) ahead`)
  return t('버전 다름', 'Different version')
}
/** 서버 컴퓨터의 앱 버전이 이 기기와 다르면 그 둘 */
export function serverSkew(devices: Device[] | undefined): { name: string; server: string; here: string; gap: string } | null {
  const me = devices?.find((x) => x.this), sv = devices?.find((x) => x.server)
  return me?.version && sv?.version && versionDiffers(sv, me) ? { name: sv.label ?? sv.name, server: versionName(sv), here: versionName(me), gap: versionGap(sv) } : null
}

function DeviceRow({ d, differs, onLogout }: { d: Device; differs?: boolean; onLogout?: () => void }) {
  const state = d.this ? t('켜짐 · 지금', 'On · now') : d.online ? t(`켜짐 · ${relativeTime(Date.parse(d.seen))}`, `On · ${relativeTime(Date.parse(d.seen))}`) : t(`꺼짐 · ${relativeTime(Date.parse(d.seen))}`, `Off · ${relativeTime(Date.parse(d.seen))}`)
  const name = d.online ? t('켜짐', 'On') : t('꺼짐', 'Off')
  return (
    <div className={`setup-row dev-row${d.online ? '' : ' off'}`} data-ui="기기 줄">
      <span className={`g ${d.online ? 'solved' : 'stopped'}`} role="img" aria-label={name} title={name} />
      <div className="setup-main">
        <div className="set-name">{d.label ?? d.name}{d.this && <small className="setup-sub">{t('이 기기', 'This device')}</small>}{d.server && <small className="setup-sub">{t('서버', 'Server')}</small>}</div>
        <div className="setup-desc dev-meta">
          <span>{state}</span>
          {d.version && <span data-ui="기기 앱 버전" data-tip={d.build ? t(`마지막 업데이트 번호와 시각 (설정 › 업데이트 이력의 번호) · 커밋 ${d.version}`, `Last update number and time (as in Settings › Update history) · commit ${d.version}`) : undefined}>{t(`앱 ${versionName(d)}`, `App ${versionName(d)}`)}</span>}
          {differs && <span className="dev-differs" data-ui="기기 버전 다름" data-tip={d.build?.ahead && !d.build.behind ? t('이 기기보다 새 버전입니다. 이 기기의 앱을 다시 시작해 새 버전으로 맞추세요', 'It is newer than this device. Restart the app here to bring this device up to date') : t('이 기기와 앱 버전이 다릅니다. 그 컴퓨터에서 앱을 다시 시작해 새 버전으로 맞추세요', 'Its app version differs from this device. Restart the app there to bring it up to date')}>{versionGap(d)}</span>}
          {d.os && <span>{d.os}</span>}
          {d.logout && <span>{t('로그아웃 대기: 다음 알림 때 합니다', 'Sign-out pending: on its next report')}</span>}
          {d.helper && !d.this && <span data-ui="기기 피드백 돕기" data-tip={t('서버의 자리가 차면 넘치는 피드백을 이 컴퓨터가 맡습니다 (지금 도는 수 / 한 번에 맡는 수)', 'When the server is full, this computer takes the overflow feedback (running now / at most at once)')}>{t(`피드백 돕기 · ${d.helper.busy}/${d.helper.slots}`, `Helps with feedback · ${d.helper.busy}/${d.helper.slots}`)}</span>}
        </div>
        {d.this && !d.server && <HelperPick />}
        {d.accounts.length > 0 && <div className="dev-accts" data-ui="기기 계정">{d.accounts.map((a, i) => <span key={i} className="tag">{accountName(a)}</span>)}</div>}
      </div>
      {onLogout && <button className="btn" data-ui="기기 로그아웃" onClick={onLogout}>{t('로그아웃', 'Sign out')}</button>}
    </div>
  )
}

/**
 * 피드백 돕기 (11/23 사용자 「이 맥에서도 에이전트가 피드백을 처리하게 하고 충돌하지 않게」, 안 A): 서버가 따로 있는 맥에서 켜면
 * 서버의 자리가 찼을 때 넘치는 피드백을 서버가 이 맥에 맡긴다. 맡길지는 서버 한 곳이 정하고 맡음(handoff.yaml)은 그대로라 둘이 같은 항목을 맡지 않는다.
 * 이 맥이 꺼지거나 잠들면 3분 뒤 서버가 맡음을 풀고 다시 맡긴다. 값은 이 맥에만 (서버로 보내지 않는다)
 */
function HelperPick() {
  const client = useQueryClient()
  const list = useQuery({ queryKey: qk.agentChatList(), queryFn: () => agentChatsApi.list() })
  const settings = useQuery({ queryKey: qk.agentSettings, queryFn: api.agentSettings, staleTime: 5 * 60_000 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = settings.data
  if (!list.data?.app || !s?.place) return null
  const save = (helper: number) => {
    setBusy(true); setError(null)
    api.saveAgentSettings({ helper }).then((v) => client.setQueryData(qk.agentSettings, v)).catch((e: Error) => setError(e.message)).finally(() => setBusy(false))
  }
  const on = s.helper > 0
  return (
    <div className="dev-help" data-ui="피드백 돕기">
      <span id="dev-help-label" data-tip={t(`서버(${s.place.server})의 자리가 차면 넘치는 피드백을 서버가 이 컴퓨터에 맡깁니다. 이 컴퓨터가 꺼지거나 잠들면 3분 뒤 서버가 다시 맡깁니다`, `When the server (${s.place.server}) is full, it hands the overflow feedback to this computer. If this computer turns off or sleeps, the server hands it out again after 3 minutes`)}>{t('피드백 돕기', 'Help with feedback')}</span>
      <button type="button" role="switch" className="switch" aria-labelledby="dev-help-label" aria-checked={on} disabled={busy} onClick={() => save(on ? 0 : 1)} />
      {on && <select className="rs-select set-select" value={s.helper} disabled={busy} aria-label={t('한 번에 맡는 수', 'At most at once')} onChange={(e) => save(Number(e.target.value))}>
        {[1, 2, 3].map((n) => <option key={n} value={n}>{t(`한 번에 ${n}개`, `${n} at once`)}</option>)}
      </select>}
      {error && <span className="error-text">{error}</span>}
    </div>
  )
}
