import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TaskList } from './WorkTasks'

const diagnostics = [{ file: 'workbench/tasks/2026-10-07-result.md', code: 'schema', line: 4, message: 'state: results — 상태 이름을 고치세요.' }]
describe('작업 파일 오류 목록', () => {
  it('정상 작업이 없어도 오류 파일·줄·이유를 보여 주고 빈 목록으로 오해시키지 않는다', () => {
    const html = renderToStaticMarkup(createElement(TaskList, { rid: 'sample', tasks: [], loaded: true, diagnostics } as Parameters<typeof TaskList>[0]))
    expect(html).toContain('작업 파일 오류 1')
    expect(html).toContain('workbench/tasks/2026-10-07-result.md:4')
    expect(html).toContain('state: results')
    expect(html).not.toContain('맡긴 일이 없습니다')
  })
})
