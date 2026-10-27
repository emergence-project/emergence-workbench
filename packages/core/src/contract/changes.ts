/**
 * 변경사항 API의 계약 (10/27 "변경사항", 서버 routes/changes.ts · changes.ts, 화면 api/changes.ts · MCP changes_since).
 * 기준 시각 뒤 프로젝트에서 바뀐 것을 화면의 이름으로 모은 목록과, 보는 이(나 · Claude · Codex)가 본 때.
 */
import { z } from 'zod'

export const CHANGE_KINDS = ['note', 'flow', 'task', 'record', 'file'] as const
export const CHANGE_ACTIONS = ['created', 'edited', 'moved', 'deleted'] as const

export const ChangeItem = z.object({
  kind: z.enum(CHANGE_KINDS),
  /** 노트 폴더 이름 · 점 id · 맡긴 일 id · 기록 파일(comments/ 아래, 끝 없이) · 다른 파일은 저장소 기준 경로 */
  id: z.string(),
  name: z.string(),
  action: z.enum(CHANGE_ACTIONS),
  /** 작성자 (최근 순). 커밋 안 된 것은 이 맥 이름 */
  authors: z.array(z.string()),
  /** 처음 · 마지막으로 바뀐 때 (ISO) */
  first: z.string(),
  last: z.string(),
  /** 이 맥에서 아직 커밋하지 않은 것이 있다 */
  uncommitted: z.boolean(),
  /** 바뀐 파일 (저장소 기준, 20개까지) */
  files: z.array(z.string()),
  /** 노트: 여는 파일 (저장소 기준 note.md · main.tex). 지운 노트는 없다 */
  main: z.string().optional(),
}).strict()
export type ChangeItem = z.infer<typeof ChangeItem>
export type ChangeKind = ChangeItem['kind']
export type ChangeAction = ChangeItem['action']

export const Changes = z.object({
  /** 이 맥 이름 (커밋 안 된 것은 이 맥 것만 보인다) */
  machine: z.string(),
  /** 기준 시각 (ISO): 이 뒤에 바뀐 것 */
  since: z.string(),
  items: z.array(ChangeItem),
  /** 에이전트가 이 프로젝트의 변경사항을 마지막으로 받은 때 (MCP changes_since). 받은 적 없으면 null */
  agents: z.object({ claude: z.string().nullable(), codex: z.string().nullable() }).strict(),
}).strict()
export type Changes = z.infer<typeof Changes>

/** 홈 카드: 내가 마지막으로 본 뒤 변경사항 수와 마지막 시각 */
export const ChangesCount = z.object({ count: z.number(), last: z.string().nullable() }).strict()
export type ChangesCount = z.infer<typeof ChangesCount>

/** 에이전트가 받기 (MCP changes_since): since를 주면 그때부터, 없으면 지난번 받은 때부터. 받은 때가 새 기준이 된다 */
export const ChangesReadBody = z.object({ since: z.string().optional() }).strict()
export const ChangesSeenBody = z.object({ at: z.string().optional() }).strict()
export const ChangesSeen = z.object({ at: z.string() }).strict()
export type ChangesSeen = z.infer<typeof ChangesSeen>
