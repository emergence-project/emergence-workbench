/**
 * 흐름(질문 › 주장 › 시도) 플러그인의 서버 쪽 (2026-11-27 사용자 결정 "실험 기능을 플러그인으로 설치 · 제거").
 * 본체의 꽂는 자리(plugins/index.ts)에 흐름의 API · MCP 도구 · 현황 절 · 사용자 차례 · 파일 진단 · 바뀐 것 검사를 낸다.
 * 흐름 파일(problem*.ts · mcpProblems.ts · routes/problems.ts)은 아직 제자리에 있고, 본체 가운데 이 파일만 그것들을 부른다.
 */
import type { ServerPlugin } from '../index.js'
import { FLOW_MANIFEST } from '@rw/core/plugins/flow'
import { registerProblems } from '../../routes/problems.js'
import { PROBLEM_INSTRUCTIONS, registerProblemTools } from '../../mcpProblems.js'
import { problemStatusSection } from '../../problemBrief.js'
import { scanProblems } from '../../problems.js'
import { PROBLEM_CHECKS, problemChecker } from '../../problemChanges.js'

export const flowPlugin: ServerPlugin = {
  manifest: FLOW_MANIFEST,
  routes: registerProblems,
  mcp: { instructions: PROBLEM_INSTRUCTIONS, register: registerProblemTools },
  statusSection: problemStatusSection,
  userTurns: (wb) => ({ problems: scanProblems(wb).problems.filter((p) => p.waiting).length }),
  // 흐름과 시도 (§16): 읽지 못한 파일은 화면 · 이어받기 요약에서 빠지므로 오류
  repoChecks: (wb) => scanProblems(wb).diagnostics.map(({ file, message }) => ({ level: 'error' as const, file, line: 1, message })),
  changeChecks: { levels: PROBLEM_CHECKS, checker: problemChecker },
}
