import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { appendFeedback, listAllFeedback } from './feedback.js'
import { exportFeedback, importFeedback, importedDayFiles, senderFolder, senderNames } from './feedbackBundle.js'

const tmp: string[] = []
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fbb-')); tmp.push(d); return d }
afterEach(() => { for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const PNG = 'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')

describe('feedback file bundle', () => {
  it('exports a friend\'s feedback with pictures and imports it under the sender', () => {
    const friend = mk(), home = mk(), admin = mk()
    fs.mkdirSync(path.join(home, 'Downloads'))
    appendFeedback(friend, { kind: '질문', target: '논문 › 목록', text: '이 버튼은 뭐예요?', image: PNG })
    appendFeedback(friend, { kind: '수정', target: '노트', text: '글자가 작아요' })
    const out = exportFeedback(friend, '김 친구', home)
    expect(out.count).toBe(2)
    expect(path.dirname(out.file)).toBe(path.join(home, 'Downloads'))
    const bundle: unknown = JSON.parse(fs.readFileSync(out.file, 'utf8'))

    appendFeedback(admin, { kind: '제안', target: '홈', text: '내 피드백' })
    const r = importFeedback(admin, bundle)
    expect(r).toMatchObject({ from: '김 친구', count: 2, pictures: 1 })
    const list = listAllFeedback(admin)
    expect(list.map((e) => e.source ?? '나').sort()).toEqual(['김 친구', '김 친구', '나'])
    const withPic = list.find((e) => e.picture)!
    expect(withPic.picture).toMatch(/^pictures\/from-[0-9a-f]{8}-/)
    expect(fs.readFileSync(path.join(admin, withPic.picture!), 'utf8')).toBe('fake-png')
    // 같은 묶음을 또 가져와도 겹치지 않는다
    importFeedback(admin, bundle)
    expect(listAllFeedback(admin)).toHaveLength(3)
  })

  it('refuses other files and empty exports, and keeps folder names safe', () => {
    const dir = mk()
    expect(() => importFeedback(dir, { hello: 1 })).toThrow(/피드백 파일이 아닙니다|Not an Emergence/)
    expect(() => exportFeedback(dir, 'x', mk())).toThrow()
    expect(senderFolder('../../etc/passwd')).toBe('etc passwd')
    expect(senderFolder('')).not.toBe('')
    // 날짜가 아닌 이름과 경로가 든 그림 이름은 버린다
    const r = importFeedback(dir, { format: 'emergence-workbench-feedback', from: 'a', days: { '../x': 'no', '2026-11-08': '## 10:00 · 질문 · 홈\n\n안녕\n' }, pictures: { '../evil.png': 'AAAA' } })
    expect(r).toMatchObject({ days: 1, pictures: 0, count: 1 })
    expect(fs.existsSync(path.join(dir, 'from', 'a', '2026-11-08.md'))).toBe(true)
  })

  it('routes: export to Downloads, import into the admin list', async () => {
    const friendDir = mk(), adminDir = mk(), home = mk()
    fs.mkdirSync(path.join(home, 'Downloads'))
    const oldHome = process.env.HOME
    process.env.HOME = home
    try {
      const friend = buildApp({ configDir: mk(), feedbackDir: friendDir })
      appendFeedback(friendDir, { kind: '질문', target: '논문', text: '질문 하나' })
      const ex = await friend.inject({ method: 'POST', url: '/api/feedback/export' })
      expect(ex.statusCode).toBe(200)
      const file: string = ex.json().file
      expect(file.startsWith(path.join(home, 'Downloads'))).toBe(true)
      const admin = buildApp({ configDir: mk(), feedbackDir: adminDir })
      const im = await admin.inject({ method: 'POST', url: '/api/feedback/import', payload: fs.readFileSync(file, 'utf8'), headers: { 'content-type': 'application/json' } })
      expect(im.statusCode).toBe(200)
      expect(im.json().count).toBe(1)
      const all = (await admin.inject({ method: 'GET', url: '/api/feedback/all' })).json()
      expect(all.entries[0].source).toBe(im.json().from)
      expect((await admin.inject({ method: 'POST', url: '/api/feedback/import', payload: { format: 'x', from: 'a', days: {} } })).statusCode).toBe(400)
      await friend.close(); await admin.close()
    } finally { process.env.HOME = oldHome }
  })
})

describe('보이는 이름 (11/9 20:44)', () => {
  it('같은 앱 번호는 가장 최근 폴더의 이름을 쓴다', () => {
    const names = senderNames([
      { name: 'USER-1c5aef', latest: '2026-11-09' },
      { name: '민수-1c5aef', latest: '2026-11-12' },
      { name: '영희-abc123', latest: '2026-11-01' },
      { name: '옛사람', latest: '2026-10-01' },
    ])
    expect(names.get('USER-1c5aef')).toBe('민수')
    expect(names.get('민수-1c5aef')).toBe('민수')
    expect(names.get('영희-abc123')).toBe('영희')
    expect(names.get('옛사람')).toBe('옛사람')
  })
  it('가져온 날짜 파일에 보이는 이름이 붙는다', () => {
    const dir = mk()
    for (const [f, d] of [['USER-1c5aef', '2026-11-09'], ['민수-1c5aef', '2026-11-12']]) {
      fs.mkdirSync(path.join(dir, 'from', f!), { recursive: true })
      fs.writeFileSync(path.join(dir, 'from', f!, `${d}.md`), '## 10:00 · 질문 · 홈\n\n안녕\n')
    }
    const got = importedDayFiles(dir).map((x) => [x.source, x.sender]).sort()
    expect(got).toEqual([['USER-1c5aef', '민수'], ['민수-1c5aef', '민수']])
  })
})
