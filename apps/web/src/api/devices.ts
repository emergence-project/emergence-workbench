// ---------- 서버 › 기기 (11/20 시안 1단계): 이 앱을 쓰는 컴퓨터 목록 (서버 routes/devices.ts · devices.ts) ----------
import type { Devices } from '@rw/core/contract/devices'
import { json, req } from './http'

export type { Device, DeviceAccount, Devices } from '@rw/core/contract/devices'
export const devicesApi = {
  get: () => req('/api/devices').then((r) => json<Devices>(r)),
}
