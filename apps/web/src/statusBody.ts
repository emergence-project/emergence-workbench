/**
 * STATUS.md 글에서 사람이 볼 부분만: 맨 위 제목 줄과 그 아래 에이전트용 안내(> 인용 줄)를 뺀다.
 * 나머지(목표, 정본 위치, 할 일, 주제, 노트 …)는 한 글자도 바꾸지 않는다.
 */
export function statusBody(markdown: string): string {
  const lines = markdown.split('\n')
  let i = 0
  const skip = (test: (line: string) => boolean) => {
    for (let line = lines[i]; line !== undefined && (test(line) || !line.trim()); line = lines[++i]);
  }
  skip((line) => /^# /.test(line))
  skip((line) => line.startsWith('>'))
  return lines.slice(i).join('\n')
}
