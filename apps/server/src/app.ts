import { setCoreLang } from '@rw/core'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { UpdateSteps } from './appupdate.js'
import type { AskRunner } from './ask.js'
import { asLang, currentLang, setDefaultLang, t, withLang } from './i18n.js'
import { Registry } from './registry.js'
import { writeStatus } from './agentStatus.js'
import { watchWorkbench, type WorkbenchEvent } from './watcher.js'
import { watchLibrary } from './libraryWatch.js'
import { Workbench, ConflictError, WorkbenchError } from './workbench.js'
import { LibraryReadIndex } from './libraryReadIndex.js'
import { conceptIndexOpener } from './conceptIndex.js'
import type { RouteContext } from './routes/context.js'
import { registerApiIndex } from './routes/apiIndex.js'
import { registerResearches } from './routes/researches.js'
import { registerSettings } from './routes/settings.js'
import { registerFeedback } from './routes/feedback.js'
import { registerSync } from './routes/sync.js'
import { registerLibrary } from './routes/library.js'
import { registerKnowledge } from './routes/knowledge.js'
import { registerSubjects } from './routes/subjects.js'
import { registerConcepts } from './routes/concepts.js'
import { registerStatements } from './routes/statements.js'
import { registerBlocks } from './routes/blocks.js'
import { registerProject } from './routes/project.js'
import { registerManuscript } from './routes/manuscript.js'
import { registerMaterials } from './routes/materials.js'
import { registerJournal } from './routes/journal.js'
import { registerComments } from './routes/comments.js'
import { registerGoogle } from './routes/google.js'
import { registerTopics } from './routes/topics.js'
import { registerBackup } from './routes/backup.js'
import { registerLatexSetup } from './routes/latexSetup.js'
import { registerNetwork } from './routes/network.js'
import { registerNoteTrash } from './routes/noteTrash.js'
import { registerSearch } from './routes/search.js'
import { registerLearn } from './routes/learn.js'
import { registerNotes } from './routes/notes.js'
import { registerPapers } from './routes/papers.js'
import { registerFigures } from './routes/figures.js'
import { registerTasks } from './routes/tasks.js'
import { registerAgentEdits } from './routes/agentEdits.js'
import { allowedRequest, extraHosts, fileResponseHeaders } from './hostGuard.js'
import { Google } from './google.js'
import type { RepoIO } from './githubRepos.js'

export interface AppOptions {
  /** 앱 설정 폴더 (기본 ~/.config/research-workspace) */
  configDir: string
  /** 파일 감시를 켤지 (테스트에서는 끔) */
  watch?: boolean
  /** 개발용 예제 모드(.sandbox/)인지. 화면이 실사용과 구분해 보여 준다 */
  sandbox?: boolean
  /** 앱 피드백을 쌓을 폴더 (실사용은 개인 저장소 사본의 feedback/). 없으면 피드백 기능을 끈다 */
  feedbackDir?: string
  /** 지금 돌고 있는 앱의 커밋 (짧은 형태). 피드백에 함께 적는다 */
  appVersion?: string
  /** 피드백 폴더를 앱에서 커밋·푸시할 수 있게 할지 (실사용만. 예제 모드의 .sandbox/는 git 제외) */
  feedbackPublish?: boolean
  /** 피드백을 남기거나 고친 뒤 이만큼(ms) 조용하면 저절로 GitHub에 올린다 (feedbackPublish일 때만). 없으면 버튼으로만 올린다 */
  feedbackAutoPublishMs?: number
  /** 피드백 폴더가 든 개인 저장소 사본에 GitHub의 새 내용(처리 기록 등)을 받는다 (실사용만, personalRepo.ts) */
  feedbackSync?: () => Promise<{ ok: boolean; error?: string }>
  /** 앱 자신의 업데이트(설정 화면). 실사용만: 저장소 위치, 지금 돌고 있는 커밋, 설치·빌드·재시작 방법 */
  appRepo?: { root: string; running: string; steps: UpdateSteps }
  /** 앱 자동 업데이트 (실사용 서비스만): 이만큼마다 받고 빌드해 두고, 열린 화면이 없고 쓰기 요청이 idleMs 동안 없으면 다시 시작한다 */
  appAutoUpdate?: { everyMs: number; idleMs: number }
  /** arXiv에서 논문을 받을 때 쓰는 fetch (테스트에서 바꿈) */
  fetch?: typeof fetch
  /** PDF 질문에 답할 Claude (기본: 맥의 `claude -p`, 테스트에서 바꿈) */
  ask?: AskRunner
  /** 분류 전 기록을 나눌 작은 모델 (테스트에서는 가짜 실행기로 바꿈) */
  classify?: AskRunner
  /** 등록 창의 GitHub 저장소 목록이 쓰는 gh·로그인·GitHub API (테스트에서 바꿈) */
  repoIO?: RepoIO
  /** 구글 계정 연결 (기본: 설정 폴더의 google.yaml로 진짜 구글. 예제 모드·테스트는 가짜 구글) */
  google?: Google
  /** 맥에만 있는 workbench/의 백업 (실사용만): 앱이 쓰는 백업 저장소 사본 폴더, GitHub 주소, 저절로 올리는 간격(ms) */
  backup?: { dir: string; remote: string; intervalMs?: number; settings?: string }
}

/**
 * GET이 아니지만 라이브러리·프로젝트 자료를 바꾸지 않는 요청. 이것 뒤에 캐시를 모두 비우면 다음 라이브러리 읽기가 파일을 모두 다시 확인한다.
 * 모르는 요청은 비우는 쪽이 안전하므로, 확실히 자료를 쓰지 않는 것만 적는다.
 */
export const READ_ONLY_REQUESTS = new Set([
  'POST /api/researches/inspect',
  'POST /api/figures/open',
  'POST /api/researches/:rid/materials/:name/open',
  'POST /api/researches/:rid/notes/reveal',
  'POST /api/researches/:rid/agent-status',
  'POST /api/researches/:rid/records/publish',
  'POST /api/feedback',
  'PATCH /api/feedback',
  'PUT /api/feedback/review',
  'POST /api/feedback/publish',
  'POST /api/app/update',
  'POST /api/app/restart',
  // 컴파일은 결과를 .build/·설정 폴더에만 쓴다(원본·캐시 stamp에 안 걸림). GitHub 주소 읽기는 아무것도 쓰지 않는다
  'POST /api/researches/:rid/blocks/:bid/compile',
  'POST /api/researches/:rid/manuscript/compile',
  'POST /api/library/notes/:kind/:id/compile',
  'POST /api/researches/github',
])

export function buildApp(opts: AppOptions): FastifyInstance & { registry: Registry } {
  const registry = new Registry(opts.configDir)
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 }) as unknown as FastifyInstance & { registry: Registry }
  app.decorate('registry', registry)

  // Messages follow the screen language (x-rw-lang), else the language saved in Settings (i18n.ts)
  setDefaultLang(() => registry.ui?.language)
  setCoreLang(currentLang)
  app.addHook('onRequest', (req, _reply, done) => withLang(asLang(req.headers['x-rw-lang']), done))

  // 맥 밖의 웹 페이지가 보낸 요청은 받지 않는다 (hostGuard.ts)
  const hosts = extraHosts()
  app.addHook('onRequest', async (req, reply) => {
    if (!allowedRequest({ host: req.headers.host, origin: req.headers.origin, site: req.headers['sec-fetch-site'] as string | undefined, mode: req.headers['sec-fetch-mode'] as string | undefined }, hosts)) {
      return reply.status(403).send({ error: t('이 맥의 작업대 화면에서 온 요청만 받습니다', 'Only requests from the workbench screen on this computer are accepted') })
    }
  })

  // 연구 저장소에서 온 파일(SVG·HTML)을 앱 주소에서 열어도 스크립트가 돌지 않게 한다 (hostGuard.ts의 fileResponseHeaders)
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/')) for (const [k, v] of Object.entries(fileResponseHeaders(reply.getHeader('content-type')))) reply.header(k, v)
    return payload
  })

  // ---------- 실시간 알림 ----------
  const sockets = new Set<{ send(data: string): void; readyState: number }>()
  let libraryReads: LibraryReadIndex | undefined
  const broadcast = (e: WorkbenchEvent) => {
    // 라이브러리 알림은 바뀐 갈래의 캐시만 비운다 (아래 watchLibraryNow). 프로젝트 파일은 사용처·지도에 걸리므로 모두 비운다
    if (e.type !== 'library') libraryReads?.invalidate()
    const data = JSON.stringify(e)
    for (const s of sockets) if (s.readyState === 1) s.send(data)
  }
  const watchers = new Map<string, FSWatcher>()
  const ensureWatch = (rid: string) => {
    if (!opts.watch || watchers.has(rid)) return
    try {
      watchers.set(rid, watchWorkbench(rid, registry.get(rid).root, (e) => {
        broadcast(e)
        scheduleStatus(rid)
        if (e.type === 'research') watchSources(rid) // sources: 경로가 바뀌었을 수 있다
      }))
      watchSources(rid)
      scheduleStatus(rid)
    } catch { /* 없는 연구는 감시하지 않음 */ }
  }
  /** research.yaml의 sources(작업 목록·bib·검토 문서 폴더)가 바뀌어도 STATUS.md를 다시 쓴다 */
  const sourceWatchers = new Map<string, ReturnType<typeof chokidar.watch>>()
  function watchSources(rid: string) {
    void sourceWatchers.get(rid)?.close()
    sourceWatchers.delete(rid)
    try {
      const wb = registry.get(rid)
      const src = wb.readResearch().sources
      const repo = wb.repo
      const paths = [src.tasks, ...src.bib, ...src.reviews].filter((x): x is string => !!x).map((x) => path.join(repo, x))
      if (!paths.length) return
      const w = chokidar.watch(paths, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 } })
      // 작업 탭·개괄이 다시 읽도록 화면에도 알린다 (broadcast가 캐시도 비운다)
      w.on('all', () => { broadcast({ type: 'sources', research: rid }); scheduleStatus(rid) })
      sourceWatchers.set(rid, w)
    } catch { /* 없는 연구 */ }
  }
  app.addHook('onClose', async () => { await Promise.all([...sourceWatchers.values()].map((w) => w.close())) })
  // research.yaml에 agent-status: true인 프로젝트는 바뀔 때마다 workbench/STATUS.md를 다시 쓴다 (잠시 모아서)
  const statusTimers = new Map<string, ReturnType<typeof setTimeout>>()
  function scheduleStatus(rid: string) {
    clearTimeout(statusTimers.get(rid))
    statusTimers.set(rid, setTimeout(() => {
      statusTimers.delete(rid)
      try { const wb = registry.get(rid); if (wb.readResearch().agentStatus) writeStatus(wb) } catch { /* 다음 변경 때 다시 */ }
    }, 1500))
  }
  app.addHook('onClose', async () => { for (const t of statusTimers.values()) clearTimeout(t) })
  if (opts.watch) registry.ids().forEach(ensureWatch)
  app.addHook('onClose', async () => { await Promise.all([...watchers.values()].map((w) => w.close())) })

  void app.register(websocket)
  void app.register(async (scope) => {
    scope.get('/api/events', { websocket: true }, (socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })
  })

  app.setErrorHandler((err, _req, reply) => {
    // 409에는 지금 파일의 hash를 붙인다(ConflictError): 라우트마다 감싸지 않아도 화면이 다시 읽고 고를 수 있다
    if (err instanceof ConflictError) return reply.status(409).send({ error: err.message, currentHash: err.currentHash })
    if (err instanceof WorkbenchError) return reply.status(err.status).send({ error: err.message })
    const e = err as { statusCode?: number; message?: string }
    return reply.status(e.statusCode ?? 500).send({ error: e.message ?? t('알 수 없는 오류', 'Unknown error') })
  })

  const wbOf = (rid: string): Workbench => registry.get(rid)
  // 자료 올리기: 파일 내용을 그대로 받는다
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  /** 등록한 연구의 저장소 경로 (workbench/의 한 단계 위) */
  const repoPath = (rid: string) => {
    const r = registry.list().find((x) => x.id === rid)
    if (!r) throw new WorkbenchError(404, t(`등록되지 않은 연구: ${rid}`, `Project not registered: ${rid}`))
    return r.path
  }
  // 화면마다 자기 파일(routes/)에 API를 둔다. 새 화면은 파일을 만들고 여기에 한 줄 더한다
  // 개념노트 색인 (설정 폴더 안 SQLite): 라이브러리 경로마다 하나
  const conceptIndexes = conceptIndexOpener(registry.configDir)
  app.addHook('onClose', async () => conceptIndexes.close())
  const conceptIndex = () => conceptIndexes.get(registry.libraryPath)
  libraryReads = new LibraryReadIndex(registry, conceptIndex)
  registry.onSave(() => libraryReads?.invalidate())
  // 공용 라이브러리를 앱 밖(에이전트·Finder)에서 바꿔도 열린 화면이 다시 읽게 한다. 설정에서 경로를 바꾸면 감시도 옮긴다
  let libraryWatcher: { lib: string; close(): Promise<void> } | undefined
  const watchLibraryNow = () => {
    const lib = registry.libraryPath
    if (!opts.watch || libraryWatcher?.lib === lib) return
    void libraryWatcher?.close()
    libraryWatcher = undefined
    if (!lib) return
    const w = watchLibrary(lib, (part, file) => {
      if (part === 'figures') libraryReads?.invalidateFigures()
      else if (part === 'papers') libraryReads?.invalidatePapers()
      else libraryReads?.invalidate()
      broadcast({ type: 'library', research: null, part, file })
    })
    libraryWatcher = { lib, close: () => w.close() }
  }
  watchLibraryNow()
  registry.onSave(watchLibraryNow)
  app.addHook('onClose', async () => { await libraryWatcher?.close() })
  // HTTP로 저장한 것은 watcher가 없는 예제 모드에서도 바로 보인다. 자료를 쓰지 않는 요청(검사·열기·피드백·백업)은 캐시를 비우지 않는다
  app.addHook('onResponse', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || READ_ONLY_REQUESTS.has(`${req.method} ${req.routeOptions.url ?? ''}`)) return
    // 거절된 요청(400·404·409 …)은 쓰기 전에 멈춘 것이다. 5xx는 중간에 썼을 수 있어 비운다
    if (reply.statusCode >= 400 && reply.statusCode < 500) return
    libraryReads?.invalidate()
  })
  // 같은 SQLite 연결의 쓰기 트랜잭션이 나눠 돌아갈 때는 색인을 쓰는 요청만 기다린다.
  app.addHook('preHandler', async (req) => {
    if (['/api/concepts/list', '/api/concepts/subjects', '/api/concepts/resolve', '/api/concepts/search', '/api/concepts/rows', '/api/concepts/brief',
      '/api/concepts/:id/links', '/api/researches/:rid/notes/links'].includes(req.routeOptions.url ?? '')) await conceptIndex()?.ready()
  })
  const clients = () => [...sockets].filter((s) => s.readyState === 1).length
  const ctx: RouteContext = { registry, opts, broadcast, clients, wbOf, ensureWatch, watchers, repoPath, conceptIndex, libraryReads }
  registerApiIndex(app, ctx) // 맨 앞: 뒤에 등록되는 경로를 모아 GET /api로 보여 준다
  registerResearches(app, ctx)
  registerSettings(app, ctx)
  registerFeedback(app, ctx)
  registerSync(app, ctx)
  registerLibrary(app, ctx)
  registerKnowledge(app, ctx)
  registerConcepts(app, ctx)
  registerSubjects(app, ctx)
  registerStatements(app, ctx)
  registerBlocks(app, ctx)
  registerProject(app, ctx)
  registerManuscript(app, ctx)
  registerMaterials(app, ctx)
  registerJournal(app, ctx)
  registerComments(app, ctx)
  registerTopics(app, ctx)
  registerBackup(app, ctx)
  registerLatexSetup(app, ctx)
  registerNetwork(app, ctx)
  registerNoteTrash(app, ctx)
  registerSearch(app, ctx)
  registerLearn(app, ctx)
  registerNotes(app, ctx)
  registerPapers(app, ctx)
  registerFigures(app, ctx)
  registerTasks(app, ctx)
  registerAgentEdits(app, ctx)
  registerGoogle(app, ctx, opts.google ?? new Google(opts.configDir))

  return app
}
