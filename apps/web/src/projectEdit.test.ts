import { describe, expect, it, vi } from 'vitest'
import type { ProjectInfo, ResearchApi, ResearchSummary } from './api'
import { projectTextState, readProjectEditSnapshot } from './projectEdit'

const sources = { canon: [], bib: [], materials: [], reviews: [], manuscripts: [] }
const projectInfo = (hash: string): ProjectInfo => ({
  hash, sources, agentStatus: false, tasks: null, reviews: [],
})
const summary: ResearchSummary = {
  id: 'project', root: '/project', engine: 'xelatex',
  research: { title: '새 이름', question: '새 설명', started: '2026-10-06', image: 'figures/new.svg', sources, agentStatus: false, concepts: [] },
  blocks: [], statements: [],
  tree: { roots: [], children: {}, parentOf: {}, alternatives: [], order: [], counts: { 'in-progress': 0, blocked: 0, stopped: 0, solved: 0 }, frontier: [], issues: [] },
}

describe('프로젝트 고치기 읽기', () => {
  it('현재 이름·설명·시작일·그림과 그 값을 읽는 동안 유지된 해시를 돌려준다', async () => {
    const rapi = {
      project: vi.fn<ResearchApi['project']>().mockResolvedValue(projectInfo('fresh-hash')),
      summary: vi.fn<ResearchApi['summary']>().mockResolvedValue(summary),
    }
    await expect(readProjectEditSnapshot(rapi)).resolves.toEqual({
      research: summary.research,
      hash: 'fresh-hash',
    })
    expect(rapi.project.mock.invocationCallOrder[0]).toBeLessThan(rapi.summary.mock.invocationCallOrder[0]!)
    expect(rapi.summary.mock.invocationCallOrder[0]).toBeLessThan(rapi.project.mock.invocationCallOrder[1]!)
  })

  it('값을 읽는 동안 바깥에서 파일이 바뀌면 저장 기준으로 쓰지 않는다', async () => {
    const rapi = {
      project: vi.fn<ResearchApi['project']>().mockResolvedValueOnce(projectInfo('before')).mockResolvedValueOnce(projectInfo('after')),
      summary: vi.fn<ResearchApi['summary']>().mockResolvedValue(summary),
    }
    await expect(readProjectEditSnapshot(rapi)).rejects.toThrow('다른 곳에서 research.yaml이 바뀌었습니다. 다시 열어 고쳐 주세요')
  })

  it.each(['first hash', 'summary', 'last hash'] as const)('%s 읽기 실패를 호출자에게 돌려준다', async (step) => {
    const failure = new Error('읽을 수 없습니다')
    const rapi = {
      project: vi.fn<ResearchApi['project']>().mockResolvedValue(projectInfo('hash')),
      summary: vi.fn<ResearchApi['summary']>().mockResolvedValue(summary),
    }
    if (step === 'first hash') rapi.project.mockRejectedValueOnce(failure)
    else if (step === 'summary') rapi.summary.mockRejectedValueOnce(failure)
    else rapi.project.mockResolvedValueOnce(projectInfo('hash')).mockRejectedValueOnce(failure)
    await expect(readProjectEditSnapshot(rapi)).rejects.toBe(failure)
  })
})

describe('프로젝트 고치기 글자 수', () => {
  it('이름 80자와 설명 200자는 허용하고 한 글자 넘으면 저장하지 않는다', () => {
    expect(projectTextState('가'.repeat(80), '나'.repeat(200)).valid).toBe(true)
    expect(projectTextState('가'.repeat(81), '').valid).toBe(false)
    expect(projectTextState('이름', '나'.repeat(201)).valid).toBe(false)
  })
  it('줄바꿈은 빼고 한글과 유니코드 기호는 한 글자로 센다', () => {
    expect(projectTextState('연구🔬', '가\r\n나\n🔬').counts).toEqual({ title: 3, description: 3 })
    expect(projectTextState('🔬'.repeat(40), '나\n'.repeat(200)).valid).toBe(true)
  })
  it('이미 넘친 글은 고치지 않으면 막지 않는다', () => {
    const before = { title: '가'.repeat(90), description: '나'.repeat(210) }
    expect(projectTextState(before.title, before.description, before).valid).toBe(true)
    expect(projectTextState(before.title + '다', before.description, before).valid).toBe(false)
  })
  it('수식은 보이는 글자만 센다', () => {
    expect(projectTextState('Graph minor $J(A,B,C)$', '').counts.title).toBe(12 + 8)
  })
  it('빈 이름은 저장하지 않고 설명은 비워도 된다', () => {
    expect(projectTextState(' \t ', '설명').valid).toBe(false)
    expect(projectTextState('이름', '').valid).toBe(true)
  })
})
