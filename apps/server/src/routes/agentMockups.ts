// 시안 (11/19 "시안을 화면에서 바로"): 앱 고치기 대화가 작업 폴더의 mockups/에 만든 그림 · html을 대화 화면에 내준다.
// 작업 폴더(<설정 폴더>/agent-worktrees/<대화>)의 mockups/ 바로 안 파일만, 링크를 따라간 실제 파일도 그 안이어야 한다
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentChats'
import { contentTypeOf } from '../materials.js'
import { WorkbenchError, assertRealInside } from '../workbench.js'
import { replies } from '../contract.js'
import { isInside } from '../fsutil.js'
import { t } from '../i18n.js'

/** 내주는 파일 종류: 그림과, 그림을 쓰는 html · css */
export const MOCKUP_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.html', '.css'] as const

/** 대화 폴더 이름: 2026-11-19-7202a377처럼 글자 · 숫자 · - · _ 만 */
const okDir = (d: string) => /^[\w-]{1,80}$/.test(d)
const okFile = (f: string) => !f.startsWith('.') && f === path.basename(f) && (MOCKUP_EXT as readonly string[]).includes(path.extname(f).toLowerCase())

export function registerAgentMockups(app: FastifyInstance, base: string): void {
  const dirOf = (d: string) => {
    if (!okDir(d)) throw new WorkbenchError(400, t('대화 폴더 이름이 올바르지 않습니다', 'Invalid conversation folder name'))
    const dir = path.join(base, d, 'mockups')
    // mockups 폴더 자체가 밖을 가리키는 링크여도 막는다
    if (fs.existsSync(dir) && !isInside(fs.realpathSync(path.join(base, d)), fs.realpathSync(dir))) throw new WorkbenchError(403, t('시안 폴더가 작업 폴더 밖에 있습니다', 'The mockups folder is outside the work folder'))
    return dir
  }
  app.get<{ Params: { dir: string } }>('/api/agent-mockups/:dir', replies(C.MockupFiles), async (req): Promise<C.MockupFiles> => {
    const dir = dirOf(req.params.dir)
    if (!fs.existsSync(dir)) return { files: [] }
    // 밖을 가리키는 링크는 목록에서도 뺀다 (내줄 때도 assertRealInside가 막는다)
    const real = fs.realpathSync(dir)
    const inside = (f: string) => { try { return isInside(real, fs.realpathSync(path.join(dir, f))) } catch { return false } }
    const files = fs.readdirSync(dir).filter((f) => okFile(f) && inside(f)).sort()
    return { files }
  })
  app.get<{ Params: { dir: string; file: string } }>('/api/agent-mockups/:dir/:file', async (req, reply) => {
    const dir = dirOf(req.params.dir)
    const name = req.params.file
    const missing = t('시안 폴더에 없는 파일', 'File not in the mockups folder')
    if (!okFile(name)) throw new WorkbenchError(403, missing)
    const file = assertRealInside(dir, path.join(dir, name), missing)
    const type = path.extname(file).toLowerCase() === '.css' ? 'text/css; charset=utf-8' : contentTypeOf(file)
    // html은 출처 없는 sandbox, svg는 스크립트 없이 열린다 (app.ts가 모든 /api/ 파일 응답에 붙이는 fileResponseHeaders)
    return reply.type(type).header('cache-control', 'no-store').send(fs.createReadStream(file))
  })
}
