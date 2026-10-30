// 폰에서 보기: Tailscale로 이 맥의 앱을 내 기기에서 연다 (설정 화면, phone.ts)
import type { FastifyInstance, FastifyRequest } from 'fastify'
import * as C from '@rw/core/contract/phone'
import { replies } from '../contract.js'
import type { Phone } from '../phone.js'

/** 이 서버가 받는 포트 (tailscale serve가 전해 줄 곳) */
const portOf = (req: FastifyRequest) => req.socket.localPort ?? Number(process.env.RW_PORT ?? 5174)

export function registerPhone(app: FastifyInstance, phone: Phone, remember: (s: C.PhoneStatus) => void): void {
  const keep = (s: C.PhoneStatus) => { remember(s); return s }
  app.get('/api/phone', replies(C.PhoneStatus), async (req): Promise<C.PhoneStatus> => keep(await phone.status(portOf(req))))
  app.post('/api/phone/on', replies(C.PhoneStatus), async (req): Promise<C.PhoneStatus> => keep(await phone.on(portOf(req))))
  app.post('/api/phone/off', replies(C.PhoneStatus), async (req): Promise<C.PhoneStatus> => keep(await phone.off(portOf(req))))
}
