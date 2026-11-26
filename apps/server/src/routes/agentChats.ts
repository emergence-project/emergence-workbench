// 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21): 대화 목록 · 만들기 · 이어서 지시 · 허락 답 · 모드 바꾸기 · 멈추기 · 지우기, 지금 작업 상태
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentChats'
import { LIBRARY_RID } from '@rw/core'
import fs from 'node:fs'
import { MCP_NAME, type AgentRunner, type OneShot } from '../agentChats.js'
import { DebateChats } from '../agentDebate.js'
import { registerAgentRoom } from './agentRoom.js'
import { publishPaths } from '../pathsync.js'
import { assertPrivateRemote } from '../personalRepo.js'
import { registerAgentCentral } from './agentCentral.js'
import { registerClaudeAccounts } from './claudeAccounts.js'
import { ClaudeAccounts } from '../claudeAccounts.js'
import { setLimitsFile } from '../agentLimits.js'
import { chatExtras } from '../agentExtras.js'
import type { AppWork } from '../appWorktree.js'
import { claudeAgentRunner } from '../agentRunner.js'
import { acpAgentRunner } from '../agentAcp.js'
import { ACP_AGENTS, agentsHere, isAcp } from '../agentKinds.js'
import { ensureCodexAcp } from '../codexAcp.js'
import { codexAsk } from '../codexCli.js'
import { registerChatMcp } from '../agentMcpHttp.js'
import { parseBody, replies } from '../contract.js'
import { createMcpServer } from '../mcp.js'
import { commitChecker } from '../commitsInApp.js'
import { repeat } from '../scheduler.js'
import { chatCap, chatRoom, MemoryGauge } from '../appMemory.js'
import { machineName } from '../backup.js'
import { publishFeedback } from '../feedback.js'
import { remoteServer } from '../serverRelay.js'
import { claimedElsewhere, claimFeedback, releaseClaims } from '../feedbackClaims.js'
import { hubOf } from '../deviceServer.js'
import { agentAnswer } from '../ask.js'
import { t } from '../i18n.js'
import { setLocalChats } from './chatPlace.js'
import type { RouteContext } from './context.js'

/** 동시에 도는 대화 수: 예제 · 시험 (맥에서는 컴퓨터 크기와 남은 메모리로, appMemory.ts의 chatCap · chatRoom, 11/19) */
export const CHAT_LIMIT = 3
/** 남은 메모리를 다시 재고 줄 선 대화를 시작해 보는 간격 */
const MEMORY_EVERY = 15_000

/** 앱 MCP가 같은 프로세스에서 앱 API를 부를 때: 네트워크 대신 fastify inject */
function injectFetch(app: FastifyInstance): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url: u.pathname + u.search,
      headers: init?.headers as Record<string, string> | undefined,
      ...(init?.body !== undefined && { payload: init.body as string }),
    })
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': String(res.headers['content-type'] ?? 'application/json') } })
  }) as typeof fetch
}

/** 중앙 메모 파일 (시안 §9 ⑤): 개인 저장소가 있으면 agent/central-memo.md로 두고 써지면 올린다, 없으면 이 컴퓨터 설정 폴더 */
const MEMO_PATH = 'agent/central-memo.md'
/** 의도 장부 (agentCentralReview.ts, 11/23): 사용자의 말 그대로라 공개 저장소가 아닌 개인 저장소에, 메모 옆 */
const LEDGER_PATH = 'agent/central-decisions.json'

export function registerAgentChats(app: FastifyInstance, ctx: RouteContext, runner?: AgentRunner, appWork?: AppWork, others?: Record<string, AppWork>): DebateChats {
  const { registry, broadcast, repoPath } = ctx
  const personal = ctx.opts.personalDir
  const kept = (rel: string, local: string, message: string) => personal
    ? { file: path.join(personal, rel), where: 'personal' as const, publish: async () => { await assertPrivateRemote(personal); await publishPaths(personal, [rel], { message }) } }
    : { file: path.join(registry.configDir, local), where: 'local' as const }
  const centralMemo = () => ({ ...kept(MEMO_PATH, 'central-memo.md', 'Update central memo'), decisions: kept(LEDGER_PATH, 'central-decisions.json', 'Update intent ledger') })
  // 저절로 맡기기는 한 컴퓨터만: 개인 저장소에 맡은 컴퓨터를 적어 올린 뒤 맡는다 (feedbackClaims.ts, 10/22). 개인 저장소가 없으면 이 컴퓨터만 쓰는 것으로 본다
  const fbDir = ctx.opts.feedbackDir
  const pull = ctx.opts.feedbackSync
  const claims = fbDir && ctx.opts.feedbackPublish && pull ? (() => {
    const deps = { dir: fbDir, machine: machineName(), pull, publish: () => publishFeedback(fbDir) }
    return {
      taken: (key: string, since: number) => claimedElsewhere(fbDir, key, deps.machine, since) !== null,
      claim: (key: string, since: number, machine?: string) => claimFeedback({ ...deps, machine: machine ?? deps.machine }, key, since),
    }
  })() : undefined
  const mcpFor = (appChat?: string, central?: boolean, chat?: string) => createMcpServer({ baseUrl: 'http://workbench.local', key: ctx.opts.key, fetch: injectFetch(app), appChat, central, chat })
  // Codex · Gemini (10/30, ACP): 대화마다 앱 MCP를 HTTP 입구로 연다 (agentMcpHttp.ts)
  const chatMcp = registerChatMcp(app, mcpFor)
  // 중앙 대화의 작업 폴더 (11/16): 앱 저장소가 있으면 그것을 읽기로, 없으면 설정 폴더 안 빈 폴더
  const centralDir = () => { const d = ctx.opts.appRepo?.root ?? path.join(registry.configDir, 'central'); fs.mkdirSync(d, { recursive: true }); return d }
  // Claude 계정 여럿 (11/16): 대화 종류마다 계정 폴더. 예제 · 시험은 이 컴퓨터의 claude 대신 아무것도 하지 않는 명령을 띄운다
  const fake = runner ? { cli: () => (process.platform === 'win32' ? undefined : '/bin/true') } : {}
  const accounts = new ClaudeAccounts(registry.configDir, runner ? fake : { global: true })
  // Codex 계정 여럿 (11/20 시안 4절) · 계정마다 한도 (agentLimits.ts: Claude는 대화가 보낸 값을 설정 폴더에 적어 둔다)
  const codexAccounts = new ClaudeAccounts(registry.configDir, { ...fake, kind: 'codex' })
  if (!runner) setLimitsFile(path.join(registry.configDir, 'agent-limits.json'))
  // 실제 맥: 상한은 이 컴퓨터 크기로, 그 안에서는 남은 메모리로 연다 (예제 · 시험은 고정 CHAT_LIMIT)
  const gauge = runner ? undefined : new MemoryGauge()
  const cap = runner ? CHAT_LIMIT : chatCap()
  const chats = new DebateChats({
    dir: path.join(registry.configDir, 'agent-chats'),
    runner: runner ?? claudeAgentRunner(mcpFor),
    ...(!runner && { others: { codex: acpAgentRunner(ACP_AGENTS.codex, chatMcp, registry.configDir), gemini: acpAgentRunner(ACP_AGENTS.gemini, chatMcp, registry.configDir) } }),
    limit: cap,
    ...(gauge && { room: (live: number, fresh: number) => { const m = gauge.current; return m ? chatRoom(live, fresh, m, cap).ok : live < CHAT_LIMIT } }),
    project: (rid) => rid === C.CENTRAL_RID || rid === C.DEBATE_RID ? { repo: centralDir(), title: t('중앙', 'Central') } : ({ repo: repoPath(rid), title: rid === LIBRARY_RID ? t('지식 라이브러리', 'Knowledge library') : registry.list().find((r) => r.id === rid)?.title ?? rid }),
    readable: () => [...(registry.libraryPath ? [registry.libraryPath] : []), ...registry.list().map((r) => r.path)],
    extraDirs: () => (registry.libraryPath ? [registry.libraryPath] : []),
    notify: (c) => broadcast({ type: 'agent-chat', research: c.rid, id: c.id }),
    draft: (c, text) => broadcast({ type: 'agent-draft', research: c.rid, id: c.id, text }),
    ...(appWork && { app: appWork }),
    ...(appWork && others && Object.keys(others).length && { apps: others }),
    ...(ctx.opts.feedbackDir && { feedback: { dir: ctx.opts.feedbackDir, written: () => ctx.feedbackWritten?.(), ...(claims && { claims }), elsewhere: () => !!remoteServer(ctx.opts), helpers: { free: () => hubOf(ctx).free(), assign: (name, keys) => hubOf(ctx).assign(name, keys), unstarted: () => hubOf(ctx).unstarted() } } }),
    settings: () => registry.agents,
    accounts: { claude: accounts, codex: codexAccounts },
    // Codex 검토 (11/9): 묻기와 같은 codex exec, 읽기 전용. 예제 · 시험은 실행기의 것
    ...(runner ? runner.review && { review: runner.review } : { review: (o: OneShot) => codexAsk(registry.configDir, o.cwd, o.prompt, undefined, o) }),
    ...(ctx.opts.appRepo && { inApp: ((repo) => commitChecker(repo.root, () => repo.running))(ctx.opts.appRepo) }),
    recordAnswer: (rid, rec, text, edits) => {
      const changed = edits.length ? [t('고친 곳 (아래 「고친 곳 검토」에서 승인. 내가 쓴 문단은 제안으로 남아, 받아야 노트에 씁니다):', 'Changed (approve under "Review changes" below; paragraphs you wrote stay as suggestions until you take them):'), ...edits.map((e) => `- ${e.file} +${e.added} −${e.removed}`)].join('\n') : ''
      agentAnswer(ctx.recordsRoot(rid), rec.target, rec.id, 'claude', [text, changed].filter(Boolean).join('\n\n'))
    },
  }, centralMemo())
  ctx.agentChats = chats
  // 다른 컴퓨터의 대화 (agentShare.ts): 맞추기가 받아 둔 개인 저장소 사본에서 읽는다
  chats.shareDir = ctx.opts.backup?.dir
  // 오래된 대화 정리 (11/16 시안 §6): 끝나고 7일 지난 대화를 보관하고 요약 · 압축한다. 1시간마다 (예제 · 시험은 돌리지 않는다)
  if (!runner) repeat(app, { first: 5 * 60_000, every: 60 * 60_000, run: () => chats.tidy() })
  // 피드백 대화 돌보기 (CI 빨강 다시 보내기 · 합치기 · 반영됨 · 저절로 맡기기): 1분마다
  if (appWork && ctx.opts.feedbackDir) repeat(app, { first: 60_000, every: 60_000, run: () => chats.tickFeedback() })
  // 끝난 대화(PR을 합쳤거나 보관한 것)의 작업 폴더 치우기 (11/25): 10분마다. 잃을 것이 있는 폴더는 두고, 시안은 남긴다
  if (appWork) repeat(app, { first: 2 * 60_000, every: 10 * 60_000, run: () => chats.tidyWorktrees() })
  if (appWork && ctx.opts.feedbackDir) ctx.feedbackSaved = () => void chats.pickFeedback().catch(() => undefined)
  // 피드백 돕기 (11/23 안 A). 서버: 늦은 돕는 맥이 맡은 항목의 맡음을 풀고 다시 맡긴다 (1분마다)
  if (appWork && fbDir) repeat(app, {
    first: 60_000, every: 60_000,
    run: async () => {
      const lapsed = hubOf(ctx).lapsed()
      let n = 0
      for (const l of lapsed) { n += releaseClaims(fbDir, l.keys, l.name); chats.unpick(l.keys) }
      if (n) await publishFeedback(fbDir).catch(() => undefined)
      if (lapsed.length) await chats.pickFeedback()
    },
  })
  // 돕는 맥: 설정 › 기기 관리에서 켜 두었고 서버가 따로 있으면, 1분 알림에 자리를 싣고 서버가 맡긴 피드백을 이 맥에서 시작한다 (routes/devices.ts)
  if (appWork && fbDir) ctx.feedbackHelp = {
    info: () => {
      const slots = registry.agents.helper
      if (!slots || !remoteServer(ctx.opts)) return undefined
      const live = chats.liveFeedback()
      return { slots, busy: Math.min(live.count, 50), keys: live.keys.slice(0, 50) }
    },
    start: async (keys) => {
      await pull?.().catch(() => undefined)
      try { chats.handOff(keys, undefined, true) } catch (e) {
        // 시작하지 못하면 맡음을 풀어 서버가 다시 맡기게 한다
        if (releaseClaims(fbDir, keys, machineName())) await publishFeedback(fbDir).catch(() => undefined)
        throw e
      }
    },
    drop: (keys) => chats.dropFeedback(keys),
  }
  // 남은 메모리를 재고, 풀렸으면 줄 선 대화를 시작한다 (11/19)
  if (gauge) {
    void gauge.refresh()
    repeat(app, { first: MEMORY_EVERY, every: MEMORY_EVERY, run: async () => { await gauge.refresh(); chats.drain() } })
  }
  // 중앙 대화 깨우기 (11/18): 하위 대화의 PR이 합쳐졌는지 · CI가 실패했는지 1분마다
  if (appWork) repeat(app, { first: 60_000, every: 60_000, run: () => chats.tickCentral() })
  app.addHook('onClose', async () => chats.stopAll())
  // 앱이 다시 켜질 때 돌던 대화를 이어 간다 (서버가 다 뜬 뒤 잠깐 기다렸다가)
  const resumeTimer = setTimeout(() => chats.resumeRestarted(), 5_000)
  resumeTimer.unref()
  app.addHook('onClose', async () => clearTimeout(resumeTimer))

  // 대화를 서버에서 (chatPlace.ts): 이 컴퓨터의 대화는 서버로 넘기지 않고, 서버 목록에 「이 맥」으로 더한다
  setLocalChats(app, { has: (id) => { try { chats.get(id); return true } catch { return false } }, list: (rid) => chats.list(rid) })
  app.get<{ Querystring: { rid?: string } }>('/api/agent-chats', replies(C.ChatList), async (req): Promise<C.ChatList> => ({ chats: chats.listAll(req.query.rid || undefined), limit: chats.limit, app: chats.app, ...(chats.otherApps.length && { apps: chats.otherApps }), handOff: chats.handOffOk }))

  /** 고를 수 있는 모델 (맥의 Claude Code에게 물어 30분 기억, 못 띄우면 빈 목록) */
  app.get('/api/agent-chats/extras', replies(C.ChatExtras), async (): Promise<C.ChatExtras> => chatExtras(MCP_NAME))
  app.get<{ Querystring: { agent?: string } }>('/api/agent-chats/models', replies(C.ChatModels), async (req): Promise<C.ChatModels> => ({ models: await chats.models(isAcp(req.query.agent) ? req.query.agent : undefined) }))
  /** 대화를 맡길 수 있는 에이전트 (Claude · Codex · Gemini): 깔렸는지 · 로그인했는지 · 깔 명령 */
  app.get('/api/agent-chats/agents', replies(C.ChatAgents), async (): Promise<C.ChatAgents> => {
    // codex는 있는데 연결부가 없으면 뒤에서 받는다 (다음에 읽을 때 Codex가 깔린 것으로 보인다)
    if (!process.env.VITEST) void ensureCodexAcp(registry.configDir)
    const agents = agentsHere(undefined, registry.configDir)
    // 예제 모드 · 시험(실행기를 넣은 앱)은 이 컴퓨터의 실제 계정을 보이지 않는다: 그림 · CI 산출물에 남지 않게 예제 계정으로
    return { agents: runner ? agents.map(({ email: _e, plan: _p, ...a }) => (a.id === 'claude-code' && a.installed ? { ...a, email: 'name@example.com', plan: 'Max' } : a)) : agents }
  })


  app.post('/api/agent-chats', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.create(parseBody(C.NewChatBody, req.body)) }))

  app.get<{ Params: { id: string } }>('/api/agent-chats/:id', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.getAny(req.params.id) }))
  /** 다른 컴퓨터의 대화를 이 컴퓨터에서 이어 하기 (agentShare.ts) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/continue-here', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.continueHere(req.params.id) }))

  /** 곁 질문: 하던 일을 멈추지 않고 작은 모델이 이 대화의 요약만 보고 답한다 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/side', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.side(req.params.id, parseBody(C.SideBody, req.body).text) }))

  /** 검토 (11/9 Codex, 11/23 여럿 동시): 고른 에이전트마다 읽기만 하며 고친 곳을 따로 보고 카드를 하나씩 붙인다 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/review', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.review(req.params.id, false, parseBody(C.ReviewBody, req.body ?? {}).by) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/messages', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.send(req.params.id, parseBody(C.ChatMessageBody, req.body)) }))

  /** 모드 · 모델 · 생각 깊이 (다음 차례부터) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/settings', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.settings(req.params.id, parseBody(C.ChatSettings, req.body)) }))

  /** 늘 허락한 것 하나 빼기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/forget', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.forget(req.params.id, parseBody(C.ForgetBody, req.body).label) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/answer', replies(C.ChatOne), async (req): Promise<C.ChatOne> => {
    const b = parseBody(C.AskAnswerBody, req.body)
    return { chat: chats.answer(req.params.id, b.ask, b.answer, { note: b.note, mode: b.mode }) }
  })

  /** 도는 동안 보내 기다리는 지시 하나 빼기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/unqueue', replies(C.Unqueued), async (req): Promise<C.Unqueued> => chats.unqueue(req.params.id, parseBody(C.UnqueueBody, req.body).index))

  /** 되돌리기: 내 지시 하나와 그 뒤를 지우고 그 앞 맥락으로 (앱 고치기 대화는 파일도) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/rewind', replies(C.Rewound), async (req): Promise<C.Rewound> => chats.rewind(req.params.id, parseBody(C.RewindBody, req.body).point))

  /** 오류 · 멈춤 · 앱 재시작 뒤 이어 하기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/resume', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.resume(req.params.id) }))

  /** 제목 바꾸기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/title', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.rename(req.params.id, parseBody(C.TitleBody, req.body).title) }))

  /** 기록으로 남기기: 대화에서 기록 초안 (화면이 적기 칸에 띄우고 사용자가 고쳐 저장한다) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/record-draft', replies(C.RecordDraft), async (req): Promise<C.RecordDraft> => chats.recordDraft(req.params.id, parseBody(C.RecordDraftBody, req.body).place))

  /** 보관함에 넣기 · 꺼내기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/archive', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.archive(req.params.id, parseBody(C.ArchiveBody, req.body).archived) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/stop', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.stop(req.params.id) }))

  app.delete<{ Params: { id: string } }>('/api/agent-chats/:id', replies(C.ChatDeleted), async (req): Promise<C.ChatDeleted> => {
    chats.remove(req.params.id)
    return { ok: true }
  })

  /** 앱 고치기 대화: 커밋해 PR 열기 · CI 결과 (에이전트가 앱 MCP app_submit · app_checks로 부른다) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/app/submit', replies(C.AppSubmitted), async (req): Promise<C.AppSubmitted> => chats.appSubmit(req.params.id, parseBody(C.AppSubmitBody, req.body)))
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/app/merge', replies(C.AppMerged), async (req): Promise<C.AppMerged> => chats.appMerge(req.params.id))
  app.get<{ Params: { id: string }; Querystring: { wait?: string } }>('/api/agent-chats/:id/app/checks', replies(C.AppChecks), async (req): Promise<C.AppChecks> => chats.appChecks(req.params.id, Number(req.query.wait) || 0))
  // 피드백 맡기기 (2단계 나): 피드백 화면의 「에이전트에게 맡기기」와, 맡은 대화가 처리 기록을 앱을 거쳐 적는 feedback_answer
  app.post('/api/feedback/hand-off', replies(C.ChatOne), async (req): Promise<C.ChatOne> => {
    const b = parseBody(C.HandOffBody, req.body)
    const keys = b.keys ?? [b.key!]
    const chat = chats.handOff(keys)
    // 손으로 맡긴 것도 적어 올려 다른 컴퓨터의 저절로 맡기기가 같은 항목을 맡지 않게 한다 (기다리지 않는다)
    for (const key of keys) void claims?.claim(key, 0).catch(() => undefined)
    return { chat }
  })
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/feedback/answer', replies(C.FeedbackAnswered), async (req): Promise<C.FeedbackAnswered> => chats.feedbackAnswer(req.params.id, parseBody(C.FeedbackAnswerBody, req.body)))

  registerAgentCentral(app, chats)
  registerAgentRoom(app, chats)
  registerClaudeAccounts(app, accounts, !!runner)
  registerClaudeAccounts(app, codexAccounts, !!runner)

  /** 지금 도는 대화와 잡은 파일: 화면 · 앱 밖 에이전트가 같은 것을 보고 피한다 */
  app.get('/api/agent-work', replies(C.WorkState), async (): Promise<C.WorkState> => chats.work())

  return chats
}
