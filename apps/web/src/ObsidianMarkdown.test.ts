import { describe, expect, it } from 'vitest'
import { renderObsidian } from './ObsidianMarkdown'

describe('증명 접기', () => {
  it('증명 문단부터 □까지를 접는다 (여러 문단·수식 포함)', () => {
    const h = renderObsidian('## 성질\n\n1. **J는 실수다**\n\n**증명.** 첫 줄.\n\n$$\nJ = \\bar J\n$$\n\n그래서 실수다. □\n\n다음 글.')
    expect(h).toMatch(/<details class="ob-proof"><summary>증명<\/summary>\n<p>첫 줄.<\/p>[^]*그래서 실수다. □<\/p>\n<\/details>\n<p>다음 글.<\/p>/)
  })
  it('끝 표시가 없으면 다음 제목 앞까지, 영어 *Proof.*도', () => {
    const h = renderObsidian('*Proof.* Trivial.\n\nMore.\n\n## Examples\n\nx')
    expect(h).toMatch(/<details class="ob-proof"><summary>Proof<\/summary>\n<p>Trivial.<\/p>\n<p>More.<\/p>\n<\/details>\n<h2>Examples<\/h2>/)
  })
  it('\\square 수식으로 끝나도', () => {
    const h = renderObsidian('**Proof.** Done $\\square$\n\nafter')
    expect(h).toMatch(/<\/details>\n<p>after<\/p>/)
  })
  it('증명이 아닌 글은 그대로', () => {
    expect(renderObsidian('증명하기 어렵다.')).not.toContain('details')
  })
})
