// 소개 절 확인 기록 (about.yaml, 11/11 「안 C′」). 피드백처럼 개인 저장소에 두고 저절로 올린다
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/about'
import { parseBody, replies } from '../contract.js'
import { prChanges, prInfo, readAboutChecks, writeAboutCheck } from '../aboutChecks.js'
import { WorkbenchError } from '../workbench.js'
import { aboutFind, aboutListLine, aboutText } from '@rw/core'
import { readAboutEntries } from '../aboutGuide.js'
import { t } from '../i18n.js'
import type { RouteContext } from './context.js'

export function registerAbout(app: FastifyInstance, ctx: RouteContext): void {
  const { opts } = ctx
  // PR 날짜 · 제목은 앱이 도는 동안 바뀌지 않는다(새 버전은 다시 시작한 뒤): 한 번만 읽는다
  let info: ReturnType<typeof prInfo> | null = null
  const repo = opts.aboutRepo ?? opts.appRepo
  const infoOnce = () => (info ??= repo ? prInfo(repo.root, repo.running) : Promise.resolve({ prDates: {}, prTitles: {} }))

  app.get('/api/about/checks', replies(C.AboutChecks), async (): Promise<C.AboutChecks> => {
    const dir = opts.feedbackDir
    const r = dir ? readAboutChecks(dir) : { exists: false, sections: {} }
    return { enabled: !!dir, ...r, ...(await infoOnce()) }
  })
  // 업데이트 하나가 바꾼 소개 문장과 요약 (11/20 시안 2절). 합친 PR은 바뀌지 않으니 한 번 읽은 것은 둔다
  const changes = new Map<number, ReturnType<typeof prChanges>>()
  app.get('/api/about/changes', replies(C.AboutChanges), async (req): Promise<C.AboutChanges> => {
    const { pr } = parseBody(C.AboutChangesQuery, req.query)
    if (!repo) return { pr, sentences: [], summary: [] }
    if (!changes.has(pr)) changes.set(pr, prChanges(repo.root, repo.running, pr))
    return { pr, ...(await changes.get(pr)!) }
  })
  app.put('/api/about/checks', replies(C.AboutChecks), async (req): Promise<C.AboutChecks> => {
    const dir = opts.feedbackDir
    if (!dir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.AboutCheckBody, req.body)
    if (!/^[\w-]+\/[\w-]+$/.test(b.key)) throw new WorkbenchError(400, t(`절 이름이 맞지 않음: ${b.key}`, `Not a section name: ${b.key}`))
    writeAboutCheck(dir, b.key, b.action, b.pr)
    ctx.feedbackWritten?.()
    return { enabled: true, ...readAboutChecks(dir), ...(await infoOnce()) }
  })
  // 에이전트가 읽는 소개 (11/27): 물음이 없으면 절 목록, 있으면 맞는 절 전문. 옮기는 중이라 .md로 옮긴 절만 나온다
  app.get('/api/about/guide', replies(C.AboutGuide), async (req): Promise<C.AboutGuide> => {
    const q = parseBody(C.AboutGuideQuery, req.query)
    const { entries, errors, found } = readAboutEntries()
    const lang = q.lang ?? 'ko'
    if (!found) return { text: t('이 앱에는 소개 절 파일이 들어 있지 않습니다 (내려받은 앱). 앱 저장소에서 pnpm agent:about을 쓰세요.', 'This app does not include the About section files (downloaded app). Use pnpm agent:about in the app repository.'), keys: [], errors }
    if (!q.section && !q.file && !q.tool) return { text: entries.map((e) => aboutListLine(e, lang)).join('\n'), keys: entries.map((e) => e.key), errors }
    const hit = aboutFind(entries, q)
    return {
      text: hit.length ? hit.map((e) => aboutText(e, { lang, full: true })).join('\n\n') : t('맞는 소개 절이 없습니다. 물음 없이 불러 목록을 보세요.', 'No About section matches. Call it without arguments to list the sections.'),
      keys: hit.map((e) => e.key),
      errors,
    }
  })
}
