import { UI_OPTIONS, DEFAULT_UI, type UiSettings } from '@rw/core'
import type { ReactNode } from 'react'
import { AppInfo } from './AppInfo'
import { AppUpdate } from './AppUpdate'
import { BackupSettings } from './BackupSettings'
import { GitHubAccount } from './GitHubAccount'
import { GoogleSettings } from './GoogleSettings'
import { LibrarySettings, LIBRARY_SECTIONS } from './LibrarySettings'
import { go } from './router'
import { LatexSetupPage } from './LatexSetupPage'
import { PaintDots } from './RecordMenus'
import { t } from './i18n'

/**
 * 설정: 화면 모양을 바꾼다. 바꾸면 바로 입혀지고 앱 설정 파일(config.yaml의 ui:)에 저장된다.
 * 연구 파일은 건드리지 않는다.
 */
const LABEL: { [K in keyof UiSettings]?: Record<string, string> } = {
  // Language names stay in their own language so anyone can find theirs
  language: { system: t('시스템 따름', 'System'), en: 'English', ko: '한국어' },
  theme: { system: t('시스템 따름', 'System'), light: t('라이트', 'Light'), dark: t('다크', 'Dark') },
  fontSize: { small: t('작게', 'Small'), normal: t('보통', 'Normal'), large: t('크게', 'Large') },
  density: { compact: t('촘촘하게', 'Compact'), normal: t('보통', 'Normal'), comfortable: t('넉넉하게', 'Comfortable') },
  accent: { mono: t('흑백', 'Mono'), indigo: t('남색', 'Indigo'), plum: t('자주', 'Plum') },
  editorFont: { menlo: 'Menlo', monaco: 'Monaco', 'noto-mono': 'Noto Sans Mono', courier: 'Courier' },
  editorLineHeight: { 1.5: t('좁게', 'Tight'), 1.65: t('조금 좁게', 'Snug'), 1.8: t('보통', 'Normal'), 2: t('넓게', 'Loose') },
}

const SWATCH: Record<UiSettings['accent'], string> = { mono: 'var(--text)', indigo: 'var(--accent-indigo)', plum: 'var(--accent-plum)' }

/**
 * 설정의 부분 (왼쪽 사이드바, 10/4 피드백 "설정 페이지에 사이드바를 넣자").
 * LaTeX는 편집기와 서식을 한 화면의 두 절로 둔다 (10/4 19:29 "Latex 탭 두개 합치고, 서브섹션으로 만들어"). 사이드바의 아래 줄은 그 절로 옮겨 간다.
 */
export const SETTINGS_PARTS = [
  { key: 'update', label: t('앱 기본정보', 'About this app') },
  { key: 'google', label: t('계정', 'Accounts') },
  { key: 'backup', label: t('백업', 'Backup') },
  { key: 'library', label: t('라이브러리 관리', 'Library'), subs: LIBRARY_SECTIONS },
  { key: 'screen', label: t('화면', 'Display') },
  { key: 'latex', label: 'LaTeX', subs: [{ id: 'latex-editor', label: t('편집기', 'Editor') }, { id: 'latex-templates', label: t('서식', 'Templates') }, { id: 'latex-macros', label: t('명령어', 'Macros') }] },
] as const

/** 옛 편집기 · PDF 폴더 주소와 라이브러리 하위 절도 해당 설정 묶음으로 연다. */
const partOf = (part?: string) => {
  if (part === 'editor') return 'latex'
  if (part === 'papers' || LIBRARY_SECTIONS.some((s) => s.id === part)) return 'library'
  return SETTINGS_PARTS.some((p) => p.key === part) ? part! : SETTINGS_PARTS[0].key
}
export const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })

export function SettingsSide({ part }: { part?: string }) {
  const cur = partOf(part)
  return (
    <div className="set-side" data-ui="설정 목록">
      {SETTINGS_PARTS.map((p) => (
        <div key={p.key} className="set-group">
          <button className={`nav${cur === p.key ? ' on' : ''}`} data-ui="설정 줄" data-ui-item={p.label} onClick={() => go({ page: 'settings', part: p.key })}>
            <span className="label">{p.label}</span>
          </button>
          {'subs' in p && cur === p.key && p.subs.map((s) => (
            <button key={s.id} className="nav set-sub" data-ui="설정 줄" data-ui-item={`${p.label} ${s.label}`} onClick={() => scrollToSection(s.id)}>
              <span className="label">{s.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function SettingsPage({ ui, onChange, part, onSaved }: { ui: UiSettings; onChange(patch: Partial<UiSettings>): void; part?: string; onSaved(message: string): void }) {
  const cur = partOf(part)
  const show = (key: string) => cur === key
  function choice<K extends keyof UiSettings>(key: K, render?: (v: UiSettings[K]) => ReactNode) {
    return (
      <div className="segmented small" role="radiogroup" data-ui="고르기">
        {(UI_OPTIONS[key] as unknown as readonly UiSettings[K][]).map((v) => (
          <button key={String(v)} role="radio" aria-checked={ui[key] === v} className={ui[key] === v ? 'on' : ''} onClick={() => onChange({ [key]: v } as Partial<UiSettings>)}>
            {render ? render(v) : LABEL[key]?.[String(v)] ?? String(v)}
          </button>
        ))}
      </div>
    )
  }
  const screenKeys = ['language', 'theme', 'fontSize', 'density', 'accent', 'highlightColor'] as const
  const screenChanged = screenKeys.some((k) => ui[k] !== DEFAULT_UI[k])
  if (cur === 'latex') {
    const editorKeys = ['editorFont', 'editorSize', 'editorLineHeight'] as const
    const editorChanged = editorKeys.some((k) => ui[k] !== DEFAULT_UI[k])
    return (
      <LatexSetupPage onSaved={onSaved} scrollTo={part === 'editor' ? 'latex-editor' : undefined} editor={
        <section id="latex-editor" data-ui="LaTeX 편집기">
          <div className="sec-head">
            <h2>{t('편집기', 'Editor')}</h2><span className="sp" />
            <button className="btn" data-ui="기본값 버튼" disabled={!editorChanged} onClick={() => onChange(Object.fromEntries(editorKeys.map((k) => [k, DEFAULT_UI[k]])) as Partial<UiSettings>)}>{t('기본값으로 되돌리기', 'Reset to defaults')}</button>
          </div>
          <div className="set-rows">
            <Row name="글꼴" label={t('글꼴', 'Font')} desc={t('고정폭 글꼴. 한글은 시스템 글꼴로 보입니다.', 'Monospace font. Korean text uses the system font.')}>{choice('editorFont')}</Row>
            <Row name="글자 크기" label={t('글자 크기', 'Font size')} desc="">{choice('editorSize', (v) => `${v}`)}</Row>
            <Row name="줄 간격" label={t('줄 간격', 'Line spacing')} desc="">{choice('editorLineHeight')}</Row>
          </div>
          <pre className="editor-sample" data-ui="편집기 미리보기" aria-label={t('편집기 미리보기', 'Editor preview')}>
            <span className="c">{t('% 편집기 미리보기', '% Editor preview')}</span>{'\n'}
            <span className="k">\begin</span>{'{proof}\n'}
            {'  '}<span className="m">$V - E + F = 2$</span>{t(' 이므로\n', ', so\n')}
            {'  '}<span className="k">\deg</span>{t('(v) ≤ 5 인 꼭짓점을 고르면 …\n', '(v) ≤ 5 gives a vertex …\n')}
            <span className="k">\end</span>{'{proof}'}
          </pre>
        </section>
      } />
    )
  }

  return (
    <main className="stage full set-page" data-ui="설정">
      <section className="pane">
        <div className="scroll">
          <div className="page-body">
            {show('update') && <section data-ui="앱 업데이트 묶음">
              <div className="sec-head"><h2>{t('앱 기본정보', 'About this app')}</h2></div>
              <AppInfo />
              <div className="sec-head"><h2>{t('업데이트', 'Update')}</h2></div>
              <AppUpdate />
              <p className="set-desc" title={t('이 맥에서 남긴 피드백은 함께 커밋해 올립니다. 앱 코드를 고쳐 두었다면 받지 않고 이유를 보여 줍니다. 연구 저장소는 바꾸지 않습니다.', 'Feedback left on this computer is committed and pushed with it. If the app code has local changes, the update is skipped and the reason is shown. Research repositories are not changed.')}>{t('새 버전을 받아 앱을 다시 시작합니다.', 'Downloads the new version and restarts the app.')}</p>
            </section>}

            {show('google') && <section data-ui="구글 계정 묶음">
              {/* 10/4 19:43: "구글 계정"을 "계정"으로, GitHub도 여기서. 연구자로서의 나는 네트워킹의 내 페이지(19:42, 둘은 따로 둔다) */}
              <div className="sec-head"><h2>{t('계정', 'Accounts')}</h2></div>
              <h3 className="set-h3">GitHub</h3>
              <GitHubAccount />
              <h3 className="set-h3">{t('구글', 'Google')}</h3>
              <GoogleSettings onUiRestored={onChange} />
              <p className="set-desc" style={{ maxWidth: 'none' }}>{t('연구자 프로필(이름·소속·이메일)은 ', 'Your researcher profile (name, affiliation, email) is edited on your page under "Me" at the top of ')}<button className="a" onClick={() => go({ page: 'network' })}>{t('네트워킹', 'Networking')}</button>{t(' 맨 위 "나"의 내 페이지에서 고칩니다. 계정은 로그인, 내 페이지는 연구자 정보로 따로 둡니다.', '. Accounts are for signing in; your page holds your researcher details.')}</p>
            </section>}

            {show('backup') && <section data-ui="백업 묶음">
              <div className="sec-head"><h2>{t('백업', 'Backup')}</h2></div>
              <BackupSettings />
            </section>}

            {show('library') && <LibrarySettings onSaved={onSaved} section={part === 'papers' ? 'library-papers' : part} />}

            {show('screen') && <section data-ui="화면">
              <div className="sec-head">
                <h2>{t('화면', 'Display')}</h2><span className="sp" />
                <button className="btn" data-ui="기본값 버튼" disabled={!screenChanged} onClick={() => onChange(Object.fromEntries(screenKeys.map((k) => [k, DEFAULT_UI[k]])) as Partial<UiSettings>)}>{t('기본값으로 되돌리기', 'Reset to defaults')}</button>
              </div>
              <div className="set-rows">
                <Row name="언어" label={t('언어', 'Language')} desc={t('화면의 말. 시스템 따름은 브라우저 언어를 따릅니다. 바꾸면 화면을 다시 엽니다.', 'Screen language. System follows the browser. Changing it reloads the screen.')}>{choice('language')}</Row>
                <Row name="테마" label={t('테마', 'Theme')} desc={t('시스템 따름은 macOS의 라이트·다크 설정을 따릅니다. 테마는 여기에서만 바꿉니다.', 'System follows the light or dark setting of your computer. The theme is changed only here.')}>{choice('theme')}</Row>
                <Row name="글자 크기" label={t('글자 크기', 'Font size')} desc={t('메뉴·본문·표의 글자. 편집기 글자는 따로 정합니다.', 'Text in menus, notes and tables. The editor has its own size.')}>{choice('fontSize')}</Row>
                <Row name="화면 밀도" label={t('화면 밀도', 'Density')} desc={t('여백의 크기. 촘촘하게 하면 한 화면에 더 많이 보입니다.', 'Amount of spacing. Compact fits more on one screen.')}>{choice('density')}</Row>
                <Row name="강조 색" label={t('강조 색', 'Accent color')} desc={t('주 버튼과 선택 표시의 색. 상태 색(진행 파랑 · 멈춤 주황 · 폐기 회색 · 해결 청록)과 겹치지 않는 색만 고를 수 있습니다.', 'Color of primary buttons and selection. Only colors that differ from the status colors (blue in progress, orange blocked, gray dropped, teal solved) are offered.')}>
                  {choice('accent', (v) => <><span className="swatch" style={{ background: SWATCH[v] }} />{LABEL.accent![v]}</>)}
                </Row>
                <Row name="하이라이트 처음 색" label={t('하이라이트 처음 색', 'Default highlight color')} desc={t('고른 글 메뉴에서 처음 고르는 색입니다.', 'The color first picked in the selection menu.')}>
                  <PaintDots color={ui.highlightColor} onChange={(highlightColor) => onChange({ highlightColor })} />
                </Row>
              </div>
            </section>}

          </div>
        </div>
      </section>
    </main>
  )
}

/** `name` is the feedback part name (data-ui, kept Korean); `label` is what the screen shows. */
function Row({ name, label = name, desc, children }: { name: string; label?: string; desc: string; children: ReactNode }) {
  return (
    <div className="set-row" data-ui={name}>
      <div>
        <div className="set-name">{label}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      {children}
    </div>
  )
}
