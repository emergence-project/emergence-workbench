import { describe, expect, it } from 'vitest'
import { statusBody } from './statusBody'

describe('statusBody', () => {
  it('drops the title and the agent instructions, keeps the rest as is', () => {
    const md = '# STATUS — x\n\n> 고치지 말 것\n> 규칙\n\n**목표.** y\n\n## 할 일\n\n> 이건 남는다\n'
    expect(statusBody(md)).toBe('**목표.** y\n\n## 할 일\n\n> 이건 남는다\n')
  })
  it('leaves text without a header alone', () => {
    expect(statusBody('## 주제\n- a')).toBe('## 주제\n- a')
  })
})
