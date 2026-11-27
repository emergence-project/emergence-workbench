// ---------- 규칙과 실험 (docs/rules/registry.json + 잰 값 + 사용자 답, 서버 routes/rules.ts) ----------
import { json, req, send } from './http'
import type { RulesView } from '@rw/core/contract/rules'

export type { RuleEntry, RuleRow, RulesView } from '@rw/core/contract/rules'

export const rulesView = () => req('/api/rules').then((r) => json<RulesView>(r))
/** 결정을 기다리는 줄(verdict ask)에 답한다: 진행 = 제안대로, 그대로 = 두기 */
export const answerRule = (id: string, answer: '진행' | '그대로') => req('/api/rules/answer', send('PUT', { id, answer })).then((r) => json<RulesView>(r))
