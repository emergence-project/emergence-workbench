// 연구 기록 올리기: 이 맥에서 남긴 사용자 기록(workbench/comments · log)과, 저절로 올릴 때는 흐름(workbench/problems)만 올려 클라우드의 Claude가 읽게 한다. 정한 경로 밖은 올리지 않는다(pathsync.ts).
// 응답 계약은 피드백 갈래(@rw/core/contract/feedback)에 함께 있다
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { LIBRARY_RID } from '@rw/core'
import * as C from '@rw/core/contract/feedback'
import { replies } from '../contract.js'
import { writeAtomic } from '../fsutil.js'
import { locate, pendingPaths, PathSyncError, publishPaths } from '../pathsync.js'
import { offDefaultBranch } from '../gitsync.js'
import { WorkbenchError } from '../workbench.js'
import { t } from '../i18n.js'
import { syncDelayMs } from '../syncTiming.js'
import { repeat } from '../scheduler.js'
import type { RouteContext } from './context.js'

/** 안 올린 기록을 다시 올려 보는 간격 (자동 올리기일 때) */
const RECORDS_RETRY_MS = 10 * 60_000

export function registerRecordsPublish(app: FastifyInstance, ctx: RouteContext): void {
  const { opts, repoPath } = ctx
  /**
   * 연구 저장소에서 앱이 올리는 사용자 기록 (workbench 기준). 코멘트 형식이 늘면 여기에 더한다.
   * 일지(log/)도 넣는다: 일지 메모를 쓰거나 할 일을 기록으로 옮기면(todos.ts) log/가 바뀌는데, 올리지 않으면 "커밋하지 않은 변경"으로 남아 저절로 받기를 막는다
   */
  const RESEARCH_RECORDS = ['comments', 'log']
  /**
   * 저절로 올릴 때 기록과 함께 올리는 것: 흐름(problems/: 질문 · 주장 · 시도 · 예외 기록).
   * 사용자가 이 컴퓨터에서 쓴 질문 · 메시지 · 판정이 GitHub에 있어야 클라우드와 다른 컴퓨터의 에이전트가 그 흐름에서 일한다
   * (11/13 점검: 화면에서 만든 흐름이 커밋되지 않은 채 이 컴퓨터에만 남았다). 기록 탭의 "안 올린 기록" 수에는 세지 않는다
   */
  const AUTO_ALSO = ['problems']
  const autoOn = () => opts.recordsAutoPublishMs !== undefined && !opts.sandbox && syncDelayMs(ctx.registry, 'publish', opts.recordsAutoPublishMs) !== null
  const researchRecords = async (rid: string, also = false) => {
    const wbDir = path.join(repoPath(rid), 'workbench')
    const { top, rel } = await locate(wbDir)
    // 아직 없는 폴더도 넣는다: publishPaths가 바뀐 것이 있는 경로만 커밋한다
    return { top, paths: [...RESEARCH_RECORDS, ...(also ? AUTO_ALSO : [])].map((p) => (rel ? `${rel}/${p}` : p)) }
  }
  /**
   * 기록 올리기. GitHub에서도 바뀐 기록 파일은 세 갈래로 합쳐 보고(merge), GitHub 위에 따로 올린 뒤에는
   * 이 컴퓨터의 브랜치를 그 커밋으로 옮겨(adopt) 저절로 받기가 막히지 않게 한다 (pathsync.ts, 10/15)
   */
  const RECORDS_MESSAGE = 'Add comments from the research workspace app'
  const FLOWS_MESSAGE = 'Update flows from the research workspace app'
  /** 커밋 제목: 올릴 것이 흐름 파일뿐이면 흐름, 섞였으면 둘 다 */
  const messageFor = (files: string[]) => {
    const flows = files.filter((f) => /(^|\/)problems\//.test(f)).length
    return !flows ? RECORDS_MESSAGE : flows === files.length ? FLOWS_MESSAGE : 'Add comments and flows from the research workspace app'
  }
  // 마지막 결과는 앱 설정 폴더에 둔다: 앱을 다시 켜도 실패가 화면(기록 탭 맨 위 줄)에 남는다 (10/20 점검: LSWT 기록이 하루 넘게 안 올라간 채 표시가 사라졌다)
  const lastFile = path.join(ctx.registry.configDir, 'records-publish.json')
  const recordsLast = new Map<string, { at: number; error: string | null }>(Object.entries((() => {
    try { return JSON.parse(fs.readFileSync(lastFile, 'utf8')) as Record<string, { at: number; error: string | null }> } catch { return {} }
  })()))
  const saveLast = () => { try { writeAtomic(lastFile, JSON.stringify(Object.fromEntries(recordsLast), null, 1)) } catch { /* 기억하지 못해도 올리기는 그대로 */ } }
  const publishRecords = async (rid: string, r: { top: string; paths: string[] }) => {
    const before = recordsLast.get(rid)?.error ?? null
    const done = (error: string | null) => {
      recordsLast.set(rid, { at: Date.now(), error })
      saveLast()
      // 화면(기록 탭 맨 위 줄 · 실패 알림)은 실패가 생기거나 풀릴 때만 다시 읽는다
      if (before !== error) ctx.broadcast({ type: 'records-publish', research: rid })
    }
    try {
      // 연구 폴더가 main 같은 기본 브랜치가 아니면 올리지 않는다: 그 브랜치로 올라가 다른 컴퓨터에서 보이지 않는다 (10/22 맥미니 NBCP)
      const off = await offDefaultBranch(r.top)
      if (off) throw new PathSyncError(off)
      const out = await publishPaths(r.top, r.paths, { message: messageFor(await pendingPaths(r.top, r.paths).catch(() => [])), adopt: true, merge: true })
      done(null)
      return out
    } catch (e) {
      done((e as Error).message)
      throw e
    }
  }
  // 기록을 쓰면(더하기 · 고치기 · 지우기 · 상태 · 답 · 이어 쓰기 · 분류 · 하이라이트, MCP add_record · answer_record 포함) 잠시 뒤 저절로 올린다.
  // 쓰는 길이 여러 갈래(comments · journal · agentEdits …)라 연구 안의 성공한 쓰기 요청마다 예약하고, 올릴 때 이 컴퓨터에서 바뀐 기록이 있는지(네트워크 없이) 먼저 본다
  const recordTimers = new Map<string, NodeJS.Timeout>()
  /** 안 올린 기록이 있으면 올린다 (git 저장소가 아니거나 GitHub 브랜치를 추적하지 않으면 올리지 않는다) */
  const publishPending = async (rid: string) => {
    let r: { top: string; paths: string[] }
    try {
      r = await researchRecords(rid, true)
      if (!(await pendingPaths(r.top, r.paths)).length) {
        // 실패 뒤 다른 길(터미널 git push 등)로 올라갔으면 남은 실패 표시를 지운다
        const last = recordsLast.get(rid)
        if (last?.error) {
          recordsLast.set(rid, { at: Date.now(), error: null })
          saveLast()
          ctx.broadcast({ type: 'records-publish', research: rid })
        }
        return
      }
    } catch { return }
    await publishRecords(rid, r).catch((e) => app.log.warn({ err: e, research: rid }, '기록 자동 올리기 실패'))
  }
  const scheduleRecordsPublish = (rid: string) => {
    const delay = syncDelayMs(ctx.registry, 'publish', opts.recordsAutoPublishMs)
    if (delay === null || opts.sandbox) return
    clearTimeout(recordTimers.get(rid))
    recordTimers.set(rid, setTimeout(() => {
      recordTimers.delete(rid)
      // 기다리는 사이 설정 › 동기화를 수동으로 바꿨으면 올리지 않는다
      if (syncDelayMs(ctx.registry, 'publish', opts.recordsAutoPublishMs) !== null) void publishPending(rid)
    }, delay))
  }
  // 쓰기가 없어도 안 올린 기록을 다시 올려 본다: 앱을 켤 때(1분 뒤)와 그 뒤 10분마다 (10/20 점검: 실패한 뒤 새로 쓰기 전까지는 다시 해 보지 않았다)
  // 자동(설정 › 동기화 올리기)일 때만. 수동이면 사용자가 "지금 올리기"로
  if (opts.recordsAutoPublishMs !== undefined && !opts.sandbox) {
    let sweeping = false
    const sweep = async () => {
      if (sweeping || syncDelayMs(ctx.registry, 'publish', opts.recordsAutoPublishMs) === null) return
      sweeping = true
      // 진행 중인 프로젝트만 다시 해 본다 (10/20 사용자 결정). 기록을 쓰면 바로 올리는 것은 멈춘 프로젝트도 그대로다
      // 지식 라이브러리(개념노트 기록)도 같은 장치로 올리므로 함께 다시 해 본다
      const rids = [...ctx.registry.list().filter((r) => r.available && r.state === 'active').map((r) => r.id), ...(ctx.registry.libraryPath ? [LIBRARY_RID] : [])]
      try { for (const rid of rids) if (!recordTimers.has(rid)) await publishPending(rid) } finally { sweeping = false }
    }
    repeat(app, { first: 60_000, every: RECORDS_RETRY_MS, run: sweep })
  }
  app.addHook('onResponse', async (req, reply) => {
    const url = req.routeOptions.url ?? ''
    const rid = (req.params as { rid?: unknown } | undefined)?.rid
    if (req.method === 'GET' || reply.statusCode >= 400 || typeof rid !== 'string' || !url.startsWith('/api/researches/:rid/') || url.startsWith('/api/researches/:rid/records/')) return
    scheduleRecordsPublish(rid)
  })
  app.addHook('onClose', async () => { for (const tm of recordTimers.values()) clearTimeout(tm) })

  app.get<{ Params: { rid: string } }>('/api/researches/:rid/records/unpublished', replies(C.UnpublishedFiles), async (req): Promise<C.UnpublishedFiles> => {
    const r = await researchRecords(req.params.rid).catch(() => null)
    return { files: r ? await pendingPaths(r.top, r.paths) : [] }
  })
  /** 기록 저절로 올리기가 켜졌는지와 마지막 결과 (기록 탭 맨 위 줄과 실패 알림이 읽는다) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/records/publish', replies(C.RecordsPublishState), async (req): Promise<C.RecordsPublishState> => ({
    autoPublish: opts.recordsAutoPublishMs !== undefined && !opts.sandbox,
    delay: (() => { const d = opts.sandbox ? null : syncDelayMs(ctx.registry, 'publish', opts.recordsAutoPublishMs); return d === null ? null : Math.round(d / 1000) })(),
    last: recordsLast.get(req.params.rid) ?? null,
  }))
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/records/publish', replies(C.RecordsPublished), async (req): Promise<C.RecordsPublished> => {
    if (opts.sandbox) throw new WorkbenchError(404, t('개발용 예제 모드에서는 GitHub에 올리지 않습니다', 'Sample mode does not push to GitHub'))
    try {
      // 저절로 올리기가 켜져 있으면 「지금 올리기」 · 「다시 올리기」도 같은 것(기록과 흐름)을 올린다. 수동이면 기록만
      const r = await researchRecords(req.params.rid, autoOn())
      return await publishRecords(req.params.rid, r)
    } catch (e) {
      if (e instanceof PathSyncError) throw new WorkbenchError(409, e.message)
      throw e
    }
  })
}
