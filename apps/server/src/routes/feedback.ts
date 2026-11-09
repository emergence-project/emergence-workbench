// 앱 피드백 (피드백 모드). 연구 기록 올리기는 recordsPublish.ts
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/feedback'
import { parseBody, replies } from '../contract.js'
import fs from 'node:fs'
import path from 'node:path'
import { addFeedbackComment, appendFeedback, editFeedback, editFeedbackNote, feedbackAccount, feedbackAsks, feedbackStatusError, listAllFeedback, listFeedback, publishFeedback, PublishError, setFeedbackReview, unpublishedFeedback } from '../feedback.js'
import { WorkbenchError, assertRealInside } from '../workbench.js'
import { commitChecker } from '../commitsInApp.js'
import { appIssuesUrl } from '../appupdate.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'
import { syncDelayMs } from '../syncTiming.js'
import { repeat } from '../scheduler.js'
import { readFeedbackCloud, writeFeedbackCloud } from '../feedbackCloud.js'
import { CLAIM_TTL_MS, isLiveClaim, lastTouched, readClaims, releaseClaims } from '../feedbackClaims.js'
import { exportFeedback, importFeedback } from '../feedbackBundle.js'
import { relayStatus, sendToRelay, senderId } from '../feedbackRelay.js'
import { revealInFinder } from '../materials.js'
import os from 'node:os'

/** 피드백 폴더 파일(날짜 파일 · status.yaml · reviews.yaml)의 이름 · 크기 · 고친 시각. 받기 전후가 다르면 새 기록이 들어온 것 */
export function feedbackFingerprint(dir: string | undefined): string {
  if (!dir) return ''
  try {
    return fs.readdirSync(dir).filter((f) => /\.(md|yaml)$/.test(f)).sort()
      .map((f) => { const s = fs.statSync(path.join(dir, f)); return `${f}:${s.size}:${s.mtimeMs}` }).join('|')
  } catch { return '' }
}

export function registerFeedback(app: FastifyInstance, ctx: RouteContext): void {
  const { opts } = ctx

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
  // 중계 서버로 바로 보내기 (11/8): 개인 저장소 없이 쓰는 앱. 한 번에 하나씩
  const sender = () => ctx.registry.authors[0]?.name || os.userInfo().username
  let relaying: Promise<unknown> = Promise.resolve()
  const relayOnce = () => {
    const run = relaying.catch(() => undefined).then(() => sendToRelay(opts.feedbackDir!, ctx.registry.configDir, sender(), opts.feedbackRelay!))
    relaying = run
    return run
  }
  let relayTimer: NodeJS.Timeout | null = null
  const scheduleRelay = () => {
    const delay = syncDelayMs(ctx.registry, 'publish', opts.feedbackAutoPublishMs)
    if (!opts.feedbackDir || !opts.feedbackRelay || delay === null) return
    if (relayTimer) clearTimeout(relayTimer)
    relayTimer = setTimeout(() => { relayTimer = null; relayOnce().catch((e) => app.log.warn({ err: e }, '피드백 바로 보내기 실패')) }, delay)
  }
  const scheduleAutoPublish = () => {
    scheduleRelay()
    // 설정 › 동기화의 올리기 칸 (10/19): 수동이면 저절로 올리지 않는다
    const delay = syncDelayMs(ctx.registry, 'publish', opts.feedbackAutoPublishMs)
    if (!opts.feedbackDir || !opts.feedbackPublish || delay === null) return
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(() => {
      autoTimer = null
      // 기다리는 사이 수동으로 바꿨으면 올리지 않는다
      if (syncDelayMs(ctx.registry, 'publish', opts.feedbackAutoPublishMs) === null) return
      publishOnce().then(() => { lastAuto = { at: Date.now(), error: null } }, (e) => {
        lastAuto = { at: Date.now(), error: (e as Error).message }
        app.log.warn({ err: e }, '피드백 자동 올리기 실패')
      })
    }, delay)
  }
  ctx.feedbackWritten = scheduleAutoPublish
  // 개인 저장소 사본에 GitHub의 새 처리 기록을 받는다: 피드백 화면을 열 때(1분에 한 번까지)와 5분마다
  let lastSync = 0
  let syncing: Promise<unknown> | null = null
  const syncSoon = () => {
    if (!opts.feedbackSync || syncing || Date.now() - lastSync < 60_000) return
    lastSync = Date.now()
    const before = feedbackFingerprint(opts.feedbackDir)
    syncing = publishing.catch(() => undefined).then(() => opts.feedbackSync!()).then((r) => {
      if (!r.ok) app.log.warn(`개인 저장소 받기 실패: ${r.error}`)
      // 받은 기록을 화면에 알린다. 알리지 않으면 화면 캐시가 앱을 다시 시작할 때까지 옛 기록을 보였다 (11/4)
      else if (feedbackFingerprint(opts.feedbackDir) !== before) ctx.broadcast({ type: 'feedback', research: null })
    }).finally(() => { syncing = null })
  }
  if (opts.feedbackSync) repeat(app, { first: 5 * 60_000, every: 5 * 60_000, run: async () => syncSoon() })
  app.addHook('onClose', async () => { if (autoTimer) clearTimeout(autoTimer); if (relayTimer) clearTimeout(relayTimer) })

  app.get('/api/feedback/unpublished', replies(C.UnpublishedFiles), async (): Promise<C.UnpublishedFiles> => (opts.feedbackDir && opts.feedbackPublish ? unpublishedFeedback(opts.feedbackDir) : { files: [], count: 0 }))

  // 공개 저장소의 새 이슈 주소: 다른 사용자가 피드백을 관리자에게 보내는 곳. RW_ISSUES_URL로 바꿀 수 있다(예제 모드 확인용)
  let issues: Promise<string | null> | null = null
  const issuesUrl = () => (issues ??= process.env.RW_ISSUES_URL ? Promise.resolve(process.env.RW_ISSUES_URL) : opts.appRepo ? appIssuesUrl(opts.appRepo.root) : Promise.resolve(null))

  app.get('/api/feedback', replies(C.FeedbackToday), async (): Promise<C.FeedbackToday> => ({
    issues: await issuesUrl(), version: opts.appVersion ?? null,
    enabled: !!opts.feedbackDir, publishable: !!opts.feedbackDir && !!opts.feedbackPublish,
    autoPublish: !!opts.feedbackDir && !!opts.feedbackPublish && opts.feedbackAutoPublishMs !== undefined,
    delay: (() => { const d = syncDelayMs(ctx.registry, 'publish', opts.feedbackAutoPublishMs); return d === null ? null : Math.round(d / 1000) })(),
    lastAutoPublish: lastAuto,
    relay: opts.feedbackDir && opts.feedbackRelay ? relayStatus(opts.feedbackDir, ctx.registry.configDir) : null,
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
    // 에이전트가 맡아 처리 중인 것 (11/9: 맡은 쪽이 사라져도 보이고 풀 수 있게)
    if (opts.feedbackDir) {
      const claims = readClaims(opts.feedbackDir)
      for (const e of entries) {
        const c = claims[e.key]
        if (isLiveClaim(c, lastTouched(e))) e.claim = { machine: c.machine, at: c.at, until: new Date(Date.parse(c.at) + CLAIM_TTL_MS).toISOString() }
      }
    }
    // 예제 모드는 예제 계정 (githubRepos.ts의 예제 저장소 주인과 같다)
    const user = opts.sandbox ? 'example-user' : opts.feedbackDir ? await (account ??= feedbackAccount(opts.feedbackDir)) : null
    return { enabled: !!opts.feedbackDir, entries, user, statusError: opts.feedbackDir ? feedbackStatusError(opts.feedbackDir) : null }
  })
  /** 맡음 풀기 (11/9): 맡은 에이전트가 끝내지 못하고 사라졌을 때 기다리지 않고 다른 곳이 맡게 */
  app.delete('/api/feedback/claim', replies(C.FeedbackOk), async (req): Promise<C.FeedbackOk> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.FeedbackClaimBody, req.body)
    if (releaseClaims(opts.feedbackDir, [b.key])) scheduleAutoPublish()
    return { ok: true }
  })
  /** 클라우드 피드백 처리 켜기 · 끄기 (11/4): cloud.yaml에 적고 피드백처럼 올린다 */
  app.get('/api/feedback/cloud', replies(C.FeedbackCloud), async (): Promise<C.FeedbackCloud> => opts.feedbackDir ? readFeedbackCloud(opts.feedbackDir) : { enabled: false, at: null })
  app.put('/api/feedback/cloud', replies(C.FeedbackCloud), async (req): Promise<C.FeedbackCloud> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.FeedbackCloudBody, req.body)
    const r = writeFeedbackCloud(opts.feedbackDir, b.enabled)
    scheduleAutoPublish()
    return r
  })
  /**
   * 피드백 파일로 보내기 (11/8): GitHub 없이 쓰는 사람이 남긴 피드백을 한 파일로 묶어 내려받기 폴더에 두고 탐색기 · Finder에서 보여 준다.
   * 보낸 사람 이름은 설정 › 계정의 첫 저자, 없으면 이 컴퓨터의 사용자 이름
   */
  app.post('/api/feedback/export', replies(C.FeedbackExported), async (): Promise<C.FeedbackExported> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const r = exportFeedback(opts.feedbackDir, sender(), undefined, undefined, senderId(ctx.registry.configDir))
    if (!opts.sandbox && !process.env.VITEST) void revealInFinder(r.file)
    return r
  })
  /** 관리자에게 바로 보내기 (11/8): 버튼. 남기면 저절로도 보낸다(scheduleRelay) */
  app.post('/api/feedback/relay', replies(C.FeedbackRelayed), async (): Promise<C.FeedbackRelayed> => {
    if (!opts.feedbackDir || !opts.feedbackRelay) throw new WorkbenchError(404, t('바로 보내기를 쓰지 않는 앱입니다', 'This app does not send feedback directly'))
    return await relayOnce()
  })
  /** 받은 피드백 파일 가져오기 (11/8): feedback/from/<보낸 사람>/에 두고, 개인 저장소면 내 피드백처럼 올린다 */
  app.post('/api/feedback/import', { bodyLimit: 100 * 1024 * 1024, ...replies(C.FeedbackImported) }, async (req): Promise<C.FeedbackImported> => {
    if (!opts.feedbackDir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const r = importFeedback(opts.feedbackDir, parseBody(C.FeedbackBundleBody, req.body))
    ctx.broadcast({ type: 'feedback', research: null })
    scheduleAutoPublish()
    return r
  })
  /** 피드백의 그림 (feedback/pictures/ 안의 파일만): 남길 때의 화면, 처리 전후 그림 */
  app.get<{ Querystring: { path?: string } }>('/api/feedback/picture', async (req, reply) => {
    const rel = req.query.path ?? ''
    if (!opts.feedbackDir || !/^pictures\/[\w.-]+\.(png|jpe?g)$/.test(rel)) throw new WorkbenchError(404, t('그림이 없음', 'No picture'))
    const file = assertRealInside(path.join(opts.feedbackDir, 'pictures'), path.join(opts.feedbackDir, rel), t('그림이 없음', 'No picture'))
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
    // 결정을 묻는 답에는 진행 · 중단 · 논의로, 결과를 알린 답에는 승인 · 진행 · 반려 · 논의로 답한다 (10/9, 11/8 안 C). 예전 보류에 단 반려는 그대로 받는다
    const asks = feedbackAsks(item.status)
    if (b.verdict === '승인' && (asks || item.status?.state === '보류')) throw new WorkbenchError(400, t('묻는 답은 승인하지 않고 진행이나 중단으로 답합니다', 'An answer that asks you is not approved: answer it with Proceed or Stop'))
    if (b.verdict === '중단' && !asks) throw new WorkbenchError(400, t('중단은 에이전트가 물은 답에만 씁니다', 'Stop is only for answers where the agent asks you'))
    if (b.verdict === '논의' && !b.note?.trim()) throw new WorkbenchError(400, t('논의는 무엇을 이야기할지 글을 적어 보냅니다', 'Write what to discuss before sending Discuss'))
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
