import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { generateStatus, readStatusEdits, writeStatus } from './agentStatus.js'
import { buildApp } from './app.js'
import { fastForward } from './gitsync.js'
import { gitTest as g, syncRepo } from './gitSyncTestkit.js'
import { makeRepo, repo, tmp, useSampleApp } from './testkit.js'
import { AgentEditStore, agentWrite } from './agentEdits.js'
import { hashOf } from './fsutil.js'
import { allManuscripts, buildDirOf } from './manuscript.js'
import { Workbench } from './workbench.js'

useSampleApp()
describe('Git freshness in agent STATUS', () => {
  it('shows stale refs and overlap immediately after the header, uses FETCH_HEAD mtime, and never fetches', async () => {
    const file = '노트 글.md'
    const { mine, incoming } = syncRepo(tmp, 'status-behind', { [file]: 'old\n' })
    const wb = new Workbench(path.join(mine, 'workbench'))
    incoming({ [file]: 'remote\n' })
    expect(generateStatus(wb)).not.toContain('> ⚠') // no fetch: old origin/main
    g(mine, 'fetch', '-q')
    const fetched = path.join(mine, '.git/FETCH_HEAD')
    const stamp = new Date(2026, 9, 10, 9, 34)
    fs.utimesSync(fetched, stamp, stamp)
    fs.writeFileSync(path.join(mine, file), 'local\r\n')
    const status = generateStatus(wb)
    const line = '> ⚠ 이 사본은 GitHub보다 1커밋 뒤다(마지막 확인 2026-10-10 09:34). 일하기 전에 받는다: 앱 홈의 받기 또는 `git pull --ff-only`. 커밋하지 않은 변경과 겹치는 파일: 노트 글.md.'
    expect(status.split('\n')[3]).toBe(line)
    expect(writeStatus(wb).written).toBe(true)
    expect(writeStatus(wb, new Date(2027, 0, 1)).written).toBe(false)
    expect(fs.statSync(fetched).mtime.getTime()).toBe(stamp.getTime())
    fs.unlinkSync(fetched)
    expect(generateStatus(wb)).toContain('1커밋 뒤다. 일하기 전에')
    expect(generateStatus(wb)).not.toContain('마지막 확인')
    // Cloud command uses this same read-only summary and does not create STATUS.md.
    fs.unlinkSync(path.join(wb.root, 'STATUS.md'))
    const output = execFileSync('node', ['scripts/agent-status.mjs', mine], { cwd: path.resolve(import.meta.dirname, '../../..'), encoding: 'utf8' })
    expect(output).toContain('1커밋 뒤다.')
    expect(output).toContain('겹치는 파일: 노트 글.md.')
    expect(fs.existsSync(path.join(wb.root, 'STATUS.md'))).toBe(false)
  })

  it('omits warnings when current, without an upstream, or inside another repository; reports ahead/divergence', () => {
    const { mine, incoming } = syncRepo(tmp, 'status-ahead', { 'local.md': 'old\n' })
    const wb = new Workbench(path.join(mine, 'workbench'))
    expect(generateStatus(wb)).not.toContain('> ⚠')
    fs.writeFileSync(path.join(mine, 'local.md'), 'committed\n')
    g(mine, 'commit', '-qam', 'Local commit')
    expect(generateStatus(wb)).toContain('> ⚠ 이 컴퓨터에만 있는 커밋 1개가 GitHub에 없다.')
    expect(generateStatus(wb)).not.toContain('뒤다')
    incoming({ 'remote.md': 'remote\n' })
    g(mine, 'fetch', '-q')
    expect(generateStatus(wb)).toContain('GitHub보다 1커밋 뒤다')
    expect(generateStatus(wb)).toContain('이 컴퓨터에만 있는 커밋 1개')
    for (const folder of ['fixtures/example', '.sandbox/example']) {
      const sub = path.join(mine, folder)
      fs.cpSync(wb.root, path.join(sub, 'workbench'), { recursive: true })
      expect(generateStatus(new Workbench(path.join(sub, 'workbench')))).not.toContain('> ⚠')
    }
    g(mine, 'branch', '--unset-upstream')
    expect(generateStatus(wb)).not.toContain('> ⚠')
  })

  it('finds FETCH_HEAD in a linked worktree whose .git is a file', () => {
    const { mine, incoming } = syncRepo(tmp, 'status-linked')
    incoming({ 'remote.md': 'remote\n' })
    g(mine, 'fetch', '-q')
    const linked = path.join(tmp, 'status-linked-copy')
    g(mine, 'worktree', 'add', '-q', '-b', 'linked', linked, 'HEAD')
    g(linked, 'branch', '--set-upstream-to=origin/main')
    g(linked, 'fetch', '-q')
    expect(fs.statSync(path.join(linked, '.git')).isFile()).toBe(true)
    const status = generateStatus(new Workbench(path.join(linked, 'workbench')))
    expect(status).toMatch(/GitHub보다 1커밋 뒤다\(마지막 확인 \d{4}-\d\d-\d\d \d\d:\d\d\)/)
  })

  it.each(['sync', 'repo'])('refreshes STATUS after /%s?fetch=1, rejected updates and successful pulls', async (route) => {
    const research = 'workbench/research.yaml'
    const { mine, incoming } = syncRepo(tmp, `status-route-${route}`, { [research]: 'title: Sync status\nagent-status: true\n', 'local.md': 'old\n' })
    const wb = new Workbench(path.join(mine, 'workbench'))
    const statusFile = path.join(wb.root, 'STATUS.md')
    writeStatus(wb)
    const sa = buildApp({ configDir: path.join(tmp, `status-config-${route}`) })
    try {
      const id = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: mine } })).json().id
      const base = `/api/researches/${id}`
      incoming({ 'remote.md': 'remote\n' })
      expect((await sa.inject({ method: 'GET', url: `${base}/${route}` })).statusCode).toBe(200)
      expect(fs.readFileSync(statusFile, 'utf8')).not.toContain('> ⚠')
      expect((await sa.inject({ method: 'GET', url: `${base}/${route}?fetch=1` })).statusCode).toBe(200)
      expect(fs.readFileSync(statusFile, 'utf8')).toContain('GitHub보다 1커밋 뒤다')
      expect(fs.existsSync(path.join(mine, 'remote.md'))).toBe(false)
      expect((await sa.inject({ method: 'POST', url: `${base}/sync/update` })).statusCode).toBe(200)
      expect(fs.readFileSync(statusFile, 'utf8')).not.toContain('> ⚠')
      // A rejected pull still fetches, so STATUS must reflect the new refs too.
      incoming({ 'local.md': 'remote edit\n' })
      fs.writeFileSync(path.join(mine, 'local.md'), 'uncommitted\r\n')
      const head = g(mine, 'rev-parse', 'HEAD')
      const rejected = await sa.inject({ method: 'POST', url: `${base}/sync/update` })
      expect(rejected.statusCode).toBe(409)
      expect(rejected.json().error).toContain('local.md')
      expect(fs.readFileSync(statusFile, 'utf8')).toContain('겹치는 파일: local.md.')
      expect(g(mine, 'rev-parse', 'HEAD')).toBe(head)
      expect(fs.readFileSync(path.join(mine, 'local.md'), 'utf8')).toBe('uncommitted\r\n')
    } finally { await sa.close() }
  })

  it('does not write STATUS when agent-status is off, even after a pull', async () => {
    const { mine, incoming } = syncRepo(tmp, 'status-disabled')
    const sa = buildApp({ configDir: path.join(tmp, 'status-config-disabled') })
    try {
      const id = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: mine } })).json().id
      incoming({ 'remote.md': 'remote\n' })
      expect((await sa.inject({ method: 'GET', url: `/api/researches/${id}/sync?fetch=1` })).statusCode).toBe(200)
      await fastForward(mine)
      expect(fs.existsSync(path.join(mine, 'workbench/STATUS.md'))).toBe(false)
    } finally { await sa.close() }
  })
})
describe('멈춘 연구·계산 노트의 재개 조건', () => {
  it('본문 경로·note.yaml·재개 조건을 표시하고 블록 노트는 기존 절에만 둔다', () => {
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

  it('명시한 .tex 원고만 장 수·마지막 컴파일 절을 보인다', () => {
    const wb = fresh()
    write(wb, 'research.yaml', 'title: 연구\nsources:\n  manuscript: paper/main.tex — 한 파일 원고\n')
    fs.mkdirSync(path.join(wb.repo, 'paper'), { recursive: true })
    fs.writeFileSync(path.join(wb.repo, 'paper/main.tex'), '\\begin{document}\n\\section{장 하나}\n\\section{장 둘}\n\\appendix\n\\section{부록}\n\\end{document}\n')
    write(wb, 'notes/single/note.md', '# 노트 장\n')
    write(wb, 'calc/single/main.tex', '\\section{계산 장}\n')
    const status = generateStatus(wb)
    expect(status.match(/^## 원고 — /gm)).toHaveLength(1)
    const ms = section(status, '## 원고 — 한 파일 원고')
    expect(ms).toContain('장 2 · 부록 1\n')
    expect(ms).not.toMatch(/^- /m)
    expect(ms).toContain('앱에서 아직 컴파일하지 않음')
  })

  it('노트는 원고 절 없이 컴파일 오류 3개까지 보이고 성공·미컴파일은 생략한다', () => {
    const wb = fresh()
    write(wb, 'research.yaml', 'title: 연구\n')
    for (const folder of ['notes/failed', 'calc/ok', 'notes/new']) write(wb, `${folder}/note.md`, '# 하나\n')
    for (const m of allManuscripts(wb)) {
      if (m.main.includes('/new/')) continue
      const dir = buildDirOf(wb, m.key)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ at: '2026-10-10T00:00:00Z', ok: m.main.includes('/ok/'), durationMs: 1000,
        problems: m.main.includes('/failed/') ? Array.from({ length: 4 }, (_, i) => ({ file: m.main, line: i + 1, message: `error ${i + 1}` })) : [] }))
    }
    const status = generateStatus(wb)
    expect(status).not.toContain('## 원고 —')
    expect(status).toContain('`workbench/notes/failed/note.md` · 기록 `note-failed` · 컴파일 오류 4')
    expect(status).toContain('  - `workbench/notes/failed/note.md:3` error 3')
    expect(status).not.toContain('error 4')
    expect(status.match(/컴파일 오류/g)).toHaveLength(1)
  })

  it('명시한 input 원고의 장 목록과 선언하지 않은 노트에 대한 블록 참조를 유지한다', () => {
    const wb = fresh()
    write(wb, 'research.yaml', 'title: 연구\nsources:\n  manuscript: workbench/notes/multi/main.tex — multi\n')
    write(wb, 'notes/multi/main.tex', '\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}\n')
    write(wb, 'notes/multi/chapter.tex', '\\section{다른 파일 장}\n')
    write(wb, 'calc/loose/main.tex', '\\begin{document}\n\\section{노트 장}\n\\end{document}\n')
    write(wb, 'blocks/reference.md', '---\nid: reference\n---\ngrounds: workbench/notes/multi/chapter.tex, workbench/calc/loose/main.tex#노트 장\n')
    const status = generateStatus(wb)
    expect(section(status, '## 원고 — multi')).toContain('- multi 1장 다른 파일 장 — `workbench/notes/multi/chapter.tex`')
    expect(section(status, '## 블록 노트')).toContain('원고: multi 1장 다른 파일 장 · loose 1장 노트 장')
    expect(status).not.toContain('## 원고 — loose')
  })

  it('할 일 이름표는 블록 id·노트 본문·다른 경로를 구분한다', () => {
    const wb = fresh()
    write(wb, 'blocks/example.md', '---\nid: example\ntitle: 블록 제목\n---\n글\n')
    write(wb, 'notes/example/note.md', '# 제목\n')
    write(wb, 'notes/example/note.yaml', 'name: 노트 제목\n')
    for (const target of ['example', 'missing-block', 'workbench/notes/example/note.md', 'workbench/calc/missing/main.tex', 'src/code.py', '연구']) {
      wb.appendJournal({ date: '2026-10-10', time: '12:00', kind: 'todo', target, text: `대상 ${target}` })
    }
    const status = generateStatus(wb)
    expect(status).toContain('대상 example (블록 노트: 블록 제목)')
    expect(status).toContain('대상 missing-block (블록 노트: missing-block)')
    expect(status).toContain('대상 workbench/notes/example/note.md (노트: 노트 제목)')
    expect(status).toContain('대상 workbench/calc/missing/main.tex (노트: workbench/calc/missing/main.tex)')
    expect(status).toContain('대상 src/code.py (src/code.py)')
    expect(status).not.toContain('대상 연구 (')
  })

  it('설정 기록에서 프로젝트 검토·허락 대기를 읽기만 하고 맡긴 일 뒤에 둔다', () => {
    const wb = fresh()
    const config = path.join(tmp, 'status-config')
    fs.mkdirSync(config, { recursive: true })
    fs.writeFileSync(path.join(config, 'config.yaml'), `researches: [{id: status-project, path: ${wb.repo}}]\n`)
    write(wb, 'notes/working/note.md', '# 작업\n\n원래 글\n')
    write(wb, 'calc/solved/note.md', '# 계산\n\n확인한 글\n')
    write(wb, 'calc/solved/note.yaml', 'state: done\n')
    const file = AgentEditStore.fileFor(config, undefined)
    const store = new AgentEditStore(file)
    const io = { lib: undefined, wbOf: () => wb }
    const target = { kind: 'note' as const, rid: 'status-project', file: 'workbench/notes/working/note.md' }
    const st = agentWrite(io, store, { target, baseHash: (fileHash(wb, target.file)), edits: [{ old: '원래 글', new: '고친 글' }], agent: 'codex' })
    expect(st.ok).toBe(true)
    const solved = { ...target, file: 'workbench/calc/solved/note.md' }
    agentWrite(io, store, { target: solved, baseHash: fileHash(wb, solved.file), edits: [{ old: '확인한 글', new: '고침' }], agent: 'claude-code' })
    store.update((d) => {
      d.pending[0]!.since = new Date(2026, 9, 10, 12, 30).toISOString()
      d.pending[0]!.agents = ['codex', 'claude-code']
      d.pending.push({ ...d.pending[0]!, key: 'other', target: { ...target, rid: 'other' } })
    })
    const broken = path.join(path.dirname(file), 'edits-broken.json')
    fs.writeFileSync(broken, '{broken')
    fs.writeFileSync(path.join(wb.repo, target.file), '# 작업\n\n고친 글\n\n사용자가 덧붙인 글\n')
    const before = fs.readFileSync(file, 'utf8')
    const edits = readStatusEdits(wb, config)
    expect(edits.reviews).toHaveLength(1)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fs.readFileSync(broken, 'utf8')).toBe('{broken')
    const status = generateStatus(wb, new Date(), edits)
    expect(status).toContain('## 에이전트 고침 검토 대기 2')
    expect(status).toContain('· 바뀐 곳 1 · 에이전트 codex, claude-code · 첫 고침 2026-10-10 12:30')
    expect(status).toContain('- 허락 대기: **solved** — `workbench/calc/solved/note.md` · 에이전트 claude-code')
    expect(status.indexOf('## 맡긴 일')).toBeLessThan(status.indexOf('## 에이전트 고침 검토 대기'))
    expect(generateStatus(wb)).not.toContain('## 에이전트 고침 검토 대기')
    expect(generateStatus(wb, new Date(), { reviews: [], attempts: [] })).not.toContain('## 에이전트 고침 검토 대기')
    expect(readStatusEdits(wb, path.join(config, 'missing'))).toEqual({ reviews: [], attempts: [] })
    fs.writeFileSync(file, '{broken')
    const files = fs.readdirSync(path.dirname(file))
    expect(readStatusEdits(wb, config)).toEqual({ reviews: [], attempts: [] })
    expect(fs.readFileSync(file, 'utf8')).toBe('{broken')
    expect(fs.readdirSync(path.dirname(file))).toEqual(files)
  })

  const fileHash = (wb: Workbench, file: string) => hashOf(fs.readFileSync(path.join(wb.repo, file), 'utf8'))

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
