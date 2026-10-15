import { describe, expect, it } from 'vitest'
import { splitStatus, statusBody } from './statusBody'

describe('statusBody', () => {
  it('drops the title and the agent instructions, keeps the rest as is', () => {
    const md = '# STATUS — x\n\n> 고치지 말 것\n> 규칙\n\n**목표.** y\n\n## 할 일\n\n> 이건 남는다\n'
    expect(statusBody(md)).toBe('**목표.** y\n\n## 할 일\n\n> 이건 남는다\n')
  })
  it('leaves text without a header alone', () => {
    expect(statusBody('## 주제\n- a')).toBe('## 주제\n- a')
  })
})

describe('splitStatus', () => {
  it('moves the rule sections to their own text, keeping order', () => {
    const body = '## 정본 위치\n\n- a\n\n## 공통 규칙\n\n> x\n\n1. r\n\n## 폴더와 편집 규칙\n\n- f\n\n## 프로젝트 규칙 2\n\n- p\n\n## 할 일\n\n- t'
    const { status, rules } = splitStatus(body)
    expect(status).toBe('## 정본 위치\n\n- a\n\n## 할 일\n\n- t')
    expect(rules).toBe('## 공통 규칙\n\n> x\n\n1. r\n\n## 폴더와 편집 규칙\n\n- f\n\n## 프로젝트 규칙 2\n\n- p')
  })
})
