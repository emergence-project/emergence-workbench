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
/** 컴퓨터가 올리는 기기 정보 (개인 저장소의 device.yaml, 서버에 1분마다 보내는 것) */
export const DeviceRecord = z.object({
  /** 개인 저장소의 컴퓨터 폴더 이름 (호스트 이름) */
  name: z.string().min(1).max(100),
  /** 보일 이름 (맥의 컴퓨터 이름) */
  label: z.string().max(200).optional(),
  /** 마지막으로 본 때 */
  seen: z.string().max(40),
  version: z.string().max(40).optional(),
  os: z.string().max(100).optional(),
  accounts: z.array(DeviceAccount).max(30),
}).strict()
export const Device = DeviceRecord.extend({
  /** 지금 이 화면을 연 컴퓨터 */
  this: z.boolean(),
  /** 켜져 있나: 서버에 3분 안에 알렸거나, 서버가 없으면 2시간 안에 개인 저장소와 맞췄나. 이 컴퓨터는 늘 true */
  online: z.boolean(),
  /** 서버가 실시간으로 본 값인가 (아니면 개인 저장소에 올린 마지막 값) */
  live: z.boolean().optional(),
  /** 서버 컴퓨터 */
  server: z.boolean().optional(),
  /** 로그아웃을 걸어 두었고 그 컴퓨터가 아직 서버에 닿지 않았다 */
  logout: z.boolean().optional(),
}).strict()
/** 서버 (11/20 2단계): 개인 저장소의 _settings/server.yaml에 적힌 컴퓨터. 다른 컴퓨터는 Tailscale 주소로 1분마다 알린다 */
export const DeviceServer = z.object({
  machine: z.string(),
  label: z.string().optional(),
  /** 이 컴퓨터가 서버 */
  this: z.boolean(),
  /** 이 컴퓨터가 서버에 마지막으로 닿은 때 (서버면 없음) */
  reached: z.string().optional(),
  /** 마지막으로 닿지 못한 까닭 */
  error: z.string().optional(),
}).strict()
export const Devices = z.object({
  devices: z.array(Device),
  /** 개인 저장소와 맞추는 중인가 (아니면 다른 컴퓨터가 보이지 않는다) */
  shared: z.boolean(),
  server: DeviceServer.nullable(),
}).strict()
/** 서버가 받은 알림의 답: 서버가 본 기기 목록과, 이 컴퓨터를 로그아웃할지 */
export const DeviceBeatReply = z.object({ devices: z.array(Device), logout: z.boolean() }).strict()
export const DeviceLogoutBody = z.object({ name: z.string().min(1).max(100) }).strict()
export const DeviceOk = z.object({ ok: z.literal(true) }).strict()

export type DeviceAccount = z.infer<typeof DeviceAccount>
export type Device = z.infer<typeof Device>
export type Devices = z.infer<typeof Devices>
export type DeviceRecord = z.infer<typeof DeviceRecord>
export type DeviceServer = z.infer<typeof DeviceServer>
export type DeviceBeatReply = z.infer<typeof DeviceBeatReply>
export type DeviceOk = z.infer<typeof DeviceOk>

/** 대화를 서버에서 (3단계, 11/20 사용자 「A 서버에서 돌리기」 · 「그렇게하자」): 서버가 다른 컴퓨터면 대화 · 중앙은 서버에서 돌고,
 * 이 컴퓨터에서 돈 대화는 같은 목록에 「이 맥」으로 함께 보인다 (새 대화에서 「이 맥」을 고르면 이 컴퓨터에서) */
export const ChatPlace = z.object({
  /** 서버로 정한 컴퓨터 (없으면 null: 대화는 늘 이 컴퓨터에서) */
  server: z.object({ machine: z.string(), label: z.string().optional(), this: z.boolean() }).strict().nullable(),
  /** 새 대화 · 중앙을 서버에서 돌리는가 (서버가 다른 컴퓨터일 때) */
  remote: z.boolean(),
  /** 서버의 실시간 알림을 받고 있는가 */
  live: z.boolean(),
  /** 서버에 닿지 못한 까닭 */
  error: z.string().optional(),
}).strict()
export type ChatPlace = z.infer<typeof ChatPlace>
