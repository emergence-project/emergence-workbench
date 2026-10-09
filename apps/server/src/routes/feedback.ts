// 기록 올리기와 앱 피드백 (피드백 모드)
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { addFeedbackComment, appendFeedback, editFeedback, editFeedbackNote, feedbackAccount, FEEDBACK_KINDS, FEEDBACK_VERDICTS, feedbackAsks, feedbackStatusError, listAllFeedback, listFeedback, publishFeedback, PublishError, setFeedbackReview, unpublishedFeedback, type FeedbackInput, type FeedbackVerdict } from '../feedback.js'
import { locate, pendingPaths, PathSyncError, publishPaths } from '../pathsync.js'
import { WorkbenchError } from '../workbench.js'
import { commitChecker } from '../commitsInApp.js'
import { appIssuesUrl } from '../appupdate.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

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
    if (!opts.feedbackDir || !opts.feedbackPublish || opts.feedbackAutoPublishMs === undefined) return
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(() => {
      autoTimer = null
      publishOnce().then(() => { lastAuto = { at: Date.now(), error: null } }, (e) => {
        lastAuto = { at: Date.now(), error: (e as Error).message }
        app.log.warn({ err: e }, '피드백 자동 올리기 실패')
      })
    }, opts.feedbackAutoPublishMs)
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

  app.get('/api/feedback/unpublished', async () => ({ files: opts.feedbackDir && opts.feedbackPublish ? await unpublishedFeedback(opts.feedbackDir) : [] }))

  /** 연구 저장소에서 앱이 올리는 사용자 기록 (workbench 기준). 코멘트 형식이 늘면 여기에 더한다 */
  const RESEARCH_RECORDS = ['comments']
  const researchRecords = async (rid: string) => {
    const { top, rel } = await locate(path.join(repoPath(rid), 'workbench'))
    return { top, paths: RESEARCH_RECORDS.map((p) => (rel ? `${rel}/${p}` : p)) }
  }
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/records/unpublished', async (req) => {
    const r = await researchRecords(req.params.rid).catch(() => null)
    return { files: r ? await pendingPaths(r.top, r.paths) : [] }
  })
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/records/publish', async (req) => {
    if (opts.sandbox) throw new WorkbenchError(404, t('개발용 예제 모드에서는 GitHub에 올리지 않습니다', 'Sample mode does not push to GitHub'))
    try {
      const r = await researchRecords(req.params.rid)
      return await publishPaths(r.top, r.paths, { message: 'Add comments from the research workspace app' })
    } catch (e) {
      if (e instanceof PathSyncError) throw new WorkbenchError(409, e.message)
      throw e
    }
  })


  // 공개 저장소의 새 이슈 주소: 다른 사용자가 피드백을 관리자에게 보내는 곳. RW_ISSUES_URL로 바꿀 수 있다(예제 모드 확인용)
  let issues: Promise<string | null> | null = null
  const issuesUrl = () => (issues ??= process.env.RW_ISSUES_URL ? Promise.resolve(process.env.RW_ISSUES_URL) : opts.appRepo ? appIssuesUrl(opts.appRepo.root) : Promise.resolve(null))

  app.get('/api/feedback', async () => ({
    issues: await issuesUrl(), version: opts.appVersion ?? null,
    enabled: !!opts.feedbackDir, publishable: !!opts.feedbackDir && !!opts.feedbackPublish,
    autoPublish: !!opts.feedbackDir && !!opts.feedbackPublish && opts.feedbackAutoPublishMs !== undefined,
    lastAutoPublish: lastAuto,
    entries: opts.feedbackDir ? listFeedback(opts.feedbackDir) : [],
  }))

  const inApp = opts.appRepo ? commitChecker(opts.appRepo.root, opts.appRepo.running) : null
  let account: Promise<string | null> | null = null
  app.get('/api/feedback/all', async () => {
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
  app.post<{ Body: { key: string; note: string } }>('/api/feedback/comment', async (req) => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = req.body ?? ({} as never)
    if (typeof b.key !== 'string' || typeof b.note !== 'string' || !b.note.trim()) throw new WorkbenchError(400, t('키와 내용이 필요함', 'key and note are required'))
    if (!listAllFeedback(opts.feedbackDir).some((e) => e.key === b.key)) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    const comment = addFeedbackComment(opts.feedbackDir, b.key, b.note.slice(0, 4000))
    scheduleAutoPublish()
    return { comment }
  })
  /** 내가 쓴 글(수정 요청 · 승인 · 코멘트) 고치기: at으로 찾는다 */
  app.patch<{ Body: { key: string; at: string; note: string } }>('/api/feedback/review', async (req) => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = req.body ?? ({} as never)
    if (typeof b.key !== 'string' || typeof b.at !== 'string' || typeof b.note !== 'string' || !b.note.trim()) throw new WorkbenchError(400, t('키 · 시각 · 내용이 필요함', 'key, at and note are required'))
    if (!editFeedbackNote(opts.feedbackDir, b.key, b.at, b.note.slice(0, 4000))) throw new WorkbenchError(404, t('그 글을 찾지 못했습니다', 'That message was not found'))
    scheduleAutoPublish()
    return { ok: true }
  })
  app.post('/api/feedback/publish', async () => {
    if (!opts.feedbackDir || !opts.feedbackPublish) throw new WorkbenchError(404, t('이 모드에서는 피드백을 올리지 않습니다', 'Feedback is not pushed in this mode'))
    try { return await publishOnce() } catch (e) {
      if (e instanceof PublishError) throw new WorkbenchError(409, e.message)
      throw e
    }
  })

  /** 남긴 피드백 고치기(text) · 지우기(text: null) */
  app.patch<{ Body: { date: string; time: string; target: string; n?: number; text: string | null } }>('/api/feedback', async (req) => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = req.body ?? ({} as never)
    if (typeof b.date !== 'string' || typeof b.time !== 'string' || typeof b.target !== 'string') throw new WorkbenchError(400, t('날짜·시각·부위가 필요함', 'date, time and target are required'))
    if (b.text !== null && (typeof b.text !== 'string' || !b.text.trim())) throw new WorkbenchError(400, t('내용이 필요함 (지우려면 text: null)', 'text is required (to delete, send text: null)'))
    if (!editFeedback(opts.feedbackDir, b, b.text)) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    scheduleAutoPublish()
    return { ok: true }
  })
  /** 처리한 피드백을 승인·반려한다 (verdict: null이면 마지막 것을 취소, 그 전의 것은 history에 남는다). feedback/reviews.yaml에 적고 피드백처럼 올린다 */
  app.put<{ Body: { key: string; verdict: FeedbackVerdict | null; note?: string } }>('/api/feedback/review', async (req) => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = req.body ?? ({} as never)
    if (typeof b.key !== 'string') throw new WorkbenchError(400, t('키가 필요함', 'key is required'))
    if (b.verdict !== null && !FEEDBACK_VERDICTS.includes(b.verdict)) throw new WorkbenchError(400, t(`verdict는 ${FEEDBACK_VERDICTS.join('·')} 또는 null`, `verdict must be ${FEEDBACK_VERDICTS.join('·')} or null`))
    const item = listAllFeedback(opts.feedbackDir).find((e) => e.key === b.key)
    if (!item) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    if (b.verdict !== null && !item.status) throw new WorkbenchError(400, t('아직 처리하지 않은 항목입니다', 'This item has not been handled yet'))
    // 결정을 묻는 답에는 진행 · 중단으로, 결과를 알린 답에는 승인 · 반려로 답한다 (10/9). 예전 보류에 단 반려는 그대로 받는다
    const asks = feedbackAsks(item.status)
    if (b.verdict === '승인' && (asks || item.status?.state === '보류')) throw new WorkbenchError(400, t('묻는 답은 승인하지 않고 진행이나 중단으로 답합니다', 'An answer that asks you is not approved: answer it with Proceed or Stop'))
    if ((b.verdict === '진행' || b.verdict === '중단') && !asks) throw new WorkbenchError(400, t('진행 · 중단은 에이전트가 물은 답에만 씁니다', 'Proceed and Stop are only for answers where the agent asks you'))
    const review = setFeedbackReview(opts.feedbackDir, b.key, b.verdict, typeof b.note === 'string' ? b.note : undefined)
    scheduleAutoPublish()
    return { review }
  })
  app.post<{ Body: FeedbackInput }>('/api/feedback', async (req) => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = req.body ?? ({} as FeedbackInput)
    if (!FEEDBACK_KINDS.includes(b.kind)) throw new WorkbenchError(400, t(`종류는 ${FEEDBACK_KINDS.join('·')} 중 하나`, `kind must be one of ${FEEDBACK_KINDS.join('·')}`))
    if (typeof b.text !== 'string' || !b.text.trim()) throw new WorkbenchError(400, t('내용이 필요함', 'text is required'))
    if (typeof b.target !== 'string') throw new WorkbenchError(400, t('부위가 필요함', 'target is required'))
    const entry = appendFeedback(opts.feedbackDir, { ...b, version: opts.appVersion })
    scheduleAutoPublish()
    return { entry }
  })
}
