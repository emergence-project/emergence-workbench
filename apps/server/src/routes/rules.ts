// 규칙과 실험 (소개 › 연구, 2026-11-27 사용자 결정 "추천대로"): docs/rules/registry.json에 git 이력에서 잰 값과 사용자 답을 붙여 돌려준다.
// 결정을 기다리는 줄(verdict ask)의 「진행」 · 「그대로」는 피드백 폴더 rules.yaml에 적는다(소개 확인 기록처럼 저절로 올린다).
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/rules'
import { appFile } from '../agentPaths.js'
import { parseBody, replies } from '../contract.js'
import { readRegistry, readRuleAnswers, recentCommits, rowsOf, writeRuleAnswer } from '../ruleRegistry.js'
import { WorkbenchError } from '../workbench.js'
import { t } from '../i18n.js'
import type { RouteContext } from './context.js'

/** 잴 기간 (pnpm agent:rules의 기본과 같다) */
const DAYS = 30

export function registerRules(app: FastifyInstance, ctx: RouteContext): void {
  const { opts } = ctx
  const repo = opts.aboutRepo ?? opts.appRepo
  const root = repo?.root ?? appFile('') // 앱 저장소 설정이 없으면(예제 모드 · 테스트) 이 서버 코드가 든 저장소
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) }
  // 커밋은 앱이 도는 동안 바뀌지 않는다(새 버전은 다시 시작한 뒤): 한 번만 센다
  let commits: ReturnType<typeof recentCommits> | null = null
  const view = async (): Promise<C.RulesView> => {
    const list = await (commits ??= recentCommits(root, DAYS, repo?.running))
    const dir = opts.feedbackDir
    return { rows: rowsOf(readRegistry(root).rules, list, today(), dir ? readRuleAnswers(dir) : {}), days: DAYS, commits: list.length, answerable: !!dir }
  }
  app.get('/api/rules', replies(C.RulesView), view)
  app.put('/api/rules/answer', replies(C.RulesView), async (req): Promise<C.RulesView> => {
    const dir = opts.feedbackDir
    if (!dir) throw new WorkbenchError(404, t('피드백 폴더가 설정되지 않았음', 'No feedback folder is set'))
    const b = parseBody(C.RuleAnswerBody, req.body)
    const entry = readRegistry(root).rules.find((r) => r.id === b.id)
    if (!entry) throw new WorkbenchError(404, t(`그런 규칙 · 실험이 없음: ${b.id}`, `No such rule or experiment: ${b.id}`))
    if (entry.verdict !== 'ask') throw new WorkbenchError(400, t('결정을 기다리는 줄이 아닙니다', 'This row is not waiting for a decision'))
    writeRuleAnswer(dir, b.id, b.answer)
    ctx.feedbackWritten?.()
    return view()
  })
}
