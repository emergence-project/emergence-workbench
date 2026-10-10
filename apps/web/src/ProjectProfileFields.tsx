import { useMemo } from 'react'
import type { ProjectKind, ProjectState, ResearchListItem } from './api'
import { FieldTags } from './FieldTags'
import { PROJECT_KIND_LABEL, PROJECT_KINDS, PROJECT_STATE_DOT, PROJECT_STATE_LABEL, PROJECT_STATES } from './projectProfile'
import { t } from './i18n'

export interface ProfilePatch { kind?: ProjectKind; fields?: string[]; state?: ProjectState; rail?: boolean }

/** 진행 상태 색 점 + 이름 (노트 상태와 같은 색, 이름은 진행 · 멈춤 · 완료) */
export function ProjectStateDot({ state, label }: { state: ProjectState; label?: boolean }) {
  const name = PROJECT_STATE_LABEL[state]
  return <>
    <span className={`g ${PROJECT_STATE_DOT[state]}`} role="img" aria-label={name} title={name} />
    {label && <span className="g-name">{name}</span>}
  </>
}

/** 다른 프로젝트가 많이 쓴 분야 (분야 더하기 칸의 첫 제안) */
export function usedFields(all: Pick<ResearchListItem, 'fields'>[]): Map<string, number> {
  const used = new Map<string, number>()
  for (const r of all) for (const f of r.fields) used.set(f.toLowerCase(), (used.get(f.toLowerCase()) ?? 0) + 1)
  return used
}

/**
 * 성격(연구 · 업무 하나) · 분야(개념노트 분류에서 고르는 이름표 여러 개) · 진행 상태(진행 · 멈춤 · 완료) 고르기.
 * 프로젝트 고치기 창과 등록 창이 함께 쓴다. 바꾼 것만 onChange로 알린다.
 */
export function ProjectProfileFields({ kind, fields, state, rail, all, onChange }: {
  kind: ProjectKind
  fields: string[]
  /** 없으면 진행 상태 줄을 두지 않는다 (등록 창) */
  state?: ProjectState
  /** 멈춤 · 완료여도 왼쪽 띠에 보이기. 진행 상태 줄과 함께 */
  rail?: boolean
  /** 모든 프로젝트 (분야 제안) */
  all: Pick<ResearchListItem, 'fields'>[]
  onChange(patch: ProfilePatch, message: string): void
}) {
  const used = useMemo(() => usedFields(all), [all])
  return (
    <dl className="pp-fields" data-ui="프로젝트 성격과 분야">
      <dt>{t('성격', 'Kind')}</dt>
      <dd>
        <div className="segmented" role="radiogroup" aria-label={t('프로젝트 성격', 'Project kind')} data-ui="성격 고르기">
          {PROJECT_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''}
              onClick={() => kind !== k && onChange({ kind: k }, t(`성격: ${PROJECT_KIND_LABEL[k]}`, `Kind: ${PROJECT_KIND_LABEL[k]}`))}>{PROJECT_KIND_LABEL[k]}</button>
          ))}
        </div>
      </dd>
      <dt>{t('분야', 'Field')}</dt>
      <dd><FieldTags tags={fields} used={used} tagClassName="pc-field" onChange={(next, message) => onChange({ fields: next }, message)} /></dd>
      {state && <>
        <dt>{t('진행 상태', 'Status')}</dt>
        <dd>
          <div className="segmented" role="radiogroup" aria-label={t('진행 상태', 'Status')} data-ui="진행 상태 고르기">
            {PROJECT_STATES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={state === s} className={state === s ? 'on' : ''}
                onClick={() => state !== s && onChange({ state: s }, t(`진행 상태: ${PROJECT_STATE_LABEL[s]}`, `Status: ${PROJECT_STATE_LABEL[s]}`))}><ProjectStateDot state={s} label /></button>
            ))}
          </div>
          {/* 10/10 12:59: 띠는 진행 중인 프로젝트만. 멈춤 · 완료도 띠에 두려면 켠다 */}
          <label className="check pp-rail" data-ui="띠에 보이기">
            <input type="checkbox" checked={state === 'active' || !!rail} disabled={state === 'active'}
              onChange={(e) => onChange({ rail: e.target.checked }, e.target.checked ? t('왼쪽 띠에 보입니다', 'Shown in the left rail') : t('왼쪽 띠에서 숨깁니다', 'Hidden from the left rail'))} />
            {state === 'active' ? t('진행 중이라 왼쪽 띠에 보입니다', 'Shown in the left rail while in progress') : t('왼쪽 띠에 보이기', 'Show in the left rail')}
          </label>
        </dd>
      </>}
    </dl>
  )
}
