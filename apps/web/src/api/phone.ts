// ---------- 폰에서 보기 (Tailscale로 이 맥의 앱을 내 기기에서 열기, 서버 phone.ts) ----------
import type { PhoneStatus } from '@rw/core/contract/phone'
import { json, req } from './http'

export type { PhoneStatus } from '@rw/core/contract/phone'
export const phoneApi = {
  status: () => req('/api/phone').then((r) => json<PhoneStatus>(r)),
  on: () => req('/api/phone/on', { method: 'POST' }).then((r) => json<PhoneStatus>(r)),
  off: () => req('/api/phone/off', { method: 'POST' }).then((r) => json<PhoneStatus>(r)),
}
