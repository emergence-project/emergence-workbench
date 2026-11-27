import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { flagsOf, measure, needsUser, parseLog, readRegistry, readRuleAnswers, rowsOf, writeRuleAnswer } from './ruleRegistry.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

const ROOT = path.resolve(import.meta.dirname, '../../..')
const base = { where: 'CLAUDE.md', since: '2026-11-01', why: 'w', note: 'n', review: '2026-12-01' }
const rule = { ...base, id: 'r', rule: 'r', kind: 'process' as const, audience: 'fixes' as const, enforce: 'prompt' as const, verdict: 'watch' as const, measure: { attest: '^소개: 그대로', touch: ['about/'] } }

describe('규칙 · 실험 목록 (docs/rules/registry.json)', () => {
  it('저장소의 목록이 모양에 맞고, 규칙은 대상 · 방식을, 실험은 판단 기준을 적었다', () => {
    const { rules } = readRegistry(ROOT)
    expect(rules.length).toBeGreaterThan(10)
    for (const r of rules) {
      if (r.kind === 'experiment') expect(r.gauge, r.id).toBeTruthy()
      else expect([r.audience, r.enforce], r.id).not.toContain(undefined)
    }
    // 되돌린 실험도 이유와 함께 남는다
    expect(rules.some((r) => r.verdict === 'reverted')).toBe(true)
  })

  it('git 출력에서 의례 줄과 지키는 파일을 센다', () => {
    const commits = parseLog('\u0001고침\n\n소개: 그대로 — 글만\u0001\napps/web/src/about/x.tsx\n\u0001다른 일\u0001\nREADME.md\n')
    expect(commits).toHaveLength(2)
    expect(measure(rule, commits)).toEqual({ commits: 2, attest: 1, touch: 1 })
    expect(measure({ ...rule, measure: null }, commits)).toBeUndefined()
  })

  it('다시 볼 날이 지나거나 의례 줄이 25%를 넘으면 알리고, 보류 · 되돌림은 알리지 않는다', () => {
    expect(flagsOf(rule, { commits: 4, attest: 2 }, '2026-12-02')).toHaveLength(2)
    expect(flagsOf(rule, { commits: 4, attest: 1 }, '2026-11-27')).toEqual([])
    expect(flagsOf({ ...rule, verdict: 'hold' }, { commits: 4, attest: 4 }, '2027-01-01')).toEqual([])
    expect(flagsOf({ ...rule, verdict: 'reverted' }, undefined, '2027-01-01')).toEqual([])
  })

  it('사용자 답을 적고 읽으며, 답한 줄은 더 묻지 않는다', () => {
    const dir = path.join(tmp, 'rule-answers')
    writeRuleAnswer(dir, 'r', '진행', new Date(2026, 10, 27, 9, 40))
    writeRuleAnswer(dir, 'other', '그대로')
    expect(fs.readFileSync(path.join(dir, 'rules.yaml'), 'utf8')).toMatch(/^# 규칙 · 실험/)
    const answers = readRuleAnswers(dir)
    expect(answers.r).toEqual({ answer: '진행', at: '2026-11-27T09:40' })
    const asks = rowsOf([{ ...rule, verdict: 'ask' }, { ...rule, id: 'q', verdict: 'ask' }], [], '2026-11-27', answers)
    expect(asks.map(needsUser)).toEqual([false, true])
    expect(readRuleAnswers(path.join(tmp, 'none'))).toEqual({})
  })

  it('API: 목록을 돌려주고, 결정을 기다리는 줄에만 답을 받는다', async () => {
    const dir = path.join(tmp, 'feedback-rules')
    const app = buildApp({ configDir: path.join(tmp, 'config-rules'), feedbackDir: dir })
    const view = (await app.inject({ method: 'GET', url: '/api/rules' })).json()
    expect(view.answerable).toBe(true)
    const ask = view.rows.find((r: { entry: { verdict: string } }) => r.entry.verdict === 'ask')
    const keep = view.rows.find((r: { entry: { verdict: string } }) => r.entry.verdict === 'keep')
    if (ask) {
      const res = await app.inject({ method: 'PUT', url: '/api/rules/answer', payload: { id: ask.entry.id, answer: '그대로' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().rows.find((r: { entry: { id: string } }) => r.entry.id === ask.entry.id).answer.answer).toBe('그대로')
    }
    expect((await app.inject({ method: 'PUT', url: '/api/rules/answer', payload: { id: keep.entry.id, answer: '진행' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: '/api/rules/answer', payload: { id: 'no-such', answer: '진행' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PUT', url: '/api/rules/answer', payload: { id: 'x', answer: '몰라' } })).statusCode).toBe(400)
    await app.close()
    const none = buildApp({ configDir: path.join(tmp, 'config-rules-none') })
    expect((await none.inject({ method: 'GET', url: '/api/rules' })).json().answerable).toBe(false)
    await none.close()
  })
})
