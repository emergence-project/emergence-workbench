/**
 * 주제와 노트 API의 계약 (10/5 "주제와 노트": 노트 한 목록 · 노트 머리말 · 링크 · 주제 카드, 서버 routes/notes.ts · topics.ts · 화면 api/notes.ts).
 * 주제 하나의 모양(Topic)은 research.ts에 있다. 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'
import type { BlockStatus as CoreBlockStatus } from '../block-header.js'
import { Topic, TOPIC_COLORS } from './research.js'

/** 노트 성격 하나 (없으면 미분류). design(설계)은 업무 프로젝트에만 고르게 한다 */
export const NOTE_CATEGORIES = ['proof', 'calc', 'check', 'summary', 'explore', 'design'] as const
export const NoteCategory = z.enum(NOTE_CATEGORIES)
/** 색 점 값 (보조 노트 상태 이름, @rw/core BLOCK_STATUSES) */
export const BlockStatus = z.enum(['in-progress', 'blocked', 'stopped', 'solved']) satisfies z.ZodType<CoreBlockStatus>

// ---------- 응답 ----------

/** 노트 한 줄: 연구노트(note) · 계산 노트(calc) · 보조 노트(block) */
export const NoteRow = z.object({
  /** 폴더 이름(연구노트·계산 노트) 또는 보조 노트 id. 갈래가 다르면 겹칠 수 있어 고칠 때는 file로 가리킨다 */
  id: z.string(),
  type: z.enum(['note', 'calc', 'block']),
  /** 본문 파일 (저장소 기준). 머리말을 고칠 때 이것으로 가리킨다 */
  file: z.string(),
  /** 연구노트·계산 노트를 원고 API로 열 때의 key */
  ms: z.string().optional(),
  format: z.enum(['md', 'tex']),
  title: z.string(),
  status: BlockStatus,
  /** 다시 열 조건 (멈춘 노트) */
  resume: z.string().optional(),
  kind: NoteCategory.optional(),
  /** kind를 적지 않아 폴더에서 정한 값 (calc/ → 계산) */
  kindAuto: z.literal(true).optional(),
  description: z.string().optional(),
  /** 적은 설명이 없어 본문 첫 문단에서 뽑은 설명 */
  descriptionAuto: z.literal(true).optional(),
  /** 주제 id, 첫째 = 주 주제. 비면 "노트들" */
  topics: z.array(z.string()),
  star: z.boolean(),
  mtime: z.number(),
  /** 머리말 파일의 해시 (고칠 때 baseHash) */
  hash: z.string(),
}).strict()
/** GET /researches/:rid/notes: 최근 고친 것부터 */
export const NoteList = z.object({ notes: z.array(NoteRow) }).strict()
/** PATCH /researches/:rid/notes/head: 고친 뒤의 줄 */
export const NoteOne = z.object({ note: NoteRow }).strict()

const conceptRef = z.object({ id: z.string(), title: z.string() }).strict()
/** GET /researches/:rid/notes/links */
export const NoteLinks = z.object({
  /** 쓰는 개념노트: 본문에 처음 나온 순서, 그 뒤에 머리말 concepts: */
  concepts: z.array(conceptRef),
  /** 본문 [[링크]]로 쓴 개념노트만, 처음 나온 순서 */
  bodyConcepts: z.array(conceptRef),
  /** 찾지 못한 [[이름]] */
  missing: z.array(z.string()),
  /** 이 노트를 인용한 노트: 최근 고친 순 */
  citedBy: z.array(NoteRow.pick({ id: true, type: true, file: true, title: true, status: true, mtime: true }).strict()),
}).strict()
/** POST /researches/:rid/notes/reveal */
export const NoteOk = z.object({ ok: z.literal(true) }).strict()

const statsShape = {
  notes: z.number(),
  byStatus: z.object({ 'in-progress': z.number(), blocked: z.number(), stopped: z.number(), solved: z.number() }).strict(),
  /** 노트들이 가진 성격 (null = 미분류), 많은 것부터 */
  kinds: z.array(z.object({ kind: NoteCategory.nullable(), count: z.number() }).strict()),
  /** 노트를 마지막으로 고친 때 (ms). 노트가 없으면 없음 */
  updated: z.number().optional(),
}
/** 주제 하나(또는 주제 없는 노트 묶음)의 노트 수 · 성격 · 최근 시각 */
export const TopicStats = z.object(statsShape).strict()
/** GET /researches/:rid/topics/overview. loose = 주제가 없는 노트 묶음("노트들"), hash = research.yaml (고칠 때 baseHash) */
export const TopicsOverview = z.object({ topics: z.array(Topic.extend(statsShape).strict()), loose: TopicStats, hash: z.string() }).strict()
/** POST · PATCH 주제, 그림 올리기 */
export const TopicSaved = z.object({ topic: Topic, hash: z.string() }).strict()
/** DELETE 주제: 남은 주제와 머리말에서 그 주제를 뺀 노트 수 */
export const TopicDeleted = z.object({ topics: z.array(Topic), notes: z.number(), hash: z.string() }).strict()

// ---------- 요청 ----------
// 이름 길이 · 있는 주제인지 · 그림 경로 · baseHash가 지금 것과 같은지는 서버 noteList.ts · topics.ts가 본다.

/** 노트 머리말에서 고칠 칸만. kind · description이 null이면 지운다 */
export const NoteHeadPatch = z.object({
  title: z.string().optional(),
  topics: z.array(z.string()).nullable().optional(),
  kind: z.union([NoteCategory, z.literal('')]).nullable().optional(),
  description: z.string().nullable().optional(),
  star: z.boolean().optional(),
})
/** 고칠 수 없는 키는 서버가 이름을 들어 거절하므로 지우지 않고 넘긴다 */
export const NoteHeadBody = z.object({ file: z.string(), patch: NoteHeadPatch.passthrough(), baseHash: z.string().optional() })
export const NoteRevealBody = z.object({ file: z.string() })

/** 주제 카드 미리보기에서 고칠 칸만. 빈 글·null이면 지운다, color 'default'는 기본색 */
export const TopicPreviewPatch = z.object({
  text: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  color: z.union([z.enum(TOPIC_COLORS), z.literal('default'), z.literal('')]).nullable().optional(),
})
const topicFields = {
  description: z.string().nullable().optional(),
  preview: TopicPreviewPatch.nullable().optional(),
  /** 읽을 때 받은 research.yaml hash (없으면 서버가 거절한다) */
  baseHash: z.string().optional(),
}
export const NewTopicBody = z.object({ title: z.string(), ...topicFields })
export const TopicPatchBody = z.object({ title: z.string().optional(), star: z.boolean().optional(), done: z.boolean().optional(), ...topicFields })

export type NoteCategory = z.infer<typeof NoteCategory>
export type BlockStatus = z.infer<typeof BlockStatus>
export type NoteRow = z.infer<typeof NoteRow>
export type NoteList = z.infer<typeof NoteList>
export type NoteOne = z.infer<typeof NoteOne>
export type NoteLinks = z.infer<typeof NoteLinks>
export type NoteOk = z.infer<typeof NoteOk>
export type TopicStats = z.infer<typeof TopicStats>
export type TopicsOverview = z.infer<typeof TopicsOverview>
export type TopicSaved = z.infer<typeof TopicSaved>
export type TopicDeleted = z.infer<typeof TopicDeleted>
export type NoteHeadPatch = z.input<typeof NoteHeadPatch>
export type NoteHeadBody = z.input<typeof NoteHeadBody>
export type NoteRevealBody = z.input<typeof NoteRevealBody>
export type TopicPreviewPatch = z.input<typeof TopicPreviewPatch>
export type NewTopicBody = z.input<typeof NewTopicBody>
export type TopicPatchBody = z.input<typeof TopicPatchBody>
