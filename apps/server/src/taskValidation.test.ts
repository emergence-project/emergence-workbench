import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { inspectTask, TASK_STATES } from './taskValidation.js'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/sandbox-extra/workbench/tasks')
describe('공통 작업 파일 검사', () => {
  it('현재 예제의 여섯 정상 상태·결과·질문·종결 조건 제안 형식을 계속 읽는다', () => {
    const states = fs.readdirSync(dir).map((name) => {
      const content = fs.readFileSync(path.join(dir, name), 'utf8')
      const inspection = inspectTask(`workbench/tasks/${name}`, content)
      expect(inspection.diagnostics).toEqual([])
      expect(content.slice(inspection.bodyStart)).toMatch(/^##|^<!--|^$/)
      return inspection.front?.state
    })
    expect(new Set(states)).toEqual(new Set(TASK_STATES))
  })

  it('순환 alias 객체·목록의 상태 값도 표시 중 예외 없이 진단한다', () => {
    for (const state of ['&s { toString: *s }', '&s [*s]']) {
      const content = `---\ntitle: 결과\ntask: 대조\nstate: ${state}\n---\n본문\n`
      expect(() => inspectTask('workbench/tasks/2026-10-07-state.md', content)).not.toThrow()
      expect(inspectTask('workbench/tasks/2026-10-07-state.md', content).diagnostics).toEqual([expect.objectContaining({ code: 'schema', line: 4 })])
    }
  })

  it('따옴표가 있는 YAML 칸의 오류도 실제 줄을 가리킨다', () => {
    const inspection = inspectTask('workbench/tasks/2026-10-07-state.md', '---\ntitle: 결과\ntask: 대조\n"state": results\n---\n본문\n')
    expect(inspection.diagnostics).toEqual([expect.objectContaining({ code: 'schema', line: 4 })])
  })
})
