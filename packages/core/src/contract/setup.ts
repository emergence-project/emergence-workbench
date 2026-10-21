/**
 * 시작 준비 API의 계약 (설정 › 계정과 홈의 "시작 준비" 카드, 서버 routes/setup.ts · 화면 api/setup.ts).
 * 공개 저장소에서 앱을 받은 사람이 쓸 준비를 한 화면에서 마치게 한다 (10/20 15:35 피드백, 10/21 시안).
 * GitHub · 구글 연결은 각자의 API(github-repos · google/status)가 알려 준다.
 */
import { z } from 'zod'

export const SetupView = z.object({
  /** 커밋에 적힐 이름 · 이메일 (git config --global). 비어 있으면 앱이 연구 저장소에 올리지 못한다 */
  git: z.object({ name: z.string(), email: z.string() }).strict(),
  /** 등록한 프로젝트 수 */
  projects: z.number(),
  /** 개인 저장소 주소 (없으면 null). active: 이번에 앱을 시작할 때 받아 둔 주소와 같으면 true (아니면 다시 시작해야 쓴다) */
  personal: z.object({ remote: z.string().nullable(), active: z.boolean() }).strict(),
  /** 에이전트(MCP)가 마지막으로 앱을 부른 때와 그 이름. 부른 적 없으면 null */
  agent: z.object({ at: z.string(), name: z.string() }).strict().nullable(),
  /** 이 앱의 MCP 입구를 등록한 에이전트 (Claude Code · Codex). 등록과 부름은 다르다 (10/21) */
  registered: z.array(z.string()),
  /** 에이전트를 연결하는 명령 (이 앱 폴더의 scripts/mcp.mjs) */
  mcpCommand: z.string(),
  /** latexmk를 찾았는지 (PDF 컴파일) */
  tex: z.boolean(),
}).strict()

// ---------- 요청 ----------
export const SetupGitBody = z.object({ name: z.string(), email: z.string() }).strict()
export const SetupPersonalBody = z.object({ remote: z.string() }).strict()

export type SetupView = z.infer<typeof SetupView>
export type SetupGitBody = z.input<typeof SetupGitBody>
export type SetupPersonalBody = z.input<typeof SetupPersonalBody>
