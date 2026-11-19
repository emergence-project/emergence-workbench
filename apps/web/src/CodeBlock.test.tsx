import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { shellCommand } from './CodeBlock'
import { MemoText } from './memo'
import { qk } from './queries'

describe('대화 답의 코드 블록', () => {
  it('셸 블록(sh · bash · zsh · console · 표시 없음)만 터미널에 넣는다', () => {
    expect(shellCommand('bash', 'ls -a\npwd')).toBe('ls -a\npwd')
    expect(shellCommand('', 'ls')).toBe('ls')
    expect(shellCommand('python', 'print(1)')).toBeNull()
    expect(shellCommand('sh', '  ')).toBeNull()
  })

  it('console 블록은 프롬프트 줄의 명령만', () => {
    expect(shellCommand('console', '$ ls\na.txt\n$ pwd\n/home')).toBe('ls\npwd')
    expect(shellCommand('console', 'ls')).toBe('ls')
  })

  const render = (text: string, available: boolean) => {
    const client = new QueryClient()
    client.setQueryData(qk.terminal, { available })
    return renderToStaticMarkup(<QueryClientProvider client={client}><MemoText text={text} /></QueryClientProvider>)
  }

  it('복사는 언제나, 「터미널에서 실행」은 이 컴퓨터에서 연 화면의 셸 블록에만', () => {
    const shell = '```bash\nls -a\n```'
    expect(render(shell, true)).toContain('data-ui="코드 복사"')
    expect(render(shell, true)).toContain('data-ui="터미널에서 실행"')
    expect(render(shell, false)).not.toContain('data-ui="터미널에서 실행"')
    expect(render('```python\nprint(1)\n```', true)).not.toContain('data-ui="터미널에서 실행"')
    expect(render(shell, true)).toContain('<pre><code>ls -a</code></pre>')
  })
})
