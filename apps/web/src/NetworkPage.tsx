import { Authors } from './network/Authors'
import { PersonPage } from './network/PersonPage'

export { NetworkSide } from './network/NetworkSide'
export { NetworkRailCount } from './network/Suggestions'
export { Avatar, byStarThenName } from './network/people'

/**
 * 네트워킹: 함께 연구하는 사람들 (10/4 피드백).
 * - 사이드바에 사람 목록: 저자와 소속에 있는 사람 + 따로 더한 관심 연구자 (앱 설정 config.yaml의 people:)
 * - 사람마다 페이지: 우선 노트 참고 문헌(공유 라이브러리 references.bib와 프로젝트 bib)에 있는 그 사람의 논문. arXiv 새 논문은 나중에 (10/4 사용자 결정)
 * 부분은 network/ 폴더에 있다: 함께 쓰는 자료와 도우미(people) · 사이드바 · 첫 화면 · 사람 카드 · 등록 추천 · 사람 페이지 · 새 논문 · 노트 저자 · 고치기 창.
 * 서버 자료는 화면 캐시(queries.ts의 qk.network · qk.personNewPapers · qk.latexSetup · qk.googleStatus)에 둔다.
 */
export function NetworkPage({ person, onSaved }: { person?: string; onSaved(m: string): void }) {
  return (
    <main className="stage full" data-ui="네트워킹">
      <section className="pane">
        <div className="scroll">
          <div className="page-body">
            {person ? <PersonPage key={person} id={person} onSaved={onSaved} /> : <Authors onSaved={onSaved} />}
          </div>
        </div>
      </section>
    </main>
  )
}
