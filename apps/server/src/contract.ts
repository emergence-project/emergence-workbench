import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** 이 라우트의 응답 계약 (@rw/core/contract). replies()로 붙인다 */
    reply?: z.ZodTypeAny
  }
}

/** 요청 몸을 계약(@rw/core/contract)으로 검사한다. 모양이 틀리면 어느 칸이 왜 틀렸는지 400으로 */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {})
  if (r.success) return r.data
  const what = r.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ')
  throw new WorkbenchError(400, t(`요청 형식이 맞지 않음: ${what}`, `Invalid request: ${what}`))
}

/** 라우트 옵션: 응답 계약. 핸들러의 반환 타입(Promise<C.X>)은 따로 적는다 */
export const replies = (schema: z.ZodTypeAny) => ({ config: { reply: schema } })

/**
 * 테스트(vitest)에서만: replies()를 붙인 라우트의 성공 응답을 모두 계약으로 검사한다.
 * 계약과 다르면(모르는 칸 포함) 500과 어느 칸인지 적은 오류로 바꿔, 그 라우트를 부르는 모든 테스트가 실패한다.
 */
export function checkReplies(app: FastifyInstance, on = !!process.env.VITEST): void {
  if (!on) return
  app.addHook('onSend', async (req, reply, payload) => {
    const schema = req.routeOptions.config?.reply
    if (!schema || reply.statusCode !== 200 || typeof payload !== 'string') return payload
    const r = schema.safeParse(JSON.parse(payload))
    if (r.success) return payload
    const what = r.error.issues.map((i) => `${i.path.join('.') || '(reply)'}: ${i.message}`).join('; ')
    throw new Error(`reply does not match contract (${req.method} ${req.routeOptions.url}): ${what}`)
  })
}
