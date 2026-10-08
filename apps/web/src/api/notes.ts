// ---------- 주제와 노트 (10/5): 노트 한 목록 · 노트 머리말 · 링크 두 목록 · 주제 고치기 (서버 noteList.ts, topics.ts) ----------
import type { BlockStatus } from '@rw/core'
import { enc, json, req, send } from './http'
import type { Topic } from './research'

/** 노트 성격 하나 (화면 이름은 noteKinds.ts). 없으면 미분류. design(설계)은 업무 프로젝트에만 고르게 한다 */
export type NoteCategory = 'proof' | 'calc' | 'check' | 'summary' | 'explore' | 'design'
/** 주제 카드 바탕색: 기본(프로젝트 색) 말고 정해 둔 다섯 색 */
export type TopicColor = 'violet' | 'blue' | 'teal' | 'orange' | 'gray'
export const TOPIC_COLORS: TopicColor[] = ['violet', 'blue', 'teal', 'orange', 'gray']
/** 글자 수 제한 (서버와 같게, 줄바꿈은 세지 않는다) */
/** 카드 글 글자 수 한도. 프로젝트 이름은 논문 제목이 들어가도록 80자 (10/7 17:40 "논문 제목 42자라 고치지도 못한다") */
export const LIMITS = { topicTitle: 40, projectTitle: 80, description: 200, previewText: 30 } as const

/** 노트 한 줄: 연구노트(note) · 계산 노트(calc) · 보조 노트(block) */
export interface NoteRow {
  id: string
  type: 'note' | 'calc' | 'block'
  /** 본문 파일 (저장소 기준). 머리말을 고칠 때 이것으로 가리킨다 */
  file: string
  /** 연구노트·계산 노트를 원고 API로 열 때의 key */
  ms?: string
  format: 'md' | 'tex'
  title: string
  /** 색 점 값 */
  status: BlockStatus
  /** 다시 열 조건 (멈춘 노트) */
  resume?: string
  kind?: NoteCategory
  /** kind를 적지 않아 폴더에서 정한 값 (calc/ → 계산) */
  kindAuto?: true
  description?: string
  /** 적은 설명이 없어 본문 첫 문단에서 뽑은 설명 */
  descriptionAuto?: true
  /** 주제 id, 첫째 = 주 주제. 비면 "노트들" */
  topics: string[]
  star: boolean
  mtime: number
  /** 머리말 파일의 해시 (고칠 때 baseHash) */
  hash: string
}

export interface TopicStats {
  notes: number
  byStatus: Record<BlockStatus, number>
  /** 노트들이 가진 성격 (null = 미분류), 많은 것부터 */
  kinds: { kind: NoteCategory | null; count: number }[]
  updated?: number
}

export interface NoteLinks {
  /** 쓰는 개념노트: 본문에 처음 나온 순서, 그 뒤에 머리말 concepts: */
  concepts: { id: string; title: string }[]
  /** 본문 [[링크]]로 쓴 개념노트만, 처음 나온 순서 */
  bodyConcepts: { id: string; title: string }[]
  /** 찾지 못한 [[이름]] */
  missing: string[]
  /** 이 노트를 인용한 노트: 최근 고친 순 */
  citedBy: Pick<NoteRow, 'id' | 'type' | 'file' | 'title' | 'status' | 'mtime'>[]
}

export interface NoteHeadPatch { title?: string; topics?: string[]; kind?: NoteCategory | null; description?: string; star?: boolean }
export interface TopicPatch {
  title?: string; description?: string; star?: boolean; done?: boolean
  /** 고칠 칸만. 빈 글·null이면 지운다, color 'default'는 기본색 */
  preview?: { text?: string | null; image?: string | null; color?: TopicColor | 'default' | null }
}

export function notesApi(rid: string) {
  const base = `/api/researches/${enc(rid)}`
  return {
    list: () => req(`${base}/notes`).then((r) => json<{ notes: NoteRow[] }>(r)).then((r) => r.notes),
    /** 머리말 고치기. 바깥에서 바뀌었으면 ConflictError */
    setHead: (file: string, patch: NoteHeadPatch, baseHash: string) => req(`${base}/notes/head`, send('PATCH', { file, patch, baseHash })).then((r) => json<{ note: NoteRow }>(r)).then((r) => r.note),
    /** 노트 파일을 Finder에서 보이기 (맥) */
    reveal: (file: string) => req(`${base}/notes/reveal`, send('POST', { file })).then((r) => json<{ ok: true }>(r)),
    links: (file: string) => req(`${base}/notes/links?file=${enc(file)}`).then((r) => json<NoteLinks>(r)),
    topicsOverview: () => req(`${base}/topics/overview`).then((r) => json<{ topics: (Topic & TopicStats)[]; loose: TopicStats; hash: string }>(r)),
    createTopic: (input: { title: string; description?: string; preview?: TopicPatch['preview'] }, baseHash: string) =>
      req(`${base}/topics`, send('POST', { ...input, baseHash })).then((r) => json<{ topic: Topic; hash: string }>(r)),
    patchTopic: (id: string, patch: TopicPatch, baseHash: string) => req(`${base}/topics/${enc(id)}`, send('PATCH', { ...patch, baseHash })).then((r) => json<{ topic: Topic; hash: string }>(r)),
    deleteTopic: (id: string, baseHash: string) => req(`${base}/topics/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<{ topics: Topic[]; notes: number; hash: string }>(r)),
    uploadTopicImage: (id: string, file: File) => req(`${base}/topics/${enc(id)}/image?name=${enc(file.name)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file }).then((r) => json<{ topic: Topic; hash: string }>(r)),
    topicImageUrl: (id: string, v: number | string = '') => `${base}/topics/${enc(id)}/image?v=${enc(String(v))}`,
  }
}
