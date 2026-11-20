// ---------- 서버 › 기기 (11/20 시안 1단계): 이 앱을 쓰는 컴퓨터 목록 (서버 routes/devices.ts · devices.ts) ----------
import type { ChatPlace, ChatPlaceKind, Devices } from '@rw/core/contract/devices'
import { enc, json, req, send } from './http'

export type { ChatPlace, ChatPlaceKind, Device, DeviceAccount, Devices, DeviceServer } from '@rw/core/contract/devices'
export const devicesApi = {
  get: () => req('/api/devices').then((r) => json<Devices>(r)),
  /** 이 컴퓨터를 서버로 (2단계) */
  makeServer: () => req('/api/devices/server', send('POST', {})).then((r) => json<Devices>(r)),
  /** 대화가 도는 곳 (3단계) */
  chatPlace: () => req('/api/chat-place').then((r) => json<ChatPlace>(r)),
  setChatPlace: (place: ChatPlaceKind) => req('/api/chat-place', send('PUT', { place })).then((r) => json<ChatPlace>(r)),
  logout: (name: string) => req(`/api/devices/${enc(name)}/logout`, send('POST', {})).then((r) => json<Devices>(r)),
}
