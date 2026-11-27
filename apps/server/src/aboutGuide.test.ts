import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { aboutNotifier, readAboutEntries } from './aboutGuide.js'
import { appFile } from './agentPaths.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('에이전트에게 건네는 소개 (11/27 aboutGuide)', () => {
  it('앱 저장소의 .md 절을 모두 읽는다', () => {
    const { entries, errors, found } = readAboutEntries()
    expect(found).toBe(true)
    expect(errors).toEqual([])
    expect(entries.map((e) => e.key)).toContain('project/edits')
  })

  it('없는 폴더(묶은 앱)는 빈 목록', () => {
    expect(readAboutEntries(path.join(tmp, 'no-app'))).toEqual({ entries: [], errors: [], found: false })
  })

  it('훅: 읽거나 고친 파일의 절을 대화마다 한 번만, 소개 파일 자체와 바깥 파일은 건너뛴다', () => {
    const root = appFile('')
    const note = aboutNotifier(root)
    const first = note(path.join(root, 'apps/web/src/AgentEditsPage.tsx'))
    expect(first).toContain('(project/edits)')
    expect(first).toContain('pnpm agent:about project/edits')
    // 규범 절(작업 원칙 · 디자인 원칙)은 첫 파일과 함께 한 번 (11/27)
    expect(first).toContain('(principles/working-principles)')
    expect(note('apps/web/src/App.tsx') ?? '').not.toContain('principles/working-principles')
    expect(note('apps/server/src/routes/agentEdits.ts')).toBeUndefined()
    expect(note('apps/web/src/about/project/edits.md')).toBeUndefined()
    expect(note('/elsewhere/x.ts')).toBeUndefined()
    expect(aboutNotifier(root)('apps/server/src/routes/agentEdits.ts')).toContain('(project/edits)')
  })

  it('GET /api/about/guide: 물음이 없으면 목록, 있으면 전문', async () => {
    const app = buildApp({ configDir: path.join(tmp, 'config-about-guide') })
    const list = (await app.inject({ method: 'GET', url: '/api/about/guide' })).json()
    expect(list.text).toMatch(/^- project\/edits · 수정 검토 — /m)
    expect(list.text.indexOf('principles/working-principles')).toBeLessThan(list.text.indexOf('project/edits'))
    const byTool = (await app.inject({ method: 'GET', url: '/api/about/guide?tool=edit_note&lang=en' })).json()
    expect(byTool.keys).toEqual(['project/edits'])
    expect(byTool.text).toContain('## Edit review (project/edits)')
    const none = (await app.inject({ method: 'GET', url: '/api/about/guide?file=nowhere.ts' })).json()
    expect(none.keys).toEqual([])
    await app.close()
  })
})
