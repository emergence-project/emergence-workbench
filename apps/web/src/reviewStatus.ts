import { t } from './i18n'
/** 검토 문서와 프로젝트 작업 표의 자료 값은 그대로 두고, 화면 이름만 바꾼다. */
const REVIEW_STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: t('초안', 'Draft'),
  'in-review': t('검토 중', 'In review'),
  accepted: t('승인됨', 'Accepted'),
  pending: t('대기', 'Pending'),
  reviewed: t('검토 완료', 'Reviewed'),
}

export function reviewStatusLabel(status: string): string {
  return Object.hasOwn(REVIEW_STATUS_LABEL, status) ? REVIEW_STATUS_LABEL[status]! : status
}
