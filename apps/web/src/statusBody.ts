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

/** 규칙 절: 왼쪽 사이드바 프로젝트 정보 아래 AGENTS.md 화면이 보이고 현황에서는 뺀다 (10/15 피드백 "현황과 AGENTS.md를 나누자") */
const RULE_HEADING = /^## (공통 규칙|폴더와 편집 규칙|프로젝트 규칙)(\s|$)/

/** 현황 글을 규칙 절과 나머지로 나눈다. 절의 순서와 글자는 바꾸지 않는다 */
export function splitStatus(body: string): { status: string; rules: string } {
  const status: string[] = [], rules: string[] = []
  let into = status
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) into = RULE_HEADING.test(line) ? rules : status
    into.push(line)
  }
  return { status: status.join('\n').trim(), rules: rules.join('\n').trim() }
}
