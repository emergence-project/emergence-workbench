import type { z } from 'zod'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 요청 몸을 계약(@rw/core/contract)으로 검사한다. 모양이 틀리면 어느 칸이 왜 틀렸는지 400으로 */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {})
  if (r.success) return r.data
  const what = r.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ')
  throw new WorkbenchError(400, t(`요청 형식이 맞지 않음: ${what}`, `Invalid request: ${what}`))
}
