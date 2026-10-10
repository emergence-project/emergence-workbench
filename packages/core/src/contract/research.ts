/**
 * 프로젝트(연구 하나) API의 계약 (서버 routes/researches.ts · project.ts · topics.ts · blocks.ts · manuscript.ts …, 화면 api/research.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

// ---------- 다른 갈래도 쓰는 것 ----------

/** LaTeX 오류 하나. file은 workbench 기준 상대 경로(밖이면 절대 경로), inBlock: 노트 본문 안의 오류인지 */
export const LatexProblem = z.object({ file: z.string(), line: z.number(), message: z.string(), inBlock: z.boolean() }).strict()
/** 노트·라이브러리 노트 컴파일 결과 */
export const CompileResult = z.object({ ok: z.boolean(), durationMs: z.number(), hasPdf: z.boolean(), problems: z.array(LatexProblem), logTail: z.string() }).strict()

/** 프로젝트 정보의 저장소 칸 (서버 gitsync.ts) */
export const RepoInfo = z.object({
  /** ok: 이 폴더가 저장소 맨 위. none: git 저장소가 아님. inside: 다른 저장소(top) 안의 폴더 */
  state: z.enum(['ok', 'none', 'inside']),
  top: z.string().optional(),
  /** 브랜치 이름. 브랜치가 아닌 커밋을 꺼내 둔 상태면 null */
  branch: z.string().nullable().optional(),
  remote: z.object({ name: z.string(), shown: z.string(), web: z.string().nullable() }).strict().nullable().optional(),
  upstream: z.string().nullable().optional(),
  last: z.object({ sha: z.string(), subject: z.string(), date: z.string() }).strict().nullable().optional(),
  dirty: z.number().optional(),
  untracked: z.number().optional(),
  ahead: z.number().nullable().optional(),
  behind: z.number().nullable().optional(),
  /** 마지막으로 원격을 확인한 시각 (ms). 실패했으면 fetchError(쉬운 말)와 fetchDetail(git 원문) */
  fetchedAt: z.number().nullable().optional(),
  fetchError: z.string().optional(),
  fetchDetail: z.string().optional(),
}).strict()

/** 주제 카드 바탕색: 기본(프로젝트 색) 말고 정해 둔 다섯 색 */
export const TOPIC_COLORS = ['violet', 'blue', 'teal', 'orange', 'gray'] as const
export const TopicPreview = z.object({ text: z.string().optional(), image: z.string().optional(), color: z.enum(TOPIC_COLORS).optional() }).strict()
/** 주제 (workbench/topics.yaml 한 항목) */
export const Topic = z.object({
  id: z.string(),
  title: z.string(),
  /** 원고의 장 id */
  parts: z.array(z.string()),
  /** 예전 기록: 이 주제에 든 보조 노트 id */
  blocks: z.array(z.string()),
  done: z.boolean(),
  star: z.boolean(),
  /** 메인 노트 main .tex (저장소 기준) */
  manuscript: z.string().optional(),
  description: z.string().optional(),
  preview: TopicPreview.optional(),
}).strict()

export type LatexProblem = z.infer<typeof LatexProblem>
export type CompileResult = z.infer<typeof CompileResult>
export type RepoInfo = z.infer<typeof RepoInfo>
export type TopicColor = (typeof TOPIC_COLORS)[number]
export type TopicPreview = z.infer<typeof TopicPreview>
export type Topic = z.infer<typeof Topic>
