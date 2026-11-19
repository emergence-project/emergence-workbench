// 터미널 (오른쪽 사이드바 › 터미널, terminal.ts): 이 컴퓨터의 화면에서만 셸을 연다. 폰 · 다른 기기에서 온 요청은 막는다
import type { FastifyInstance, FastifyRequest } from 'fastify'
import * as C from '@rw/core/contract/terminal'
import type { IPty } from '@lydell/node-pty'
import { replies } from '../contract.js'
import { sameComputer } from '../hostGuard.js'
import { t } from '../i18n.js'
import { folderFor, loadPty, messageOf, openShell, startDir } from '../terminal.js'
import type { RouteContext } from './context.js'

/** 한꺼번에 여는 셸 수 (창을 여러 개 열어 둘 때) */
const MAX_SHELLS = 8

// 연결(socket)이 없는 요청(테스트의 injectWS)은 어디서 왔는지 모르니 막는다
const fromHere = (req: FastifyRequest) => sameComputer({ headers: req.headers, remoteAddress: req.socket?.remoteAddress })
const remoteReason = () => t('터미널은 이 컴퓨터에서 연 화면에서만 씁니다', 'The terminal works only in a window opened on this computer')

export function registerTerminal(app: FastifyInstance, ctx: RouteContext): void {
  const shells = new Set<IPty>()
  app.addHook('onClose', async () => { for (const p of shells) p.kill() })

  app.get('/api/terminal', replies(C.TerminalStatus), async (req): Promise<C.TerminalStatus> => {
    if (!fromHere(req)) return { available: false, reason: remoteReason() }
    const pty = await loadPty()
    if (typeof pty === 'string') return { available: false, reason: t(`터미널 부품을 읽지 못했습니다: ${pty}`, `Could not load the terminal module: ${pty}`) }
    return { available: true }
  })

  void app.register(async (scope) => {
    scope.get<{ Querystring: { rid?: string; cols?: string; rows?: string } }>('/api/terminal/ws', {
      websocket: true,
      preValidation: async (req, reply) => { if (!fromHere(req)) await reply.status(403).send({ error: remoteReason() }) },
    }, async (socket, req) => {
      const send = (m: C.TerminalOutput) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m)) }
      const fail = (message: string) => { send({ t: 'error', message }); socket.close() }
      const pty = await loadPty()
      if (typeof pty === 'string') return fail(t(`터미널 부품을 읽지 못했습니다: ${pty}`, `Could not load the terminal module: ${pty}`))
      if (shells.size >= MAX_SHELLS) return fail(t(`터미널은 ${MAX_SHELLS}개까지 엽니다`, `Up to ${MAX_SHELLS} terminals can be open`))
      const size = (v: string | undefined, d: number) => Math.min(1000, Math.max(2, Number(v) || d))
      const cwd = startDir(folderFor(req.query.rid, { appRoot: ctx.opts.appRepo?.root, repoPath: ctx.repoPath }))
      let proc: IPty
      let shell: string
      try { ({ proc, shell } = openShell(pty, cwd, { cols: size(req.query.cols, 80), rows: size(req.query.rows, 24) })) } catch (e) {
        return fail(t(`셸을 열지 못했습니다: ${messageOf(e)}`, `Could not start the shell: ${messageOf(e)}`))
      }
      shells.add(proc)
      send({ t: 'start', cwd, shell })
      proc.onData((d) => send({ t: 'out', d }))
      proc.onExit(({ exitCode }) => { shells.delete(proc); send({ t: 'exit', code: exitCode }); socket.close() })
      socket.on('message', (raw: Buffer) => {
        let m: C.TerminalInput
        try {
          const r = C.TerminalInput.safeParse(JSON.parse(raw.toString('utf8')))
          if (!r.success) return
          m = r.data
        } catch { return }
        if (m.t === 'in') proc.write(m.d)
        else proc.resize(m.cols, m.rows)
      })
      socket.on('close', () => { if (shells.delete(proc)) proc.kill() })
    })
  })
}
