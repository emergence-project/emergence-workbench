/**
 * 폰에서 보기 API의 계약 (Tailscale로 이 맥의 앱을 내 기기에서 열기, 서버 routes/phone.ts · 화면 api/phone.ts).
 */
import { z } from 'zod'

/** GET /phone, POST /phone/on, POST /phone/off */
export const PhoneStatus = z.object({
  /** 이 맥에 Tailscale이 깔려 있는지 */
  installed: z.boolean(),
  /** Tailscale에 로그인해 이어져 있는지 */
  running: z.boolean(),
  /** 이 앱을 Tailscale 주소로 열어 두었는지 */
  on: z.boolean(),
  /** 이 맥의 Tailscale 이름 (예: mac.tail1234.ts.net) */
  host: z.string().nullable(),
  /** 이 맥이 로그인한 Tailscale 계정 */
  login: z.string().nullable(),
  /** 폰에서 열 주소 (켜져 있을 때) */
  url: z.string().nullable(),
  /** 켜지 못했을 때: tailnet에서 HTTPS를 허락할 주소 */
  enableUrl: z.string().nullable().optional(),
  error: z.string().optional(),
}).strict()

export type PhoneStatus = z.infer<typeof PhoneStatus>
