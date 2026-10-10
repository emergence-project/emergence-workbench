// 연구 목록·등록·개괄
import type { FastifyInstance } from 'fastify'
import { GitHubRepoList } from '@rw/core/contract/register'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import path from 'node:path'
import { buildTree } from '@rw/core'
import { cloneInto, defaultCloneDir, parseGitHubRepo } from '../clone.js'
import { listGitHubRepos, realIO, type RepoIO } from '../githubRepos.js'
import { AgentEditStore } from '../agentEdits.js'
import { allManuscripts, groundsOf } from '../manuscript.js'
import { listStatements } from '../statements.js'
import { listTasks } from '../tasks.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerResearches(app: FastifyInstance, ctx: RouteContext, io: RepoIO = ctx.opts.repoIO ?? realIO): void {
  const { registry, opts, wbOf, ensureWatch, watchers } = ctx
  app.get('/api/researches', replies(C.ResearchList), async (): Promise<C.ResearchList> => ({ engine: registry.engine, sandbox: !!opts.sandbox, researches: registry.list() }))

  /**
   * 왼쪽 띠의 프로젝트 버튼에 붙는 수와 첫 화면의 "확인 필요" 점: 프로젝트마다 확인이 필요한 노트(첫 화면의 tree.issues와 같다, 10/4 18:16 피드백)
   * + 판단을 기다리는 맡긴 일(결과·종결 조건 제안, 10/7). counts는 둘의 합, notes·tasks는 툴팁에 쓰는 내역.
   * + 에이전트 고침(검토를 기다리는 노트와 확인된 노트 쓰기 시도, 10/8). 검토는 기록만 세고 노트 파일을 비교하지 않는다.
   * 노트 머리와 작업 파일 머리만 보므로 원고·진술은 읽지 않는다. 읽지 못하는 프로젝트는 뺀다.
   */
  app.get('/api/research-issues', replies(C.ProjectIssues), async (): Promise<C.ProjectIssues> => {
    const counts: Record<string, number> = {}
    const notes: Record<string, number> = {}
    const tasks: Record<string, number> = {}
    const edits: Record<string, number> = {}
    const stored = new AgentEditStore(AgentEditStore.fileFor(registry.configDir, registry.libraryPath)).read()
    for (const x of [...stored.pending, ...stored.attempts]) if (x.target.kind === 'note') edits[x.target.rid] = (edits[x.target.rid] ?? 0) + 1
    for (const id of registry.ids()) {
      try {
        const wb = wbOf(id)
        notes[id] = wb.tree().issues.length
        tasks[id] = listTasks(wb).filter((t) => t.state === 'result' || t.state === 'proposed').length
        edits[id] ??= 0
        counts[id] = notes[id] + tasks[id] + edits[id]
      } catch { delete edits[id] /* 없는 폴더 등 */ }
    }
    for (const id of Object.keys(edits)) if (!(id in counts)) delete edits[id]
    return { counts, notes, tasks, edits }
  })


  /**
   * 등록 창의 "GitHub에서" 목록 (10/4 19:22 피드백). 이 컴퓨터의 gh 또는 git 로그인으로 내 저장소를 읽는다.
   * 로그인을 못 찾으면 ok: false와 이유만 돌려준다 (화면은 주소 칸을 보여 준다). 예제 모드는 예제 목록.
   */
  app.get('/api/researches/github-repos', replies(GitHubRepoList), async (): Promise<GitHubRepoList> => {
    const list = registry.list()
    const parent = defaultCloneDir(list.map((r) => r.path))
    return { ...(await listGitHubRepos(io, list, parent, !!opts.sandbox)), parent }
  })

  /** GitHub 주소로 등록할 때: 주소를 읽고 받을 곳의 기본값을 알려 준다 */
  app.post<{ Body: { url?: unknown } }>('/api/researches/github', async (req) => {
    const repo = typeof req.body?.url === 'string' ? parseGitHubRepo(req.body.url) : null
    if (!repo) throw new WorkbenchError(400, t('GitHub 저장소 주소가 아닙니다 (예: https://github.com/이름/저장소)', 'Not a GitHub repository address (for example https://github.com/name/repo)'))
    return { ...repo, parent: defaultCloneDir(registry.list().map((r) => r.path)) }
  })

  /** GitHub 저장소를 parent 폴더 아래로 받는다. 등록은 받은 뒤 평소처럼 경로로 한다 */
  app.post<{ Body: { url?: unknown; parent?: unknown } }>('/api/researches/clone', async (req) => {
    const repo = typeof req.body?.url === 'string' ? parseGitHubRepo(req.body.url) : null
    if (!repo) throw new WorkbenchError(400, t('GitHub 저장소 주소가 아닙니다 (예: https://github.com/이름/저장소)', 'Not a GitHub repository address (for example https://github.com/name/repo)'))
    if (typeof req.body?.parent !== 'string') throw new WorkbenchError(400, t('parent가 필요함', 'parent is required'))
    return { path: await cloneInto(repo.url, req.body.parent, repo.name) }
  })

  app.post<{ Body: { path: string } }>('/api/researches/inspect', async (req) => {
    if (typeof req.body?.path !== 'string') throw new WorkbenchError(400, t('path가 필요함', 'path is required'))
    return registry.inspect(req.body.path)
  })

  app.post<{ Body: { path: string; createWorkbench?: boolean; title?: string; question?: string; kind?: unknown; fields?: unknown; tags?: string[]; libraryPreambles?: string[]; repoPreambles?: string[] } }>('/api/researches', replies(C.ResearchListItem), async (req): Promise<C.ResearchListItem> => {
    if (typeof req.body?.path !== 'string') throw new WorkbenchError(400, t('path가 필요함', 'path is required'))
    const item = registry.register(req.body.path, req.body)
    ensureWatch(item.id)
    return item
  })

  /**
   * 성격(kind: research · work) · 분야(fields) · 진행 상태(state: active · paused · done) 중 보낸 것만 바꾼다.
   * 예전 모양 tags(업무 + 분야)도 받는다. 이 컴퓨터의 설정에만 남는다
   */
  app.patch<{ Params: { rid: string } }>('/api/researches/:rid', replies(C.ResearchListItem), async (req): Promise<C.ResearchListItem> => {
    const b = parseBody(C.ProfileBody, req.body)
    if (b.tags !== undefined && b.kind === undefined && b.fields === undefined && b.state === undefined) return registry.setTags(req.params.rid, b.tags)
    return registry.setProfile(req.params.rid, b)
  })

  /** 프로젝트 순서 (홈에서 카드를 끌어 바꾼다). ids에 없는 것은 뒤에 원래 순서대로 */
  app.put('/api/researches/order', replies(C.ResearchOrder), async (req): Promise<C.ResearchOrder> => ({ researches: registry.setOrder(parseBody(C.OrderBody, req.body).ids) }))

  app.delete<{ Params: { rid: string } }>('/api/researches/:rid', replies(C.Ok), async (req): Promise<C.Ok> => {
    registry.unregister(req.params.rid)
    await watchers.get(req.params.rid)?.close()
    watchers.delete(req.params.rid)
    return { ok: true as const }
  })

  /** 연구 개괄에 필요한 것 전부: 연구 정보, 블록 목록, 나무, 문제 */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid', replies(C.ResearchSummary), async (req): Promise<C.ResearchSummary> => {
    const wb = wbOf(req.params.rid)
    const blocks = wb.listBlocks()
    // 메인 노트가 여럿이면 장·부록을 모두 합쳐 근거를 찾는다
    const parts = allManuscripts(wb).flatMap((m) => m.parts)
    return {
      id: req.params.rid,
      root: wb.root,
      research: wb.readResearch(),
      engine: registry.engine,
      // grounds: 유도가 근거로 적은 원고의 장·부록 (저장소 기준 경로)
      blocks: blocks.map(({ id, format, meta, hash, mtime, content }) => ({ ...meta, id, format, hash, mtime, grounds: parts.length ? groundsOf(content, parts) : [] })),
      tree: buildTree(blocks),
      statements: listStatements(wb.root),
    }
  })
}
