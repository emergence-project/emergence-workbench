// 오른쪽 세부 패널의 절 (11/19, 참고: Claude Code 앱의 세부 패널): 작은 회색 절 제목 + 얇은 구분선, 접는 절은 「제목 ›」
import type { ReactNode } from 'react'

/** 절 하나. fold면 제목을 눌러 펼치고(처음 접힘), aside는 제목 줄 오른쪽(수 · 단추) */
export function SideSection({ title, aside, fold, ui, children }: { title: string; aside?: ReactNode; fold?: boolean; ui: string; children: ReactNode }) {
  if (fold) return (
    <details className="side-sec" data-ui={ui}>
      <summary className="side-sec-h">{title} <span className="chev side-sec-chev">›</span>{aside}</summary>
      {children}
    </details>
  )
  return (
    <section className="side-sec" data-ui={ui}>
      <div className="side-sec-h"><h3>{title}</h3>{aside}</div>
      {children}
    </section>
  )
}
