// 두 컴퓨터(맥북 · 맥미니)가 같은 개인 저장소 · 연구 저장소를 쓸 때 (10/22 "두 맥 동기화와 충돌 대비")
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { publishFeedback } from './feedback.js'
import { feedbackMergeFor, mergeYamlMap } from './feedbackMerge.js'
import { claimedElsewhere, claimFeedback, readClaims } from './feedbackClaims.js'
import { ensurePersonalClone, pullPersonal } from './personalRepo.js'
import { autoPull, offDefaultBranch, repoSync } from './gitsync.js'
import { gitTest, syncRepo } from './gitSyncTestkit.js'

let tmp: string
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]).toString().trim()
beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-two-')) })
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const entry = (time: string, text: string) => `\n## ${time} · 수정 · 홈\n- 화면: #/\n\n${text}\n`
const HEAD = '# 피드백 2026-10-22\n'

/** 피드백이 든 개인 저장소와 두 컴퓨터의 사본 */
async function twoClones(name: string, files: Record<string, string>) {
  const remote = path.join(tmp, `${name}.git`)
  const seed = path.join(tmp, `${name}-seed`)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  git(tmp, 'clone', '-q', remote, seed)
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(seed, f)), { recursive: true }); fs.writeFileSync(path.join(seed, f), body) }
  git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'seed'); git(seed, 'push', '-q', 'origin', 'HEAD:main')
  const clone = async (who: string) => {
    const dir = path.join(tmp, `${name}-${who}/personal`)
    await ensurePersonalClone(dir, remote)
    git(dir, 'config', 'user.name', who); git(dir, 'config', 'user.email', `${who}@t`)
    return dir
  }
  return { remote, a: await clone('macbook'), b: await clone('macmini') }
}
const append = (dir: string, file: string, text: string) => fs.appendFileSync(path.join(dir, 'feedback', file), text)
const remoteFile = (remote: string, file: string) => git(remote, 'show', `main:feedback/${file}`)

describe('피드백: 같은 날 두 컴퓨터에서 남기기', () => {
  it('먼저 올린 컴퓨터가 있어도 나중 컴퓨터가 항목 단위로 합쳐 올리고, 받으면 둘 다 보인다', async () => {
    const { remote, a, b } = await twoClones('fb1', { 'feedback/2026-10-22.md': HEAD + entry('08:00', '처음') })
    append(a, '2026-10-22.md', entry('09:00', '맥북에서'))
    append(b, '2026-10-22.md', entry('09:01', '맥미니에서'))
    expect((await publishFeedback(path.join(a, 'feedback'))).pushed).toBe(true)
    expect((await publishFeedback(path.join(b, 'feedback'))).pushed).toBe(true)
    const up = remoteFile(remote, '2026-10-22.md')
    for (const s of ['처음', '맥북에서', '맥미니에서']) expect(up).toContain(s)
    expect(await pullPersonal(a)).toEqual({ ok: true })
    expect(await pullPersonal(b)).toEqual({ ok: true })
    for (const dir of [a, b]) expect(fs.readFileSync(path.join(dir, 'feedback/2026-10-22.md'), 'utf8')).toContain('맥미니에서')
    expect(fs.readFileSync(path.join(a, 'feedback/2026-10-22.md'), 'utf8')).toContain('맥북에서')
  })

  it('이 컴퓨터에만 커밋된 피드백이 있어도 받기가 줄 단위 부딪힘에서 멈추지 않는다', async () => {
    const { a, b } = await twoClones('fb2', { 'feedback/2026-10-22.md': HEAD, 'feedback/reviews.yaml': 'x:\n  verdict: 승인\n' })
    append(a, '2026-10-22.md', entry('10:00', '맥북'))
    append(a, 'reviews.yaml', 'y:\n  verdict: 반려\n')
    expect((await publishFeedback(path.join(a, 'feedback'))).pushed).toBe(true)
    // 맥미니: 커밋했지만 올리지 못한 채로(네트워크가 끊긴 때 등)
    append(b, '2026-10-22.md', entry('10:01', '맥미니'))
    append(b, 'reviews.yaml', 'z:\n  verdict: 승인\n')
    git(b, 'commit', '-qam', 'Add app feedback')
    expect(await pullPersonal(b)).toEqual({ ok: true })
    const md = fs.readFileSync(path.join(b, 'feedback/2026-10-22.md'), 'utf8')
    expect(md).toContain('맥북'); expect(md).toContain('맥미니')
    expect(Object.keys(YAML.parse(fs.readFileSync(path.join(b, 'feedback/reviews.yaml'), 'utf8')))).toEqual(['x', 'z', 'y'])
    expect(git(b, 'status', '--porcelain')).toBe('')
  })

  it('같은 항목의 같은 칸을 서로 다르게 고쳤으면 받지 않고 사본을 그대로 둔다', async () => {
    const { a, b } = await twoClones('fb3', { 'feedback/reviews.yaml': 'x:\n  verdict: 승인\n' })
    fs.writeFileSync(path.join(a, 'feedback/reviews.yaml'), 'x:\n  verdict: 반려\n')
    expect((await publishFeedback(path.join(a, 'feedback'))).pushed).toBe(true)
    fs.writeFileSync(path.join(b, 'feedback/reviews.yaml'), 'x:\n  verdict: 진행\n')
    git(b, 'commit', '-qam', 'local')
    const r = await pullPersonal(b)
    expect(r.ok).toBe(false)
    expect(fs.readFileSync(path.join(b, 'feedback/reviews.yaml'), 'utf8')).toBe('x:\n  verdict: 진행\n')
    expect(git(b, 'status', '--porcelain')).toBe('')
  })
})

describe('피드백 YAML 합치기', () => {
  it('다른 키는 모두 두고, 같은 키는 칸 단위로, 목록은 양쪽이 더한 것을 모두 둔다', () => {
    const base = 'a:\n  verdict: 승인\n  comments:\n    - { at: "1", note: 처음 }\n'
    const ours = 'a:\n  verdict: 승인\n  comments:\n    - { at: "1", note: 처음 }\n    - { at: "2", note: 맥북 }\nb: 1\n'
    const theirs = 'a:\n  verdict: 반려\n  comments:\n    - { at: "1", note: 처음 }\n    - { at: "3", note: 맥미니 }\nc: 2\n'
    const out = YAML.parse(mergeYamlMap(base, ours, theirs)!)
    expect(out).toEqual({ a: { verdict: '반려', comments: [{ at: '1', note: '처음' }, { at: '2', note: '맥북' }, { at: '3', note: '맥미니' }] }, b: 1, c: 2 })
  })
  it('한쪽이 지운 키는 지우고, 같은 칸을 다르게 고쳤으면 null', () => {
    expect(YAML.parse(mergeYamlMap('a: 1\nb: 2\n', 'a: 1\n', 'a: 1\nb: 2\nc: 3\n')!)).toEqual({ a: 1, c: 3 })
    expect(mergeYamlMap('a: 1\n', 'a: 2\n', 'a: 3\n')).toBeNull()
  })
  it('handoff.yaml은 같은 항목을 둘이 맡으면 먼저 맡은 쪽', () => {
    const m = feedbackMergeFor('feedback/handoff.yaml')!
    const out = YAML.parse(m('', 'k:\n  machine: A\n  at: "2026-10-22T01:00:02Z"\n', 'k:\n  machine: B\n  at: "2026-10-22T01:00:01Z"\n')!)
    expect(out.k.machine).toBe('B')
  })
  it('그림 같은 다른 파일은 합치지 않는다', () => {
    expect(feedbackMergeFor('feedback/pictures/a.png')).toBeUndefined()
    expect(feedbackMergeFor('feedback/2026-10-22.md')).toBeDefined()
  })
})

describe('피드백 맡기기는 한 컴퓨터만', () => {
  it('먼저 적어 올린 컴퓨터만 맡고, 다른 컴퓨터는 받은 뒤 건너뛴다', async () => {
    const { a, b } = await twoClones('claim1', { 'feedback/2026-10-22.md': HEAD })
    const deps = (dir: string, machine: string) => ({ dir: path.join(dir, 'feedback'), machine, pull: () => pullPersonal(dir), publish: () => publishFeedback(path.join(dir, 'feedback')) })
    const since = Date.parse('2026-10-22T00:00:00Z')
    expect(await claimFeedback(deps(a, 'MacBook'), '2026-10-22 09:00 홈', since)).toBe(true)
    expect(await claimFeedback(deps(b, 'Macmini'), '2026-10-22 09:00 홈', since)).toBe(false)
    expect(claimedElsewhere(path.join(b, 'feedback'), '2026-10-22 09:00 홈', 'Macmini', since)).toBe('MacBook')
    // 사용자가 다시 답해 새 차례가 되면(마지막 손댄 때가 맡은 때보다 뒤) 다른 컴퓨터도 맡을 수 있다
    expect(claimedElsewhere(path.join(b, 'feedback'), '2026-10-22 09:00 홈', 'Macmini', Date.now() + 60_000)).toBeNull()
    expect(readClaims(path.join(a, 'feedback'))['2026-10-22 09:00 홈']?.machine).toBe('MacBook')
  })
})

describe('연구 폴더가 기본 브랜치가 아닐 때', () => {
  it('저절로 받지 않고, 기록도 올리지 않으며, 홈 카드에 기본 브랜치 이름을 알린다', async () => {
    const r = syncRepo(tmp, 'branch1')
    gitTest(r.mine, 'switch', '-q', '-c', 'claude/project-thread-x')
    gitTest(r.mine, 'push', '-q', '-u', 'origin', 'claude/project-thread-x')
    expect((await repoSync(r.mine))?.defaultBranch).toBe('main')
    expect(await offDefaultBranch(r.mine)).toContain('git switch main')
    // 그 브랜치에 새 커밋이 있어도 저절로 받지 않는다
    const other = path.join(tmp, 'branch1-other')
    execFileSync('git', ['clone', '-q', '-b', 'claude/project-thread-x', r.remote, other])
    fs.writeFileSync(path.join(other, 'new.txt'), 'x')
    git(other, 'add', '-A'); git(other, 'commit', '-qm', 'x'); git(other, 'push', '-q')
    expect(await autoPull(r.mine)).toBe(false)
    gitTest(r.mine, 'switch', '-q', 'main')
    expect((await repoSync(r.mine))?.defaultBranch).toBeUndefined()
    expect(await offDefaultBranch(r.mine)).toBeNull()
  })
})
