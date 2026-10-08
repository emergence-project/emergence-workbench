/**
 * 편집기는 줄바꿈을 \n 하나로 다룬다. 파일이 CRLF였으면 꺼낼 때 되돌려 고치지 않은 줄의 바이트가 바뀌지 않게 한다.
 * 글이 그대로면 처음 받은 글을 그대로 돌려준다 (CRLF와 LF가 섞인 파일도).
 */
export function keepLineBreaks(text: string, initial: string): string {
  if (!initial.includes('\r')) return text
  if (text === initial.replace(/\r\n?/g, '\n')) return initial
  return /\r\n/.test(initial) && !/(?<!\r)\n/.test(initial) ? text.replace(/\n/g, '\r\n') : text
}
