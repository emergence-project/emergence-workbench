import { Icon } from './icons'

/** 쓴 이 이름: Claude가 쓴 기록 · 답은 이름 앞에 무채색 Claude 표시 (10/19 피드백 "무채색 로고". 주황은 내 차례에만) */
export function Author({ by }: { by: string }) {
  return <>{/^claude/i.test(by) && <span className="ico agent-mark" aria-hidden>{Icon.claude}</span>}{by}</>
}
