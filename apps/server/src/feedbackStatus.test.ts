import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { FEEDBACK_MISSES, FEEDBACK_STATES, listAllFeedback } from './feedback.js'

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
