// ---------- 주제와 노트 (10/5): 노트 한 목록 · 노트 머리말 · 링크 두 목록 · 주제 고치기 (서버 noteList.ts, topics.ts) ----------
import type { NewTopicBody, NoteHeadBody, NoteHeadPatch, NoteLinks, NoteList, NoteOk, NoteOne, NoteRevealBody, TopicDeleted, TopicPatchBody, TopicSaved, TopicsOverview } from '@rw/core/contract/notes'
import type { TopicColor } from '@rw/core/contract/research'
import { enc, json, req, send } from './http'

export type { NoteCategory, NoteRow, TopicStats, NoteLinks, NoteHeadPatch } from '@rw/core/contract/notes'
export type { TopicColor } from '@rw/core/contract/research'
/** 주제 카드 바탕색: 기본(프로젝트 색) 말고 정해 둔 다섯 색 (계약 TOPIC_COLORS와 같게, 화면 번들에 zod를 넣지 않으려고 값은 여기에) */
export const TOPIC_COLORS: TopicColor[] = ['violet', 'blue', 'teal', 'orange', 'gray']
/** 글자 수 제한 (서버와 같게, 줄바꿈은 세지 않는다) */
/** 카드 글 글자 수 한도. 프로젝트 이름은 논문 제목이 들어가도록 80자 (10/7 17:40 "논문 제목 42자라 고치지도 못한다") */
export const LIMITS = { topicTitle: 40, projectTitle: 80, description: 200, previewText: 30 } as const

/** 주제에서 고칠 칸만. preview는 빈 글·null이면 지운다, color 'default'는 기본색 */
export type TopicPatch = Omit<TopicPatchBody, 'baseHash'>

export function notesApi(rid: string) {
  const base = `/api/researches/${enc(rid)}`
  return {
    list: () => req(`${base}/notes`).then((r) => json<NoteList>(r)).then((r) => r.notes),
    /** 머리말 고치기. 바깥에서 바뀌었으면 ConflictError */
    setHead: (file: string, patch: NoteHeadPatch, baseHash: string) => req(`${base}/notes/head`, send('PATCH', { file, patch, baseHash } satisfies NoteHeadBody)).then((r) => json<NoteOne>(r)).then((r) => r.note),
    /** 노트 파일을 Finder에서 보이기 (맥) */
    reveal: (file: string) => req(`${base}/notes/reveal`, send('POST', { file } satisfies NoteRevealBody)).then((r) => json<NoteOk>(r)),
    links: (file: string) => req(`${base}/notes/links?file=${enc(file)}`).then((r) => json<NoteLinks>(r)),
    topicsOverview: () => req(`${base}/topics/overview`).then((r) => json<TopicsOverview>(r)),
    createTopic: (input: { title: string; description?: string; preview?: TopicPatch['preview'] }, baseHash: string) =>
      req(`${base}/topics`, send('POST', { ...input, baseHash } satisfies NewTopicBody)).then((r) => json<TopicSaved>(r)),
    patchTopic: (id: string, patch: TopicPatch, baseHash: string) => req(`${base}/topics/${enc(id)}`, send('PATCH', { ...patch, baseHash } satisfies TopicPatchBody)).then((r) => json<TopicSaved>(r)),
    deleteTopic: (id: string, baseHash: string) => req(`${base}/topics/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<TopicDeleted>(r)),
    uploadTopicImage: (id: string, file: File) => req(`${base}/topics/${enc(id)}/image?name=${enc(file.name)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file }).then((r) => json<TopicSaved>(r)),
    topicImageUrl: (id: string, v: number | string = '') => `${base}/topics/${enc(id)}/image?v=${enc(String(v))}`,
  }
}
