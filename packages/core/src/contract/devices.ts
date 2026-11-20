// 서버 › 기기 (11/20 사용자 "클로드 기기관리처럼", 시안 1단계): 이 앱을 쓰는 컴퓨터마다 한 줄.
// 컴퓨터마다 개인 저장소의 _settings/<컴퓨터>/device.yaml에 이름 · 마지막 맞춘 때 · 앱 버전 · 로그인한 계정 이름을 올리고, 다른 컴퓨터가 그것을 읽는다
import { z } from 'zod'

/** 그 컴퓨터에 로그인한 계정. 이름과 요금제만 (이메일 · 열쇠는 올리지 않는다) */
export const DeviceAccount = z.object({
  kind: z.enum(['github', 'claude', 'codex', 'google']),
  /** GitHub 로그인 이름, 또는 더한 Claude · Codex 계정의 이름 */
  name: z.string().optional(),
  plan: z.string().optional(),
}).strict()
export const Device = z.object({
  /** 개인 저장소의 컴퓨터 폴더 이름 (호스트 이름) */
  name: z.string(),
  /** 보일 이름 (맥의 컴퓨터 이름) */
  label: z.string().optional(),
  /** 지금 이 화면을 연 컴퓨터 */
  this: z.boolean(),
  /** 최근(2시간 안)에 개인 저장소와 맞췄나. 이 컴퓨터는 늘 true */
  online: z.boolean(),
  /** 마지막으로 맞춘 때 (이 컴퓨터는 지금) */
  seen: z.string(),
  version: z.string().optional(),
  os: z.string().optional(),
  accounts: z.array(DeviceAccount),
}).strict()
export const Devices = z.object({
  devices: z.array(Device),
  /** 개인 저장소와 맞추는 중인가 (아니면 다른 컴퓨터가 보이지 않는다) */
  shared: z.boolean(),
}).strict()

export type DeviceAccount = z.infer<typeof DeviceAccount>
export type Device = z.infer<typeof Device>
export type Devices = z.infer<typeof Devices>
