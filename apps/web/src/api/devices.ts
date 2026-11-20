// ---------- 서버 › 기기 (11/20 시안 1단계): 이 앱을 쓰는 컴퓨터 목록 (서버 routes/devices.ts · devices.ts) ----------
import type { Devices } from '@rw/core/contract/devices'
import { enc, json, req, send } from './http'

export type { Device, DeviceAccount, Devices, DeviceServer } from '@rw/core/contract/devices'
export const devicesApi = {
  get: () => req('/api/devices').then((r) => json<Devices>(r)),
  /** 이 컴퓨터를 서버로 (2단계) */
  makeServer: () => req('/api/devices/server', send('POST', {})).then((r) => json<Devices>(r)),
  logout: (name: string) => req(`/api/devices/${enc(name)}/logout`, send('POST', {})).then((r) => json<Devices>(r)),
}
