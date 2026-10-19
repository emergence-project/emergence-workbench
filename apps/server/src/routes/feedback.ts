// 기록 올리기와 앱 피드백 (피드백 모드)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/feedback'
import { parseBody, replies } from '../contract.js'
import fs from 'node:fs'
import path from 'node:path'
import { addFeedbackComment, appendFeedback, editFeedback, editFeedbackNote, feedbackAccount, feedbackAsks, feedbackStatusError, listAllFeedback, listFeedback, publishFeedback, PublishError, setFeedbackReview, unpublishedFeedback } from '../feedback.js'
import { locate, pendingPaths, PathSyncError, publishPaths } from '../pathsync.js'
import { WorkbenchError } from '../workbench.js'
import { commitChecker } from '../commitsInApp.js'
import { appIssuesUrl } from '../appupdate.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'
import { syncDelayMs } from '../syncTiming.js'
// 연구 저장소 기록 올리기(records)의 응답 계약은 코멘트 갈래에 있다

export function registerFeedback(app: FastifyInstance, ctx: RouteContext): void {
  const { opts, repoPath } = ctx
  // 이 맥에서 남긴 사용자 기록만 올려 클라우드의 Claude가 읽게 한다. 정한 경로 밖은 올리지 않는다(pathsync.ts).

  // 올리기는 한 번에 하나씩 (버튼과 자동 올리기가 겹쳐 git이 부딪히지 않게)
  let publishing: Promise<unknown> = Promise.resolve()
  const publishOnce = () => {
    const run = publishing.catch(() => undefined).then(() => publishFeedback(opts.feedbackDir!))
    publishing = run
    return run
  }
  // 피드백을 남기면 잠시 뒤 저절로 올린다. 여러 개를 이어 남기면 마지막 것 뒤에 한 번만 올린다
  let autoTimer: NodeJS.Timeout | null = null
  let lastAuto: { at: number; error: string | null } | null = null
  const scheduleAutoPublish = () => {
    // 설정 › 동기화의 올리기 칸 (10/19): 수동이면 저절로 올리지 않는다
    const delay = syncDelayMs(ctx.registry, 'publish', opts.feedbackAutoPublishMs)
    if (!opts.feedbackDir || !opts.feedbackPublish || delay === null) return
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(() => {
      autoTimer = null
      publishOnce().then(() => { lastAuto = { at: Date.now(), error: null } }, (e) => {
        lastAuto = { at: Date.now(), error: (e as Error).message }
        app.log.warn({ err: e }, '피드백 자동 올리기 실패')
      })
    }, delay)
  }
  // 개인 저장소 사본에 GitHub의 새 처리 기록을 받는다: 피드백 화면을 열 때(1분에 한 번까지)와 5분마다
  let lastSync = 0
  let syncing: Promise<unknown> | null = null
  const syncSoon = () => {
    if (!opts.feedbackSync || syncing || Date.now() - lastSync < 60_000) return
    lastSync = Date.now()
    syncing = publishing.catch(() => undefined).then(() => opts.feedbackSync!()).then((r) => {
      if (!r.ok) app.log.warn(`개인 저장소 받기 실패: ${r.error}`)
    }).finally(() => { syncing = null })
  }
  const syncTimer = opts.feedbackSync ? setInterval(syncSoon, 5 * 60_000) : null
  syncTimer?.unref()
  app.addHook('onClose', async () => { if (autoTimer) clearTimeout(autoTimer); if (syncTimer) clearInterval(syncTimer) })

  app.get('/api/feedback/unpublished', replies(C.UnpublishedFiles), async (): Promise<C.UnpublishedFiles> => (opts.feedbackDir && opts.feedbackPublish ? unpublishedFeedback(opts.feedbackDir) : { files: [], count: 0 }))

  /**
   * 연구 저장소에서 앱이 올리는 사용자 기록 (workbench 기준). 코멘트 형식이 늘면 여기에 더한다.
   * 일지(log/)도 넣는다: 일지 메모를 쓰거나 할 일을 기록으로 옮기면(todos.ts) log/가 바뀌는데, 올리지 않으면 "커밋하지 않은 변경"으로 남아 저절로 받기를 막는다
   */
  const RESEARCH_RECORDS = ['comments', 'log']
  const researchRecords = async (rid: string) => {
    const wbDir = path.join(repoPath(rid), 'workbench')
    const { top, rel } = await locate(wbDir)
    // git add는 없는 경로를 거절한다: 일지 폴더가 아직 없는 저장소는 comments만 (comments는 예전처럼 늘 넣는다)
    const present = RESEARCH_RECORDS.filter((p) => p === 'comments' || fs.existsSync(path.join(wbDir, p)))
    return { top, paths: present.map((p) => (rel ? `${rel}/${p}` : p)) }
  }
  /**
   * 기록 올리기. GitHub에서도 바뀐 기록 파일은 세 갈래로 합쳐 보고(merge), GitHub 위에 따로 올린 뒤에는
   * 이 컴퓨터의 브랜치를 그 커밋으로 옮겨(adopt) 저절로 받기가 막히지 않게 한다 (pathsync.ts, 10/15)
   */
  const RECORDS_MESSAGE = 'Add comments from the research workspace app'
  const recordsLast = new Map<string, { at: number; error: string | null }>()
  const publishRecords = async (rid: string, r: { top: string; paths: string[] }) => {
    const before = recordsLast.get(rid)?.error ?? null
    const done = (error: string | null) => {
      recordsLast.set(rid, { at: Date.now(), error })
      // 화면(기록 탭 맨 위 줄 · 실패 알림)은 실패가 생기거나 풀릴 때만 다시 읽는다
      if (before !== error) ctx.broadcast({ type: 'records-publish', research: rid })
    }
    try {
      const out = await publishPaths(r.top, r.paths, { message: RECORDS_MESSAGE, adopt: true, merge: true })
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
  const scheduleRecordsPublish = (rid: string) => {
    const delay = syncDelayMs(ctx.registry, 'publish', opts.recordsAutoPublishMs)
    if (delay === null || opts.sandbox) return
    clearTimeout(recordTimers.get(rid))
    recordTimers.set(rid, setTimeout(() => {
      recordTimers.delete(rid)
      void (async () => {
        let r: { top: string; paths: string[] }
        try {
          r = await researchRecords(rid)
          if (!(await pendingPaths(r.top, r.paths)).length) return
        } catch { return } // git 저장소가 아니거나 GitHub 브랜치를 추적하지 않음: 올리지 않는다
        await publishRecords(rid, r).catch((e) => app.log.warn({ err: e, research: rid }, '기록 자동 올리기 실패'))
      })()
    }, delay))
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
      const r = await researchRecords(req.params.rid)
      return await publishRecords(req.params.rid, r)
    } catch (e) {
      if (e instanceof PathSyncError) throw new WorkbenchError(409, e.message)
      throw e
    }
  })


  // 공개 저장소의 새 이슈 주소: 다른 사용자가 피드백을 관리자에게 보내는 곳. RW_ISSUES_URL로 바꿀 수 있다(예제 모드 확인용)
  let issues: Promise<string | null> | null = null
  const issuesUrl = () => (issues ??= process.env.RW_ISSUES_URL ? Promise.resolve(process.env.RW_ISSUES_URL) : opts.appRepo ? appIssuesUrl(opts.appRepo.root) : Promise.resolve(null))

  app.get('/api/feedback', replies(C.FeedbackToday), async (): Promise<C.FeedbackToday> => ({
    issues: await issuesUrl(), version: opts.appVersion ?? null,
    enabled: !!opts.feedbackDir, publishable: !!opts.feedbackDir && !!opts.feedbackPublish,
    autoPublish: !!opts.feedbackDir && !!opts.feedbackPublish && opts.feedbackAutoPublishMs !== undefined,
    lastAutoPublish: lastAuto,
    entries: opts.feedbackDir ? listFeedback(opts.feedbackDir) : [],
  }))

  const inApp = opts.appRepo ? commitChecker(opts.appRepo.root, opts.appRepo.running) : null
  let account: Promise<string | null> | null = null
  app.get('/api/feedback/all', replies(C.FeedbackAll), async (): Promise<C.FeedbackAll> => {
    syncSoon()
    const entries = opts.feedbackDir ? listAllFeedback(opts.feedbackDir) : []
    if (inApp) {
      await Promise.all(entries.map(async (e) => {
        if (!e.status?.commit) return
        const v = await inApp(e.status.commit)
        if (v !== undefined) e.inApp = v
      }))
    }
    // 예제 모드는 예제 계정 (githubRepos.ts의 예제 저장소 주인과 같다)
    const user = opts.sandbox ? 'example-user' : opts.feedbackDir ? await (account ??= feedbackAccount(opts.feedbackDir)) : null
    return { enabled: !!opts.feedbackDir, entries, user, statusError: opts.feedbackDir ? feedbackStatusError(opts.feedbackDir) : null }
  })
  /** 피드백의 그림 (feedback/pictures/ 안의 파일만): 남길 때의 화면, 처리 전후 그림 */
  app.get<{ Querystring: { path?: string } }>('/api/feedback/picture', async (req, reply) => {
    const rel = req.query.path ?? ''
    if (!opts.feedbackDir || !/^pictures\/[\w.-]+\.(png|jpe?g)$/.test(rel)) throw new WorkbenchError(404, t('그림이 없음', 'No picture'))
    const file = path.join(opts.feedbackDir, rel)
    if (!fs.existsSync(file)) throw new WorkbenchError(404, t('그림이 없음', 'No picture'))
    return reply.type(rel.endsWith('.png') ? 'image/png' : 'image/jpeg').send(fs.readFileSync(file))
  })
  /** 코멘트: 처리를 바꾸지 않고 묻거나 덧붙인다. reviews.yaml comments에 적고 피드백처럼 올린다 */
  app.post('/api/feedback/comment', replies(C.FeedbackCommented), async (req): Promise<C.FeedbackCommented> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.FeedbackCommentBody, req.body)
    if (!b.note.trim()) throw new WorkbenchError(400, t('키와 내용이 필요함', 'key and note are required'))
    if (!listAllFeedback(opts.feedbackDir).some((e) => e.key === b.key)) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    const comment = addFeedbackComment(opts.feedbackDir, b.key, b.note.slice(0, 4000))
    scheduleAutoPublish()
    return { comment }
  })
  /** 내가 쓴 글(수정 요청 · 승인 · 코멘트) 고치기: at으로 찾는다 */
  app.patch('/api/feedback/review', replies(C.FeedbackOk), async (req): Promise<C.FeedbackOk> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.FeedbackNoteBody, req.body)
    if (!b.note.trim()) throw new WorkbenchError(400, t('키 · 시각 · 내용이 필요함', 'key, at and note are required'))
    if (!editFeedbackNote(opts.feedbackDir, b.key, b.at, b.note.slice(0, 4000))) throw new WorkbenchError(404, t('그 글을 찾지 못했습니다', 'That message was not found'))
    scheduleAutoPublish()
    return { ok: true }
  })
  app.post('/api/feedback/publish', replies(C.FeedbackPublished), async (): Promise<C.FeedbackPublished> => {
    if (!opts.feedbackDir || !opts.feedbackPublish) throw new WorkbenchError(404, t('이 모드에서는 피드백을 올리지 않습니다', 'Feedback is not pushed in this mode'))
    try { return await publishOnce() } catch (e) {
      if (e instanceof PublishError) throw new WorkbenchError(409, e.message)
      throw e
    }
  })

  /** 남긴 피드백 고치기(text) · 지우기(text: null) */
  app.patch('/api/feedback', replies(C.FeedbackOk), async (req): Promise<C.FeedbackOk> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.EditFeedbackBody, req.body)
    if (b.text !== null && !b.text.trim()) throw new WorkbenchError(400, t('내용이 필요함 (지우려면 text: null)', 'text is required (to delete, send text: null)'))
    if (!editFeedback(opts.feedbackDir, b, b.text, b.kind)) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    scheduleAutoPublish()
    return { ok: true }
  })
  /** 처리한 피드백을 승인·반려한다 (verdict: null이면 마지막 것을 취소, 그 전의 것은 history에 남는다). feedback/reviews.yaml에 적고 피드백처럼 올린다 */
  app.put('/api/feedback/review', replies(C.FeedbackReviewed), async (req): Promise<C.FeedbackReviewed> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.FeedbackReviewBody, req.body)
    const item = listAllFeedback(opts.feedbackDir).find((e) => e.key === b.key)
    if (!item) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    if (b.verdict !== null && !item.status) throw new WorkbenchError(400, t('아직 처리하지 않은 항목입니다', 'This item has not been handled yet'))
    // 결정을 묻는 답에는 진행 · 중단으로, 결과를 알린 답에는 승인 · 반려로 답한다 (10/9). 예전 보류에 단 반려는 그대로 받는다
    const asks = feedbackAsks(item.status)
    if (b.verdict === '승인' && (asks || item.status?.state === '보류')) throw new WorkbenchError(400, t('묻는 답은 승인하지 않고 진행이나 중단으로 답합니다', 'An answer that asks you is not approved: answer it with Proceed or Stop'))
    if ((b.verdict === '진행' || b.verdict === '중단') && !asks) throw new WorkbenchError(400, t('진행 · 중단은 에이전트가 물은 답에만 씁니다', 'Proceed and Stop are only for answers where the agent asks you'))
    const review = setFeedbackReview(opts.feedbackDir, b.key, b.verdict, b.note)
    scheduleAutoPublish()
    return { review }
  })
  app.post('/api/feedback', replies(C.FeedbackAdded), async (req): Promise<C.FeedbackAdded> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.NewFeedbackBody, req.body)
    if (!b.text.trim()) throw new WorkbenchError(400, t('내용이 필요함', 'text is required'))
    const entry = appendFeedback(opts.feedbackDir, { ...b, version: opts.appVersion })
    scheduleAutoPublish()
    return { entry }
  })
}
