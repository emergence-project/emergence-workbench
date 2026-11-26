import type { HTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useCmdEnter } from './cmdEnter'

/**
 * ⌘↵로 보내는 여러 줄 입력란 (11/26 "조합 중 ⌘↵"): 한글을 친 직후의 ⌘↵는 조합 중이라, 조합이 끝나 마지막 글자까지 들어간 뒤에 보낸다.
 * 다른 키는 onKeyDown으로 그대로 받는다. 입력란 바깥(버튼 줄까지)에서 ⌘↵를 받는 곳은 useCmdEnter를 바로 쓴다
 */
export function SendArea({ onSend, onKeyDown, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { onSend(): void }) {
  const sendKey = useCmdEnter(onSend)
  return <textarea {...rest} onKeyDown={(e) => { if (!sendKey.onKeyDown(e)) onKeyDown?.(e) }} onCompositionEnd={sendKey.onCompositionEnd} />
}

/** ⌘↵를 칸 전체(입력란과 그 아래 버튼 줄)에서 받는 묶음: 버튼으로 옮겨 간 뒤에도 보내고, 조합 중이면 조합이 끝난 뒤 보낸다 */
export function SendBox({ onSend, onKeyDown, ...rest }: HTMLAttributes<HTMLDivElement> & { onSend(): void }) {
  const sendKey = useCmdEnter(onSend)
  return <div {...rest} onKeyDown={(e) => { if (!sendKey.onKeyDown(e)) onKeyDown?.(e) }} onCompositionEnd={sendKey.onCompositionEnd} />
}
