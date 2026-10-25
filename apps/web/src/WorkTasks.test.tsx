import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Task } from './api/tasks'
import { openTaskId, taskRowKey } from './taskView'
import { JudgeList } from './WorkTasks'

const task = (id: string): Task => ({
  id, file: `workbench/tasks/${id}.md`, title: id, agent: 'claude-code', created: '2026-10-15 09:45', state: 'result', task: '일', resultAt: '2026-10-20 23:20',
  references: [], asks: [], issues: [], next: [], outputs: [], check: {}, answers: [], judged: [], body: '', hash: 'h', mtime: 0,
})

// 기록 화면(LogPage)처럼 펼친 줄을 바깥 키로 들고 JudgeList에 넘긴다 (#213 뒤 키가 어긋나 카드가 펼쳐지지 않았다)
const render = (openRow: string | null) => renderToStaticMarkup(
  <JudgeList rid="r" tasks={[task('a'), task('b')]} loaded onSaved={() => undefined} reload={() => undefined} onEditProposal={() => undefined}
    openId={openTaskId(openRow)} onToggle={() => undefined} />,
)

describe('기록 화면 내 차례의 판단 카드', () => {
  it('누른 카드 하나만 펼친다', () => {
    const html = render(taskRowKey('b'))
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1)
    expect(html).toMatch(/data-ui-item="b"[^>]*>.*aria-expanded="true"/)
  })

  it('기록 줄이 펼쳐져 있으면 카드는 모두 접는다', () => {
    expect(render('project/c-20261020-0900')).not.toContain('aria-expanded="true"')
  })
})
