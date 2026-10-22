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

/** 모아 보내는 이슈 초안에 넣는 피드백 하나 */
export interface IssueItem { date: string; time: string; kind: string; text: string; area: string; route?: string; version?: string }
/** GitHub 새 이슈 주소가 너무 길면 열리지 않아(약 8천 자) 그 안에서 자른다 */
export const ISSUE_URL_MAX = 7500

/**
 * 고른 피드백 여럿을 이슈 하나로 (10/22 사용자: "등록해 두고 한 번에 보낸다").
 * 버그 양식의 what 칸에 번호를 붙여 차례로 적고, 화면 · 버전은 항목마다 그 줄에 둔다. 그림은 넣지 않는다(issueDraftUrl과 같은 이유).
 * 주소가 길어지면 거기까지만 넣고, 넣은 수를 돌려준다
 */
export function issuesDraftUrl(base: string, items: IssueItem[], environment: string): { url: string; included: number } {
  const one = (x: IssueItem, i: number) => {
    const where = [x.area, x.route, x.version && `v ${x.version}`].filter(Boolean).join(' · ')
    return `${i + 1}. [${x.kind}] ${x.text.trim().replace(/\r?\n/g, '\n   ')}\n   (${x.date} ${x.time}${where ? ` · ${where}` : ''})`
  }
  const build = (n: number) => {
    const list = items.slice(0, n)
    const title = list.length === 1 ? feedbackSummary(list[0]!.text).slice(0, 80) : `피드백 ${list.length}개 (${list[0]!.date}${list.length > 1 && list.at(-1)!.date !== list[0]!.date ? ` – ${list.at(-1)!.date}` : ''})`
    const areas = [...new Set(list.map((x) => x.area).filter(Boolean))]
    const versions = [...new Set(list.map((x) => x.version).filter((v): v is string => !!v))]
    const q = new URLSearchParams({ template: 'bug.yml', title, what: list.map(one).join('\n\n'), area: areas.join(', ') })
    if (versions.length) q.set('version', versions.join(', '))
    q.set('environment', environment)
    return `${base}?${q}`
  }
  let n = items.length
  let url = build(n)
  while (n > 1 && url.length > ISSUE_URL_MAX) url = build(--n)
  return { url, included: n }
}
