// 서버 › 기기 (11/20 사용자 "클로드 기기관리처럼", 시안 1단계): 이 앱을 쓰는 컴퓨터 목록. 이 컴퓨터는 지금 값, 다른 컴퓨터는 개인 저장소에 올린 마지막 값
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/devices'
import { replies } from '../contract.js'
import { machineName } from '../backup.js'
import { otherDevices, setDeviceAccounts, thisDevice } from '../devices.js'
import type { RouteContext } from './context.js'

/** 예제 모드: 실제 컴퓨터 · 계정 대신 지어낸 기기 셋 (그림 · CI 산출물에 남지 않게) */
function sample(now: Date): C.Devices {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString()
  const gh = { kind: 'github' as const, name: 'researcher' }
  return {
    shared: true,
    devices: [
      { name: 'studio', label: 'Mac Studio', this: true, online: true, seen: ago(0), version: '1a19a27', os: 'macOS 26.1', accounts: [gh, { kind: 'claude', plan: 'Max' }, { kind: 'claude', name: '답변용', plan: 'Pro' }, { kind: 'codex', plan: 'Plus' }, { kind: 'google' }] },
      { name: 'laptop', label: 'MacBook Pro', this: false, online: true, seen: ago(14), version: '1a19a27', os: 'macOS 26.1', accounts: [gh, { kind: 'claude', plan: 'Pro' }] },
      { name: 'mini', label: 'Mac mini', this: false, online: false, seen: ago(60 * 19), version: 'dc65a0e', os: 'macOS 15.6', accounts: [gh, { kind: 'claude', plan: 'Max' }, { kind: 'codex', plan: 'Plus' }] },
    ],
  }
}

export function registerDevices(app: FastifyInstance, ctx: RouteContext): void {
  const { opts, registry, account } = ctx
  setDeviceAccounts('github', () => (account.account ? [{ kind: 'github', name: account.account.login }] : []))
  app.get('/api/devices', replies(C.Devices), async (): Promise<C.Devices> => {
    const now = new Date()
    if (opts.sandbox) return sample(now)
    const me = machineName()
    const shared = !!opts.backup && !!(opts.backup.remote || registry.personalRepo)
    const others = opts.backup ? otherDevices(opts.backup.dir, me, now) : []
    return { shared, devices: [{ ...deviceForBackup(ctx), this: true, online: true }, ...others] }
  })
}

/** 맞추기가 올릴 이 컴퓨터의 기기 정보 */
export const deviceForBackup = (ctx: RouteContext) => thisDevice(machineName(), ctx.opts.appRepo?.running.slice(0, 7) ?? ctx.opts.appVersion)
