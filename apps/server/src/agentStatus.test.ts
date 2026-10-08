import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateStatus } from './agentStatus.js'
import { repo, useSampleApp } from './testkit.js'
import { Workbench } from './workbench.js'

useSampleApp()
describe('멈춘 연구·계산 노트의 재개 조건', () => {
  it('본문 경로·note.yaml·재개 조건을 표시하고 보조 노트는 기존 절에만 둔다', () => {
    for (const [folder, body, resume] of [['notes/pause', 'note.md', '외부 수치 결과'], ['calc/pause', 'main.tex', '다른 크기의 계산']] as const) {
      const dir = path.join(repo, 'workbench', folder)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, body), body.endsWith('.md') ? '# 멈춘 노트\n' : '\\section{멈춘 계산}\n')
      fs.writeFileSync(path.join(dir, 'note.yaml'), `name: ${folder}\nstate: paused\nresume: ${resume}\n`)
    }
    const block = path.join(repo, 'workbench/blocks/broken-example.tex')
    fs.writeFileSync(block, fs.readFileSync(block, 'utf8').replace('% status: in-progress', '% status: blocked').replace('% ---\n', '% ---\n% resume-condition: 보조 재개 조건\n'))
    const status = generateStatus(new Workbench(path.join(repo, 'workbench')))
    expect(status).toContain('## 멈춘 연구·계산 노트 2')
    expect(status).toContain('workbench/notes/pause/note.md')
    expect(status).toContain('workbench/notes/pause/note.yaml')
    expect(status).toContain('다시 시작할 조건: 외부 수치 결과')
    expect(status).toContain('workbench/calc/pause/main.tex')
    expect(status).toContain('workbench/calc/pause/note.yaml')
    expect(status).toContain('다시 시작할 조건: 다른 크기의 계산')
    expect(status.split('workbench/blocks/broken-example.tex')).toHaveLength(2)
  })
})
