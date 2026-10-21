import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { adoptLocalFeedback, FEEDBACK_MISSES, FEEDBACK_STATES, feedbackStatusWarnings, listAllFeedback } from './feedback.js'

// 처리 기록이 깨지면(합치다가 같은 키가 두 번 들어가는 등) 피드백 화면이 경고를 띄운다. 합치기 전에 잡는다.
// 실제 기록은 개인 저장소에 있으므로(CLAUDE.md "위치") 예제 기록은 늘 보고, 개인 저장소 사본이 있으면 그것도 본다
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const personal = process.env.RW_FEEDBACK_STATUS ?? path.join(os.homedir(), '.config/research-workspace/personal/feedback/status.yaml')
const files = [
  path.join(root, 'fixtures/sandbox-feedback/status.yaml'),
  path.join(root, 'fixtures/en/sandbox-feedback/status.yaml'),
  ...(fs.existsSync(personal) ? [personal] : []),
]

describe.each(files)('feedback status %s', (file) => {
  it('parses as YAML without errors or duplicate keys', () => {
    const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'))
    expect(doc.errors.map((e) => e.message)).toEqual([])
  })

  it('merged_into always names a key that exists and is not itself merged', () => {
    const all = YAML.parse(fs.readFileSync(file, 'utf8')) as Record<string, { merged_into?: string }>
    const bad = Object.entries(all).filter(([, v]) => v.merged_into && (!all[v.merged_into] || all[v.merged_into]!.merged_into)).map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('every record names the screen area it is about (the feedback page groups by it)', () => {
    const all = YAML.parse(fs.readFileSync(file, 'utf8')) as Record<string, { area?: unknown }>
    expect(Object.entries(all).filter(([, v]) => typeof v.area !== 'string' || !v.area).map(([k]) => k)).toEqual([])
  })

  it('every revised miss is one the lessons summary knows (10/16; a typo would drop it from pnpm agent:feedback)', () => {
    const all = YAML.parse(fs.readFileSync(file, 'utf8')) as Record<string, { revised?: { miss?: unknown }[] }>
    const bad = Object.entries(all).flatMap(([k, v]) => (v.revised ?? []).filter((r) => r.miss != null && !(FEEDBACK_MISSES as readonly unknown[]).includes(r.miss)).map(() => k))
    expect(bad).toEqual([])
  })

  it('every state is one the feedback page knows (a typo would hide the record)', () => {
    const all = YAML.parse(fs.readFileSync(file, 'utf8')) as Record<string, { state?: unknown }>
    expect(Object.entries(all).filter(([, v]) => !(FEEDBACK_STATES as readonly unknown[]).includes(v.state)).map(([k]) => k)).toEqual([])
  })
})

it('reads revised miss and lesson so pnpm agent:feedback can count them', () => {
  const dir = path.join(root, 'fixtures/sandbox-feedback')
  const revised = listAllFeedback(dir).flatMap((e) => e.status?.revised ?? [])
  expect(revised).toContainEqual(expect.objectContaining({ miss: '덜 고침', lesson: '고쳤다고 하기 전에 그 화면을 그림으로 찍어 확인한다.' }))
})

describe('feedbackStatusWarnings', () => {
  it('앱이 모르는 state(오타)를 적은 항목을 알린다: 그 항목은 처리 기록 없는 것으로 읽혀 새 항목처럼 보이므로', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-warn-'))
    fs.writeFileSync(path.join(dir, 'status.yaml'), '"2026-10-01 09:00 홈":\n  state: 확인필요\n"2026-10-01 10:00 홈":\n  state: 반영\n"2026-10-01 11:00 홈":\n  note: state 없음\n')
    const w = feedbackStatusWarnings(dir)
    expect(w).toHaveLength(2)
    expect(w[0]).toContain('2026-10-01 09:00 홈: state "확인필요"')
    expect(w[1]).toContain('2026-10-01 11:00 홈: state 없음')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('설정 폴더에만 쌓인 피드백을 개인 저장소로 옮기기 (10/21 맥미니)', () => {
  it('없는 파일은 옮기고, 같은 날짜 파일은 그 날 항목을 끝에 잇고, 이름이 겹치는 다른 그림은 두고 온다', () => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-adopt-'))
    const from = path.join(root, 'feedback'), to = path.join(root, 'personal/feedback')
    fs.mkdirSync(path.join(from, 'pictures'), { recursive: true }); fs.mkdirSync(path.join(to, 'pictures'), { recursive: true })
    fs.writeFileSync(path.join(from, '2026-10-22.md'), '# 피드백 2026-10-22\n\n## 07:13 수정 · 설정\n\n맥미니 글\n')
    fs.writeFileSync(path.join(to, '2026-10-22.md'), '# 피드백 2026-10-22\n\n## 06:00 질문 · 홈\n\n맥북 글\n')
    fs.writeFileSync(path.join(from, '2026-10-21.md'), '# 피드백 2026-10-21\n\n## 23:00 제안 · 홈\n\n어제 글\n')
    fs.writeFileSync(path.join(from, 'pictures/a.png'), 'mini'); fs.writeFileSync(path.join(to, 'pictures/a.png'), 'book')
    fs.writeFileSync(path.join(from, 'pictures/b.png'), 'mini')
    const r = adoptLocalFeedback(from, to, new Date(2026, 9, 22, 8))
    expect(r).toEqual({ files: 3, skipped: [path.join('pictures', 'a.png')] })
    expect(fs.readFileSync(path.join(to, '2026-10-22.md'), 'utf8')).toBe('# 피드백 2026-10-22\n\n## 06:00 질문 · 홈\n\n맥북 글\n\n## 07:13 수정 · 설정\n\n맥미니 글\n')
    expect(fs.readFileSync(path.join(to, '2026-10-21.md'), 'utf8')).toContain('어제 글')
    expect(fs.readFileSync(path.join(to, 'pictures/a.png'), 'utf8')).toBe('book')
    expect(fs.existsSync(from)).toBe(false)
    expect(fs.existsSync(path.join(root, 'feedback.moved-2026-10-22/pictures/a.png'))).toBe(true)
    fs.rmSync(root, { recursive: true, force: true })
  })
})
