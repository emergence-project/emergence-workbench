import { LIMITS, type ResearchApi, type ResearchSummary } from './api'
import { charCount } from './cardParts'
import { t } from './i18n'

/** 창의 초기 값과 저장 기준 해시가 같은 파일에서 왔는지 확인한다. */
export async function readProjectEditSnapshot(rapi: Pick<ResearchApi, 'project' | 'summary'>): Promise<{ research: ResearchSummary['research']; hash: string }> {
  const before = await rapi.project()
  const summary = await rapi.summary()
  const after = await rapi.project()
  if (before.hash !== after.hash) throw new Error(t('다른 곳에서 research.yaml이 바뀌었습니다. 다시 열어 고쳐 주세요', 'research.yaml changed elsewhere. Open it again to edit.'))
  return { research: summary.research, hash: before.hash }
}

/** 주제 창과 같은 글자 수 기준. 넘친 글도 자르지 않고 사용자가 고친다. */
/** 넘친 글이라도 고치지 않은 칸은 막지 않는다: 길게 적어 둔 이름 때문에 다른 것을 못 고치는 일이 없게 (서버의 주제 규칙과 같다) */
export function projectTextState(title: string, description: string, before?: { title: string; description: string }) {
  const counts = { title: charCount(title), description: charCount(description) }
  const titleOk = counts.title <= LIMITS.projectTitle || title === before?.title
  const descriptionOk = counts.description <= LIMITS.description || description === before?.description
  return { counts, valid: !!title.trim() && titleOk && descriptionOk }
}
