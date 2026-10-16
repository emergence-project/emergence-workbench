import { INSTRUCTION_HOURS, INSTRUCTION_MODES, type InstructionMode } from '@rw/core'
import type { AgentSettings as Settings } from '@rw/core/contract/settings'
import { useEffect, useState } from 'react'
import { api } from './api'
import { t } from './i18n'

const MODE: Record<InstructionMode, () => string> = {
  manual: () => t('직접 부탁', 'When asked'),
  instant: () => t('바로', 'Right away'),
  daily: () => t('하루 한 번', 'Once a day'),
}

/**
 * 설정 › 에이전트 (10/16 사용자 결정 "설정에서 조절할 수 있게 하자"): 기록에 남긴 지시를 이 맥의 Claude가 언제 하는지.
 * 맥의 Claude는 한 번에 하나씩 하고, 파일은 직접 고치지 않는다(노트 고침은 답에 적고 "노트에 적용"으로).
 */
export function AgentSettings() {
  const [s, setS] = useState<Settings | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.agentSettings().then(setS).catch((e: Error) => setErr(e.message)) }, [])
  const save = (patch: Partial<Settings>) => {
    setErr(null)
    api.saveAgentSettings(patch).then(setS).catch((e: Error) => setErr(e.message))
  }
  if (!s) return <p className="muted">{err ?? t('설정을 읽는 중…', 'Reading settings…')}</p>
  return (
    <div className="set-rows" data-ui="에이전트">
      <div className="set-row" data-ui="지시 처리">
        <div>
          <div className="set-name">{t('지시 처리', 'Instructions')}</div>
          <div className="set-desc">{t('기록에 남긴 지시를 이 맥의 Claude가 언제 할지 고릅니다. 직접 부탁이면 맥은 하지 않고, 다음에 일하는 에이전트가 집어 갑니다. 한 번에 하나씩 하고, 노트 고침은 답에 적어 "노트에 적용"으로 반영합니다. 지시 하나마다 Claude 사용량이 듭니다.', 'Choose when Claude on this Mac carries out instructions left in records. With "When asked", the Mac does nothing and the next agent session picks them up. One runs at a time, and note changes come in the answer for you to apply with "Apply to note". Each instruction uses Claude usage.')}</div>
          {err && <div className="error-text">{err}</div>}
        </div>
        <div className="segmented small" role="radiogroup" data-ui="고르기">
          {INSTRUCTION_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={s.instructions === m} className={s.instructions === m ? 'on' : ''} onClick={() => save({ instructions: m })}>{MODE[m]()}</button>
          ))}
        </div>
      </div>
      {s.instructions === 'daily' && <div className="set-row" data-ui="지시 처리 시각">
        <div>
          <div className="set-name">{t('시각', 'Time')}</div>
          <div className="set-desc">{t('이 시각에 모든 프로젝트의 대기 중인 지시를 모아 합니다. 그때 맥과 앱이 켜져 있어야 합니다.', 'At this time, waiting instructions from every project are carried out. The Mac and the app must be running then.')}</div>
        </div>
        <select value={s.at} aria-label={t('시각', 'Time')} onChange={(e) => save({ at: e.target.value })}>
          {INSTRUCTION_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>}
    </div>
  )
}
