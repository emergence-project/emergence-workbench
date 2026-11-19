// 대화 답 · 메모의 ``` 코드 블록 (memo.tsx의 MemoText). 「복사」는 블록 전체를, 셸 명령 블록의 「터미널에서 실행」은
// 이 화면을 보는 컴퓨터의 터미널(오른쪽 사이드바 › 터미널)에 넣기만 한다: Enter는 사용자가 누른다 (11/19 "대화중에 터미널 실행 · 복사가 쉽게")
import { useState } from 'react'
import { t } from './i18n'
import { Icon } from './icons'
import { putInTerminal, useTerminalAvailable } from './TerminalPane'

/** 터미널에 넣을 수 있는 블록의 언어 (표시가 없는 블록도) */
const SHELL_LANGS = new Set(['', 'sh', 'bash', 'zsh', 'shell', 'console', 'terminal'])

/** 터미널에 넣을 명령. 셸 블록이 아니면 null. console 블록은 `$ ` · `% `로 시작하는 줄만 (프롬프트를 떼고), 그런 줄이 없으면 전체 */
export function shellCommand(lang: string, text: string): string | null {
  if (!SHELL_LANGS.has(lang) || !text.trim()) return null
  if (lang !== 'console') return text
  const cmds = text.split('\n').flatMap((l) => { const m = /^\s*[$%] (.*)$/.exec(l); return m ? [m[1]!] : [] })
  return cmds.length ? cmds.join('\n') : text
}

/** 클립보드에 쓴다. 안전하지 않은 주소(http로 연 원격 화면)에서는 navigator.clipboard가 없어 고른 글 복사로 */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text).then(() => true, () => false)
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { return document.execCommand('copy') } finally { ta.remove() }
}

export function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const terminal = useTerminalAvailable()
  const cmd = terminal ? shellCommand(lang, text) : null
  const copy = () => void copyText(text).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) } })
  return (
    <div className="memo-pre" data-ui="코드 블록">
      <div className="memo-pre-bar">
        <span className="memo-pre-lang">{lang}</span>
        <span className="sp" />
        <button className="memo-pre-btn" data-ui="코드 복사" onClick={copy}>{copied ? Icon.check : Icon.copy}{copied ? t('복사함', 'Copied') : t('복사', 'Copy')}</button>
        {cmd !== null && <button className="memo-pre-btn" data-ui="터미널에서 실행" title={t('이 컴퓨터의 터미널에 넣습니다. 확인하고 Enter를 눌러 실행하세요', 'Puts it in this computer\'s terminal. Check it, then press Enter to run')} onClick={() => putInTerminal(cmd)}>{t('터미널에서 실행', 'Run in terminal')}</button>}
      </div>
      <pre><code>{text}</code></pre>
    </div>
  )
}
