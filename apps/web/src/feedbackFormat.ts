import { parseMemo } from '@rw/core'

/** 처리한 피드백과 표의 한 줄 요약: 줄마다 목록 기호를 빼고 항목 사이를 구분한다. */
export function feedbackSummary(text: string): string {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(' · ')
}

/** 올해 날짜는 월일부터, 다른 해는 연도까지 보인다. */
export function feedbackWhen(date: string, time: string, year = new Date().getFullYear()): string {
  return `${date.startsWith(`${year}-`) ? date.slice(5) : date} ${time}`.trim()
}

/** 미리보기는 MemoText가 실제 목록으로 그리는 줄이 있을 때만 연다. */
export const hasFeedbackList = (text: string): boolean => parseMemo(text).some((block) => block.kind === 'list')

/**
 * 공개 저장소의 버그 양식(.github/ISSUE_TEMPLATE/bug.yml)을 미리 채운 새 이슈 주소 (2026-10-08 결정, docs/maintaining.md).
 * 칸 이름은 양식의 id. 화면 그림은 넣지 않는다: 연구 내용이 공개될 수 있어서 올리는 사람이 직접 판단해 붙인다
 */
export function issueDraftUrl(base: string, f: { text: string; area: string; snippet?: string; route: string; version?: string | null; environment: string }): string {
  const first = feedbackSummary(f.text.split(/\r?\n/).find((l) => l.trim()) ?? '')
  const title = first.length > 80 ? `${first.slice(0, 79)}…` : first
  const q = new URLSearchParams({ template: 'bug.yml', title, what: f.snippet ? `${f.text.trim()}\n\n> ${f.snippet}` : f.text.trim(), area: f.area, route: f.route })
  if (f.version) q.set('version', f.version)
  q.set('environment', f.environment)
  return `${base}?${q}`
}
