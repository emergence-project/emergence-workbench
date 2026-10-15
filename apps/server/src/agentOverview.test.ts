// 여러 프로젝트 한눈에: 사용자 차례는 홈의 "확인 필요"(/api/research-issues)와 같은 수, 에이전트 차례는 질문 · 진행 중 맡긴 일 · 할 일
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateOverview, overviewRow } from './agentOverview.js'
import { app, R, repo, useSampleApp } from './testkit.js'
import { Workbench } from './workbench.js'

useSampleApp()
const rid = R.split('/').pop()!

describe('agent overview', () => {
  it('counts the user\'s turn exactly like Home and lists the agent\'s turn', async () => {
    await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: '답을 기다리는 질문' } })
    await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: '에이전트가 사용자에게 묻는 것', by: 'claude' } })
    const issues = (await app.inject({ method: 'GET', url: '/api/research-issues' })).json() as { counts: Record<string, number>; notes: Record<string, number>; tasks: Record<string, number>; records: Record<string, number> }
    const row = await overviewRow(new Workbench(path.join(repo, 'workbench')))
    expect(row.user.notes).toBe(issues.notes[rid])
    expect(row.user.tasks).toBe(issues.tasks[rid])
    expect(row.user.records).toBe(issues.records[rid])
    expect(row.user.records).toBeGreaterThanOrEqual(1)
    expect(row.user.notes + row.user.tasks + row.user.edits + row.user.records).toBe(issues.counts[rid])
    expect(row.agent.questions).toBeGreaterThanOrEqual(1)
    const md = generateOverview([row, { folder: '/x/broken', problem: 'research.yaml | 없음' }], new Date(2026, 9, 15, 9, 5))
    expect(md.split('\n')[0]).toBe('# 프로젝트 한눈에 (2026-10-15 09:05)')
    expect(md).toContain(`| ${row.title} |`)
    expect(md).toContain('답 없는 질문')
    expect(md).toContain('| (읽지 못함) | `/x/broken` | research.yaml / 없음 | | | |')
  })

  it('serves the same table at /api/agent-overview', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agent-overview' })
    expect(res.statusCode).toBe(200)
    expect(res.json().markdown).toContain('| 프로젝트 | 폴더 | 사용자 차례 | 에이전트 차례 | 저장소 | 최근 기록 |')
  })
})
