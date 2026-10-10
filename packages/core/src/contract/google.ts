/**
 * 구글 계정 API의 계약 (로그인 · 달력 · 설정 동기화, 서버 routes/google.ts · 화면 api/google.ts).
 */
import { z } from 'zod'

/** lastPush: 마지막으로 구글에 올린 때 (GET /google에만) */
export const GoogleStatus = z.object({
  /** 클라이언트 ID가 설정되어 있는지 */
  configured: z.boolean(),
  connected: z.boolean(),
  email: z.string().optional(),
  /** 예제 모드의 가짜 구글 */
  mock: z.boolean(),
  synced: z.boolean(),
  clientId: z.string().optional(),
  lastPush: z.object({ at: z.string(), error: z.string().optional() }).strict().nullable().optional(),
}).strict()

export const GoogleEvent = z.object({
  id: z.string(),
  calendar: z.string(),
  title: z.string(),
  /** 시작하는 날 (YYYY-MM-DD) */
  date: z.string(),
  /** 끝나는 날 (포함) */
  endDate: z.string(),
  /** 종일 일정이면 없음. HH:MM */
  time: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  link: z.string().optional(),
}).strict()
export const GoogleEvents = z.object({ connected: z.boolean(), events: z.array(GoogleEvent) }).strict()

export const SyncedResearch = z.object({ id: z.string(), title: z.string(), tags: z.array(z.string()), remote: z.string().nullable(), folder: z.string() }).strict()
/** 구글 드라이브에 둔 설정. 화면은 savedAt · machine · researches만 읽는다 */
export const SyncedSettings = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  machine: z.string(),
  ui: z.unknown(),
  engine: z.string().optional(),
  latexTemplates: z.unknown().optional(),
  latexDefault: z.unknown().optional(),
  authors: z.unknown().optional(),
  people: z.unknown().optional(),
  researches: z.array(SyncedResearch),
}).strict()
/** GET /google/sync: 구글의 설정과 이 컴퓨터 비교 */
export const GoogleSync = z.object({
  remote: SyncedSettings.nullable(),
  missing: z.array(SyncedResearch),
  matched: z.array(z.object({ remote: SyncedResearch, localId: z.string() }).strict()),
  localCount: z.number(),
}).strict()
export const GooglePushed = z.object({ ok: z.literal(true), lastPush: z.object({ at: z.string() }).strict() }).strict()
/** POST /google/sync/restore. missing: 아직 이 컴퓨터에 없는 프로젝트 (화면에서 GitHub 주소로 받는다) */
export const GoogleRestored = z.object({ ok: z.literal(true), restored: z.number(), missing: z.array(SyncedResearch) }).strict()

// ---------- 요청 ----------
export const GoogleClientBody = z.object({ clientId: z.string(), clientSecret: z.string() })

export type GoogleStatus = z.infer<typeof GoogleStatus>
export type GoogleEvent = z.infer<typeof GoogleEvent>
export type GoogleEvents = z.infer<typeof GoogleEvents>
export type SyncedResearch = z.infer<typeof SyncedResearch>
export type SyncedSettings = z.infer<typeof SyncedSettings>
export type GoogleSync = z.infer<typeof GoogleSync>
export type GooglePushed = z.infer<typeof GooglePushed>
export type GoogleRestored = z.infer<typeof GoogleRestored>
export type GoogleClientBody = z.input<typeof GoogleClientBody>
