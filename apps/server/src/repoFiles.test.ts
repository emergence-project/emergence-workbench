import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { app, R, repo, useSampleApp } from './testkit.js'

// 기록 글 속 저장소 경로 열기 (10/19 피드백 09:53, 시안 안 1): 옮긴 파일은 git 이력으로 찾고, 지운 파일은 지우기 전 판을
useSampleApp()

const g = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'pipe' })
const file = (q: string) => app.inject({ method: 'GET', url: `${R}/file?${q}` })

describe('기록 글 속 저장소 경로', () => {
  beforeAll(() => {
    fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true })
    g('init', '-q')
    fs.mkdirSync(path.join(repo, 'GOVERNMENT/pad'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'GOVERNMENT/pad/guide.md'), '# Guide\n\nA1 check the sign.\n')
    fs.writeFileSync(path.join(repo, 'GOVERNMENT/pad/old-plan.md'), '# Plan\n\nretired\n')
    g('add', '-A'); g('commit', '-qm', 'start')
    fs.mkdirSync(path.join(repo, 'docs/reviews'), { recursive: true })
    g('mv', 'GOVERNMENT/pad/guide.md', 'docs/reviews/guide.md')
    g('rm', '-q', 'GOVERNMENT/pad/old-plan.md')
    g('commit', '-qm', 'move GOVERNMENT')
  })

  it('있는 파일은 그대로, 내용은 body=1일 때만', async () => {
    const meta = (await file('path=docs/reviews/guide.md')).json()
    expect(meta).toMatchObject({ status: 'here', path: 'docs/reviews/guide.md', kind: 'markdown' })
    expect(meta.text).toBeUndefined()
    expect((await file('path=./docs/reviews/guide.md&body=1')).json().text).toContain('A1 check the sign.')
  })

  it('옮긴 파일은 git 이력에서 새 자리를 찾고, 옮긴 커밋의 시각을 알린다', async () => {
    const r = (await file('path=GOVERNMENT/pad/guide.md&body=1')).json()
    expect(r).toMatchObject({ asked: 'GOVERNMENT/pad/guide.md', path: 'docs/reviews/guide.md', status: 'moved', kind: 'markdown' })
    expect(r.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(r.text).toContain('A1')
  })

  it('지운 파일은 지우기 전 마지막 판을 보인다', async () => {
    const r = (await file('path=GOVERNMENT/pad/old-plan.md&body=1')).json()
    expect(r).toMatchObject({ status: 'deleted', path: 'GOVERNMENT/pad/old-plan.md' })
    expect(r.text).toContain('retired')
  })

  it('이력도 같은 이름도 없으면 missing, 저장소 밖과 .git은 거절', async () => {
    expect((await file('path=nowhere/none.md')).json()).toMatchObject({ status: 'missing' })
    expect((await file('path=../outside.md')).statusCode).toBe(400)
    expect((await file('path=.git/config')).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: `${R}/file/raw?path=docs/reviews/guide.md` })).body).toContain('# Guide')
    expect((await app.inject({ method: 'POST', url: `${R}/file/open`, payload: { path: 'GOVERNMENT/pad/guide.md' } })).statusCode).toBe(404)
  })

  it('저장소 안의 링크가 밖의 파일을 가리키면 내용도 원본도 내보내지 않는다 (보안 검토 L1)', async () => {
    const secret = path.join(path.dirname(repo), 'secret.md')
    fs.writeFileSync(secret, 'TOP SECRET\n')
    fs.symlinkSync(secret, path.join(repo, 'docs/leak.md'))
    const meta = await file('path=docs/leak.md&body=1')
    expect(meta.body).not.toContain('TOP SECRET')
    const raw = await app.inject({ method: 'GET', url: `${R}/file/raw?path=docs/leak.md` })
    expect(raw.statusCode).toBe(403)
    expect(raw.body).not.toContain('TOP SECRET')
  })
})
