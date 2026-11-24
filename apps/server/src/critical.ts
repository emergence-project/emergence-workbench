/** 크리티컬한 허락 목록: 중앙의 chat_answer 거르기(agentKid criticalOf)와 자동 모드의 명령 판정(agentPolicy)이 함께 쓴다 (centralBrief.ts에서 나눔) */

/**
 * 크리티컬한 허락 (11/18 사용자 "허락이 크리티컬한 것이 아니면 자동이면 좋을 것 같아").
 * 이것만 사용자에게 남기고, 나머지(일반 계획 승인 · 일상적인 확인)는 중앙이 사용자 말을 근거로 chat_answer로 답한다.
 * 중앙의 답은 앱이 이 목록으로 다시 가린다 (criticalOf: 맞으면 409)
 */
export const CRITICAL = [
  // squash 합치기는 중앙 · 하위 대화가 CI 통과 뒤 직접 한다 (11/19 "중앙은 깃 편집 권한"): squash가 아닌 합치기와 main에 바로 푸시만 남긴다
  { key: 'merge', ko: 'squash가 아닌 PR 합치기 · main에 바로 푸시', en: 'merging a pull request other than by squash, or pushing straight to main', re: /\bgh\s+pr\s+merge\b(?!.*(--squash\b|\s-s\b))|\bgit(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+push\b.*\b(main|master)\b/i },
  { key: 'restart', ko: '앱 다시 시작', en: 'restarting the app', re: /service:restart|launchctl|\brestart\b|다시 시작|재시작/i },
  { key: 'delete', ko: '지우기 · 덮어쓰기', en: 'deleting or overwriting', re: /\brm\s|\brmdir\b|\bgit\s+(reset\s+--hard|clean|checkout\s+--|restore)\b|--force\b|\bpush\s+-f\b|overwrite|덮어|지우/i },
  { key: 'outside', ko: '외부로 내보내기', en: 'sending something outside', re: /\b(curl|wget|scp|rsync|ssh)\b|\bnpm\s+publish\b|\bgh\s+(issue|release|gist|api|pr\s+(comment|review|close|edit))\b/i },
  { key: 'notes', ko: '연구 노트 · 개념 노트 변경 확정', en: 'changing research or concept notes', re: /edit_note|new_note|edit_concept|edit_review/i },
  // 낱말 token · 토큰만으로는 잡지 않는다: 「이미지 토큰 비용」 웹 검색이 돈 · 계정으로 잡혔다 (11/23)
  { key: 'money', ko: '돈 · 계정', en: 'money or accounts', re: /billing|payment|subscri|password|credential|secret|api[ _-]?key|(access|auth|api|bearer|refresh|oauth)[ _-]?token|\b(GH|GITHUB|NPM)_TOKEN\b|\blogin\b|keychain|결제|구독|계정|비밀번호|(접근|인증) ?토큰/i },
] as const
export type Critical = (typeof CRITICAL)[number]

const of = (key: Critical['key']) => CRITICAL.find((c) => c.key === key)!

/**
 * 자동 모드에서 한 번 묻는 명령 (11/23 "클로드 자동 모드처럼"): 위 목록의 합치기 · 다시 시작 · 외부로 내보내기 · 돈 · 계정을 명령 줄에서 본다.
 * 지우기는 commandKind가 본다. 따옴표 안 글은 빼고 본다 (grep "restart" 같은 찾기가 걸리지 않게)
 */
const COMMAND_CRITICAL: { key: Critical['key']; re: RegExp }[] = [
  { key: 'merge', re: of('merge').re },
  { key: 'restart', re: /service:restart|\blaunchctl\b|\bbrew\s+services\b/i },
  { key: 'outside', re: of('outside').re },
  { key: 'money', re: /\bsecurity\s+[a-z-]*(password|keychain|certificate|identity)|\bgh\s+auth\b|\b(npm|pnpm|yarn)\s+(login|logout|adduser|token)\b|\bclaude\s+(login|logout|setup-token)\b|\b(gcloud|az)\s+(auth|login)\b|\baws\s+configure\b/i },
]
export function commandCritical(cmd: string): Critical | undefined {
  const bare = cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, ' ')
  const hit = COMMAND_CRITICAL.find((c) => c.re.test(bare))
  return hit && of(hit.key)
}
