// 소개와 업데이트 1대1 (10/15 사용자 결정): 화면을 바꾼 PR은 소개도 같은 PR에서 고친다.
// 소개 글은 절마다 파일 하나다: apps/web/src/about/<쪽>/<절>.tsx (한국어 ko와 영어 en이 한 파일에, prs는 ko에). 쪽 머리는 about/<쪽>.tsx.
// 11/27부터 절을 .md로 옮긴다(packages/core/src/about-md.ts): 머리말 code:(구현 파일 glob)가 있는 절은, 그 파일을 고친 PR에 그 절을 정확히 짚는다.
// - 화면 파일이 바뀌었는데 소개가 그대로면 알린다(막지 않는다, 11/27 사용자 결정 "알림으로 + 앱이 절을 짚어 줌"): 그 화면 파일과 지난 커밋에서
//   함께 고쳐진 소개 절을 짚어 준다. 줄은 "※ "로 시작하고(앱의 app_submit이 에이전트에게 돌려준다), CI에서는 ::warning으로도 낸다.
//   "소개: 그대로 — 이유" 줄은 이제 의무가 아니다: 쓰면 알림이 없고 설정 › 업데이트 이력에 이유가 보인다.
//   근거: 커밋의 41%가 '그대로' 줄을 썼고 검사는 줄이 있는지만 봐서, 소개가 틀린 일(#749)을 막지 못했다 (docs/rules/registry.json about-sync)
// - 소개를 고쳤고 PR 번호를 알면(CI), 고친 절에 그 번호가 있어야 한다 (소개 이력 보기의 업데이트 번호와 이력의 "소개" 칸이 서로 가리킨다):
//   조각 파일 about/prs/<번호>.json(고친 절 "<쪽>/<절>" 목록, 11/20 · PR끼리 prs 줄에서 부딪히지 않게)이나 절 ko의 prs
// 비교 기준: ABOUT_BASE(CI의 PR 기준 커밋), 없으면 origin/main과 갈라진 곳. 둘 다 없으면 건너뛴다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ABOUT_DIR = 'apps/web/src/about'
const ABOUT_FILES = ['apps/web/src/aboutContent.tsx', 'apps/web/src/aboutFigures.tsx']

/** PR 번호 조각 파일 about/prs/<번호>.json의 번호 (아니면 undefined) */
export const fragmentPr = (f) => Number(f.match(/^apps\/web\/src\/about\/prs\/(\d+)\.json$/)?.[1]) || undefined

/** 소개 글 파일인가 (절·쪽 파일과 그것을 모으는 aboutContent.tsx; 번호 조각은 글이 아니다) */
export const isAboutText = (f) => (f.startsWith(`${ABOUT_DIR}/`) && !f.startsWith(`${ABOUT_DIR}/prs/`)) || f === ABOUT_FILES[0]

/** 사용자가 보는 화면 파일인가 (테스트와 소개 자체는 뺀다) */
export const isScreenFile = (f) =>
  (/^apps\/web\/src\/.+\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) && !ABOUT_FILES.includes(f) && !isAboutText(f)) || /^apps\/web\/src\/styles\/.+\.css$/.test(f)

/** 커밋 메시지들에서 "소개: 그대로 — 이유" (appupdate.ts aboutSameNote와 같은 꼴) */
export const sameNote = (messages) => /^(?:소개: 그대로|About: unchanged)/m.test(messages)

/** prs: [..] 배열에 적힌 PR 번호들 */
export const prsIn = (source) => new Set([...source.matchAll(/prs: \[([\d, ]*)\]/g)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())).filter(Boolean)))

/** 소개 절 파일의 이름 "<쪽>/<절>" (절 파일이 아니면 undefined) */
export const sectionOf = (f) => f.match(/^apps\/web\/src\/about\/([^/]+)\/([^/]+)\.(?:tsx|md)$/)?.slice(1, 3).join('/')

/**
 * 바뀐 파일을 구현(code:)으로 적은 절들 (11/27). 절 파일 이름 차례
 * @param {string[]} files
 * @param {Record<string, string[]>} code "<쪽>/<절>" → 구현 glob
 * @param {(glob: string, file: string) => boolean} match
 */
export function sectionsByCode(files, code, match) {
  return Object.entries(code).filter(([, gs]) => gs.some((g) => files.some((f) => match(g, f)))).map(([s]) => s).sort()
}

/**
 * 바뀐 화면 파일과 지난 커밋에서 함께 고쳐진 소개 절 (많이 함께 고친 차례로 n개). 함께 고친 적이 없으면 빈 목록
 * @param {string[]} screens
 * @param {{ files: string[] }[]} history 지난 커밋들
 * @returns {string[]}
 */
export function sectionsFor(screens, history, n = 3) {
  const count = new Map()
  const want = new Set(screens)
  for (const c of history) {
    if (!c.files.some((f) => want.has(f))) continue
    for (const f of c.files) { const s = sectionOf(f); if (s) count.set(s, (count.get(s) ?? 0) + 1) }
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([s]) => s)
}

/**
 * 알림 (막지 않는다): 화면이나 절의 구현 파일을 바꿨는데 소개를 고치지 않았고 '그대로' 이유도 없으면, 살펴볼 소개 절을 짚는다
 * @param {{ files: string[], messages: string, history?: { files: string[] }[], code?: Record<string, string[]>, match?: (glob: string, file: string) => boolean, ext?: (section: string) => string }} o
 */
export function aboutReminders({ files, messages, history = [], code = {}, match = () => false, ext = () => '.tsx' }) {
  const isTest = (f) => /\.test\.[cm]?[jt]sx?$/.test(f)
  const coded = files.filter((f) => !isTest(f) && !isAboutText(f) && Object.values(code).some((gs) => gs.some((g) => match(g, f))))
  const screens = [...new Set([...files.filter(isScreenFile), ...coded])]
  const aboutChanged = files.some((f) => ABOUT_FILES.includes(f) || isAboutText(f))
  if (!screens.length || aboutChanged || sameNote(messages)) return []
  const shown = `${screens.slice(0, 5).join(', ')}${screens.length > 5 ? ' …' : ''}`
  const byCode = sectionsByCode(screens, code, match)
  // 구현으로 적지 않은 화면 파일은 지금처럼 함께 고쳐 온 절로 짚는다 (둘을 함께 보인다)
  const rest = screens.filter((f) => !Object.values(code).some((gs) => gs.some((g) => match(g, f))))
  const byHistory = rest.length ? sectionsFor(rest, history).filter((s) => !byCode.includes(s)) : []
  const path = (s) => `${ABOUT_DIR}/${s}${ext(s)}`
  const where = [
    byCode.length && `이 파일을 구현으로 적은 소개 절: ${byCode.map(path).join(', ')}`,
    byHistory.length && `이 화면 파일과 함께 고쳐 온 소개 절: ${byHistory.map(path).join(', ')}`,
  ].filter(Boolean).join('. ') || `함께 고쳐 온 소개 절이 없습니다. ${ABOUT_DIR}/<쪽>/ 아래에서 이 화면을 설명하는 절을 찾으세요`
  return [`소개 확인: 파일이 바뀌었습니다 (${shown}). ${where}. 설명이 달라졌으면 그 절(ko · en)을 고치고, 그대로면 두어도 됩니다(이유를 남기려면 커밋 메시지에 "소개: 그대로 — 이유").`]
}

/** 검사 결과: 문제 문장 목록 (비면 통과). 화면만 바꾼 것은 막지 않는다(aboutReminders) */
export function checkAbout({ files, messages, aboutSource, pr }) {
  const problems = []
  const numbered = files.some((f) => fragmentPr(f) === pr) || prsIn(aboutSource).has(pr)
  // "소개: 그대로"를 쓴 PR(글을 옮기기만 한 정리 등)은 PR 번호를 적지 않는다
  if (files.some(isAboutText) && pr && !sameNote(messages) && !numbered) {
    problems.push(`소개를 고쳤는데 어느 절에도 이 PR 번호가 없습니다. ${ABOUT_DIR}/prs/${pr}.json에 고친 절을 적으세요 (예: ["project/flow"]; 앱 고치기 대화는 app_submit이 적는다).`)
  }
  return problems
}

/** 소개 글 파일들을 모두 이어 붙인 것 (prs를 찾는 곳) */
const aboutSources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  .map((e) => e.isDirectory() ? aboutSources(path.join(dir, e.name)) : /\.(?:tsx?|md)$/.test(e.name) ? fs.readFileSync(path.join(dir, e.name), 'utf8') : '').join('\n')

/**
 * .md 절의 구현 glob { "<쪽>/<절>": string[] } (형식은 packages/core/src/about-md.ts를 그대로 쓴다)
 * @param {string} dir
 * @returns {Promise<{ code: Record<string, string[]>, match: (glob: string, file: string) => boolean }>}
 */
async function codeOfSections(dir) {
  const { tsxApi } = await import('./tsx-api.mjs')
  const { tsImport } = await tsxApi()
  const { parseAboutMd, aboutGlobMatch } = await tsImport('../../packages/core/src/about-md.ts', import.meta.url)
  /** @type {Record<string, string[]>} */
  const code = {}
  for (const part of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'prs')) {
    for (const f of fs.readdirSync(path.join(dir, part.name)).filter((x) => x.endsWith('.md'))) {
      code[`${part.name}/${f.replace(/\.md$/, '')}`] = parseAboutMd(fs.readFileSync(path.join(dir, part.name, f), 'utf8')).code
    }
  }
  return { code, match: aboutGlobMatch }
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim()

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  process.chdir(root)
  let base = process.env.ABOUT_BASE
  const head = process.env.ABOUT_HEAD || 'HEAD'
  if (!base) { try { base = git('merge-base', 'origin/main', head) } catch { /* 없음 */ } }
  if (!base) { console.log('소개 검사 건너뜀: 비교할 기준 커밋이 없습니다'); process.exit(0) }
  // 커밋하지 않은 변경도 함께 본다 (로컬)
  const files = [...new Set([
    ...git('diff', '--name-only', `${base}...${head}`).split('\n'),
    ...(head === 'HEAD' ? git('diff', '--name-only', 'HEAD').split('\n') : []),
  ].filter(Boolean))]
  const messages = git('log', '--format=%B', `${base}..${head}`)
  const pr = Number(process.env.PR_NUMBER) || undefined
  const problems = checkAbout({ files, messages, aboutSource: aboutSources(ABOUT_DIR), pr })
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1) }
  // 지난 커밋 2000개에서 화면 파일과 소개 절이 함께 바뀐 것 (얕게 받은 저장소면 있는 만큼)
  /** @type {{ files: string[] }[]} */
  let history = []
  try {
    history = git('log', '-n', '2000', '--format=%x01', '--name-only', base).split('\u0001').map((b) => ({ files: b.split('\n').filter(Boolean) }))
  } catch { /* 이력 없음 */ }
  // 알림만 하는 일이라, 절 파일을 읽지 못해도(형식 오류 · tsx 없음) 검사를 막지 않고 이력 기반 알림으로 돌아간다
  const { code, match } = await codeOfSections(ABOUT_DIR).catch((e) => {
    console.log(`※ 소개 절의 구현(code:)을 읽지 못해 함께 고친 이력으로만 짚습니다: ${e instanceof Error ? e.message : e}`)
    /** @type {Record<string, string[]>} */
    const none = {}
    return { code: none, match: () => false }
  })
  const ext = (/** @type {string} */ s) => fs.existsSync(`${ABOUT_DIR}/${s}.md`) ? '.md' : '.tsx'
  for (const r of aboutReminders({ files, messages, history, code, match, ext })) {
    console.log(`※ ${r}`)
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=소개 확인::${r}`)
  }
  console.log(`소개 검사 통과 (바뀐 파일 ${files.length}개${pr ? `, PR #${pr}` : ''})`)
}
