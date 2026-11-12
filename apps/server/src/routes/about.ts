// 소개 절 확인 기록 (about.yaml, 11/11 「안 C′」). 피드백처럼 개인 저장소에 두고 저절로 올린다
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/about'
import { parseBody, replies } from '../contract.js'
import { prDates, readAboutChecks, writeAboutCheck } from '../aboutChecks.js'
import { WorkbenchError } from '../workbench.js'
import { t } from '../i18n.js'
import type { RouteContext } from './context.js'

export function registerAbout(app: FastifyInstance, ctx: RouteContext): void {
  const { opts } = ctx
  // PR 날짜는 앱이 도는 동안 바뀌지 않는다(새 버전은 다시 시작한 뒤): 한 번만 읽는다
  let dates: Promise<Record<string, string>> | null = null
  const datesOnce = () => (dates ??= opts.appRepo ? prDates(opts.appRepo.root, opts.appRepo.running) : Promise.resolve({}))

  app.get('/api/about/checks', replies(C.AboutChecks), async (): Promise<C.AboutChecks> => {
    const dir = opts.feedbackDir
    const r = dir ? readAboutChecks(dir) : { exists: false, sections: {} }
    return { enabled: !!dir, ...r, prDates: await datesOnce() }
  })
  app.put('/api/about/checks', replies(C.AboutChecks), async (req): Promise<C.AboutChecks> => {
    const dir = opts.feedbackDir
    if (!dir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.AboutCheckBody, req.body)
    if (!/^[\w-]+\/[\w-]+$/.test(b.key)) throw new WorkbenchError(400, t(`절 이름이 맞지 않음: ${b.key}`, `Not a section name: ${b.key}`))
    writeAboutCheck(dir, b.key, b.action, b.pr)
    ctx.feedbackWritten?.()
    return { enabled: true, ...readAboutChecks(dir), prDates: await datesOnce() }
  })
}
