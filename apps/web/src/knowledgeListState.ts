import type { ConceptCheck, ConceptIssue, ConceptSort } from './api'
import { go } from './router'
import { store } from './store'
import { t } from './i18n'

export const KNOWLEDGE_LAYOUT_KEY = 'rw-knowledge-columns'
export const KNOWLEDGE_SORT_KEY = 'rw-knowledge-sort'
export const ISSUE_NAMES: Record<ConceptIssue, string> = { empty: t('비어 있음', 'Empty'), emptySection: t('빈 절', 'Empty section'), todo: 'TODO', brokenLink: t('끊긴 링크', 'Broken link'), noSource: t('출처 없음', 'No source'), unknownCite: t('bib에 없는 키', 'Key not in bib') }
export const CHECK_NAMES: Record<ConceptCheck, string> = { unchecked: t('확인 전', 'Not reviewed'), changedAfterCheck: t('확인 뒤 바뀜', 'Changed after review'), draftsToReview: t('초안 검토', 'Drafts to review') }
export type KnowledgeFilters = { subjectPrefix?: string; issue?: ConceptIssue; check?: ConceptCheck; showEmpty?: boolean }
export type KnowledgeSort = { col: ConceptSort; dir: 'asc' | 'desc' }

/** 거르기는 주소에 남겨 뒤로·앞으로에서도 같은 목록을 보여 준다. 정렬은 논문처럼 브라우저가 기억한다. */
export function showKnowledgeList(filters: KnowledgeFilters = {}, recent = false) {
  if (recent) {
    store.set(KNOWLEDGE_SORT_KEY, { col: 'mtime', dir: 'desc' })
    const layout = store.get<{ order?: ConceptSort[]; hidden?: ConceptSort[] } | null>(KNOWLEDGE_LAYOUT_KEY, null)
    if (Array.isArray(layout?.hidden)) store.set(KNOWLEDGE_LAYOUT_KEY, { ...layout, hidden: layout.hidden.filter((c) => c !== 'mtime') })
  }
  go({ page: 'library', list: true, ...filters })
}
