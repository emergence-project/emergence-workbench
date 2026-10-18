// 설정 › 공통 규칙 (2026-10-18 사용자 승인 시안 "설정 › 공통 규칙"): 모든 연구 저장소의 에이전트가 먼저 읽는 규칙 파일 하나를
// 앱에서 읽고 고친다. 저장하면 그 자체가 사용자 확인이라 머리말을 확정(accepted)과 오늘 날짜로 적고,
// 개인 저장소 사본이면 먼저 받은 뒤 그 파일만 올린다(pathsync.ts). 올리지 못하면 파일은 이 컴퓨터에 남고 다음 저장 때 다시 올린다.
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import YAML from 'yaml'
import { frontMatter } from '@rw/core'
import * as C from '@rw/core/contract/settings'
import { parseBody, replies } from '../contract.js'
import { commonRulesPath } from '../agentRules.js'
import { homeShort } from '../agentPaths.js'
import { hashOf, isInside, localDate, writeAtomic } from '../fsutil.js'
import { pendingPaths, publishPaths } from '../pathsync.js'
import { pullPersonal } from '../personalRepo.js'
import { ConflictError, WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

const MESSAGE = 'Update common research rules'

/** 파일이 없을 때 "만들기"가 여는 빈 틀: 지금 규칙의 절 다섯 */
export const COMMON_RULES_TEMPLATE = '# 연구 공통 규칙\n\n## 시작할 때\n\n## 내용\n\n## 고칠 때\n\n## 기록을 두는 곳\n\n## 말\n'

/** 머리말을 뗀 본문과 머리말 값 몇 개 */
export function readCommonRules(text: string): Pick<C.CommonRulesView, 'status' | 'updated' | 'count' | 'sections' | 'body'> {
  const f = frontMatter(text)
  let head: Record<string, unknown> = {}
  try { const v = f ? YAML.parse(f.yaml) as unknown : null; if (v && typeof v === 'object' && !Array.isArray(v)) head = v as Record<string, unknown> } catch { /* 머리말을 읽지 못하면 값 없이 */ }
  const str = (v: unknown) => typeof v === 'string' ? v : v instanceof Date ? localDate(v) : null
  const body = f ? f.body.replace(/^\r?\n/, '') : text
  return {
    status: str(head.status), updated: str(head.updated),
    count: body.split('\n').filter((l) => /^\d+\.\s/.test(l)).length,
    sections: body.split('\n').filter((l) => /^##\s+\S/.test(l)).map((l) => l.replace(/^##\s+/, '').trim()),
    body,
  }
}

/** 저장할 글: 머리말(다른 칸은 그대로)에 확정 · 오늘을 적고 본문을 붙인다 */
export function writeCommonRules(before: string, body: string, today: string): string {
  const f = frontMatter(before)
  const doc = f ? YAML.parseDocument(f.yaml) : new YAML.Document({ title: '연구 공통 규칙', created: today })
  if (!doc.contents || !YAML.isMap(doc.contents)) doc.contents = doc.createNode({}) as typeof doc.contents
  doc.set('status', 'accepted')
  doc.set('updated', today)
  doc.set('reviewed-by', '사용자')
  doc.set('reviewed-at', today)
  const clean = body.replace(/\r\n/g, '\n').replace(/\s+$/, '')
  return `---\n${doc.toString({ lineWidth: 0 })}---\n\n${clean}\n`
}

export function registerCommonRules(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  const where = () => {
    const abs = commonRulesPath(registry.configDir)
    if (!abs) throw new WorkbenchError(404, t('공통 규칙을 둘 설정 폴더가 없습니다', 'There is no settings folder for the common rules'))
    // 개인 저장소 사본 안이면 그 저장소 기준 경로로 올린다
    const repo = opts.personalDir && isInside(opts.personalDir, abs) ? opts.personalDir : null
    return { abs, repo, rel: repo ? path.relative(repo, abs).split(path.sep).join('/') : null }
  }
  const view = async (): Promise<C.CommonRulesView> => {
    const w = where()
    let text = ''
    try { text = fs.readFileSync(w.abs, 'utf8') } catch { /* 없으면 빈 상태 */ }
    let unpublished = false
    if (w.repo && w.rel && text) { try { unpublished = (await pendingPaths(w.repo, [w.rel])).length > 0 } catch { /* git을 읽지 못하면 모름 */ } }
    return { file: homeShort(w.abs), exists: !!text, hash: hashOf(text), unpublished, ...readCommonRules(text) }
  }

  app.get('/api/settings/common-rules', replies(C.CommonRulesView), async (): Promise<C.CommonRulesView> => view())
  app.put('/api/settings/common-rules', replies(C.CommonRulesSaved), async (req): Promise<C.CommonRulesSaved> => {
    const { body, baseHash } = parseBody(C.CommonRulesBody, req.body)
    if (!body.trim()) throw new WorkbenchError(400, t('빈 규칙은 저장하지 않습니다', 'Empty rules are not saved'))
    const w = where()
    // 다른 맥이나 에이전트가 올린 것을 먼저 받는다. 받지 못해도 쓰기는 하고, 올리기가 GitHub와 부딪히면 멈춘다
    if (w.repo) await pullPersonal(w.repo)
    const read = () => { try { return fs.readFileSync(w.abs, 'utf8') } catch { return '' } }
    const before = read()
    if (hashOf(before) !== baseHash) throw new ConflictError(t('그새 규칙 파일이 바뀌었습니다. 다시 읽어 주세요', 'The rules file changed in the meantime. Reload it'), hashOf(before))
    fs.mkdirSync(path.dirname(w.abs), { recursive: true })
    writeAtomic(w.abs, writeCommonRules(before, body, localDate()))
    let published: C.CommonRulesSaved['published'] = null
    if (w.repo && w.rel) {
      try {
        const r = await publishPaths(w.repo, [w.rel], { message: MESSAGE })
        published = { pushed: r.pushed, message: r.pushed ? t('공통 규칙을 저장하고 GitHub에 올렸습니다', 'Saved the common rules and pushed them to GitHub') : t('공통 규칙을 저장했습니다', 'Saved the common rules') }
      } catch (e) {
        published = { pushed: false, message: t(`저장했지만 GitHub에 올리지 못했습니다. 파일은 이 컴퓨터에 남아 다음 저장 때 다시 올립니다: ${(e as Error).message}`, `Saved, but could not push to GitHub. The file stays on this computer and is pushed with the next save: ${(e as Error).message}`) }
      }
    }
    return { view: await view(), published }
  })
}
