/**
 * 기록에서 부른 에이전트의 「고치게 하기」 (11/21 시안 「기록과 에이전트의 경계」 코멘트 "제안대로 하자"):
 * 메모 · 질문에서 부른 에이전트는 읽기만 한다. 부탁이 고치는 일이면 고치지 않고 무엇을 고칠지 적은 뒤 마지막 줄에 표시를 남기고,
 * 앱은 그 표시를 답에서 떼고 답 아래에 「고치게 하기」를 보인다. 누르면 같은 대화가 노트를 고칠 권한으로 이어 하고 고친 것은 수정 검토로 간다.
 */
import { t } from './i18n.js'

const MARK = /^[\s>*_-]*(?:고칠 일\s*[:：]\s*있음|needs edit\s*[:：]\s*yes)[\s.*_]*$/i

/** 답의 마지막 줄이 표시면 떼어 낸다. needs = 고치는 일이라고 에이전트가 판단함 */
export function splitFixMark(text: string): { text: string; needs: boolean } {
  const lines = text.trimEnd().split('\n')
  if (!MARK.test(lines.at(-1) ?? '')) return { text, needs: false }
  return { text: lines.slice(0, -1).join('\n').trimEnd(), needs: true }
}

/** 질문 대화의 지침에 더하는 줄: 고치는 일이면 고치지 말고 표시만 */
export const fixMarkRule = (): string => t(
  '- 고쳐 달라는 부탁이면 고치지 말고, 무엇을 어떻게 고칠지 마지막 글에 짧게 적은 뒤 맨 마지막 줄에 정확히 「고칠 일: 있음」 한 줄을 씁니다(연구자에게 「고치게 하기」 버튼이 보입니다). 묻기만 한 것이면 그 줄을 쓰지 않습니다.',
  '- If the request asks for a change, do not make it: say briefly in the last message what you would change and how, then end with exactly one final line "Needs edit: yes" (the researcher then sees a "Have it changed" button). Leave that line out for a plain question.',
)

/** 「고치게 하기」를 눌렀을 때 그 대화에 보내는 글 */
export const fixPrompt = (concept: boolean): string => concept
  ? t('연구자가 「고치게 하기」를 눌렀습니다. 이제 개념노트를 고쳐도 됩니다. 앞서 적은 대로 rules(part: "concepts")를 한 번 읽고 read_concept → edit_concept로 고치세요(연구자가 수정 검토에서 문단마다 봅니다). 마지막 글에 무엇을 고쳤는지 결론부터 몇 줄로 적습니다.',
    'The researcher pressed "Have it changed". You may now change the concept note. As you described, read rules (part: "concepts") once, then read_concept → edit_concept (the researcher reviews each paragraph in change review). In the last message say what you changed, conclusion first, in a few lines.')
  : t('연구자가 「고치게 하기」를 눌렀습니다. 이제 노트를 고쳐도 됩니다. 앞서 적은 대로 edit_note로 고치세요(연구자가 수정 검토에서 문단마다 봅니다). 마지막 글에 무엇을 고쳤는지 결론부터 몇 줄로 적습니다.',
    'The researcher pressed "Have it changed". You may now change the note. As you described, use edit_note (the researcher reviews each paragraph in change review). In the last message say what you changed, conclusion first, in a few lines.')
