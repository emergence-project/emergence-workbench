import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { ErrorReply } from '@rw/core/contract/error'
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * 다른 컴퓨터가 보낸 것에서 이 버전의 계약이 모르는 칸을 뺀다 (기기 알림과 그 답: 컴퓨터마다 앱 버전이 다를 수 있다, 11/26).
 * 아는 칸은 건드리지 않으므로 모양이 틀리면 뒤의 계약 검사가 그대로 잡는다. 화면과 주고받는 것은 같은 빌드라 쓰지 않는다(모르는 칸도 실패)
 */
export function knownOnly(schema: z.ZodTypeAny, data: unknown): unknown {
  let cur = data
  // 한 번에 다 나오지만, 안쪽 칸이 뒤에 드러나는 경우를 생각해 몇 번까지 본다
  for (let round = 0; round < 3; round++) {
    const r = schema.safeParse(cur)
    if (r.success) return cur
    let dropped = false
    const next: unknown = structuredClone(cur)
    for (const issue of r.error.issues) {
      if (issue.code !== 'unrecognized_keys') continue
      let at: unknown = next
      for (const key of issue.path) at = isRecord(at) ? at[String(key)] : undefined
      if (!isRecord(at)) continue
      for (const key of issue.keys) { delete at[key]; dropped = true }
    }
    if (!dropped) return cur
    cur = next
  }
  return cur
}

/** 라우트 옵션: 응답 계약. 핸들러의 반환 타입(Promise<C.X>)은 따로 적는다 */
export const replies = (schema: z.ZodTypeAny) => ({ config: { reply: schema } })

/**
 * 테스트(vitest)에서만: replies()를 붙인 라우트의 응답을 모두 계약으로 검사한다.
 * 성공(200)은 그 라우트의 계약으로, 오류(4xx·5xx)는 공통 오류 계약(ErrorReply: { error, currentHash?, key? })으로.
 * 계약과 다르면(모르는 칸 포함) 500과 어느 칸인지 적은 오류로 바꿔, 그 라우트를 부르는 모든 테스트가 실패한다.
 */
export function checkReplies(app: FastifyInstance, on = !!process.env.VITEST): void {
  if (!on) return
  app.addHook('onSend', async (req, reply, payload) => {
    const ok = req.routeOptions.config?.reply
    const failed = reply.statusCode >= 400
    if (!ok || (reply.statusCode !== 200 && !failed) || typeof payload !== 'string') return payload
    const schema = failed ? ErrorReply : ok
    const r = schema.safeParse(JSON.parse(payload))
    if (r.success) return payload
    const what = r.error.issues.map((i) => `${i.path.join('.') || '(reply)'}: ${i.message}`).join('; ')
    throw new Error(`${failed ? `error ${reply.statusCode} ` : ''}reply does not match contract (${req.method} ${req.routeOptions.url}): ${what}`)
  })
}
