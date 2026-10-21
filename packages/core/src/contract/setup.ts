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
  /**
   * 이 앱을 MCP로 부르는 에이전트마다 (Claude Code · Codex, 10/21 "에이전트 연결을 구분해서"):
   * installed = 그 에이전트의 명령(claude · codex)이 이 컴퓨터에 깔려 있는지, registered = 그 에이전트 설정에 이 앱의 MCP 입구가 있는지, at = 마지막으로 앱을 부른 때(없으면 null), command = 등록 명령.
   * 등록과 부름은 다르다: 등록하기 전에 열린 세션은 부르지 못한다
   */
  agents: z.array(z.object({ key: z.enum(['claude-code', 'codex']), name: z.string(), installed: z.boolean(), registered: z.boolean(), at: z.string().nullable(), command: z.string() }).strict()),
  /**
   * 이 컴퓨터에 설치 (10/21 "다른 컴퓨터에서도 아이콘부터 에이전트 등록까지 설치 과정에서"): scripts/install.sh가 하는 일 중 앱이 볼 수 있는 것.
   * app = ~/Applications의 앱 아이콘(Spotlight · Launchpad · 바탕화면), dock = Dock에 고정, service = 백그라운드 서비스 등록. command = 설치 명령 (빠진 것을 마저 한다)
   */
  /**
   * 공용 라이브러리 (10/21 맥미니: 받아 둔 research-library를 앱이 몰랐고 화면에서 정할 곳도 없었다).
   * path = 지금 정한 폴더, suggest = 정하지 않았을 때 다른 컴퓨터가 쓰는 라이브러리와 이름이 같은, 이 컴퓨터에 받아 둔 폴더
   */
  library: z.object({ path: z.string().nullable(), suggest: z.string().nullable() }).strict(),
  install: z.object({ app: z.boolean(), dock: z.boolean(), service: z.boolean(), command: z.string() }).strict(),
  /**
   * 다른 컴퓨터의 프로젝트 중 이 컴퓨터에 없는 것 (10/21 "새 컴퓨터에 원래 프로젝트가 나와야, 최소한 받을지 물어야"):
   * 개인 저장소의 _settings/<컴퓨터>/projects.yaml(백업이 올림)에서 읽는다. local = 같은 이름의 폴더가 받을 곳에 이미 있으면 그 경로(받지 않고 등록만)
   */
  elsewhere: z.array(z.object({
    machine: z.string(), title: z.string(), remote: z.string().nullable(), folder: z.string(), tags: z.array(z.string()),
    state: z.string().optional(), local: z.string().nullable(),
  }).strict()),
  /** 받을 곳 (이미 등록한 프로젝트들이 모인 폴더, 없으면 ~/GitHub) */
  cloneDir: z.string(),
  /** latexmk를 찾았는지 (PDF 컴파일) */
  tex: z.boolean(),
}).strict()

// ---------- 요청 ----------
/** PUT /setup/library: 공용 라이브러리 폴더 (절대 경로) */
export const SetupLibraryBody = z.object({ path: z.string() }).strict()
export const SetupGitBody = z.object({ name: z.string(), email: z.string() }).strict()
export const SetupPersonalBody = z.object({ remote: z.string() }).strict()
/** 다른 컴퓨터의 프로젝트 하나를 받아(이미 있으면 그대로) 등록한다 */
export const SetupFetchBody = z.object({ remote: z.string(), folder: z.string(), tags: z.array(z.string()).optional() }).strict()

export type SetupView = z.infer<typeof SetupView>
export type SetupGitBody = z.input<typeof SetupGitBody>
export type SetupPersonalBody = z.input<typeof SetupPersonalBody>
export type SetupFetchBody = z.input<typeof SetupFetchBody>
export type SetupLibraryBody = z.input<typeof SetupLibraryBody>
