/**
 * 규칙과 실험의 목록 (docs/rules/registry.json, 2026-11-27 사용자 결정 "규칙은 늘 의심하고 꼭 필요한지 확인" · "실험은 해 보고 별로면 기록 남기고 되돌린다").
 * 서버 ruleRegistry.ts가 읽고 git 이력에서 잰 값을 붙이며, 화면은 소개 › 연구에서 보인다(ResearchTables.tsx). pnpm agent:rules도 같은 계산을 쓴다.
 */
import { z } from 'zod'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** 규칙의 갈래 (safety는 사용자 허락 없이 풀지 않는다) 와 실험 */
export const RuleKind = z.enum(['safety', 'quality', 'process', 'format', 'experiment'])
/** 지금 판단. 규칙: keep · relaxed · removed · ask · watch. 실험: watch · keep · hold(보류) · reverted(되돌림) · ask */
export const RuleVerdict = z.enum(['keep', 'relaxed', 'removed', 'ask', 'watch', 'hold', 'reverted'])
/** 누구에게: 앱을 쓰는 에이전트(연구 저장소에서 일함) · 앱을 고치는 에이전트 · 둘 다 */
export const RuleAudience = z.enum(['uses', 'fixes', 'both'])
/** 어떻게: 글(지시문으로 주고 지키기를 기대함) · 코드(앱 · 검사가 막음) · 둘 다 */
export const RuleEnforce = z.enum(['prompt', 'code', 'both'])

export const RuleEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  rule: z.string().min(1),
  where: z.string().min(1),
  kind: RuleKind,
  audience: RuleAudience.optional(),
  enforce: RuleEnforce.optional(),
  since: Day,
  why: z.string().min(1),
  /** git 이력에서 셀 것. attest: 이 규칙 때문에 커밋 메시지에 쓰는 줄(정규식), touch: 지키는 파일 */
  measure: z.object({ attest: z.string().optional(), touch: z.array(z.string()).optional() }).strict().nullable(),
  /** 잴 것을 말로 (git으로 셀 수 없는 것: 실험의 판단 기준 등) */
  gauge: z.string().optional(),
  review: Day,
  verdict: RuleVerdict,
  /** 실험 기능의 울타리: 그 기능이 가진 파일(무늬, *는 / 밖의 아무 글자)과 그 파일을 불러도 되는 바깥 파일(이음매). scripts/ci/check-experiments.mjs가 검사 */
  code: z.object({ owns: z.array(z.string().min(1)).min(1), seams: z.array(z.string().min(1)) }).strict().optional(),
  /** 글로만 지키는 규칙을 코드로 옮길 길 */
  toCode: z.string().optional(),
  note: z.string().min(1),
}).strict().superRefine((r, ctx) => {
  // 규칙은 누구에게 · 어떻게를 적고, 실험은 판단 기준(gauge)을 적는다
  if (r.kind !== 'experiment' && (!r.audience || !r.enforce)) ctx.addIssue({ code: 'custom', message: `${r.id}: 규칙은 audience · enforce를 적는다` })
  if (r.kind === 'experiment' && !r.gauge) ctx.addIssue({ code: 'custom', message: `${r.id}: 실험은 gauge(판단 기준)를 적는다` })
  if (r.code && r.kind !== 'experiment') ctx.addIssue({ code: 'custom', message: `${r.id}: code(울타리)는 실험에만 적는다` })
})
export type RuleEntry = z.infer<typeof RuleEntry>

export const RuleRegistry = z.object({ about: z.string(), rules: z.array(RuleEntry) }).strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>()
    for (const r of d.rules) {
      if (seen.has(r.id)) ctx.addIssue({ code: 'custom', message: `${r.id}: id가 겹친다` })
      seen.add(r.id)
    }
  })

/** 사용자가 결정을 기다리는 줄(verdict ask)에 누른 답 (피드백 폴더 rules.yaml) */
export const RuleAnswer = z.object({ answer: z.enum(['진행', '그대로']), at: z.string() }).strict()
export type RuleAnswer = z.infer<typeof RuleAnswer>

/** 화면에 보이는 한 줄: 목록 + 잰 값 + 알릴 것 + 사용자 답 */
export const RuleRow = z.object({
  entry: RuleEntry,
  /** 최근 days일 커밋 가운데 attest 줄을 쓴 수 · touch 파일을 고친 수 (measure가 없으면 없음) */
  measured: z.object({ commits: z.number(), attest: z.number().optional(), touch: z.number().optional() }).strict().optional(),
  /** 다시 볼 날이 지남 · 의례 줄이 25% 넘음 */
  flags: z.array(z.string()),
  answer: RuleAnswer.optional(),
}).strict()
export type RuleRow = z.infer<typeof RuleRow>

export const RulesView = z.object({
  rows: z.array(RuleRow),
  /** 잰 기간(일)과 그 사이 커밋 수 (git 저장소가 아니면 0) */
  days: z.number(),
  commits: z.number(),
  /** 답을 적을 피드백 폴더가 있는지 */
  answerable: z.boolean(),
}).strict()
export type RulesView = z.infer<typeof RulesView>

export const RuleAnswerBody = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), answer: z.enum(['진행', '그대로']) }).strict()
