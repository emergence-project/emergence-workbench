// LaTeX 서식 모음과 저자·소속 (설정 › LaTeX 서식, 네트워킹 화면)
import { buildExportMainTex, buildSettingTex, LATEX_PACKAGES, type LatexTemplate } from '@rw/core'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/latex'
import { parseBody, replies } from '../contract.js'
import fs from 'node:fs'
import path from 'node:path'
import { MACROS_FILE, parseMacros } from '../conceptNotes.js'
import { hashOf, writeAtomic } from '../fsutil.js'
import { LATEX_FILES_DIR } from '../latexFiles.js'
import { WorkbenchError } from '../workbench.js'
import { templatePreview } from '../latexPreview.js'
import type { RouteContext } from './context.js'
import { t as tx } from '../i18n.js'

export { LATEX_FILES_DIR }

export function registerLatexSetup(app: FastifyInstance, ctx: RouteContext): void {
  const { registry } = ctx
  const mainOf = (t: LatexTemplate) => buildExportMainTex({ setup: t, authors: registry.authors, title: '제목' })
  const view = (): C.LatexSetupView => ({
    templates: registry.latexTemplates,
    defaultTemplate: registry.latexDefault,
    authors: registry.authors,
    packages: LATEX_PACKAGES,
    /** 서식마다 내보내면 생기는 main.tex(제목 자리 표시)과 setting.tex */
    previews: Object.fromEntries(registry.latexTemplates.map((t) => [t.id, { main: mainOf(t), setting: buildSettingTex(t) }])),
  })
  app.get('/api/latex-setup', replies(C.LatexSetupView), async (): Promise<C.LatexSetupView> => view())
  app.put<{ Params: { id: string } }>('/api/latex-templates/:id', replies(C.LatexSetupView), async (req): Promise<C.LatexSetupView> => {
    registry.setTemplate(req.params.id, parseBody(C.SaveTemplateBody, req.body).template)
    return view()
  })
  app.post('/api/latex-templates', replies(C.LatexTemplateAdded), async (req): Promise<C.LatexTemplateAdded> => {
    const body = parseBody(C.AddTemplateBody, req.body)
    const t = registry.addTemplate(body.name, body.from)
    return { ...view(), created: t.id }
  })
  app.delete<{ Params: { id: string } }>('/api/latex-templates/:id', replies(C.LatexSetupView), async (req): Promise<C.LatexSetupView> => {
    registry.removeTemplate(req.params.id)
    return view()
  })
  app.put('/api/latex-templates-default', replies(C.LatexSetupView), async (req): Promise<C.LatexSetupView> => {
    registry.setDefaultTemplate(parseBody(C.DefaultTemplateBody, req.body).id)
    return view()
  })
  app.put('/api/authors', replies(C.LatexSetupView), async (req): Promise<C.LatexSetupView> => {
    registry.setAuthors(parseBody(C.SaveAuthorsBody, req.body).authors)
    return view()
  })
  /**
   * 서식 카드의 미리보기: 예문을 이 서식으로 컴파일한 PDF (서식이 그대로면 지난 것).
   * 만들지 못하면(TeX이 없는 컴퓨터 등) 오류 응답 대신 { error }(JSON)로 알린다: 화면은 카드에 이유를 적고, 브라우저 콘솔에 오류가 쌓이지 않는다
   */
  app.get<{ Params: { id: string } }>('/api/latex-templates/:id/preview.pdf', async (req, reply) => {
    const t = registry.latexTemplates.find((x) => x.id === req.params.id)
    if (!t) return reply.code(404).send({ error: tx('없는 서식', 'No such template') })
    const r = await templatePreview(registry.configDir, t, registry.engine)
    if (!r.ok) return reply.header('cache-control', 'no-store').send({ error: r.error })
    return reply.type('application/pdf').header('cache-control', 'no-store').send(fs.readFileSync(r.pdf))
  })
  /**
   * 모든 노트가 함께 쓰는 기호 (설정 › LaTeX › 기호, 10/4 19:30 "커스텀 기호나 명령어를 만드는 것"). 파일은 research-library의 concepts/macros.tex 하나:
   * 개념노트 화면(KaTeX)이 그대로 쓰고, 연구노트 컴파일·내보내기는 \providecommand로 바꿔 프로젝트 기호 다음에 넣는다.
   */
  const macrosView = (): C.LatexMacrosView => {
    const lib = registry.libraryPath
    const abs = lib ? path.join(lib, MACROS_FILE) : ''
    const text = abs && fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
    return { file: MACROS_FILE, library: !!lib, exists: !!text, text, hash: hashOf(text), macros: parseMacros(text) }
  }
  app.get('/api/latex-macros', replies(C.LatexMacrosView), async (): Promise<C.LatexMacrosView> => macrosView())
  // 모든 연구의 PDF가 쓰는 파일이라, 읽은 뒤 바깥에서 고쳤으면 덮지 않는다 (baseHash = 읽을 때 받은 hash)
  app.put('/api/latex-macros', replies(C.LatexMacrosView), async (req, reply) => {
    const lib = registry.libraryPath
    if (!lib) throw new WorkbenchError(409, tx('개념노트 라이브러리(research-library)를 먼저 정하세요', 'Choose the concept note library (research-library) first'))
    const { text, baseHash } = parseBody(C.SaveMacrosBody, req.body)
    const current = macrosView().hash
    if (baseHash !== current) return reply.status(409).send({ error: tx('다른 곳에서 명령어 파일이 바뀌어 고치지 않았음', 'Not changed: the macros file was changed elsewhere'), currentHash: current })
    const abs = path.join(lib, MACROS_FILE)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    writeAtomic(abs, text.replace(/\s*$/, '\n'))
    return macrosView()
  })
  /** 새 노트를 시작할 틀: main.tex(제목·저자 포함), setting.tex, 서식의 스타일 파일을 받는다. template이 없으면 기본 서식 */
  app.get<{ Params: { file: string }; Querystring: { template?: string } }>('/api/latex-setup/download/:file', async (req, reply) => {
    const { file } = req.params
    const t = registry.template(req.query.template || registry.latexDefault)
    if (t.files?.includes(file) && path.basename(file) === file) {
      const text = fs.readFileSync(path.join(LATEX_FILES_DIR, file), 'utf8')
      return reply.header('content-type', 'text/x-tex; charset=utf-8').header('content-disposition', `attachment; filename="${file}"`).send(text)
    }
    if (file !== 'main.tex' && file !== 'setting.tex') return reply.code(404).send({ error: tx('없는 파일', 'No such file') })
    const text = file === 'main.tex' ? mainOf(t) : buildSettingTex(t)
    return reply.header('content-type', 'text/x-tex; charset=utf-8').header('content-disposition', `attachment; filename="${file}"`).send(text)
  })
}
