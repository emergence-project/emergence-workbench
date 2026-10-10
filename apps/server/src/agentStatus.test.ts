import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateStatus } from './agentStatus.js'
import { makeRepo, repo, useSampleApp } from './testkit.js'
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
    expect(status).toContain('## 노트 2')
    expect(status).toContain('workbench/notes/pause/note.md')
    expect(status).toContain('workbench/notes/pause/note.yaml')
    expect(status).toContain('다시 시작할 조건: 외부 수치 결과')
    expect(status).toContain('workbench/calc/pause/main.tex')
    expect(status).toContain('workbench/calc/pause/note.yaml')
    expect(status).toContain('다시 시작할 조건: 다른 크기의 계산')
    expect(status.split('workbench/blocks/broken-example.tex')).toHaveLength(2)
  })
})

// 각 사례는 별도 임시 복사본에서 확인한다. 예제 원본은 고치지 않는다.
describe('에이전트 맥락 요약', () => {
  let serial = 0
  const fresh = () => new Workbench(path.join(makeRepo(`status-${serial++}`), 'workbench'))
  const write = (wb: Workbench, file: string, text: string) => {
    const abs = path.join(wb.root, file)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
  const section = (status: string, heading: string) => status.split(heading)[1]!.split('\n## ')[0]!

  it('머리 안내에 형식·검사·확인·MCP 규칙을 기존 세 안내 뒤에 둔다', () => {
    const status = generateStatus(fresh())
    const guides = status.split('\n').filter((line) => line.startsWith('> '))
    expect(guides[0]).toMatch(/^> 연구 작업대 앱이 자동으로 쓰는 요약이다/)
    expect(guides[3]).toContain('docs/repo-format.md')
    expect(guides[3]).toContain('agent:check')
    expect(guides[3]).toContain('pnpm --dir')
    expect(guides[4]).toContain('locked: true')
    expect(guides[5]).toContain('`edit_note`·`edit_concept`')
  })

  it('노트를 상태 순·최근 수정 순으로 보이고 해결 노트의 기록 대상을 화면처럼 만든다', () => {
    const wb = fresh()
    write(wb, 'research.yaml', 'title: 연구\ntopics: [{id: wheels, title: 바퀴}]\n')
    for (const [folder, state, name, body] of [
      ['notes/done 한..글', 'done', '확인한 노트', 'note.md'],
      ['calc/solved', 'done', '확인한 계산', 'note.md'],
      ['notes/stopped', 'stopped', '그만둔 노트', 'note.md'],
      ['notes/paused', 'paused', '멈춘 노트', 'main.tex'],
      ['notes/older', '', '먼저 쓴 노트', 'note.md'],
      ['notes/newer', '', '최근 노트', 'note.md'],
    ]) {
      write(wb, `${folder}/${body}`, body === 'note.md' ? '# 제목\n' : '\\section{제목}\n')
      write(wb, `${folder}/note.yaml`, `name: ${name}\n${state ? `state: ${state}\n` : ''}description: ${folder === 'notes/older' ? '"- 첫 설명"' : '첫 설명'}\ntopics: [wheels]\nkind: proof\n`)
    }
    fs.utimesSync(path.join(wb.root, 'notes/older/note.md'), 1, 1)
    fs.utimesSync(path.join(wb.root, 'notes/newer/note.md'), 2, 2)
    const status = generateStatus(wb)
    const notes = section(status, '## 노트 6')
    expect(notes).toContain('- ✓ **확인한 노트** — 해결 · `workbench/notes/done 한..글/note.md` · 기록 `note-done____` · 주제 wheels · proof')
    expect(notes).toContain('기록 `calc-solved`')
    expect(notes).toContain('  - 첫 설명')
    expect(notes).not.toContain('- - ')
    expect(notes).toContain('다시 시작할 조건: — · 정본: `workbench/notes/stopped/note.yaml`')
    expect(notes).not.toContain('기록 `note-paused`')
    const names = ['최근 노트', '먼저 쓴 노트', '멈춘 노트', '확인한 노트', '그만둔 노트']
    for (let i = 1; i < names.length; i++) expect(notes.indexOf(`**${names[i - 1]}**`)).toBeLessThan(notes.indexOf(`**${names[i]}**`))
    expect(status.indexOf('## 주제')).toBeLessThan(status.indexOf('## 노트'))
    expect(status.indexOf('## 노트')).toBeLessThan(status.indexOf('## 블록 노트'))
  })

  it.each([
    ['note.md', '# 장 하나\n## 장 둘\n\\appendix\n# 부록\n'],
    ['main.tex', '\\documentclass{article}\n\\begin{document}\n\\section{장 하나}\n\\section{장 둘}\n\\appendix\n\\section{부록}\n\\end{document}\n'],
  ])('한 파일 %s 원고는 머리를 지키고 장 목록 대신 수만 보인다', (body, text) => {
    const wb = fresh()
    write(wb, `notes/single/${body}`, text)
    write(wb, 'notes/single/note.yaml', 'name: 한 파일 원고\n')
    const heading = `## 원고 — 한 파일 원고 (\`workbench/notes/single/${body}\`)`
    const status = generateStatus(wb)
    expect(status).toContain(heading)
    const ms = section(status, heading)
    expect(ms).toContain('장 2 · 부록 1\n')
    expect(ms).not.toMatch(/^- /m)
    expect(ms).toContain('앱에서 아직 컴파일하지 않음')
  })

  it('부록이 없는 한 파일 원고는 부록 수를 쓰지 않는다', () => {
    const wb = fresh()
    write(wb, 'notes/single/note.md', '# 하나\n')
    const ms = section(generateStatus(wb), '## 원고 — single')
    expect(ms).toContain('장 1\n')
    expect(ms).not.toContain('부록')
  })

  it('input 원고는 장 목록과 블록의 원고 참조를 유지한다', () => {
    const wb = fresh()
    write(wb, 'notes/multi/main.tex', '\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}\n')
    write(wb, 'notes/multi/chapter.tex', '\\section{다른 파일 장}\n')
    write(wb, 'blocks/reference.md', '---\nid: reference\n---\ngrounds: workbench/notes/multi/chapter.tex\n')
    const status = generateStatus(wb)
    expect(section(status, '## 원고 — multi')).toContain('- 1장 다른 파일 장 — `workbench/notes/multi/chapter.tex`')
    expect(section(status, '## 블록 노트')).toContain('원고: 1장 다른 파일 장')
  })

  it('블록·노트가 없으면 해당 절과 정본 줄을 생략하고 있는 노트 폴더만 안내한다', () => {
    const wb = fresh()
    fs.rmSync(wb.blocksDir, { recursive: true })
    let status = generateStatus(wb)
    expect(status).not.toContain('## 블록 노트')
    expect(status).not.toContain('workbench/blocks/*.md')
    expect(status).not.toContain('## 노트')
    write(wb, 'calc/only/note.md', '# 계산\n')
    status = generateStatus(new Workbench(wb.root))
    expect(status).toContain('- `workbench/calc/<폴더>/` — 연구노트·계산 노트 1개')
    expect(status).not.toContain('workbench/notes/<폴더>/')
  })
})
