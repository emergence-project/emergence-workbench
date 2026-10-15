/**
 * 앱 자체에 관한 API의 계약: API 안내(GET /api, routes/apiIndex.ts)와 앱 업데이트(routes/settings.ts · appupdate.ts, 화면 AppUpdate.tsx · AppInfo.tsx).
 */
import { z } from 'zod'

// ---------- GET /api (routes/apiIndex.ts) ----------
export const ApiRoute = z.object({ method: z.string(), url: z.string() }).strict()
export const ApiStart = ApiRoute.extend({ does: z.string() }).strict()
/** 처음 보는 에이전트를 위한 안내. 경로 전부(routes)는 ?all=1일 때만, 아니면 more에 받는 법 */
export const ApiIndex = z.object({
  about: z.string(),
  writes: z.string(),
  start: z.array(ApiStart),
  routes: z.array(ApiRoute).optional(),
  more: z.string().optional(),
}).strict()

// ---------- 앱 업데이트 (routes/settings.ts) ----------
/** 이번 업데이트로 처리 기록이 새로 생기거나 바뀐 피드백 */
export const ResolvedFeedback = z.object({ key: z.string(), state: z.string(), text: z.string(), note: z.string().optional() }).strict()

export const AppStatus = z.object({
  /** 지금 돌고 있는 코드의 커밋 */
  running: z.string(),
  /** 저장소의 현재 커밋 (받았지만 아직 다시 시작하지 않았으면 running과 다르다) */
  head: z.string(),
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  /** GitHub에만 있는 커밋 수 */
  behind: z.number(),
  /** 업데이트를 막는 이유. 없으면 null */
  blocked: z.string().nullable(),
  fetchError: z.string().optional(),
  /** 최근 GitHub 커밋 제목 (behind만큼, 최대 10개) */
  incoming: z.array(z.string()),
  resolved: z.array(ResolvedFeedback),
  /** 받은 커밋(head)을 미리 빌드해 두어 다시 시작만 하면 되는지 */
  prepared: z.boolean(),
}).strict()

/** GET /app/status. 앱 저장소가 없는 모드(예제·개발)면 enabled: false */
export const AppStatusReply = z.union([
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({ enabled: z.literal(true), status: AppStatus }).strict(),
])

export const AppHistoryItem = z.object({
  commit: z.string(),
  version: z.string(),
  time: z.string(),
  title: z.string(),
  pr: z.number().optional(),
  /** 그 업데이트의 커밋 메시지 "소개: 그대로 — 이유"의 이유 */
  aboutSame: z.string().optional(),
}).strict()

export const AppInfo = z.object({
  /** 지금 도는 버전: 번호(1.11 꼴), 커밋과 그 날짜 */
  version: z.object({ number: z.string(), commit: z.string(), date: z.string() }).strict(),
  /** 앱 코드가 있는 폴더 */
  root: z.string(),
  branch: z.string().nullable(),
  /** 받는 곳 (GitHub 주소) */
  remote: z.string().nullable(),
  /** 업데이트 이력: 지금 버전까지 합쳐진 최근 변경, 최근 것부터 */
  history: z.array(AppHistoryItem),
}).strict()

/** GET /app/info (?pr=번호면 그 PR까지 이력을 늘린다) */
export const AppInfoReply = z.union([
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({ enabled: z.literal(true), info: AppInfo }).strict(),
])

/** POST /app/update: 받고 빌드한 결과. 다시 시작까지 했으면 restarting */
export const AppUpdateResult = z.object({ status: AppStatus, restarting: z.boolean(), message: z.string() }).strict()
/** POST /app/restart: 미리 빌드한 새 버전으로 다시 시작한다. 할 수 없으면 409 */
export const AppRestarted = z.object({ restarting: z.literal(true) }).strict()

export type ApiIndex = z.infer<typeof ApiIndex>
export type ResolvedFeedback = z.infer<typeof ResolvedFeedback>
export type AppStatus = z.infer<typeof AppStatus>
export type AppStatusReply = z.infer<typeof AppStatusReply>
export type AppHistoryItem = z.infer<typeof AppHistoryItem>
export type AppInfo = z.infer<typeof AppInfo>
export type AppInfoReply = z.infer<typeof AppInfoReply>
export type AppUpdateResult = z.infer<typeof AppUpdateResult>
export type AppRestarted = z.infer<typeof AppRestarted>
