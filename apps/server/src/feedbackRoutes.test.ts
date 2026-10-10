// 앱 피드백: 남기기, 고치기, GitHub에 올리기
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { buildApp } from './app.js'
import { addFeedbackComment, editFeedbackNote, readFeedbackComments, readFeedbackReviews, setFeedbackReview } from './feedback.js'
import { fixture, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('앱 피드백', () => {
  it('부위·종류·화면 정보와 함께 날짜 파일에 쌓이고, 최근 것부터 읽힌다', async () => {
    const dir = path.join(tmp, 'feedback')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb'), feedbackDir: dir, appVersion: '1f48fb4' })
    const post = (body: object) => fb.inject({ method: 'POST', url: '/api/feedback', payload: body })
    expect((await post({ kind: '디자인', target: '블록 › 속성 표 › 다른 시도', text: '칩이 너무 작다\n둘째 줄', route: '#/r/x/b/y', note: 'Beta › Paper overview (workbench/notes/introduction/note.md)', snippet: '강한 부가법칙', viewport: '1440×900', theme: '라이트' })).statusCode).toBe(200)
    expect((await post({ kind: '버그', target: '사이드바', text: '- 목록도\n- 된다' })).statusCode).toBe(200)
    expect((await post({ kind: '엉뚱함', target: 'x', text: 'y' })).statusCode).toBe(400)
    expect((await post({ kind: '질문', target: 'x', text: '   ' })).statusCode).toBe(400)

    const file = fs.readdirSync(dir)[0]!
    const md = fs.readFileSync(path.join(dir, file), 'utf8')
    expect(md).toMatch(/## \d{2}:\d{2} · 디자인 · 블록 › 속성 표 › 다른 시도\n- 화면: #\/r\/x\/b\/y\n- 노트: Beta › Paper overview \(workbench\/notes\/introduction\/note\.md\)\n- 가리킨 글자: 강한 부가법칙\n- 창: 1440×900 · 라이트\n- 앱 버전: 1f48fb4\n\n칩이 너무 작다\n둘째 줄\n/)

    const list = (await fb.inject({ method: 'GET', url: '/api/feedback' })).json()
    expect(list.enabled).toBe(true)
    expect(list.entries.map((e: { kind: string }) => e.kind)).toEqual(['버그', '디자인'])
    expect(list.entries[0].text).toBe('- 목록도\n- 된다')
    expect(list.entries[1]).toMatchObject({ target: '블록 › 속성 표 › 다른 시도', note: 'Beta › Paper overview (workbench/notes/introduction/note.md)', snippet: '강한 부가법칙', text: '칩이 너무 작다\n둘째 줄' })
    await fb.close()
  })

  it('화면 그림을 함께 보내면 pictures/에 파일로 두고 항목에는 경로만 적는다', async () => {
    const dir = path.join(tmp, 'feedback-pic')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-pic'), feedbackDir: dir })
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const post = (image: string) => fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '디자인', target: '사이드바', text: '이상하다', image } })
    expect((await post(`data:image/jpeg;base64,${jpeg.toString('base64')}`)).statusCode).toBe(200)
    expect((await post('data:text/html;base64,PGI+')).statusCode).toBe(200)

    const pics = fs.readdirSync(path.join(dir, 'pictures'))
    expect(pics).toHaveLength(1)
    expect(fs.readFileSync(path.join(dir, 'pictures', pics[0]!))).toEqual(jpeg)
    const md = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.md'))!), 'utf8')
    expect(md).toContain(`- 그림: pictures/${pics[0]}\n\n이상하다`)
    expect(md).not.toContain('base64')
    const list = (await fb.inject({ method: 'GET', url: '/api/feedback' })).json()
    expect(list.entries.map((e: { picture?: string }) => e.picture)).toEqual([undefined, `pictures/${pics[0]}`])
    await fb.close()
  })

  it('모든 날짜를 최근 것부터 모으고, status.yaml의 처리 기록을 붙인다', async () => {
    const dir = path.join(tmp, 'feedback-all')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, '2026-09-30.md'), '# 피드백 2026-09-30\n\n## 10:00 · 질문 · 홈\n\n왜?\n\n## 11:00 · 버그 · 사이드바\n- 화면: #/\n\n안 열림\n')
    fs.writeFileSync(path.join(dir, '2026-10-01.md'), '# 피드백 2026-10-01\n\n## 09:00 · 디자인 · 홈 › 제목\n\n- 필요해?\n- 둘째\n\n## 09:00 · 디자인 · 홈 › 제목\n\n같은 분에 또\n')
    fs.writeFileSync(path.join(dir, 'status.yaml'), [
      '"2026-10-01 09:00 홈 › 제목":', '  state: 반영', '  commit: 1bd6963', '  note: 뺐다', '  theme: 디자인', '  clean: 필요해?', '  understood: 제목을 뺀다', '  cause: 머리줄이 두 줄',
      '"2026-09-30 10:00 홈":', '  state: 답변', '  note: 이래서',
      '"2026-09-30 11:00 사이드바":', '  state: 엉뚱함',
      '"2026-10-01 09:00 홈 › 제목 #2":', '  state: 보류',
    ].join('\n'))
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-all'), feedbackDir: dir })
    const { entries } = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json()
    expect(entries.map((e: { date: string; time: string }) => `${e.date} ${e.time}`)).toEqual(['2026-10-01 09:00', '2026-10-01 09:00', '2026-09-30 11:00', '2026-09-30 10:00'])
    expect(entries[0]).toMatchObject({ text: '같은 분에 또', status: { state: '보류' } }) // 같은 키의 두 번째는 #2
    expect(entries[1]).toMatchObject({ text: '- 필요해?\n- 둘째', status: { state: '반영', commit: '1bd6963', note: '뺐다', theme: '디자인', clean: '필요해?', understood: '제목을 뺀다', cause: '머리줄이 두 줄' } })
    expect(entries[2].status).toBeUndefined() // 고를 수 없는 상태는 대기로 본다
    expect(entries[2].route).toBe('#/')
    expect(entries[3].status).toEqual({ state: '답변', note: '이래서' })

    // 고치기: 같은 키의 두 번째만 바뀌고 머리줄·화면 정보는 그대로
    const patch = (body: object) => fb.inject({ method: 'PATCH', url: '/api/feedback', payload: body })
    expect((await patch({ date: '2026-10-01', time: '09:00', target: '홈 › 제목', n: 2, text: '- 고친 글\n- 둘째' })).statusCode).toBe(200)
    expect((await patch({ date: '2026-09-30', time: '11:00', target: '사이드바', text: '고침' })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(dir, '2026-09-30.md'), 'utf8')).toContain('## 11:00 · 버그 · 사이드바\n- 화면: #/\n\n고침\n')
    expect((await patch({ date: '2026-09-30', time: '12:00', target: '없음', text: 'x' })).statusCode).toBe(404)
    expect((await patch({ date: '../x', time: '09:00', target: '홈', text: 'x' })).statusCode).toBe(404)
    // 지우기
    expect((await patch({ date: '2026-09-30', time: '10:00', target: '홈', text: null })).statusCode).toBe(200)
    const after = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().entries
    expect(after.map((e: { text: string }) => e.text)).toEqual(['- 고친 글\n- 둘째', '- 필요해?\n- 둘째', '고침'])
    expect((await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().statusError).toBeNull()
    // 깨진 status.yaml은 조용히 무시하지 않고 알린다
    fs.writeFileSync(path.join(dir, 'status.yaml'), '"a":\n  note: x (y): z\n')
    expect((await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().statusError).toMatch(/./)
    await fb.close()
  })

  it('같은 지적을 합치면 최신 대표 항목 아래에 원래 코멘트가 원문 그대로 붙는다', async () => {
    const dir = path.join(tmp, 'feedback-merge')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, '2026-10-01.md'), '# 피드백 2026-10-01\n\n## 19:37 · 디자인 · 설정\n\n아이콘을 바꿔\n')
    fs.writeFileSync(path.join(dir, '2026-10-02.md'), '# 피드백 2026-10-02\n\n## 23:10 · 디자인 · 설정\n\n다시 생각해 봐\n\n## 23:11 · 질문 · 홈\n\n왜?\n')
    fs.writeFileSync(path.join(dir, 'status.yaml'), [
      '"2026-10-02 23:10 설정":', '  state: 반영', '  note: 톱니바퀴',
      '"2026-10-01 19:37 설정":', '  state: 반영', '  merged_into: "2026-10-02 23:10 설정"',
      '"2026-10-02 23:11 홈":', '  state: 답변', '  merged_into: "없는 키"',
    ].join('\n'))
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-merge'), feedbackDir: dir })
    const { entries } = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json()
    expect(entries.map((e: { time: string }) => e.time)).toEqual(['23:11', '23:10']) // 대표가 없으면 그대로 둔다
    expect(entries[1].merged).toEqual([{ date: '2026-10-01', time: '19:37', kind: '디자인', target: '설정', text: '아이콘을 바꿔', n: 1 }])
    expect(fs.readFileSync(path.join(dir, '2026-10-01.md'), 'utf8')).toContain('아이콘을 바꿔') // 원문은 그대로
    await fb.close()
  })

  it('미리보기 댓글(preview/날짜.md)도 시각순으로 섞여 보이고, 처리 기록 키 앞에 "미리보기"가 붙는다', async () => {
    const dir = path.join(tmp, 'feedback-preview')
    fs.mkdirSync(path.join(dir, 'preview'), { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-10-03.md'), '# 피드백 2026-10-03\n\n## 13:51 · 디자인 · 프로젝트 정보\n\n따로 두자\n\n## 15:00 · 디자인 · 홈\n\n달력\n')
    fs.writeFileSync(path.join(dir, 'preview', '2026-10-03.md'), '# 미리보기 댓글\n\n설명\n\n## 14:47 · 디자인 · 프로젝트 정보\n- 가리킨 글자: 프로젝트 정보\n\n사이드바에 두자\n')
    fs.writeFileSync(path.join(dir, 'status.yaml'), [
      '"미리보기 2026-10-03 14:47 프로젝트 정보":', '  state: 반영', '  area: 프로젝트 정보',
      '"2026-10-03 13:51 프로젝트 정보":', '  state: 반영', '  merged_into: "미리보기 2026-10-03 14:47 프로젝트 정보"',
    ].join('\n'))
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-preview'), feedbackDir: dir })
    const { entries } = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json()
    expect(entries.map((e: { time: string; source?: string }) => `${e.time} ${e.source ?? '맥'}`)).toEqual(['15:00 맥', '14:47 미리보기'])
    expect(entries[1].status).toMatchObject({ state: '반영', area: '프로젝트 정보' })
    expect(entries[1].snippet).toBe('프로젝트 정보')
    expect(entries[1].merged).toEqual([{ date: '2026-10-03', time: '13:51', kind: '디자인', target: '프로젝트 정보', text: '따로 두자', n: 1 }])
    await fb.close()
  })
})

describe('피드백 올리기', () => {
  it('피드백 폴더만 커밋해 원격에 올리고, 다른 변경과 원격의 새 커밋은 건드리지 않는다', async () => {
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env }).toString().trim()
    const remote = path.join(tmp, 'fb-remote.git')
    const local = path.join(tmp, 'fb-local')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    execFileSync('git', ['clone', '-q', remote, local])
    fs.writeFileSync(path.join(local, 'code.ts'), 'a\n')
    g(local, 'add', '.'); g(local, 'commit', '-qm', 'init'); g(local, 'push', '-q', '-u', 'origin', 'main')
    g(local, 'config', 'user.name', 't'); g(local, 'config', 'user.email', 't@t')

    const dir = path.join(local, 'feedback')
    const fb = buildApp({ configDir: path.join(tmp, 'config-pub'), feedbackDir: dir, feedbackPublish: true })
    const publish = () => fb.inject({ method: 'POST', url: '/api/feedback/publish' })
    expect((await fb.inject({ method: 'GET', url: '/api/feedback' })).json().publishable).toBe(true)

    await fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '버그', target: '홈', text: '안 열림' } })
    fs.writeFileSync(path.join(local, 'code.ts'), 'b\n') // 작업 중인 코드 변경
    fs.writeFileSync(path.join(local, 'staged.ts'), 's\n'); g(local, 'add', 'staged.ts') // 스테이징만 된 변경
    const first = await publish()
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ pushed: true })
    expect(g(remote, 'show', '--name-only', '--format=', 'main').split('\n')).toEqual([expect.stringMatching(/^feedback\/.+\.md$/)])
    expect(g(local, 'status', '--porcelain').split('\n').map((l) => l.trim()).sort()).toEqual(['A  staged.ts', 'M code.ts'])

    expect((await publish()).json()).toMatchObject({ commit: null, pushed: false })

    // 원격에 이 맥에 없는 커밋이 있어도 작업 트리는 그대로 두고, 원격 최신 위에 피드백만 얹어 올린다
    const other = path.join(tmp, 'fb-other')
    execFileSync('git', ['clone', '-q', remote, other])
    fs.writeFileSync(path.join(other, 'x.ts'), 'x\n'); g(other, 'add', '.'); g(other, 'commit', '-qm', 'other'); g(other, 'push', '-q')
    await fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '질문', target: '홈', text: '왜?' } })
    expect((await fb.inject({ method: 'GET', url: '/api/feedback/unpublished' })).json().files).toEqual([expect.stringMatching(/^feedback\/.+\.md$/)])
    const onTop = await publish()
    expect(onTop.statusCode).toBe(200)
    expect(onTop.json()).toMatchObject({ pushed: true })
    expect(g(remote, 'log', '--format=%s', '-n', '2', 'main').split('\n')).toEqual([expect.stringMatching(/^Add app feedback/), 'other'])
    expect(g(remote, 'show', '--name-only', '--format=', 'main').split('\n')).toEqual([expect.stringMatching(/^feedback\/.+\.md$/)])
    expect(g(remote, 'show', 'main:' + g(remote, 'show', '--name-only', '--format=', 'main'))).toContain('왜?')
    expect(g(local, 'status', '--porcelain', '--', 'feedback')).toBe('')
    expect(fs.existsSync(path.join(local, 'x.ts'))).toBe(false)
    expect((await fb.inject({ method: 'GET', url: '/api/feedback/unpublished' })).json().files).toEqual([])

    // 앱 폴더가 다른 브랜치에 있으면 그 브랜치에 커밋하지도 올리지도 않는다
    g(local, 'switch', '-q', '-c', 'claude/x')
    await fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '질문', target: '홈', text: '브랜치' } })
    const before = g(remote, 'rev-parse', 'main')
    const head = g(local, 'rev-parse', 'HEAD')
    const onBranch = await publish()
    expect(onBranch.statusCode).toBe(409)
    expect(onBranch.json().error).toMatch(/main이 아닌 claude\/x/)
    expect(g(remote, 'rev-parse', 'main')).toBe(before)
    expect(g(local, 'rev-parse', 'HEAD')).toBe(head)
    g(local, 'switch', '-q', 'main')

    const sandbox = buildApp({ configDir: path.join(tmp, 'config-pub2'), feedbackDir: dir })
    expect((await sandbox.inject({ method: 'POST', url: '/api/feedback/publish' })).statusCode).toBe(404)
    await Promise.all([fb.close(), sandbox.close()])
  })

  it('연구 저장소의 코멘트(workbench/comments/)만 올린다', async () => {
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env }).toString().trim()
    const remote = path.join(tmp, 'rec-remote.git')
    const local = path.join(tmp, 'rec-local')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    execFileSync('git', ['clone', '-q', remote, local])
    fs.cpSync(fixture, local, { recursive: true, filter: (src) => !src.includes('.build') })
    g(local, 'add', '.'); g(local, 'commit', '-qm', 'init'); g(local, 'push', '-q', '-u', 'origin', 'main')
    g(local, 'config', 'user.name', 't'); g(local, 'config', 'user.email', 't@t')
    const rec = buildApp({ configDir: path.join(tmp, 'config-rec') })
    const { id } = (await rec.inject({ method: 'POST', url: '/api/researches', payload: { path: local } })).json()
    fs.mkdirSync(path.join(local, 'workbench/comments'), { recursive: true })
    fs.writeFileSync(path.join(local, 'workbench/comments/a.md'), '코멘트\n')
    expect((await rec.inject(`/api/researches/${id}/records/unpublished`)).json().files).toEqual(['workbench/comments/a.md'])
    const r = await rec.inject({ method: 'POST', url: `/api/researches/${id}/records/publish` })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ pushed: true, files: ['workbench/comments/a.md'] })
    await rec.close()
  })

  it('자동 올리기를 켜면 피드백을 이어 남겨도 마지막 것 뒤에 한 번만 올린다', async () => {
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env }).toString().trim()
    const remote = path.join(tmp, 'fba-remote.git')
    const local = path.join(tmp, 'fba-local')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    execFileSync('git', ['clone', '-q', remote, local])
    fs.writeFileSync(path.join(local, 'code.ts'), 'a\n')
    g(local, 'add', '.'); g(local, 'commit', '-qm', 'init'); g(local, 'push', '-q', '-u', 'origin', 'main')
    g(local, 'config', 'user.name', 't'); g(local, 'config', 'user.email', 't@t')

    const fb = buildApp({ configDir: path.join(tmp, 'config-auto'), feedbackDir: path.join(local, 'feedback'), feedbackPublish: true, feedbackAutoPublishMs: 300 })
    expect((await fb.inject({ method: 'GET', url: '/api/feedback' })).json().autoPublish).toBe(true)
    await fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '버그', target: '홈', text: '하나' } })
    await fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '버그', target: '홈', text: '둘' } })
    expect(g(remote, 'log', '--format=%s', 'main')).toBe('init') // 아직 기다리는 중
    const until = Date.now() + 10_000
    while (g(remote, 'log', '--format=%s', 'main') === 'init' && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
    expect(g(remote, 'log', '--format=%s', 'main').split('\n')).toEqual([expect.stringMatching(/^Add app feedback/), 'init'])
    expect(g(remote, 'show', 'main:' + g(remote, 'show', '--name-only', '--format=', 'main'))).toMatch(/하나[\s\S]*둘/)
    // 원격에 커밋이 보인 직후에는 서버가 아직 결과를 적기 전일 수 있다: 적을 때까지 기다린다
    const last = async () => (await fb.inject({ method: 'GET', url: '/api/feedback' })).json().lastAutoPublish
    while (!(await last()) && Date.now() < until) await new Promise((r) => setTimeout(r, 50))
    expect(await last()).toMatchObject({ error: null })
    await fb.close()
  })

  it('종류는 Claude가 가린다: 새 코멘트는 미분류로 쌓이고, status.yaml의 kind가 있으면 그것을 돌려준다', async () => {
    const dir = path.join(tmp, 'feedback-kind')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-kind'), feedbackDir: dir })
    const r = await fb.inject({ method: 'POST', url: '/api/feedback', payload: { kind: '미분류', target: '홈', text: '달력이 작다' } })
    expect(r.statusCode).toBe(200)
    const { entry } = r.json()
    expect(fs.readFileSync(path.join(dir, `${entry.date}.md`), 'utf8')).toContain(`## ${entry.time} · 미분류 · 홈`)
    fs.writeFileSync(path.join(dir, 'status.yaml'), [`"${entry.date} ${entry.time} 홈":`, '  state: 반영', '  area: 홈', '  kind: 디자인'].join('\n'))
    const { entries } = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json()
    expect(entries[0]).toMatchObject({ kind: '미분류', status: { state: '반영', kind: '디자인' } })
    await fb.close()
  })
})

describe('승인·반려', () => {
  it('처리한 항목만 승인·반려하고, reviews.yaml에 적으며 status.yaml은 건드리지 않는다', async () => {
    const dir = path.join(tmp, 'feedback-review')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-10-04.md'), '## 13:52 · 디자인 · 사이드바 › 목차\n\n크기 조절\n\n## 13:54 · 질문 · 홈\n\n왜?\n')
    const status = '"2026-10-04 13:52 사이드바 › 목차":\n  state: 반영\n  area: 사이드바\n'
    fs.writeFileSync(path.join(dir, 'status.yaml'), status)
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-review'), feedbackDir: dir })
    const put = (body: object) => fb.inject({ method: 'PUT', url: '/api/feedback/review', payload: body })
    const key = '2026-10-04 13:52 사이드바 › 목차'
    expect((await put({ key: '2026-10-04 13:54 홈', verdict: '승인' })).statusCode).toBe(400)
    expect((await put({ key: 'ghost', verdict: '승인' })).statusCode).toBe(404)
    expect((await put({ key, verdict: '맞아요' })).statusCode).toBe(400)
    expect((await put({ key, verdict: '반려', note: '너무 좁다' })).json().review).toMatchObject({ verdict: '반려', note: '너무 좁다' })
    let all = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().entries
    expect(all.find((e: { key: string }) => e.key === key).review).toMatchObject({ verdict: '반려', note: '너무 좁다' })
    expect(fs.readFileSync(path.join(dir, 'status.yaml'), 'utf8')).toBe(status)
    expect((await put({ key, verdict: null })).statusCode).toBe(200)
    all = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().entries
    expect(all.find((e: { key: string }) => e.key === key).review).toBeUndefined()
    await fb.close()
  })
  it('보류 항목은 수정 요청으로 답할 수 있고 승인은 막는다 (10/7 17:09)', async () => {
    const dir = path.join(tmp, 'feedback-review-held')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-10-04.md'), '## 13:54 · 질문 · 홈\n\n왜?\n')
    fs.writeFileSync(path.join(dir, 'status.yaml'), '"2026-10-04 13:54 홈":\n  state: 보류\n  ask: 이렇게 할까요?\n')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-review-held'), feedbackDir: dir })
    const put = (body: object) => fb.inject({ method: 'PUT', url: '/api/feedback/review', payload: body })
    const key = '2026-10-04 13:54 홈'
    expect((await put({ key, verdict: '승인' })).statusCode).toBe(400)
    expect((await put({ key, verdict: '반려', note: '좋아' })).json().review).toMatchObject({ verdict: '반려', note: '좋아' })
    await fb.close()
  })
  it('묻는 답(확인 필요 · 동의 · 물음이 붙은 답변)은 진행 · 중단으로 답하고, 결과 답에는 진행 · 중단을 막는다 (10/9)', async () => {
    const dir = path.join(tmp, 'feedback-review-asks')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-10-04.md'), '## 13:54 · 수정 · 홈\n\n지워\n\n## 14:00 · 질문 · 홈\n\n왜?\n\n## 14:10 · 질문 · 홈\n\n어디?\n')
    fs.writeFileSync(path.join(dir, 'status.yaml'), [
      '"2026-10-04 13:54 홈":\n  state: 확인 필요\n  ask: 폴더까지 지울까요?',
      '"2026-10-04 14:00 홈":\n  state: 답변\n  ask: 수정으로 바꿀까요?',
      '"2026-10-04 14:10 홈":\n  state: 답변',
    ].join('\n') + '\n')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-review-asks'), feedbackDir: dir })
    const put = (body: object) => fb.inject({ method: 'PUT', url: '/api/feedback/review', payload: body })
    expect((await put({ key: '2026-10-04 13:54 홈', verdict: '승인' })).statusCode).toBe(400)
    expect((await put({ key: '2026-10-04 13:54 홈', verdict: '진행', note: '휴지통으로' })).json().review).toMatchObject({ verdict: '진행', note: '휴지통으로' })
    expect((await put({ key: '2026-10-04 14:00 홈', verdict: '승인' })).statusCode).toBe(400)
    expect((await put({ key: '2026-10-04 14:00 홈', verdict: '중단' })).json().review).toMatchObject({ verdict: '중단' })
    expect((await put({ key: '2026-10-04 14:10 홈', verdict: '진행' })).statusCode).toBe(400)
    expect((await put({ key: '2026-10-04 14:10 홈', verdict: '승인' })).statusCode).toBe(200)
    await fb.close()
  })

  it('새 승인·반려를 적으면 그 전의 것은 history에 남고, 위의 verdict·at·note는 늘 최신이다', () => {
    const dir = path.join(tmp, 'feedback-review-history')
    const key = '2026-10-04 13:52 사이드바 › 목차'
    setFeedbackReview(dir, key, '반려', '너무 좁다', new Date(2026, 9, 4, 14, 0))
    setFeedbackReview(dir, key, '반려', '아직 좁다', new Date(2026, 9, 4, 15, 0))
    const latest = setFeedbackReview(dir, key, '승인', undefined, new Date(2026, 9, 4, 16, 0))
    expect(latest).toEqual({ verdict: '승인', at: '2026-10-04T16:00', history: [
      { verdict: '반려', at: '2026-10-04T14:00', note: '너무 좁다' },
      { verdict: '반려', at: '2026-10-04T15:00', note: '아직 좁다' },
    ] })
    expect(readFeedbackReviews(dir).get(key)).toEqual(latest)
    // 예전에 읽던 쪽(verdict·at·note만 보는 것)도 최신을 읽는다
    const raw = YAML.parse(fs.readFileSync(path.join(dir, 'reviews.yaml'), 'utf8'))[key]
    expect(raw).toMatchObject({ verdict: '승인', at: '2026-10-04T16:00' })
    // 취소는 마지막 것만: 그 전의 반려가 다시 최신이 된다
    expect(setFeedbackReview(dir, key, null)).toEqual({ verdict: '반려', at: '2026-10-04T15:00', note: '아직 좁다', history: [{ verdict: '반려', at: '2026-10-04T14:00', note: '너무 좁다' }] })
    expect(setFeedbackReview(dir, key, null)).toEqual({ verdict: '반려', at: '2026-10-04T14:00', note: '너무 좁다' })
    expect(setFeedbackReview(dir, key, null)).toBeNull()
    expect(readFeedbackReviews(dir).has(key)).toBe(false)
  })

  it('history가 없는 예전 reviews.yaml도 읽고, 잘못된 history 줄은 건너뛴다', () => {
    const dir = path.join(tmp, 'feedback-review-old')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'reviews.yaml'), [
      '"a":', '  verdict: 승인', '  at: 2026-10-04T14:50',
      '"b":', '  verdict: 반려', '  at: 2026-10-04T15:00', '  note: 다시', '  history:', '    - { verdict: 승인, at: 2026-10-04T14:00 }', '    - { verdict: 몰라, at: x }', '    - 엉뚱함',
      '"c":', '  history: []',
    ].join('\n'))
    const all = readFeedbackReviews(dir)
    expect(all.get('a')).toEqual({ verdict: '승인', at: '2026-10-04T14:50' })
    expect(all.get('b')).toEqual({ verdict: '반려', at: '2026-10-04T15:00', note: '다시', history: [{ verdict: '승인', at: '2026-10-04T14:00' }] })
    expect(all.has('c')).toBe(false)
    // 예전 항목에 새로 적으면 그 예전 것이 history 첫 줄이 된다
    expect(setFeedbackReview(dir, 'a', '반려', '틀림', new Date(2026, 9, 4, 18, 11))).toEqual({ verdict: '반려', at: '2026-10-04T18:11', note: '틀림', history: [{ verdict: '승인', at: '2026-10-04T14:50' }] })
  })

  it('코멘트는 승인·반려와 따로 쌓이고, 승인·반려를 바꾸거나 되돌려도 남는다 (10/8)', () => {
    const dir = path.join(tmp, 'feedback-comments')
    const key = '2026-10-04 13:52 사이드바 › 목차'
    setFeedbackReview(dir, key, '승인', undefined, new Date(2026, 9, 4, 14, 0))
    addFeedbackComment(dir, key, ' 왜 회색이야? ', new Date(2026, 9, 4, 14, 10))
    expect(readFeedbackComments(dir).get(key)).toEqual([{ at: '2026-10-04T14:10', note: '왜 회색이야?' }])
    expect(readFeedbackReviews(dir).get(key)).toEqual({ verdict: '승인', at: '2026-10-04T14:00' })
    setFeedbackReview(dir, key, '반려', '파랑으로', new Date(2026, 9, 4, 14, 20))
    expect(readFeedbackComments(dir).get(key)).toHaveLength(1)
    setFeedbackReview(dir, key, null); setFeedbackReview(dir, key, null)
    expect(readFeedbackReviews(dir).has(key)).toBe(false)
    expect(readFeedbackComments(dir).get(key)).toHaveLength(1)
    // 코멘트만 있는 항목에도 승인을 적을 수 있다
    addFeedbackComment(dir, 'b', '먼저 묻기', new Date(2026, 9, 4, 15, 0))
    expect(setFeedbackReview(dir, 'b', '승인', undefined, new Date(2026, 9, 4, 15, 5))).toMatchObject({ verdict: '승인' })
    expect(readFeedbackComments(dir).get('b')).toEqual([{ at: '2026-10-04T15:00', note: '먼저 묻기' }])
  })

  it('내가 쓴 글은 at으로 찾아 고치고 edited를 붙인다: 최신 · history · 코멘트', () => {
    const dir = path.join(tmp, 'feedback-edit-note')
    const key = 'k'
    setFeedbackReview(dir, key, '반려', '첫 글', new Date(2026, 9, 4, 14, 0))
    setFeedbackReview(dir, key, '반려', '둘째 글', new Date(2026, 9, 4, 15, 0))
    addFeedbackComment(dir, key, '코멘트', new Date(2026, 9, 4, 15, 30))
    const at = new Date(2026, 9, 4, 16, 0)
    expect(editFeedbackNote(dir, key, '2026-10-04T15:00', '둘째 글 고침', at)).toBe(true)
    expect(editFeedbackNote(dir, key, '2026-10-04T14:00', '첫 글 고침', at)).toBe(true)
    expect(editFeedbackNote(dir, key, '2026-10-04T15:30', '코멘트 고침', at)).toBe(true)
    expect(editFeedbackNote(dir, key, '2026-10-04T09:00', 'x', at)).toBe(false)
    expect(editFeedbackNote(dir, key, '2026-10-04T15:00', '  ', at)).toBe(false)
    expect(readFeedbackReviews(dir).get(key)).toEqual({ verdict: '반려', at: '2026-10-04T15:00', note: '둘째 글 고침', edited: '2026-10-04T16:00', history: [{ verdict: '반려', at: '2026-10-04T14:00', note: '첫 글 고침', edited: '2026-10-04T16:00' }] })
    expect(readFeedbackComments(dir).get(key)).toEqual([{ at: '2026-10-04T15:30', note: '코멘트 고침', edited: '2026-10-04T16:00' }])
  })

  it('API: 코멘트 남기기 · 글 고치기 · 처리 기록의 새 칸 · 그림 (10/8 대화 화면)', async () => {
    const dir = path.join(tmp, 'feedback-conversation')
    fs.mkdirSync(path.join(dir, 'pictures'), { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-10-04.md'), '## 13:54 · 디자인 · 홈\n\n작다\n')
    fs.writeFileSync(path.join(dir, 'pictures', 'a.png'), Buffer.from([0x89, 0x50]))
    fs.writeFileSync(path.join(dir, 'status.yaml'), [
      '"2026-10-04 13:54 홈":', '  state: 반영', '  note: 키웠다', '  handled_at: 2026-10-04T14:00', '  by: claude', '  version: 0.1.1',
      '  pictures: [pictures/a.png, pictures/b.png]', '  replies:', '    - { at: 2026-10-04T15:00, to: 2026-10-04T14:30, note: 네, by: codex }', '    - { at: x, note: 받는 코멘트 없음 }',
    ].join('\n'))
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-conv'), feedbackDir: dir, sandbox: true })
    const key = '2026-10-04 13:54 홈'
    expect((await fb.inject({ method: 'POST', url: '/api/feedback/comment', payload: { key, note: '' } })).statusCode).toBe(400)
    expect((await fb.inject({ method: 'POST', url: '/api/feedback/comment', payload: { key: '없음', note: 'x' } })).statusCode).toBe(404)
    const c = (await fb.inject({ method: 'POST', url: '/api/feedback/comment', payload: { key, note: '왜?' } })).json().comment
    expect((await fb.inject({ method: 'PATCH', url: '/api/feedback/review', payload: { key, at: c.at, note: '왜 그래?' } })).statusCode).toBe(200)
    expect((await fb.inject({ method: 'PATCH', url: '/api/feedback/review', payload: { key, at: 'x', note: 'y' } })).statusCode).toBe(404)
    const all = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json()
    expect(all.user).toBe('example-user')
    expect(all.entries[0].comments).toEqual([expect.objectContaining({ note: '왜 그래?', edited: expect.any(String) })])
    expect(all.entries[0].status).toMatchObject({ handled_at: '2026-10-04T14:00', by: 'claude', version: '0.1.1', pictures: ['pictures/a.png', 'pictures/b.png'], replies: [{ at: '2026-10-04T15:00', to: '2026-10-04T14:30', note: '네', by: 'codex' }] })
    const pic = await fb.inject({ method: 'GET', url: '/api/feedback/picture?path=pictures/a.png' })
    expect(pic.statusCode).toBe(200)
    expect(pic.headers['content-type']).toBe('image/png')
    for (const bad of ['pictures/b.png', '../status.yaml', 'pictures/../status.yaml', 'status.yaml']) {
      expect((await fb.inject({ method: 'GET', url: `/api/feedback/picture?path=${encodeURIComponent(bad)}` })).statusCode).toBe(404)
    }
    await fb.close()
  })
})
