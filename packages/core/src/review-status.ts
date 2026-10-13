/**
 * 검토 문서(research.yaml sources.reviews)의 frontmatter `status` 가운데 사용자 차례인 것.
 * `in-review`(사용자에게 승인·반려를 묻는 상태)와 그 옛 이름만 센다. `draft`·`in-progress`는 아직 쓰는 중이고,
 * `accepted`·`closed`·`superseded`는 끝난 것이라 사용자 차례가 아니다.
 */
const AWAITING_USER = new Set(['in-review', 'review', 'proposed', 'needs-review', 'needs_review', 'needs-revision', 'needs_revision'])

export function awaitsUserReview(status: string): boolean {
  return AWAITING_USER.has(status.trim().toLowerCase())
}
