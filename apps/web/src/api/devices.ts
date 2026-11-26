// ---------- 서버 › 기기 (11/20 시안 1단계): 이 앱을 쓰는 컴퓨터 목록 (서버 routes/devices.ts · devices.ts) ----------
import type { ChatPlace, Devices } from '@rw/core/contract/devices'
import { enc, json, req, send } from './http'

export type { ChatPlace, Device, DeviceAccount, Devices, DeviceServer } from '@rw/core/contract/devices'
export const devicesApi = {
  get: () => req('/api/devices').then((r) => json<Devices>(r)),
  /** 이 컴퓨터를 서버로 (2단계) */
  makeServer: () => req('/api/devices/server', send('POST', {})).then((r) => json<Devices>(r)),
  /** 서버가 다른 컴퓨터인지 · 닿는지 (새 대화의 서버 | 이 맥 고르기, 에이전트 패널 한 줄) */
  chatPlace: () => req('/api/chat-place').then((r) => json<ChatPlace>(r)),
  logout: (name: string) => req(`/api/devices/${enc(name)}/logout`, send('POST', {})).then((r) => json<Devices>(r)),
  /** 걸어 둔 로그아웃 취소 */
  cancelLogout: (name: string) => req(`/api/devices/${enc(name)}/logout`, { method: 'DELETE' }).then((r) => json<Devices>(r)),
}
