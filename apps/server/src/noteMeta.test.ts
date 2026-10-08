import { describe, expect, it } from 'vitest'
import { summaryOfMarkdown } from './noteMeta.js'

describe('Markdown 노트의 자동 설명', () => {
  it('\\(…\\) 수식도 $…$로 보이고, 안의 _·*가 지워지지 않는다', () => {
    expect(summaryOfMarkdown('오일러 지표 \\(\\chi(G)_\\Sigma\\)가 2이면 $\\deg_{v}$로 줄인다.'))
      .toBe('오일러 지표 $\\chi(G)_\\Sigma$가 2이면 $\\deg_{v}$로 줄인다.')
  })
  it('수식이 없으면 그대로', () => {
    expect(summaryOfMarkdown('# 제목\n\n첫 문단 **굵게** [[링크|이름]].')).toBe('첫 문단 굵게 이름.')
  })
})
