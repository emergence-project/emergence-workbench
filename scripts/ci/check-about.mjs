// 소개와 업데이트 1대1 (10/15 사용자 결정): 화면을 바꾼 PR은 소개(aboutContent)도 같은 PR에서 고친다.
// - 화면 파일이 바뀌었는데 소개가 그대로면, 커밋 메시지에 "소개: 그대로 — 이유" 한 줄이 있어야 한다 (설정 › 업데이트 이력에 이유가 보인다)
// - 소개를 고쳤고 PR 번호를 알면(CI), 고친 절의 prs에 그 번호가 있어야 한다 (절 제목 옆 "업데이트 #n"과 이력의 "소개" 칸이 서로 가리킨다)
// 비교 기준: ABOUT_BASE(CI의 PR 기준 커밋), 없으면 origin/main과 갈라진 곳. 둘 다 없으면 건너뛴다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ABOUT = 'apps/web/src/aboutContent.tsx'
const ABOUT_FILES = [ABOUT, 'apps/web/src/aboutContent.en.tsx', 'apps/web/src/aboutFigures.tsx']

/** 사용자가 보는 화면 파일인가 (테스트와 소개 자체는 뺀다) */
export const isScreenFile = (f) =>
  (/^apps\/web\/src\/.+\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) && !ABOUT_FILES.includes(f)) || /^apps\/web\/src\/styles\/.+\.css$/.test(f)

/** 커밋 메시지들에서 "소개: 그대로 — 이유" (appupdate.ts aboutSameNote와 같은 꼴) */
export const sameNote = (messages) => /^(?:소개: 그대로|About: unchanged)/m.test(messages)

/** prs: [..] 배열에 적힌 PR 번호들 */
export const prsIn = (source) => new Set([...source.matchAll(/prs: \[([\d, ]*)\]/g)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())).filter(Boolean)))

/** 검사 결과: 문제 문장 목록 (비면 통과) */
export function checkAbout({ files, messages, aboutSource, pr }) {
  const problems = []
  const screens = files.filter(isScreenFile)
  const aboutChanged = files.some((f) => ABOUT_FILES.includes(f))
  if (screens.length && !aboutChanged && !sameNote(messages)) {
    problems.push(`화면 파일이 바뀌었는데 소개를 고치지 않았습니다 (${screens.slice(0, 5).join(', ')}${screens.length > 5 ? ' …' : ''}).\n  바뀐 화면을 설명하는 소개 절을 ${ABOUT}(영어는 .en.tsx)에서 고치거나, 소개가 그대로 맞으면 커밋 메시지에 "소개: 그대로 — 이유" 한 줄을 쓰세요.`)
  }
  if (files.includes(ABOUT) && pr && !prsIn(aboutSource).has(pr)) {
    problems.push(`소개를 고쳤는데 어느 절에도 이 PR 번호가 없습니다. 고친 절의 prs에 ${pr}을 더하세요 (예: title: '흐름', id: 'flow', prs: [${pr}],).`)
  }
  return problems
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

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
  const problems = checkAbout({ files, messages, aboutSource: fs.readFileSync(ABOUT, 'utf8'), pr })
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1) }
  console.log(`소개 검사 통과 (바뀐 파일 ${files.length}개${pr ? `, PR #${pr}` : ''})`)
}
