// 설정 › 서버 (11/20 사용자 "클로드 기기관리처럼"): 이 앱을 쓰는 컴퓨터 목록.
// 1단계: 다른 컴퓨터는 개인 저장소에 올린 마지막 값. 2단계 ("맥스튜디오를 서버로"): 서버로 정한 컴퓨터에 다른 컴퓨터가 1분마다 알리고(실시간), 서버가 기기마다 로그아웃을 건다
import type { FastifyInstance, FastifyRequest } from 'fastify'
import * as C from '@rw/core/contract/devices'
import { parseBody, replies } from '../contract.js'
import { machineName } from '../backup.js'
import { logoutDevice, otherDevices, setDeviceAccounts, setDeviceLogout, thisDevice } from '../devices.js'
import { BEAT_MS, DEVICE_KEY_HEADER, DeviceHub, deviceKeyOk, mergeDevices, readServerConfig, writeServerConfig, type ServerConfig } from '../deviceServer.js'
import { deviceBuild } from '../deviceBuild.js'
import { t } from '../i18n.js'
import type { PhoneStatus } from '@rw/core/contract/phone'
import type { Phone } from '../phone.js'
import { errorLog, repeat } from '../scheduler.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'


export interface DeviceDeps {
  phone: Phone
  seePhone: (s: PhoneStatus) => void
  runBackup: (() => Promise<unknown>) | null
}

/** 예제 모드: 실제 컴퓨터 · 계정 대신 지어낸 기기 셋 (그림 · CI 산출물에 남지 않게) */
function sampleDevices(now: Date): C.Device[] {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString()
  const gh = { kind: 'github' as const, name: 'researcher' }
  return [
    { name: 'studio', label: 'Mac Studio', this: true, online: true, seen: ago(0), version: '1a19a27', build: { pr: 622, at: '2026-11-21T07:58:00+09:00', behind: 0, ahead: 0 }, os: 'macOS 26.1', accounts: [gh, { kind: 'claude', plan: 'Max' }, { kind: 'claude', name: '답변용', plan: 'Pro' }, { kind: 'codex', plan: 'Plus' }, { kind: 'google' }] },
    { name: 'laptop', label: 'MacBook Pro', this: false, online: true, live: true, seen: ago(1), version: '1a19a27', build: { pr: 622, at: '2026-11-21T07:58:00+09:00', behind: 0, ahead: 0 }, os: 'macOS 26.1', accounts: [gh, { kind: 'claude', plan: 'Pro' }] },
    { name: 'mini', label: 'Mac mini', this: false, online: false, seen: ago(60 * 19), version: 'dc65a0e', build: { pr: 610, at: '2026-11-21T06:45:00+09:00', behind: 12, ahead: 0 }, os: 'macOS 15.6', accounts: [gh, { kind: 'claude', plan: 'Max' }, { kind: 'codex', plan: 'Plus' }] },
  ]
}

const portOf = (req: FastifyRequest) => req.socket.localPort ?? Number(process.env.RW_PORT ?? 5174)

export function registerDevices(app: FastifyInstance, ctx: RouteContext, deps: DeviceDeps): void {
  const { opts, registry, account } = ctx
  setDeviceAccounts('github', () => (account.account ? [{ kind: 'github', name: account.account.login }] : []))
  if (!opts.sandbox) setDeviceLogout('github', () => account.account && account.logout())
  const hub = new DeviceHub()

  // 예제 모드: 맥 스튜디오가 서버인 모습. 로그아웃은 눌러 볼 수 있게 메모리에서만
  let sampleServer: string | null = 'studio'
  const samplePending = new Set<string>()

  const dirs = () => [opts.backup?.dir, opts.personalDir]
  const config = (): ServerConfig | null => readServerConfig(dirs())
  /** 이 컴퓨터가 서버에 마지막으로 알린 결과 */
  let reach: { at: string; devices: C.Device[]; error?: string } | null = null

  const view = async (): Promise<C.Devices> => {
    const now = new Date()
    if (opts.sandbox) {
      const devices = sampleDevices(now).map((d) => ({ ...d, ...(d.name === sampleServer && { server: true }), ...(samplePending.has(d.name) && { logout: true }) }))
      const label = devices.find((d) => d.name === sampleServer)?.label
      return { shared: true, devices, server: sampleServer ? { machine: sampleServer, ...(label && { label }), this: sampleServer === 'studio' } : null }
    }
    const me = machineName()
    const shared = !!opts.backup && !!(opts.backup.remote || registry.personalRepo)
    const repo = opts.backup ? otherDevices(opts.backup.dir, me, now) : []
    const cfg = config()
    const amServer = cfg?.machine === me
    const seen = amServer ? hub.live(now.getTime()) : (reach?.devices ?? [])
    const devices = mergeDevices({ ...deviceForBackup(ctx), this: true, online: true }, seen, repo, cfg?.machine ?? null, (n) => amServer && hub.pending(n))
    const server: C.DeviceServer | null = cfg
      ? { machine: cfg.machine, ...(cfg.label && { label: cfg.label }), this: amServer, ...(!amServer && reach && (reach.error ? { error: reach.error } : { reached: reach.at })) }
      : null
    return { shared, devices: await withBuilds(devices), server }
  }
  /** 버전(커밋)을 업데이트 번호 · 시각 · 앞뒤 수로 (앱 저장소가 있을 때) */
  const withBuilds = async (devices: C.Device[]): Promise<C.Device[]> => {
    const repo = opts.appRepo
    if (!repo) return devices
    return Promise.all(devices.map(async (d) => { const b = d.version ? await deviceBuild(repo.root, d.version, repo.running) : null; return b ? { ...d, build: b } : d }))
  }

  app.get('/api/devices', replies(C.Devices), async (): Promise<C.Devices> => view())

  /** 이 컴퓨터를 서버로: Tailscale 주소를 켜고, 주소와 새 열쇠를 개인 저장소에 적어 올린다 */
  app.post('/api/devices/server', replies(C.Devices), async (req): Promise<C.Devices> => {
    if (opts.sandbox) { sampleServer = 'studio'; return view() }
    if (!opts.backup) throw new WorkbenchError(400, t('개인 저장소와 맞추기를 먼저 켜 주세요 (설정 › 동기화)', 'Turn on sync with your personal repository first (Settings › Sync)'))
    const st = await deps.phone.on(portOf(req))
    deps.seePhone(st)
    if (!st.url) throw new WorkbenchError(409, !st.running
      ? t('Tailscale을 켜고 로그인한 뒤 다시 눌러 주세요', 'Start Tailscale and sign in, then try again')
      : st.enableUrl
        // 처음 한 번은 tailnet 관리 화면에서 HTTPS를 허락해야 serve가 켜진다. 그 주소를 화면에 넘겨 링크로 보인다
        ? t(`Tailscale에서 HTTPS를 처음 한 번 허락해야 합니다. 허락한 뒤 다시 눌러 주세요: ${st.enableUrl}`, `Allow HTTPS in Tailscale once, then try again: ${st.enableUrl}`)
        : t(`Tailscale 주소를 켜지 못했습니다${st.error ? `: ${st.error}` : ''}`, `Could not turn on the Tailscale address${st.error ? `: ${st.error}` : ''}`))
    const me = thisDevice(machineName(), undefined)
    writeServerConfig(opts.backup.dir, { machine: me.name, ...(me.label && { label: me.label }), url: st.url })
    hub.beat({ ...deviceForBackup(ctx) })
    void deps.runBackup?.().catch(() => {})
    return view()
  })

  /** 기기 로그아웃: 이 컴퓨터면 바로, 다른 컴퓨터면 서버에 걸어 두고 그 컴퓨터가 다음에 알릴 때 받는다 */
  app.post<{ Params: { name: string } }>('/api/devices/:name/logout', replies(C.Devices), async (req): Promise<C.Devices> => {
    const name = req.params.name
    if (opts.sandbox) { if (name !== 'studio') samplePending.add(name); return view() }
    const me = machineName()
    if (name === me) { await logoutDevice(); return view() }
    const cfg = config()
    if (!cfg) throw new WorkbenchError(409, t('서버로 정한 컴퓨터가 없습니다. 먼저 한 컴퓨터를 서버로 정해 주세요', 'No computer is set as the server yet'))
    if (cfg.machine === me) hub.requestLogout(name)
    else await callServer(cfg, '/api/devices/remote-logout', { name })
    return view()
  })

  // ── 서버 쪽: 다른 컴퓨터가 열쇠를 붙여 부르는 곳 ──
  const checkKey = (req: FastifyRequest): void => {
    const cfg = config()
    if (!cfg || cfg.machine !== machineName()) throw new WorkbenchError(409, t('이 컴퓨터는 서버가 아닙니다', 'This computer is not the server'))
    // 열쇠 비교는 대화 넘기기(appKey.ts)와 같은 곳에서: 걸린 시간으로 열쇠가 새지 않게
    if (!deviceKeyOk(req.headers, dirs(), machineName())) throw new WorkbenchError(401, t('열쇠가 맞지 않습니다', 'Wrong key'))
  }
  app.post('/api/devices/beat', replies(C.DeviceBeatReply), async (req): Promise<C.DeviceBeatReply> => {
    checkKey(req)
    const rec = parseBody(C.DeviceRecord, req.body)
    const { logout } = hub.beat(rec)
    const me = { ...deviceForBackup(ctx), this: false, online: true, live: true, server: true }
    return { devices: [me, ...hub.live().filter((d) => d.name !== rec.name)], logout }
  })
  app.post('/api/devices/remote-logout', replies(C.DeviceOk), async (req): Promise<C.DeviceOk> => {
    checkKey(req)
    const { name } = parseBody(C.DeviceLogoutBody, req.body)
    if (name === machineName()) await logoutDevice()
    else hub.requestLogout(name)
    return { ok: true }
  })

  // ── 다른 컴퓨터 쪽: 1분마다 서버에 알린다 ──
  async function callServer(cfg: ServerConfig, p: string, body: unknown): Promise<unknown> {
    const r = await fetch(`${cfg.url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', [DEVICE_KEY_HEADER]: cfg.secret }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
    const j: unknown = await r.json().catch(() => null)
    if (!r.ok) {
      const msg = j && typeof j === 'object' && 'error' in j && typeof j.error === 'string' ? j.error : `HTTP ${r.status}`
      throw new WorkbenchError(502, t(`서버에 닿지 못했습니다: ${msg}`, `Could not reach the server: ${msg}`))
    }
    return j
  }
  if (!opts.sandbox) {
    const log = errorLog('기기 알리기')
    repeat(app, {
      first: 10_000,
      every: () => { const c = config(); return c && c.machine !== machineName() ? BEAT_MS : null },
      run: async () => {
        const cfg = config()
        if (!cfg || cfg.machine === machineName()) return
        try {
          const res = C.DeviceBeatReply.parse(await callServer(cfg, '/api/devices/beat', deviceForBackup(ctx)))
          reach = { at: new Date().toISOString(), devices: res.devices }
          log.ok()
          if (res.logout) await logoutDevice()
        } catch (e) {
          reach = { at: new Date().toISOString(), devices: [], error: e instanceof Error ? e.message : String(e) }
          log.fail(e)
        }
      },
    })
  }
}

/** 맞추기 · 서버에 알릴 이 컴퓨터의 기기 정보 */
export const deviceForBackup = (ctx: RouteContext) => thisDevice(machineName(), ctx.opts.appRepo?.running.slice(0, 7) ?? ctx.opts.appVersion)
