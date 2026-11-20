import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from './i18n'

/**
 * 화면을 그리다 난 오류를 잡는다: 전에는 한 곳이 죽으면 창 전체가 하얗게 비었고,
 * Dock 앱은 마지막 주소로 다시 열려 계속 비어 있었다 (11/21 맥북의 빈 화면).
 * 오류 문구와 함께 다시 불러오기 · 첫 화면으로 빠져나갈 길을 보인다.
 * 본문 둘레에 한 겹 더 둔다(inside, 11/21): 화면 하나가 죽어도 레일 · 상단바 · 사이드바는 남아 다른 화면으로 갈 수 있고,
 * 주소가 바뀌면(resetKey) 오류를 지우고 새 화면을 그린다.
 */
export class CrashScreen extends Component<{ children: ReactNode; inside?: boolean; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('screen crashed', error, info.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="empty center" role="alert">
        <p>{t('이 화면을 그리다 오류가 났습니다.', 'This screen ran into an error.')}</p>
        <p className="error-text">{error.message}</p>
        <p>
          <button className="btn" onClick={() => location.reload()}>{t('다시 불러오기', 'Reload')}</button>{' '}
          {!this.props.inside && <button className="btn" onClick={() => { location.hash = ''; location.reload() }}>{t('첫 화면 열기', 'Open home')}</button>}
        </p>
      </div>
    )
  }
}
