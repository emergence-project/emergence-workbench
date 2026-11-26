/**
 * 프로젝트의 내 차례 수 (11/26 "수가 서로 다른 곳"): 한 가지는 사이드바의 한 줄에서만 센다.
 * 「기록」 = 에이전트가 물은 기록 + 판단할 맡긴 일(+ 검토 문서), 「흐름」 = 결정할 흐름, 「수정 검토」 = 검토할 노트.
 * 줄의 합(total)이 레일의 프로젝트 배지 · 기록 화면의 탭 「내 차례」와 같다. 남은 할 일은 내가 적은 일이라 여기에 넣지 않는다
 */
export interface TurnParts { records: number; flow: number; edit: number; total: number }
export function turnParts({ ask, task, flow, edit, review = 0 }: { ask: number; task: number; flow: number; edit: number; review?: number }): TurnParts {
  const records = ask + task + review
  return { records, flow, edit, total: records + flow + edit }
}
