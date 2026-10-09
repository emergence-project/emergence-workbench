// 주제 (research.yaml의 topics:, 10/5 "주제와 노트")
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import { contentTypeOf } from '../materials.js'
import { dropTopicsFromNotes, topicsOverview } from '../noteList.js'
import { checkTopicsHash, createTopic, deleteTopic, patchTopic, readTopics, saveTopics, setTopicImage, topicImageFile, topicsHash, type TopicPatch } from '../topics.js'
import { WorkbenchError } from '../workbench.js'
import { cardFigureRef } from '../figures.js'
import type { RouteContext } from './context.js'

export function registerTopics(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf, registry } = ctx
  const checkImage = (rid: string, preview: unknown) => {
    if (preview && typeof preview === 'object') cardFigureRef(registry, rid, (preview as Record<string, unknown>).image)
  }
  type P = { rid: string; tid: string }
  /** 주제 목록 (research.yaml에 적힌 그대로)과 research.yaml의 해시 (고칠 때 baseHash) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/topics', async (req) => {
    const wb = wbOf(req.params.rid)
    return { topics: readTopics(wb), hash: topicsHash(wb) }
  })
  /** 주제 목록을 통째로 바꾼다 (예전 화면). 빠진 주제는 노트 머리말 topics:에서도 뺀다 */
  app.put<{ Params: { rid: string }; Body: { topics?: unknown; baseHash?: unknown } }>('/api/researches/:rid/topics', async (req) => {
    const wb = wbOf(req.params.rid)
    // 읽은 뒤 바뀐 research.yaml은 고치지 않는다 (baseHash 필수) (빠진 주제를 노트에서도 빼므로)
    checkTopicsHash(wb, req.body?.baseHash)
    if (Array.isArray(req.body?.topics)) {
      for (const topic of req.body.topics) if (topic && typeof topic === 'object') checkImage(req.params.rid, topic.preview)
    }
    const before = readTopics(wb).map((t) => t.id)
    const topics = saveTopics(wb, req.body?.topics)
    dropTopicsFromNotes(wb, before.filter((id) => !topics.some((t) => t.id === id)))
    return { topics, hash: topicsHash(wb) }
  })
  /** 주제마다 노트 수(상태별)·노트들의 성격·최근 시각, 그리고 주제 없는 노트 묶음("노트들", loose) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/topics/overview', async (req) => {
    const wb = wbOf(req.params.rid)
    return { ...topicsOverview(wb), hash: topicsHash(wb) }
  })
  /** 주제 만들기: { title, description?, preview? } */
  app.post<{ Params: { rid: string }; Body: { title?: unknown; description?: unknown; preview?: unknown; baseHash?: unknown } }>('/api/researches/:rid/topics', async (req) => {
    const wb = wbOf(req.params.rid)
    checkTopicsHash(wb, req.body?.baseHash); checkImage(req.params.rid, req.body?.preview); const topic = createTopic(wb, req.body ?? {}); return { topic, hash: topicsHash(wb) }
  })
  /** 주제 고치기: 이름(40자) · 설명(200자) · preview { text(30자), image, color } · star · done. 적은 칸만 바꾼다 */
  app.patch<{ Params: P; Body: TopicPatch & { baseHash?: unknown } }>('/api/researches/:rid/topics/:tid', async (req) => {
    const wb = wbOf(req.params.rid)
    const { baseHash, ...patch } = req.body ?? {}
    checkTopicsHash(wb, baseHash); checkImage(req.params.rid, patch.preview); const topic = patchTopic(wb, req.params.tid, patch); return { topic, hash: topicsHash(wb) }
  })
  /** 주제 지우기: research.yaml과 노트 머리말에서만 뺀다. 노트는 "노트들"로 가고 파일은 그대로 */
  app.delete<{ Params: P; Querystring: { baseHash?: string } }>('/api/researches/:rid/topics/:tid', async (req) => {
    const wb = wbOf(req.params.rid)
    checkTopicsHash(wb, req.query.baseHash)
    const topics = deleteTopic(wb, req.params.tid)
    const notes = dropTopicsFromNotes(wb, [req.params.tid])
    return { topics, notes, hash: topicsHash(wb) }
  })
  /** 주제 그림 올리기 (application/octet-stream, ?name=파일 이름): workbench/figures/topics/<id>.<확장자>에 두고 미리보기에 건다 */
  app.put<{ Params: P; Querystring: { name?: string } }>('/api/researches/:rid/topics/:tid/image', async (req) => {
    const wb = wbOf(req.params.rid)
    return { topic: setTopicImage(wb, req.params.tid, req.query.name, req.body), hash: topicsHash(wb) }
  })
  app.get<{ Params: P }>('/api/researches/:rid/topics/:tid/image', async (req, reply) => {
    const wb = wbOf(req.params.rid)
    const topic = readTopics(wb).find((t) => t.id === req.params.tid)
    const ref = cardFigureRef(registry, req.params.rid, topic?.preview?.image)
    if (ref) return reply.header('cache-control', 'no-store').redirect(`/api/figures/file?id=${encodeURIComponent(ref.id)}`)
    const file = topicImageFile(wb, req.params.tid)
    return reply.type(contentTypeOf(file)).header('cache-control', 'no-store').send(fs.createReadStream(file))
  })
}
