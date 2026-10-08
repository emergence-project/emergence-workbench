import { markdownToLatex } from '@rw/core'
import { describe, expect, it } from 'vitest'
import { OPTIONAL_AUX_NOTE_COMMANDS } from './auxNoteCommands'
import { renderObsidian } from './ObsidianMarkdown'
import { numberNote } from './noteNumbers'

const fill = (template: string, values: string[] = []) => {
  let i = 0
  return template.replace(/\$\{\}/g, () => values[i++] ?? '')
}
const readNote = (text: string) => renderObsidian(numberNote(text).text)

describe('optional auxiliary note prompts', () => {
  it.each(OPTIONAL_AUX_NOTE_COMMANDS)('keeps an empty $label invisible in both outputs', (command) => {
    const body = fill(command.tpl)
    expect(readNote(body).trim()).toBe('')
    expect(markdownToLatex(body).trim()).toBe('')
  })

  it('shows entered reasoning and equations without showing the prompts', () => {
    const body = fill(OPTIONAL_AUX_NOTE_COMMANDS[0]!.tpl, [
      '가정은 $x > 0$이다.',
      '식 (2)에서 필요한 경계를 확인하지 못했다.',
      '문헌의 정리 번호와 가정을 대조한 뒤 다시 연다.',
    ])
    const html = readNote(body)
    const latex = markdownToLatex(body)
    for (const output of [html, latex]) {
      expect(output).toContain('식 (2)에서 필요한 경계를 확인하지 못했다.')
      expect(output).toContain('문헌의 정리 번호와 가정을 대조한 뒤 다시 연다.')
      expect(output).not.toContain('아래 빈 줄')
      expect(output).not.toContain('<!--')
    }
    expect(html).toContain('katex')
    expect(latex).toContain('$x > 0$')
  })

  it('shows calculation provenance only when entered and leaves existing body intact', () => {
    const existing = '기존 기록\n\n$$\nx = 1\n$$\n'
    const evidence = '결과 파일: result.csv · 코드 커밋: abc123 · 입력: n=4 · 확인 범위: 예제 하나'
    const blank = fill(OPTIONAL_AUX_NOTE_COMMANDS[1]!.tpl)
    expect(readNote(existing + blank)).toBe(readNote(existing))
    expect(markdownToLatex(existing + blank)).toBe(markdownToLatex(existing))
    for (const output of [readNote(fill(OPTIONAL_AUX_NOTE_COMMANDS[1]!.tpl, [evidence])), markdownToLatex(fill(OPTIONAL_AUX_NOTE_COMMANDS[1]!.tpl, [evidence]))]) {
      expect(output).toContain(evidence)
      expect(output).not.toContain('아래 빈 줄')
    }
  })
})
