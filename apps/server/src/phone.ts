/**
 * 폰에서 보기 (설정 › 폰에서 보기, 10/30): 이 맥의 앱을 Tailscale로 이어진 내 기기(폰 · 아이패드)에서 연다.
 *
 * 서버는 그대로 맥 안 주소(127.0.0.1)에서만 받는다. `tailscale serve`가 이 맥의 Tailscale 주소(https://<맥>.<tailnet>.ts.net)로
 * 들어온 요청을 127.0.0.1로 전해 준다. Tailscale은 내 계정의 기기끼리만 이어지므로 바깥 인터넷에는 열리지 않는다.
 * 전해 줄 때 Host는 그 ts.net 이름 그대로이고, 보낸 사람의 Tailscale 계정을 `Tailscale-User-Login` 머리에 붙인다.
 * 그래서 hostGuard는 그 이름을 이 맥의 이름일 때만, 그리고 그 머리가 이 맥의 계정일 때만 받는다(phoneRequestOk).
 * Tailscale의 serve 설정은 tailscaled가 기억하므로 맥을 다시 켜도 그대로다. 서버는 시작할 때 상태를 한 번 읽어 이름을 안다.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { PhoneStatus } from '@rw/core/contract/phone'

const exec = promisify(execFile)

export interface Phone {
  status(port: number): Promise<PhoneStatus>
  on(port: number): Promise<PhoneStatus>
  off(port: number): Promise<PhoneStatus>
}

/** 맥에서 Tailscale CLI가 있는 곳: App Store · 내려받은 앱 안의 실행 파일, 그 앱이 깔아 주는 명령, Homebrew */
const CANDIDATES = [
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
]

/** Tailscale이 HTTPS(serve)를 처음 켤 때 tailnet 관리 화면에서 허락받으라고 내놓는 주소 */
export const enableUrlOf = (out: string): string | null => out.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0] ?? null

interface TsStatus { BackendState?: string; Self?: { DNSName?: string; UserID?: number }; User?: Record<string, { LoginName?: string }> }
interface ServeStatus { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> }

/** `tailscale serve status --json`에서 이 이름의 https 443 "/"가 이 앱 서버로 가는지 */
export const servesApp = (serve: ServeStatus, host: string, port: number): boolean => {
  const proxy = serve.Web?.[`${host}:443`]?.Handlers?.['/']?.Proxy ?? ''
  return proxy.replace(/\/$/, '') === `http://127.0.0.1:${port}`
}

/** JSON.parse는 any를 돌려주므로 받는 쪽 타입으로 둔다 (tailscale이 내놓는 모양) */
const parseJson = <T>(text: string): T => JSON.parse(text)
/** execFile 오류의 stdout · stderr · message */
const textOf = (e: unknown, key: string): string => (e && typeof e === 'object' ? String(Reflect.get(e, key) ?? '') : '')

export function tailscalePhone(bin = process.env.RW_TAILSCALE_BIN ?? CANDIDATES.find((p) => existsSync(p))): Phone {
  const run = async (args: string[], timeout = 10_000) => (await exec(bin!, args, { timeout, maxBuffer: 4 * 1024 * 1024 })).stdout

  const status = async (port: number): Promise<PhoneStatus> => {
    if (!bin) return { installed: false, running: false, on: false, host: null, login: null, url: null }
    let st: TsStatus
    try { st = parseJson<TsStatus>(await run(['status', '--json'])) } catch {
      return { installed: true, running: false, on: false, host: null, login: null, url: null }
    }
    const host = st.Self?.DNSName?.replace(/\.$/, '').toLowerCase() || null
    const login = st.Self?.UserID !== undefined ? st.User?.[String(st.Self.UserID)]?.LoginName ?? null : null
    if (st.BackendState !== 'Running' || !host) return { installed: true, running: false, on: false, host, login, url: null }
    let serve: ServeStatus = {}
    try { serve = parseJson<ServeStatus>((await run(['serve', 'status', '--json'])) || '{}') } catch { /* 아직 serve를 쓴 적 없음 */ }
    const on = servesApp(serve, host, port)
    return { installed: true, running: true, on, host, login, url: on ? `https://${host}` : null }
  }

  return {
    status,
    async on(port) {
      const before = await status(port)
      if (!before.running) return before
      try {
        // 처음이면 tailnet에서 HTTPS를 허락하라는 주소를 내놓고 기다린다. 기다리지 않고 그 주소를 화면에 넘긴다
        await run(['serve', '--bg', `http://127.0.0.1:${port}`], 20_000)
      } catch (e) {
        const out = `${textOf(e, 'stdout')}\n${textOf(e, 'stderr')}`
        const after = await status(port)
        if (after.on) return after
        return { ...after, enableUrl: enableUrlOf(out), error: out.trim().split('\n').filter(Boolean).slice(-2).join(' ') || textOf(e, 'message') }
      }
      return status(port)
    },
    async off(port) {
      try { await run(['serve', '--https=443', 'off']) } catch { /* 이미 꺼져 있음 */ }
      return status(port)
    },
  }
}

/** 예제 모드 · 화면 그림: Tailscale이 켜진 맥처럼 답한다(진짜 tailscale은 부르지 않는다) */
export function samplePhone(): Phone {
  let on = false
  const host = 'example-mac.tail0000.ts.net'
  const st = (): PhoneStatus => ({ installed: true, running: true, on, host, login: 'me@example.com', url: on ? `https://${host}` : null })
  return { status: async () => st(), on: async () => { on = true; return st() }, off: async () => { on = false; return st() } }
}

/**
 * 폰에서 온 요청인지 보고 받을지 정한다. host가 이 맥의 ts.net 이름이 아니면 이 판정과 상관없다(null).
 * 그 이름이면 Tailscale이 붙인 보낸 사람 계정이 있어야 하고, 이 맥의 계정을 알면 같아야 한다.
 */
export function phoneRequestOk(hostHeader: string | undefined, userLogin: string | undefined, phone: { host: string | null; login: string | null }): boolean | null {
  if (!phone.host || !hostHeader) return null
  if (hostHeader.trim().toLowerCase().split(':')[0] !== phone.host) return null
  if (!userLogin) return false
  return !phone.login || userLogin.toLowerCase() === phone.login.toLowerCase()
}
