import type { Command } from './conceptCommands'
import { t } from './i18n'

// Optional prompts use the existing hidden-comment syntax in both note outputs.
export const OPTIONAL_AUX_NOTE_COMMANDS: Command[] = [
  {
    label: t('멈춤 기록 (선택)', 'Blocked record (optional)'),
    detail: t('목표와 가정 · 멈춘 근거 · 다시 열 조건', 'Goal and assumptions · Why it is blocked · When to reopen'),
    tpl: '<!-- 목표와 가정: 아래 빈 줄에 필요할 때만 적습니다. -->\n\n${}\n\n<!-- 멈춘 근거 (식·반례·문헌 위치): 아래 빈 줄에 확인한 근거만 적습니다. -->\n\n${}\n\n<!-- 다시 열 조건: 무엇을 확인하면 다시 시작할지 필요할 때만 적습니다. -->\n\n${}\n',
  },
  {
    label: t('계산·결과 근거 (선택)', 'Calculation and result grounds (optional)'),
    detail: t('근거: 결과 파일 · 코드 커밋 · 주요 입력 · 확인한 범위', 'Grounds: result files · code commit · key inputs · range checked'),
    tpl: '<!-- 근거: 결과 파일 · 코드 커밋 · 주요 입력 · 확인한 범위. 아래 빈 줄에 필요한 것만 적습니다. -->\n\n${}\n',
  },
]
