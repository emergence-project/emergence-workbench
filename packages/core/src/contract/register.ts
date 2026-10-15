/**
 * 프로젝트 등록 창의 GitHub 목록 계약 (서버 routes/researches.ts · githubRepos.ts, 화면 api/register.ts).
 */
import { z } from 'zod'

/** 이 컴퓨터가 로그인한 GitHub 계정의 저장소 하나 */
export const GitHubRepoItem = z.object({
  owner: z.string(),
  name: z.string(),
  /** clone에 넘길 주소 */
  url: z.string(),
  private: z.boolean(),
  description: z.string(),
  updatedAt: z.string(),
  /** 이미 등록한 프로젝트 id */
  registeredId: z.string().optional(),
  /** 받을 폴더에 같은 이름의 폴더가 이미 있으면 그 경로 */
  localPath: z.string().optional(),
}).strict()

/** GET /researches/github-repos. parent: 받을 폴더의 기본값. 로그인을 못 찾으면 ok: false와 이유 */
export const GitHubRepoList = z.union([
  z.object({ parent: z.string(), ok: z.literal(true), source: z.enum(['gh', 'git', 'sample']), repos: z.array(GitHubRepoItem) }).strict(),
  z.object({ parent: z.string(), ok: z.literal(false), reason: z.string() }).strict(),
])

/** POST /researches/pick-folder: 맥의 Finder 폴더 고르기 창. 취소하면 path: null */
export const PickFolderBody = z.object({ start: z.string().optional() }).strict()
export const PickedFolder = z.object({ path: z.string().nullable() }).strict()

// ---------- GitHub 주소로 등록 · 검사 · 등록 (routes/researches.ts, 화면 RegisterDialog.tsx · GoogleSettings.tsx) ----------
/** POST /researches/github: GitHub 저장소 주소를 읽는다 (https://github.com/이름/저장소, git@github.com:…, 이름/저장소) */
export const GitHubUrlBody = z.object({ url: z.string() }).strict()
/** 읽은 주소와 받을 폴더의 기본값 */
export const GitHubRepoParsed = z.object({ owner: z.string(), name: z.string(), url: z.string(), parent: z.string() }).strict()
/** POST /researches/clone: parent 폴더 아래로 받는다. 등록은 받은 뒤 평소처럼 경로로 */
export const CloneBody = z.object({ url: z.string(), parent: z.string() }).strict()
export const Cloned = z.object({ path: z.string() }).strict()

/** 서식 파일이 정의하는 기호와 환경 */
export const TexDefinitions = z.object({ commands: z.array(z.string()), environments: z.array(z.string()) }).strict()
/** POST /researches/inspect: 등록 전에 폴더를 살핀다 */
export const InspectBody = z.object({ path: z.string() }).strict()
export const Inspection = z.object({
  path: z.string(),
  exists: z.boolean(),
  isDirectory: z.boolean(),
  isGitRepo: z.boolean(),
  hasWorkbench: z.boolean(),
  /** 저장소 안에서 찾은, 함께 쓸 만한 서식 파일 (저장소 기준 경로) */
  repoPreambles: z.array(z.string()),
  /** 저장소 서식마다 그 안에서 정의하는 기호와 환경 */
  repoPreambleDetails: z.record(z.string(), TexDefinitions),
  /** 이미 등록되어 있으면 그 프로젝트 id */
  alreadyRegistered: z.string().nullable(),
  suggestedTitle: z.string(),
  /** 등록은 되지만 알아 둘 점 */
  warnings: z.array(z.string()),
  /** 등록할 수 없는 이유 */
  errors: z.array(z.string()),
}).strict()

/**
 * POST /researches: 등록. workbench/가 없으면 createWorkbench가 true일 때만 만든다.
 * kind · fields의 값 검사(research·work, 분야 수와 길이)는 서버(registry)가 메시지와 함께 한다. tags는 예전 화면이 보내던 모양
 */
export const RegisterBody = z.object({
  path: z.string(),
  createWorkbench: z.boolean().optional(),
  title: z.string().optional(),
  question: z.string().optional(),
  kind: z.unknown().optional(),
  fields: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  libraryPreambles: z.array(z.string()).optional(),
  repoPreambles: z.array(z.string()).optional(),
}).strict()

export type GitHubUrlBody = z.infer<typeof GitHubUrlBody>
export type GitHubRepoParsed = z.infer<typeof GitHubRepoParsed>
export type CloneBody = z.infer<typeof CloneBody>
export type Cloned = z.infer<typeof Cloned>
export type TexDefinitions = z.infer<typeof TexDefinitions>
export type InspectBody = z.infer<typeof InspectBody>
export type Inspection = z.infer<typeof Inspection>
export type RegisterBody = z.infer<typeof RegisterBody>

export type GitHubRepoItem = z.infer<typeof GitHubRepoItem>
export type GitHubRepoList = z.infer<typeof GitHubRepoList>
export type PickFolderBody = z.infer<typeof PickFolderBody>
export type PickedFolder = z.infer<typeof PickedFolder>
