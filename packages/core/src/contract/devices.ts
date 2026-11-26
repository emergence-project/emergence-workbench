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
/**
 * 피드백 돕기 (11/23 안 A): 서버가 아닌 맥이 켜 두면 서버의 자리가 찼을 때 넘치는 피드백을 서버가 그 맥에 맡긴다.
 * slots = 한 번에 맡는 수, busy = 지금 그 맥에서 도는 피드백 대화 수
 */
export const DeviceHelper = z.object({ slots: z.number().int().min(1).max(3), busy: z.number().int().min(0).max(50) }).strict()
/** 서버에 1분마다 보내는 알림: 기기 정보 + 피드백 돕기 (keys = 그 맥에서 도는 피드백 대화가 맡은 항목: 그 맥이 꺼지면 서버가 맡음을 푼다) */
export const DeviceBeat = DeviceRecord.extend({ helper: DeviceHelper.extend({ keys: z.array(z.string().max(300)).max(50) }).strict().optional() }).strict()
/** 앱 버전을 읽는 말로 (서버 deviceBuild.ts): 마지막 업데이트 번호 · 시각, 이 컴퓨터보다 몇 개 뒤 · 앞 */
export const DeviceBuild = z.object({ pr: z.number().int().optional(), at: z.string().max(40), behind: z.number().int(), ahead: z.number().int() }).strict()
export const Device = DeviceRecord.extend({
  /** version(커밋)을 이 컴퓨터의 앱 저장소에서 찾았을 때만. 목록을 볼 때 붙이고, 컴퓨터끼리 주고받지는 않는다 */
  build: DeviceBuild.optional(),
  /** 지금 이 화면을 연 컴퓨터 */
  this: z.boolean(),
  /** 켜져 있나: 서버에 3분 안에 알렸거나, 서버가 없으면 2시간 안에 개인 저장소와 맞췄나. 이 컴퓨터는 늘 true */
  online: z.boolean(),
  /** 서버가 실시간으로 본 값인가 (아니면 개인 저장소에 올린 마지막 값) */
  live: z.boolean().optional(),
  /** 서버 컴퓨터 */
  server: z.boolean().optional(),
  /** 로그아웃을 걸어 두었고, 그 컴퓨터의 계정이 빠진 것을 서버가 아직 보지 못했다 (서버를 다시 켜도 남는다) */
  logout: z.boolean().optional(),
  /** 피드백 돕기를 켠 맥 (서버가 본 값) */
  helper: DeviceHelper.optional(),
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
/**
 * 서버가 받은 알림의 답: 서버가 본 기기 목록과, 이 컴퓨터를 로그아웃할지.
 * feedback = 서버가 이 맥에 맡긴 피드백 (한 대화에 묶어 시작), drop = 이 맥이 늦어 서버가 맡음을 푼 항목 (그 대화를 멈춘다)
 */
export const DeviceBeatReply = z.object({ devices: z.array(Device), logout: z.boolean(), feedback: z.array(z.string()).optional(), drop: z.array(z.string()).optional() }).strict()
export const DeviceLogoutBody = z.object({ name: z.string().min(1).max(100) }).strict()
export const DeviceOk = z.object({ ok: z.literal(true) }).strict()

export type DeviceAccount = z.infer<typeof DeviceAccount>
export type Device = z.infer<typeof Device>
export type DeviceBuild = z.infer<typeof DeviceBuild>
export type Devices = z.infer<typeof Devices>
export type DeviceRecord = z.infer<typeof DeviceRecord>
export type DeviceBeat = z.infer<typeof DeviceBeat>
export type DeviceHelper = z.infer<typeof DeviceHelper>
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
