// 연구 등록, 블록, 원고 저장, 일지, 파일 감시, 서식, 컴파일, 화면 설정
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBlock, type JournalEntry } from '@rw/core'
import { describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { hashOf } from './fsutil.js'
import * as comments from './comments.js'
import { judgeCompile } from './latex.js'
import { app, block, blockHash, hasLatex, makeRepo, R, repo, tmp, useSampleApp } from './testkit.js'
import { watchWorkbench, type WorkbenchEvent } from './watcher.js'
import { Workbench, WorkbenchError } from './workbench.js'

useSampleApp()

describe('연구 등록', () => {
  it('등록한 연구가 목록과 설정 파일에 남는다', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/researches' })).json()
    expect(list.researches).toContainEqual(expect.objectContaining({ id: 'sample-research', title: '예제 연구 — 5색 정리 재유도', available: true }))
    expect(fs.readFileSync(path.join(tmp, 'config/config.yaml'), 'utf8')).toContain(repo)
  })

  it('workbench가 없는 저장소는 확인 없이는 만들지 않고, 확인하면 만들되 다른 파일은 건드리지 않는다', async () => {
    const other = makeRepo('Other_Project', false)
    const ins = (await app.inject({ method: 'POST', url: '/api/researches/inspect', payload: { path: other } })).json()
    expect(ins).toMatchObject({ isGitRepo: true, hasWorkbench: false, errors: [] })
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: other } })).statusCode).toBe(409)
    expect(fs.existsSync(path.join(other, 'workbench'))).toBe(false)

    const ok = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: other, createWorkbench: true, title: '다른 연구' } })).json()
    expect(ok.id).toBe('other-project')
    expect(fs.readdirSync(path.join(other, 'workbench')).sort()).toEqual(['.gitignore', 'blocks', 'figures', 'log', 'preamble.tex', 'research.yaml'])
    expect(fs.readdirSync(other).sort()).toEqual(['.git', 'src', 'workbench'])
  })

  it('왼쪽 띠의 프로젝트 수는 첫 화면의 확인이 필요한 보조 노트 수와 같다', async () => {
    const { counts } = (await app.inject({ method: 'GET', url: '/api/research-issues' })).json()
    const summary = (await app.inject({ method: 'GET', url: R })).json()
    expect(counts['sample-research']).toBe(summary.tree.issues.length)
  })

  it('없는 경로, 상대 경로, 두 번 등록을 거부한다', async () => {
    for (const p of [path.join(tmp, 'nope'), 'relative/path', repo]) {
      expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: p } })).statusCode).toBe(400)
    }
  })

  it('성격 · 분야는 등록할 때 정하고 나중에 바꿀 수 있으며, 설정 파일에만 남는다', async () => {
    const job = makeRepo('job-project')
    // 예전 화면처럼 tags로 보내도 "업무"는 성격, 나머지는 분야로 나눠 새 키로 쓴다
    const made = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: job, tags: [' 업무 ', '#회사', '업무'] } })).json()
    expect(made).toMatchObject({ kind: 'work', fields: ['회사'], state: 'active', tags: ['업무', '회사'] })
    const cfg = () => fs.readFileSync(path.join(tmp, 'config', 'config.yaml'), 'utf8')
    expect(cfg()).toMatch(/path: .*job-project\n\s+kind: work\n\s+fields:\n\s+- 회사/)
    const url = `/api/researches/${made.id}`
    expect((await app.inject({ method: 'PATCH', url, payload: { tags: 'x' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url, payload: { kind: 'hobby' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url, payload: { state: 'stopped' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url, payload: { fields: ['가'.repeat(61)] } })).statusCode).toBe(400)
    // 보낸 것만 바꾼다
    const paused = (await app.inject({ method: 'PATCH', url, payload: { state: 'paused' } })).json()
    expect(paused).toMatchObject({ kind: 'work', fields: ['회사'], state: 'paused' })
    const back = (await app.inject({ method: 'PATCH', url, payload: { kind: 'research', fields: ['Graph Theory'], state: 'active' } })).json()
    expect(back).toMatchObject({ kind: 'research', fields: ['Graph Theory'], state: 'active', tags: ['Graph Theory'] })
    expect(cfg()).not.toMatch(/job-project\n(\s+\w+:.*\n)*\s+state:/) // 진행(기본)은 적지 않는다
    await app.inject({ method: 'DELETE', url })
  })

  it('예전 설정(kind: work, 업무 태그)은 고칠 때까지 그대로 두고 성격 · 분야로 읽는다', async () => {
    const dir = path.join(tmp, 'config-legacy')
    fs.mkdirSync(dir)
    const file = path.join(dir, 'config.yaml')
    fs.writeFileSync(file, `researches:\n  - id: old\n    path: ${repo}\n    kind: work\n  - id: tagged\n    path: ${repo}\n    tags: [업무, 공부]\n  - id: plain\n    path: ${repo}\n    tags: [그래프이론]\n`)
    const legacy = buildApp({ configDir: dir })
    const list = (await legacy.inject({ method: 'GET', url: '/api/researches' })).json().researches
    expect(list.map((r: { kind: string; fields: string[]; state: string }) => [r.kind, r.fields, r.state])).toEqual([['work', [], 'active'], ['work', ['공부'], 'active'], ['research', ['그래프이론'], 'active']])
    // 다른 설정을 고쳐 저장해도 예전 키는 그대로 남는다
    await legacy.inject({ method: 'PUT', url: '/api/researches/order', payload: { ids: ['plain'] } })
    expect(fs.readFileSync(file, 'utf8')).toMatch(/id: tagged\n\s+path: .*\n\s+tags:\n\s+- 업무\n\s+- 공부/)
    // 고치면 새 키로
    await legacy.inject({ method: 'PATCH', url: '/api/researches/tagged', payload: { state: 'done' } })
    const text = fs.readFileSync(file, 'utf8')
    expect(text).toMatch(/id: tagged\n\s+path: .*\n\s+kind: work\n\s+fields:\n\s+- 공부\n\s+state: done/)
    expect(text).not.toMatch(/id: tagged\n(\s+\w+:.*\n|\s+- .*\n)*\s+tags:/)
    await legacy.close()
  })

  it('프로젝트 순서를 바꾸면 목록과 설정 파일이 그 순서가 된다', async () => {
    const dir = path.join(tmp, 'config-order')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'config.yaml'), `researches:\n  - id: a\n    path: ${repo}\n  - id: b\n    path: ${repo}\n  - id: c\n    path: ${repo}\n`)
    const ordered = buildApp({ configDir: dir })
    expect((await ordered.inject({ method: 'PUT', url: '/api/researches/order', payload: { ids: 'a' } })).statusCode).toBe(400)
    const res = (await ordered.inject({ method: 'PUT', url: '/api/researches/order', payload: { ids: ['c', 'a', 'zz'] } })).json()
    expect(res.researches.map((r: { id: string }) => r.id)).toEqual(['c', 'a', 'b']) // 빠진 것은 뒤에
    const again = buildApp({ configDir: dir })
    expect((await again.inject({ method: 'GET', url: '/api/researches' })).json().researches.map((r: { id: string }) => r.id)).toEqual(['c', 'a', 'b'])
    await ordered.close(); await again.close()
  })

  it('등록 해제는 목록에서만 빼고 파일은 지우지 않는다', async () => {
    const third = makeRepo('third')
    const { id } = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: third } })).json()
    expect((await app.inject({ method: 'DELETE', url: `/api/researches/${id}` })).statusCode).toBe(200)
    expect(fs.existsSync(path.join(third, 'workbench/blocks/kempe-chains.tex'))).toBe(true)
  })
})

describe('블록과 나무', () => {
  it('연구 개괄 자료에 블록 머리말과 나무가 들어 있다', async () => {
    const s = (await app.inject({ method: 'GET', url: R })).json()
    expect(s.research.title).toBe('예제 연구 — 5색 정리 재유도')
    expect(s.blocks).toContainEqual(expect.objectContaining({ id: 'kempe-chains', title: 'Kempe 사슬 이용', status: 'in-progress' }))
    expect(s.tree.order.map((o: { id: string }) => o.id).sort()).toEqual(['broken-example', 'kempe-chains'])
  })

  it('새 블록을 만들면 머리말이 채워지고, 다른 시도로 만들면 양쪽에 적힌다', async () => {
    const created = (await app.inject({ method: 'POST', url: `${R}/blocks`, payload: { title: 'Brooks theorem 직접', alternativeOf: 'kempe-chains' } })).json()
    expect(created.id).toBe('brooks-theorem')
    expect(created.meta).toMatchObject({ title: 'Brooks theorem 직접', status: 'in-progress', alternatives: ['kempe-chains'] })
    expect(parseBlock(block('kempe-chains')).meta.alternatives).toContain('brooks-theorem')
    expect((await app.inject({ method: 'POST', url: `${R}/blocks`, payload: { title: 'x', id: 'kempe-chains' } })).statusCode).toBe(409)
    // 원고 컴파일 폴더(.build/manuscript…)와 겹치는 id는 만들지 않는다
    expect((await app.inject({ method: 'POST', url: `${R}/blocks`, payload: { title: 'x', id: 'manuscript-notes' } })).statusCode).toBe(400)
  })

  it('머리말을 고쳐도 본문은 바이트 그대로다', async () => {
    const before = block('kempe-chains')
    const body = before.slice(parseBlock(before).bodyStart)
    const res = await app.inject({ method: 'PATCH', url: `${R}/blocks/kempe-chains/meta`, payload: { baseHash: await blockHash('kempe-chains'), patch: { next: '새 다음 할 일', title: '제목 바꿈' } } })
    expect(res.statusCode).toBe(200)
    const after = block('kempe-chains')
    expect(after.slice(parseBlock(after).bodyStart)).toBe(body)
    expect(parseBlock(after).meta).toMatchObject({ next: '새 다음 할 일', title: '제목 바꿈' })
  })

  it('멈춤으로 바꾸려면 이유와 다시 시작할 조건이 필요하고, 바꾸면 일지에 남는다', async () => {
    const bad = await app.inject({ method: 'PATCH', url: `${R}/blocks/brooks-theorem/meta`, payload: { baseHash: await blockHash('brooks-theorem'), patch: { status: 'blocked' } } })
    expect(bad.statusCode).toBe(400)
    const ok = await app.inject({ method: 'PATCH', url: `${R}/blocks/brooks-theorem/meta`, payload: { baseHash: await blockHash('brooks-theorem'), patch: { status: 'blocked', 'blocked-reason': '보조정리 없음', 'resume-condition': '부록 확인' } } })
    expect(ok.statusCode).toBe(200)
    const j = (await app.inject({ method: 'GET', url: `${R}/journal` })).json()
    expect(j.entries[0]).toMatchObject({ kind: 'status', target: 'brooks-theorem', text: '진행 → 멈춤 — 보조정리 없음 / 다시 시작할 조건: 부록 확인' })
    const s = (await app.inject({ method: 'GET', url: R })).json()
    expect(s.tree.counts.blocked).toBe(1)
  })

  it('다른 시도를 빼면 상대 블록에서도 빠진다', async () => {
    await app.inject({ method: 'PATCH', url: `${R}/blocks/brooks-theorem/meta`, payload: { baseHash: await blockHash('brooks-theorem'), patch: { alternatives: [] } } })
    expect(parseBlock(block('kempe-chains')).meta.alternatives).not.toContain('brooks-theorem')
  })

  it('고리가 생기는 부모, 없는 블록, 고칠 수 없는 키를 거부한다', async () => {
    await app.inject({ method: 'PATCH', url: `${R}/blocks/brooks-theorem/meta`, payload: { baseHash: await blockHash('brooks-theorem'), patch: { parent: 'kempe-chains' } } })
    const cycle = await app.inject({ method: 'PATCH', url: `${R}/blocks/kempe-chains/meta`, payload: { baseHash: await blockHash('kempe-chains'), patch: { parent: 'brooks-theorem' } } })
    expect(cycle.statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: `${R}/blocks/kempe-chains/meta`, payload: { baseHash: await blockHash('kempe-chains'), patch: { parent: 'ghost' } } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: `${R}/blocks/kempe-chains/meta`, payload: { baseHash: await blockHash('kempe-chains'), patch: { id: 'renamed' } } })).statusCode).toBe(400)
  })

  it('머리말 고치기도 읽은 뒤 바뀐 파일은 건드리지 않는다', async () => {
    const { hash } = (await app.inject({ method: 'GET', url: `${R}/blocks/kempe-chains` })).json()
    fs.appendFileSync(path.join(repo, 'workbench/blocks/kempe-chains.tex'), '% 에이전트 수정\n')
    const res = await app.inject({ method: 'PATCH', url: `${R}/blocks/kempe-chains/meta`, payload: { patch: { next: 'x' }, baseHash: hash } })
    expect(res.statusCode).toBe(409)
    expect(block('kempe-chains')).toContain('% 에이전트 수정')
  })
})

describe('원고 저장', () => {
  it('읽은 뒤 바뀌지 않았으면 저장하고, 바뀌었으면 덮어쓰지 않는다', async () => {
    const read = (await app.inject({ method: 'GET', url: `${R}/blocks/broken-example` })).json()
    const saved = await app.inject({ method: 'PUT', url: `${R}/blocks/broken-example`, payload: { content: `${read.content}% 추가\n`, baseHash: read.hash } })
    expect(saved.statusCode).toBe(200)
    fs.appendFileSync(path.join(repo, 'workbench/blocks/broken-example.tex'), '% 에이전트 수정\n')
    const stale = await app.inject({ method: 'PUT', url: `${R}/blocks/broken-example`, payload: { content: 'x', baseHash: saved.json().hash } })
    expect(stale.statusCode).toBe(409)
    expect(block('broken-example')).toContain('% 에이전트 수정')
  })

  it('잘못된 id와 workbench 밖을 가리키는 링크를 거부한다', async () => {
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/..%2Fpreamble` })).statusCode).toBe(400)
    const outside = path.join(tmp, 'outside.tex')
    fs.writeFileSync(outside, 'secret')
    fs.symlinkSync(outside, path.join(repo, 'workbench/blocks/escape.tex'))
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/escape` })).statusCode).toBe(403)
    fs.rmSync(path.join(repo, 'workbench/blocks/escape.tex'))
  })
})

describe('일지', () => {
  it('메모와 할 일을 남기고 완료 표시를 바꾼다', async () => {
    await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'memo', text: '연구 전체 메모 $x$' } })
    const todo = (await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: 'kempe-chains', text: '유일성 조건 적기' } })).json().entry
    expect(todo).toMatchObject({ kind: 'todo', target: 'kempe-chains', done: false })
    const done = (await app.inject({ method: 'PATCH', url: `${R}/journal/${todo.date}/${todo.index}`, payload: { done: true, was: todo.text } })).json().entry
    expect(done.done).toBe(true)
    const entries = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries
    // 끝낸 날의 "완료" 기록이 맨 뒤에 붙는다 (최근 것부터)
    expect(entries[0]).toMatchObject({ kind: 'done', target: 'kempe-chains', text: '유일성 조건 적기' })
    expect(entries[1]).toMatchObject({ kind: 'todo', done: true })
    expect(entries[2]).toMatchObject({ kind: 'memo', target: '연구', text: '연구 전체 메모 $x$' })
    // 이미 끝낸 할 일을 다시 끝냄으로 보내도, 되돌려도 완료 기록은 더 생기지 않는다
    await app.inject({ method: 'PATCH', url: `${R}/journal/${todo.date}/${todo.index}`, payload: { done: true, was: todo.text } })
    await app.inject({ method: 'PATCH', url: `${R}/journal/${todo.date}/${todo.index}`, payload: { done: false, was: todo.text } })
    const again = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries
    expect(again.filter((e: { kind: string }) => e.kind === 'done')).toHaveLength(1)
  })

  it('메모·할 일을 고치고 지운다. 그새 바뀐 기록이나 상태 기록은 건드리지 않는다', async () => {
    const memo = (await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'memo', text: '고칠 메모' } })).json().entry
    const todo = (await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', text: '지울 할 일' } })).json().entry
    const url = (e: { date: string; index: number }) => `${R}/journal/${e.date}/${e.index}`
    const edited = (await app.inject({ method: 'PATCH', url: url(memo), payload: { text: '고친 메모', was: '고칠 메모' } })).json().entry
    expect(edited).toMatchObject({ kind: 'memo', text: '고친 메모', index: memo.index })
    expect((await app.inject({ method: 'PATCH', url: url(memo), payload: { text: 'x', was: '고칠 메모' } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'DELETE', url: `${url(todo)}?was=${encodeURIComponent('지울 할 일')}` })).statusCode).toBe(200)
    const texts = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries.map((e: { text: string }) => e.text)
    expect(texts).toContain('고친 메모')
    expect(texts).not.toContain('지울 할 일')
  })

  it('할 일 체크는 화면이 본 글과 같을 때만 한다 (그새 줄이 끼어 번호가 밀리면 409)', async () => {
    const date = '2026-10-07'
    const log = path.join(repo, 'workbench/log', `${date}.md`)
    fs.mkdirSync(path.dirname(log), { recursive: true })
    fs.writeFileSync(log, '## 09:00 · 할 일 · kempe-chains\n- [ ] 첫 할 일\n\n## 09:01 · 할 일 · kempe-chains\n- [ ] 둘째 할 일\n')
    const seen = ((await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]).find((e) => e.date === date && e.text === '첫 할 일')!
    // 에이전트가 맨 앞에 할 일을 끼워 넣는다
    fs.writeFileSync(log, '## 08:59 · 할 일 · kempe-chains\n- [ ] 끼어든 할 일\n\n' + fs.readFileSync(log, 'utf8'))
    const res = await app.inject({ method: 'PATCH', url: `${R}/journal/${date}/${seen.index}`, payload: { done: true, was: seen.text } })
    expect(res.statusCode).toBe(409)
    expect(fs.readFileSync(log, 'utf8')).not.toContain('[x]')
    expect((await app.inject({ method: 'PATCH', url: `${R}/journal/${date}/${seen.index}`, payload: { done: true } })).statusCode).toBe(400)
    fs.rmSync(log)
  })

  it('완료 기록만 지우고 원래 할 일의 완료 표시를 보존한다. 완료 고치기와 상태 지우기는 거부한다', async () => {
    const text = '완료 기록 지우기 검증'
    const todo = (await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: 'kempe-chains', text } })).json().entry as JournalEntry
    const url = (e: JournalEntry) => `${R}/journal/${e.date}/${e.index}`
    expect((await app.inject({ method: 'PATCH', url: url(todo), payload: { done: true, was: todo.text } })).statusCode).toBe(200)
    const log = path.join(repo, 'workbench/log', `${todo.date}.md`)
    fs.appendFileSync(log, '\n## 23:59 · 상태 · kempe-chains\n진행 → 해결\n')
    const before = fs.readFileSync(log, 'utf8')
    const entries = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    const done = entries.find((e) => e.kind === 'done' && e.text === text)!
    const status = entries.find((e) => e.kind === 'status' && e.time === '23:59' && e.date === todo.date)!
    expect((await app.inject({ method: 'PATCH', url: url(done), payload: { text: '바꾼 완료 기록', was: text } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'DELETE', url: `${url(done)}?was=${encodeURIComponent('다른 글')}` })).statusCode).toBe(409)
    expect((await app.inject({ method: 'PATCH', url: url(status), payload: { text: '바꾼 상태', was: status.text } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'DELETE', url: `${url(status)}?was=${encodeURIComponent(status.text)}` })).statusCode).toBe(400)
    expect(fs.readFileSync(log, 'utf8')).toBe(before)
    expect((await app.inject({ method: 'DELETE', url: `${url(done)}?was=${encodeURIComponent(text)}` })).statusCode).toBe(200)
    expect(fs.readFileSync(log, 'utf8')).toBe(before.replace(`## ${done.time} · 완료 · ${done.target}\n${text}\n\n`, ''))
    const remaining = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    expect(remaining.find((e) => e.kind === 'todo' && e.text === text)?.done).toBe(true)
    expect(remaining.some((e) => e.kind === 'done' && e.text === text)).toBe(false)
  })

  it('상태 기록을 손으로 남기거나 없는 블록에 붙이는 것은 거부한다', async () => {
    expect((await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'status', text: 'x' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'done', text: 'x' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'memo', target: 'ghost', text: 'x' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: 'docs/ghost.tex', text: 'x' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: '../x.tex', text: 'x' } })).statusCode).toBe(400)
  })

  it('노트 파일(.tex)에 할 일을 붙인다', async () => {
    const file = 'workbench/blocks/kempe-chains.tex'
    const todo = (await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: file, text: '유일성 확인하기' } })).json().entry
    expect(todo).toMatchObject({ kind: 'todo', target: file })
    const entries = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries
    expect(entries.some((e: { target: string; text: string }) => e.target === file && e.text === '유일성 확인하기')).toBe(true)
  })

  it('Markdown 노트 파일에도 할 일을 붙인다', async () => {
    const file = 'workbench/notes/journal-markdown/note.md'
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
    fs.writeFileSync(path.join(repo, file), '# Markdown 노트\n\n원문은 그대로 둔다.\n')
    const res = await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: file, text: 'Markdown 노트 확인하기' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().entry).toMatchObject({ kind: 'todo', target: file, done: false })
    expect(fs.readFileSync(path.join(repo, file), 'utf8')).toBe('# Markdown 노트\n\n원문은 그대로 둔다.\n')
    expect((await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'todo', target: 'workbench/notes/absent/note.md', text: '없는 노트' } })).statusCode).toBe(400)
  })

  it('노트 기록에 할 일을 더하면 일지에 연결하고 기록의 완료·대기를 일지에도 반영한다', async () => {
    const source = 'workbench/notes/journal-markdown/note.md'
    const url = `${R}/comments/note-journal-forward`
    const added = await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '일지 연결 노트', source, text: '앞줄을 확인하고\n다음 줄도 확인하기' } })
    expect(added.statusCode).toBe(200)
    const { entry: record, hash } = added.json()
    const journals = () => app.inject({ method: 'GET', url: `${R}/journal` }).then((r) => r.json().entries as JournalEntry[])
    const linked = (await journals()).find((e) => e.kind === 'todo' && e.target === source && e.text === '앞줄을 확인하고 다음 줄도 확인하기')!
    expect(record).toMatchObject({ kind: '할 일', state: '대기', journal: `${linked.date} ${linked.time}` })
    expect(linked.done).toBe(false)

    const done = await app.inject({ method: 'PATCH', url: `${url}/${record.id}`, payload: { state: '끝냄', baseHash: hash } })
    expect(done.statusCode).toBe(200)
    expect((await journals()).find((e) => e.date === linked.date && e.index === linked.index)?.done).toBe(true)
    expect((await journals()).filter((e) => e.kind === 'done' && e.target === source && e.text === linked.text)).toHaveLength(1)
    const again = await app.inject({ method: 'PATCH', url: `${url}/${record.id}`, payload: { state: '끝냄', baseHash: done.json().hash } })
    expect(again.statusCode).toBe(200)
    const reopened = await app.inject({ method: 'PATCH', url: `${url}/${record.id}`, payload: { state: '대기', baseHash: again.json().hash } })
    expect(reopened.statusCode).toBe(200)
    expect((await journals()).find((e) => e.date === linked.date && e.index === linked.index)?.done).toBe(false)
    expect((await journals()).filter((e) => e.kind === 'done' && e.target === source && e.text === linked.text)).toHaveLength(1)
  })

  it('일지에서 보조 노트 할 일을 끝내거나 다시 열면 연결된 기록 상태도 바뀐다', async () => {
    const url = `${R}/comments/block-kempe-chains`
    const added = await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '보조 노트', source: 'kempe-chains', text: '일지에서 끝낼 보조 노트 할 일' } })
    expect(added.statusCode).toBe(200)
    const record = added.json().entry
    const journals = () => app.inject({ method: 'GET', url: `${R}/journal` }).then((r) => r.json().entries as JournalEntry[])
    const linked = (await journals()).find((e) => e.kind === 'todo' && e.target === 'kempe-chains' && e.text === record.body)!
    const journalUrl = `${R}/journal/${linked.date}/${linked.index}`
    expect((await app.inject({ method: 'PATCH', url: journalUrl, payload: { done: true, was: linked.text, link: linked.link } })).statusCode).toBe(200)
    const getState = () => app.inject({ method: 'GET', url }).then((r) => r.json().comments.find((c: { id: string }) => c.id === record.id).state)
    expect(await getState()).toBe('끝냄')
    expect((await journals()).filter((e) => e.kind === 'done' && e.text === record.body)).toHaveLength(1)
    expect((await app.inject({ method: 'PATCH', url: journalUrl, payload: { done: false, was: linked.text, link: linked.link } })).statusCode).toBe(200)
    expect(await getState()).toBe('대기')
    expect((await journals()).filter((e) => e.kind === 'done' && e.text === record.body)).toHaveLength(1)
  })

  it.each([409, 422])('기록 동기화가 실패하면 일지 완료도 저장하지 않고 실패를 반환한다 (%i)', async (status) => {
    const target = 'block-kempe-chains'
    const url = `${R}/comments/${target}`
    const added = (await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '보조 노트', text: `기록 동기화 실패 검증 ${status}` } })).json()
    const file = path.join(repo, 'workbench/comments', `${target}.md`)
    const before = fs.readFileSync(file, 'utf8')
    const outside = '\n<!-- 바깥에서 덧붙인 기록 -->\n'
    const originalSet = comments.updateComment
    let failure: unknown
    const sync = vi.spyOn(comments, 'updateComment').mockImplementationOnce((...args) => {
      try {
        if (status === 422) throw new WorkbenchError(422, '기록 동기화 검증 실패')
        // 목록을 읽은 뒤 파일이 바뀌어 실제 rewrite 해시 검사에서 409가 나게 한다.
        fs.appendFileSync(file, outside)
        return originalSet(...args)
      } catch (error) {
        failure = error
        throw error
      }
    })
    try {
      const [date] = added.entry.journal.split(' ')
      const result = await app.inject({ method: 'PATCH', url: `${R}/journal/${date}/${added.entry.journalIndex}`, payload: { done: true, was: added.entry.body, link: `block-kempe-chains/${added.entry.id}` } })
      expect(sync).toHaveBeenCalledOnce()
      expect(failure).toMatchObject({ status })
      expect(result.statusCode).toBe(status)
      const journals = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
      expect(journals.find((e) => e.kind === 'todo' && e.text === added.entry.body)?.done).toBe(false)
      expect(journals.filter((e) => e.kind === 'done' && e.text === added.entry.body)).toHaveLength(0)
      expect(fs.readFileSync(file, 'utf8')).toBe(status === 409 ? before + outside : before)
      expect((await app.inject({ method: 'GET', url })).json().comments.find((c: { id: string }) => c.id === added.entry.id).state).toBe('대기')
    } finally {
      sync.mockRestore()
    }
  })

  it('바깥에서 기록이 바뀌면 오래된 해시의 완료 요청은 일지도 건드리지 않는다', async () => {
    const url = `${R}/comments/block-kempe-chains`
    const added = (await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '보조 노트', text: '오래된 해시 검증용 할 일' } })).json()
    const fresh = (await app.inject({ method: 'POST', url, payload: { kind: '메모', title: '보조 노트', text: '바깥의 새 기록' } })).json()
    const before = (await app.inject({ method: 'GET', url: `${R}/journal` })).json()
    const res = await app.inject({ method: 'PATCH', url: `${url}/${added.entry.id}`, payload: { state: '끝냄', baseHash: added.hash } })
    expect(res.statusCode).toBe(409)
    expect(res.json().currentHash).toBe(fresh.hash)
    expect((await app.inject({ method: 'GET', url: `${R}/journal` })).json()).toEqual(before)
  })

  it('같은 분에 같은 할 일을 두 번 적어도 일지 인덱스로 구분한다', async () => {
    const url = `${R}/comments/block-kempe-chains`
    const payload = { kind: '할 일', title: '보조 노트', text: '같은 분에 중복된 할 일' }
    const first = (await app.inject({ method: 'POST', url, payload })).json()
    const second = (await app.inject({ method: 'POST', url, payload })).json()
    expect(first.entry.journalIndex).not.toBe(second.entry.journalIndex)
    expect((await app.inject({ method: 'PATCH', url: `${url}/${second.entry.id}`, payload: { state: '끝냄', baseHash: second.hash } })).statusCode).toBe(200)
    const journals = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    expect(journals.find((e) => e.kind === 'todo' && e.index === first.entry.journalIndex)).toMatchObject({ done: false, text: payload.text })
    expect(journals.find((e) => e.kind === 'todo' && e.index === second.entry.journalIndex)).toMatchObject({ done: true, text: payload.text })
    const [date] = first.entry.journal.split(' ')
    expect((await app.inject({ method: 'PATCH', url: `${R}/journal/${date}/${first.entry.journalIndex}`, payload: { done: true, was: payload.text, link: `block-kempe-chains/${first.entry.id}` } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url })).json().comments.find((c: { id: string }) => c.id === first.entry.id).state).toBe('끝냄')
  })

  it('같은 분의 중복 일지를 지우면 그 기록만 지우고 남은 연결의 상태를 바꾼다', async () => {
    const url = `${R}/comments/block-kempe-chains`
    const payload = { kind: '할 일', title: '보조 노트', text: '중복 연결 삭제 검증용 할 일' }
    const first = (await app.inject({ method: 'POST', url, payload })).json()
    const second = (await app.inject({ method: 'POST', url, payload })).json()
    const [date] = first.entry.journal.split(' ')
    expect((await app.inject({ method: 'DELETE', url: `${R}/journal/${date}/${first.entry.journalIndex}?was=${encodeURIComponent(payload.text)}&link=${encodeURIComponent(`block-kempe-chains/${first.entry.id}`)}` })).statusCode).toBe(200)
    const current = (await app.inject({ method: 'GET', url })).json()
    expect(current.comments.find((c: { id: string }) => c.id === first.entry.id)).toBeUndefined()
    const journals = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    const remaining = journals.find((e) => e.kind === 'todo' && e.text === payload.text)!
    expect(remaining).toMatchObject({ index: first.entry.journalIndex, done: false })
    expect((await app.inject({ method: 'PATCH', url: `${R}/journal/${date}/${remaining.index}`, payload: { done: true, was: payload.text, link: remaining.link } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url })).json().comments.find((c: { id: string }) => c.id === second.entry.id).state).toBe('끝냄')
  })

  it('일지 앞 항목을 지워 인덱스가 달라져도 유일한 연결이면 상태를 함께 바꾼다', async () => {
    const memo = (await app.inject({ method: 'POST', url: `${R}/journal`, payload: { kind: 'memo', text: '인덱스를 바꿀 앞 메모' } })).json().entry
    const url = `${R}/comments/block-kempe-chains`
    const added = (await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '보조 노트', text: '인덱스가 달라질 할 일' } })).json()
    expect((await app.inject({ method: 'DELETE', url: `${R}/journal/${memo.date}/${memo.index}?was=${encodeURIComponent(memo.text)}` })).statusCode).toBe(200)
    const journals = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    const linked = journals.find((e) => e.kind === 'todo' && e.text === added.entry.body)!
    expect(linked.index).not.toBe(added.entry.journalIndex)
    expect((await app.inject({ method: 'PATCH', url: `${R}/journal/${linked.date}/${linked.index}`, payload: { done: true, was: linked.text, link: linked.link } })).statusCode).toBe(200)
    const current = (await app.inject({ method: 'GET', url })).json()
    expect(current.comments.find((c: { id: string }) => c.id === added.entry.id).state).toBe('끝냄')
    expect((await app.inject({ method: 'PATCH', url: `${url}/${added.entry.id}`, payload: { state: '대기', baseHash: current.hash } })).statusCode).toBe(200)
    expect(((await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]).find((e) => e.kind === 'todo' && e.text === linked.text)?.done).toBe(false)
  })

  it('일지 글을 바깥에서 고치거나 지웠으면 연결 상태를 잘못된 항목에 쓰지 않는다', async () => {
    const url = `${R}/comments/block-kempe-chains`
    const added = (await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '보조 노트', text: '연결 일지를 고칠 할 일' } })).json()
    const all = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    const linked = all.find((e) => e.kind === 'todo' && e.text === added.entry.body)!
    const journalUrl = `${R}/journal/${linked.date}/${linked.index}`
    const wb = new Workbench(path.join(repo, 'workbench'))
    wb.editJournal(linked.date, linked.index, linked.text, '일지에서 바뀐 글')
    const done = await app.inject({ method: 'PATCH', url: `${url}/${added.entry.id}`, payload: { state: '끝냄', baseHash: added.hash } })
    expect(done.statusCode).toBe(200)
    const changed = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries as JournalEntry[]
    expect(changed.find((e) => e.date === linked.date && e.index === linked.index)).toMatchObject({ done: false, text: '일지에서 바뀐 글' })
    expect(changed.filter((e) => e.kind === 'done' && e.text === linked.text)).toHaveLength(0)
    const reopened = await app.inject({ method: 'PATCH', url: `${url}/${added.entry.id}`, payload: { state: '대기', baseHash: done.json().hash } })
    expect(reopened.statusCode).toBe(200)
    expect((await app.inject({ method: 'PATCH', url: journalUrl, payload: { done: true, was: '일지에서 바뀐 글', link: linked.link } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'GET', url })).json().comments.find((c: { id: string }) => c.id === added.entry.id).state).toBe('대기')
    wb.editJournal(linked.date, linked.index, '일지에서 바뀐 글', null)
    const beforeMissing = (await app.inject({ method: 'GET', url: `${R}/journal` })).json()
    expect((await app.inject({ method: 'PATCH', url: `${url}/${added.entry.id}`, payload: { state: '끝냄', baseHash: reopened.json().hash } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `${R}/journal` })).json()).toEqual(beforeMissing)
  })
})

describe('파일 감시', () => {
  it('바깥에서 블록을 고치면 새 내용의 해시와 함께 알린다', async () => {
    const root = path.join(repo, 'workbench')
    const events: WorkbenchEvent[] = []
    const w = watchWorkbench('sample-research', root, (e) => events.push(e))
    await new Promise<void>((r) => w.on('ready', () => r()))
    fs.appendFileSync(path.join(root, 'blocks/broken-example.tex'), '% 감시 확인\n')
    fs.writeFileSync(path.join(root, '.build-ignored.tex'), 'x') // 숨김 파일은 무시
    const deadline = Date.now() + 5000
    while (!events.some((e) => e.type === 'block') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    await w.close()
    const ev = events.find((e) => e.type === 'block')
    expect(ev).toMatchObject({ type: 'block', research: 'sample-research', id: 'broken-example' })
    const { hash } = (await app.inject({ method: 'GET', url: `${R}/blocks/broken-example` })).json()
    expect(ev && 'hash' in ev ? ev.hash : null).toBe(hash)
  }, 10_000)

  it('바깥에서 노트를 고치면 저장소 기준 경로와 해시로 알린다', async () => {
    const root = path.join(repo, 'workbench')
    const file = path.join(root, 'notes/watch-check/note.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '# 감시\n')
    const events: WorkbenchEvent[] = []
    const w = watchWorkbench('sample-research', root, (e) => events.push(e))
    await new Promise<void>((r) => w.on('ready', () => r()))
    fs.appendFileSync(file, '에이전트가 더한 줄\n')
    const deadline = Date.now() + 5000
    while (!events.some((e) => e.type === 'note') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    await w.close()
    expect(events.find((e) => e.type === 'note')).toEqual({ type: 'note', research: 'sample-research', file: 'workbench/notes/watch-check/note.md', hash: hashOf('# 감시\n에이전트가 더한 줄\n') })
    fs.rmSync(path.dirname(file), { recursive: true })
  }, 10_000)
})

describe('서식 라이브러리', () => {
  const templates = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/research-library')

  it('등록 창에 라이브러리 서식과 저장소 안 서식 후보가 나오고, 고른 순서대로 서식을 만든다', async () => {
    const lib = path.join(tmp, 'research-library')
    fs.cpSync(templates, lib, { recursive: true })
    app.registry.setLibrary(lib)
    const listed = (await app.inject({ method: 'GET', url: '/api/library' })).json()
    expect(listed.preambles.map((p: { name: string; place: string }) => `${p.place}:${p.name}`)).toEqual(['first:base', 'last:notation', 'last:theorems'])

    // statements/ 폴더의 자기 서식에서 \Tr와 lemma를 이미 정의한 연구
    const alpha = path.join(tmp, 'alpha-like')
    fs.mkdirSync(path.join(alpha, '.git'), { recursive: true })
    fs.mkdirSync(path.join(alpha, 'statements'))
    fs.writeFileSync(path.join(alpha, 'statements/preamble.tex'), [
      '\\usepackage{amsmath,amssymb,amsthm}',
      '\\newtheorem*{lemma}{Lemma}',
      '\\newcommand{\\Tr}{\\operatorname{Tr}}',
      '\\newcommand{\\ICS}{\\Sigma}',
      '',
    ].join('\n'))
    const ins = (await app.inject({ method: 'POST', url: '/api/researches/inspect', payload: { path: alpha } })).json()
    expect(ins.repoPreambles).toEqual(['statements/preamble.tex'])

    const reg = await app.inject({ method: 'POST', url: '/api/researches', payload: {
      path: alpha, createWorkbench: true, title: 'Alpha 같은 연구',
      libraryPreambles: ['base', 'theorems', 'notation'], repoPreambles: ['statements/preamble.tex'],
    } })
    expect(reg.statusCode).toBe(200)
    const preamble = fs.readFileSync(path.join(alpha, 'workbench/preamble.tex'), 'utf8')
    const at = (s: string) => preamble.indexOf(s)
    expect(at('\\input{preamble/base.tex}')).toBeGreaterThan(-1)
    expect(at('\\input{preamble/base.tex}')).toBeLessThan(at('\\input{../statements/preamble.tex}'))
    expect(at('\\input{../statements/preamble.tex}')).toBeLessThan(at('\\input{preamble/notation.tex}'))
    expect(at('\\input{../statements/preamble.tex}')).toBeLessThan(at('\\input{preamble/theorems.tex}'))
  })

  it('없는 라이브러리 서식이나 저장소 밖 서식은 거부한다', async () => {
    const other = makeRepo('reject-me', false)
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: other, createWorkbench: true, libraryPreambles: ['ghost'] } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: other, createWorkbench: true, repoPreambles: ['../../etc/passwd'] } })).statusCode).toBe(400)
    expect(fs.existsSync(path.join(other, 'workbench'))).toBe(false)
  })

  it.skipIf(!hasLatex)('저장소 서식과 라이브러리가 같은 기호·환경을 정의해도 충돌 없이 컴파일된다 (저장소 쪽이 이긴다)', async () => {
    const rid = 'alpha-like'
    const b = (await app.inject({ method: 'POST', url: `/api/researches/${rid}/blocks`, payload: { title: 'Library check', id: 'lib-check' } })).json()
    const content = `${b.content}\\begin{lemma}한글 보조정리: $\\Tr \\rho = 1$, $\\ket{\\psi}\\bra{\\phi}$, $\\proj{0}$, $\\ICS$\\end{lemma}\n\\begin{theorem}번호 있는 정리.\\end{theorem}\n`
    expect((await app.inject({ method: 'PUT', url: `/api/researches/${rid}/blocks/lib-check`, payload: { content, baseHash: b.hash } })).statusCode).toBe(200)
    const compiled = (await app.inject({ method: 'POST', url: `/api/researches/${rid}/blocks/lib-check/compile` })).json()
    expect(compiled.problems).toEqual([])
    expect(compiled.ok).toBe(true)
  }, 60_000)

  it.skipIf(!hasLatex)('개념노트를 라이브러리 서식으로 컴파일해 PDF를 내준다 (라이브러리 저장소에는 아무것도 남기지 않는다)', async () => {
    const c = (await app.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: 'Compile check', format: 'tex' } })).json()
    expect((await app.inject({ method: 'GET', url: `/api/library/notes/concept/${c.id}/pdf` })).statusCode).toBe(404)
    const compiled = (await app.inject({ method: 'POST', url: `/api/library/notes/concept/${c.id}/compile` })).json()
    expect(compiled.problems).toEqual([])
    expect(compiled).toMatchObject({ ok: true, hasPdf: true })
    const pdf = await app.inject({ method: 'GET', url: `/api/library/notes/concept/${c.id}/pdf` })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toContain('application/pdf')
    const lib = (await app.inject({ method: 'GET', url: '/api/library' })).json().path as string
    expect(fs.readdirSync(path.join(lib, 'concepts')).filter((f) => !f.endsWith('.tex'))).toEqual([])
  }, 60_000)

  it.skipIf(!hasLatex)('개념노트의 \\cite는 라이브러리 references.bib에서 찾아 끝에 참고문헌으로 붙인다', async () => {
    const lib = (await app.inject({ method: 'GET', url: '/api/library' })).json().path as string
    fs.writeFileSync(path.join(lib, 'references.bib'), '@article{exampleDischargingRules2022, title={Discharging rules for planar graphs of minimum degree five}, author={Example, Ada E. and Sample, Bea}, journal={J. Example Comb.}, volume={128}, pages={176402}, year={2022}}\n')
    const c = (await app.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: 'Cite check', format: 'tex' } })).json()
    const n = (await app.inject({ method: 'GET', url: `/api/library/notes/concept/${c.id}` })).json()
    const content = `${n.content}\n출처: \\cite{exampleDischargingRules2022}.\n`
    expect((await app.inject({ method: 'PUT', url: `/api/library/notes/concept/${c.id}`, payload: { content, baseHash: n.hash } })).statusCode).toBe(200)
    const compiled = (await app.inject({ method: 'POST', url: `/api/library/notes/concept/${c.id}/compile` })).json()
    expect(compiled.problems).toEqual([])
    expect(compiled).toMatchObject({ ok: true, hasPdf: true, warnings: [] })
    const cfg = path.join(tmp, 'config')
    const bbl = fs.readFileSync(path.join(cfg, 'library-build', `concept-${c.id}`, 'main.bbl'), 'utf8')
    expect(bbl).toContain('Discharging rules')
  }, 90_000)
})

describe.skipIf(!hasLatex)('컴파일과 위치 이동', () => {
  it('컴파일하면 PDF가 생기고, 원고 줄 ↔ PDF 위치가 서로 맞는다', async () => {
    const compiled = (await app.inject({ method: 'POST', url: `${R}/blocks/kempe-chains/compile` })).json()
    expect(compiled).toMatchObject({ ok: true, hasPdf: true })
    const lines = block('kempe-chains').split('\n')
    const eqLine = lines.findIndex((l) => l.includes('\\kc{1}{3}{v_1}')) + 1
    const view = (await app.inject({ method: 'GET', url: `${R}/blocks/kempe-chains/synctex/view?line=${eqLine}` })).json()
    const box = view.boxes[0]
    const edit = (await app.inject({ method: 'GET', url: `${R}/blocks/kempe-chains/synctex/edit?page=${box.page}&x=${box.h + box.width / 2}&y=${box.v - box.height / 2}` })).json()
    expect(edit.spot.inBlock).toBe(true)
    expect(Math.abs(edit.spot.line - eqLine)).toBeLessThanOrEqual(1)
  }, 60_000)

  it('참조가 없는 새 블록도 첫 컴파일에 성공으로 판정한다', async () => {
    const b = (await app.inject({ method: 'POST', url: `${R}/blocks`, payload: { title: 'Plain first compile', id: 'plain-first' } })).json()
    await app.inject({ method: 'PUT', url: `${R}/blocks/plain-first`, payload: { content: `${b.content}참조 없는 문장.\n`, baseHash: b.hash } })
    const compiled = (await app.inject({ method: 'POST', url: `${R}/blocks/plain-first/compile` })).json()
    expect(compiled).toMatchObject({ ok: true, hasPdf: true, problems: [] })
  }, 60_000)

  it('오류가 있으면 블록 파일의 줄 번호로 알려 주고, PDF는 가능한 만큼 만든다', async () => {
    const compiled = (await app.inject({ method: 'POST', url: `${R}/blocks/broken-example/compile` })).json()
    const badLine = block('broken-example').split('\n').findIndex((l) => l.includes('\\undefinedmacro')) + 1
    expect(compiled.ok).toBe(false)
    expect(compiled.problems).toContainEqual(expect.objectContaining({ file: 'blocks/broken-example.tex', line: badLine, inBlock: true }))
    expect(compiled.hasPdf).toBe(true)
    // 고치지 않고 다시 컴파일해도 오류는 그대로 오류다
    const again = (await app.inject({ method: 'POST', url: `${R}/blocks/broken-example/compile` })).json()
    expect(again.ok).toBe(false)
    expect(again.problems).toContainEqual(expect.objectContaining({ line: badLine, inBlock: true }))
  }, 120_000)
})


describe('화면 설정', () => {
  it('바꾼 항목만 합쳐 config.yaml에 남기고, 고를 수 없는 값은 무시한다', async () => {
    const configDir = path.join(tmp, 'config-ui')
    const a = buildApp({ configDir })
    expect((await a.inject({ method: 'GET', url: '/api/settings' })).json().ui).toMatchObject({ theme: 'system', fontSize: 'normal', editorSize: 12.5 })
    const put = await a.inject({ method: 'PUT', url: '/api/settings', payload: { ui: { theme: 'dark', editorSize: 14, accent: 'neon', density: 'compact' } } })
    expect(put.json().ui).toMatchObject({ theme: 'dark', editorSize: 14, accent: 'mono', density: 'compact', fontSize: 'normal' })
    await a.close()

    // 다시 켜도 남아 있다
    const b = buildApp({ configDir })
    expect((await b.inject({ method: 'GET', url: '/api/settings' })).json().ui).toMatchObject({ theme: 'dark', editorSize: 14, density: 'compact' })
    expect(fs.readFileSync(path.join(configDir, 'config.yaml'), 'utf8')).toMatch(/ui:\n(?:\s+\w+: .*\n)*?\s+theme: dark/)
    await b.close()
  })
})

describe('컴파일 성공 판단', () => {
  const err = { file: 'blocks/x.tex', line: 3, message: 'Undefined control sequence.', inBlock: true }
  it('새 PDF를 쓰고 오류가 없으면 성공 (latexmk가 max_repeat로 실패 코드를 내도)', () => {
    expect(judgeCompile({ hasPdf: true, fresh: true, exitCode: 12, problems: [] })).toEqual({ ok: true, problems: [] })
  })
  it('원고가 그대로라 latexmk가 건너뛰고 정상 종료하면, 있는 PDF가 최신이므로 성공', () => {
    expect(judgeCompile({ hasPdf: true, fresh: false, exitCode: 0, problems: [] })).toEqual({ ok: true, problems: [] })
  })
  it('PDF를 새로 쓰지 못하고 실패 코드면 실패로 알린다', () => {
    const r = judgeCompile({ hasPdf: true, fresh: false, exitCode: 12, problems: [] })
    expect(r.ok).toBe(false)
    expect(r.problems[0]!.message).toMatch(/PDF를 새로 만들지 못했습니다/)
    expect(judgeCompile({ hasPdf: false, fresh: false, exitCode: -1, problems: [] }).problems[0]!.message).toMatch(/latexmk를 실행하지 못했습니다/)
  })
  it('LaTeX 오류가 있으면 PDF가 있어도 실패이고 오류를 그대로 돌려준다', () => {
    expect(judgeCompile({ hasPdf: true, fresh: false, exitCode: 0, problems: [err] })).toEqual({ ok: false, problems: [err] })
  })
})
