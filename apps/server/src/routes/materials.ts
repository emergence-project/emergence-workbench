// 자료 (논문·발표자료)
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { contentTypeOf, ensureMaterialsDir, fetchArxiv, listMaterials, materialPath, openWithSystem } from '../materials.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerMaterials(app: FastifyInstance, ctx: RouteContext): void {
  const { opts, wbOf } = ctx
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/materials', async (req) => {
    const wb = wbOf(req.params.rid)
    const { bib, files } = listMaterials(wb.root, wb.readResearch().sources)
    return { bib, files }
  })
  app.get<{ Params: { rid: string; name: string } }>('/api/researches/:rid/materials/:name', async (req, reply) => {
    const wb = wbOf(req.params.rid)
    const file = materialPath(wb.root, req.params.name, wb.readResearch().sources)
    return reply.type(contentTypeOf(file)).header('cache-control', 'no-store').send(fs.createReadStream(file))
  })
  /** 끌어다 놓은 파일을 materials/에 둔다 (같은 이름이 있으면 거절) */
  app.put<{ Params: { rid: string; name: string }; Body: Buffer }>('/api/researches/:rid/materials/:name', { bodyLimit: 200 * 1024 * 1024 }, async (req) => {
    const name = req.params.name
    if (!name || name !== path.basename(name) || name.startsWith('.') || name.length > 200) throw new WorkbenchError(400, t('파일 이름이 올바르지 않음', 'Invalid file name'))
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new WorkbenchError(400, t('빈 파일', 'Empty file'))
    const dir = ensureMaterialsDir(wbOf(req.params.rid).root)
    const file = path.join(dir, name)
    if (fs.existsSync(file)) throw new WorkbenchError(409, t(`같은 이름의 자료가 이미 있습니다: ${name}`, `A material with this name already exists: ${name}`))
    fs.writeFileSync(file, req.body)
    return { name }
  })
  app.post<{ Params: { rid: string; key: string } }>('/api/researches/:rid/materials/fetch/:key', async (req) =>
    fetchArxiv(wbOf(req.params.rid).root, req.params.key, opts.fetch, wbOf(req.params.rid).readResearch().sources))
  app.post<{ Params: { rid: string; name: string } }>('/api/researches/:rid/materials/:name/open', async (req) => {
    const wb = wbOf(req.params.rid)
    await openWithSystem(materialPath(wb.root, req.params.name, wb.readResearch().sources))
    return { ok: true }
  })
}
