import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isOutside } from './fsutil.js'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.js'
import { tikzCachePath } from './figures.js'
import { Google, mockGoogleFetch } from './google.js'
import { macSteps, promoteNextBuild } from './appupdate.js'
import { ensurePersonalClone, personalRemote, pullPersonal } from './personalRepo.js'
import { Registry } from './registry.js'
import { serveStatic } from './static.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const port = Number(process.env.RW_PORT ?? 8130)

/**
 * Sample mode (RW_SANDBOX=1) in English: RW_SAMPLE_LANG=en builds a separate .sandbox-en/ from the same
 * fixtures with the English overlay fixtures/en/ copied on top (same paths, only human text differs).
 */
const sampleEn = process.env.RW_SAMPLE_LANG === 'en'
const sandboxRoot = path.join(repoRoot, sampleEn ? '.sandbox-en' : '.sandbox')
function cpSample(src: string, dst: string, opts: { recursive?: boolean; filter?: (src: string) => boolean } = {}): void {
  fs.cpSync(src, dst, { recursive: true, ...opts })
  const rel = path.relative(path.join(repoRoot, 'fixtures'), src)
  const overlay = path.join(repoRoot, 'fixtures/en', rel)
  if (sampleEn && !isOutside(rel) && fs.existsSync(overlay)) fs.cpSync(overlay, dst, { recursive: true, force: true, ...(opts.filter && { filter: (s: string) => opts.filter!(s) }) })
}

/**
 * 설정 폴더.
 * - RW_SANDBOX=1 (개발용 `pnpm dev` 기본값): 저장소 안 .sandbox/config를 쓰고, 예제 연구를 복사해 등록한다.
 *   실제 ~/.config와 실제 연구 저장소는 건드리지 않는다.
 * - 그 밖: RW_CONFIG_DIR 또는 ~/.config/research-workspace
 */
function resolveConfigDir(): string {
  if (process.env.RW_SANDBOX === '1') return path.join(sandboxRoot, process.env.RW_SUBJECTS_FIXTURE === '1' ? 'subjects-config' : 'config')
  return process.env.RW_CONFIG_DIR ?? path.join(os.homedir(), '.config/research-workspace')
}

const configDir = resolveConfigDir()

// 앱이 파일 감시를 시작하기 전에 예제 연구를 등록해 둔다.
if (process.env.RW_SANDBOX === '1') {
  const research = path.join(sandboxRoot, 'sample-research')
  if (!fs.existsSync(path.join(research, 'workbench'))) {
    cpSample(path.join(repoRoot, 'fixtures/sample-research'), research, { recursive: true, filter: (src) => !src.includes('.build') })
    // 화면 확인용 덧붙임: 메인 노트(장·부록), 상태가 다른 블록 노트, 진술. 서버 테스트는 위의 작은 예제만 쓴다
    cpSample(path.join(repoRoot, 'fixtures/sandbox-extra'), research, { recursive: true })
  }
  const registry = new Registry(configDir)
  // The sample opens in its own language: Korean sample in Korean, RW_SAMPLE_LANG=en in English (a saved choice in Settings wins)
  if (!fs.existsSync(path.join(configDir, 'config.yaml'))) registry.setUi({ language: sampleEn ? 'en' : 'ko' })
  if (!registry.list().some((r) => r.path === fs.realpathSync(research))) {
    const { id } = registry.register(research)
    // 홈의 분야 이름표 예 (개념노트 분류의 이름)
    registry.setProfile(id, { fields: ['Graph Theory', 'Combinatorics'] })
  }
  // 홈 목록 · 카드 예: 성격이 업무인 두 번째 프로젝트 (작은 예제를 복사해 이름만 바꾼다)
  const work = path.join(sandboxRoot, 'sample-work')
  if (!fs.existsSync(path.join(work, 'workbench'))) {
    cpSample(path.join(repoRoot, 'fixtures/sample-research'), work, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.writeFileSync(path.join(work, 'workbench/research.yaml'), sampleEn ? 'title: Sample work — sensor performance table\nquestion: Summarize the required gravity-sensor performance in a table and report it.\nstarted: 2026-10-01\n' : 'title: 예제 업무 — 센서 성능 표\nquestion: 중력 센서 요구 성능을 표로 정리해 보고한다.\nstarted: 2026-10-01\n')
    const { id } = registry.register(work)
    registry.setProfile(id, { kind: 'work', fields: ['Graph Theory'] })
  }
  // 예제용 라이브러리: 저장소의 templates/research-library를 복사해 쓴다
  const library = path.join(sandboxRoot, 'research-library')
  if (!fs.existsSync(library)) fs.cpSync(path.join(repoRoot, 'templates/research-library'), library, { recursive: true })
  if (!registry.libraryPath) registry.setLibrary(library)
  // 지식 화면 예제: Study vault · Topic Review · 개념노트·문헌노트 몇 개 (fixtures/knowledge)
  const knowledge = path.join(repoRoot, 'fixtures/knowledge')
  for (const kind of ['concepts', 'papers']) {
    const dir = path.join(library, kind)
    if (!fs.existsSync(dir)) cpSample(path.join(knowledge, 'library', kind), dir, { recursive: true })
  }
  // 네트워킹 화면 예제: 분야 이름표가 여럿인 사람과 저자가 아닌 관심 연구자 (사람 카드의 "+2", 분야별 차례, 프로필이 보이게)
  if (!registry.people.length) {
    registry.setPeople([
      { name: 'Ada E. Example', tags: ['Graph Theory', 'Combinatorics'], homepage: 'https://example.org/aexample' },
      { name: 'Gus Grey', affiliations: ['Example Institute of Mathematics, Example City, EX, USA'], tags: ['Combinatorics', 'Graph Theory', 'Map Coloring'], note: sampleEn ? 'Kempe chains, discharging' : 'Kempe 사슬·방전법' },
    ])
  }
  // 공부할 것 예제: 기다림 · 읽을 초안 · 앎 (Learn.tsx)
  if (!fs.existsSync(path.join(library, 'to-learn.yaml'))) cpSample(path.join(knowledge, 'to-learn.yaml'), path.join(library, 'to-learn.yaml'))
  if (!fs.existsSync(path.join(library, 'references.bib')))cpSample(path.join(knowledge, 'library', 'references.bib'), path.join(library, 'references.bib'))
  // 논문 화면 예제: PDF 폴더(이 맥에 있는 PDF 둘, 클라우드에만 있는 것 하나), 논문·책 몇 편, 코멘트 (fixtures/sandbox-papers)
  const paperPdfs = path.join(sandboxRoot, 'papers-pdf')
  if (!fs.existsSync(paperPdfs)) {
    const extra = path.join(repoRoot, 'fixtures/sandbox-papers')
    cpSample(path.join(extra, 'pdf'), paperPdfs, { recursive: true })
    fs.appendFileSync(path.join(library, 'references.bib'), fs.readFileSync(path.join(extra, 'extra.bib'), 'utf8'))
    cpSample(path.join(extra, 'comments'), path.join(library, 'comments'), { recursive: true })
    fs.writeFileSync(path.join(library, 'papers.yaml'), 'exampleDischarging2022:\n  projects: [sample-research]\ndoeStructurePlanar2004:\n  projects: [sample-research]\n')
  }
  if (!registry.pdfFoldersSet.length) registry.setPdfFolders([paperPdfs])
  // 그림 화면 예제: 공용 그림 셋(tikz 하나)과 예제 연구 전용 그림 둘 (fixtures/sandbox-figures).
  // tikz는 맥의 TeX로 SVG를 만드는데, 예제 모드는 TeX가 없어도 보이게 미리 그린 SVG를 캐시에 둔다
  const libFigures = path.join(library, 'figures')
  if (!fs.existsSync(libFigures)) {
    const figs = path.join(repoRoot, 'fixtures/sandbox-figures')
    cpSample(path.join(figs, 'library'), libFigures, { recursive: true })
    cpSample(path.join(figs, 'project'), path.join(research, 'workbench', 'figures'), { recursive: true })
    const cache = tikzCachePath(configDir, path.join(libFigures, 'single-country.tikz'))
    fs.mkdirSync(path.dirname(cache), { recursive: true })
    cpSample(path.join(figs, 'single-country.cache.svg'), cache)
  }
  // L5 screenshots use a separate sample library; the default legacy sample stays unchanged.
  if (process.env.RW_SUBJECTS_FIXTURE === '1') {
    const classified = path.join(sandboxRoot, 'subjects-library')
    if (!fs.existsSync(classified)) {
      fs.cpSync(library, classified, { recursive: true })
      cpSample(path.join(repoRoot, 'fixtures/subjects/library'), classified, { recursive: true })
    }
    const cache = tikzCachePath(configDir, path.join(classified, 'figures/single-country.tikz'))
    if (!fs.existsSync(cache)) { fs.mkdirSync(path.dirname(cache), { recursive: true }); cpSample(path.join(repoRoot, 'fixtures/sandbox-figures/single-country.cache.svg'), cache) }
    registry.setLibrary(classified)
  }
  for (const [name, set] of [['study', (p: string) => registry.setStudy(p)], ['topic-reviews', (p: string) => registry.setReviews(p)]] as const) {
    const dir = path.join(sandboxRoot, name)
    if (!fs.existsSync(dir)) cpSample(path.join(knowledge, name), dir, { recursive: true })
    set(dir)
  }
}

// 개인 저장소 (personalRepo.ts): 실사용만. 앱 설정·workbench 백업·피드백을 둔다
const personal = process.env.RW_SANDBOX !== '1' ? await personalRemote(configDir, repoRoot) : null
const personalDir = path.join(configDir, 'personal')
if (personal) {
  try { await ensurePersonalClone(personalDir, personal); await pullPersonal(personalDir) } catch (e) { console.warn(`개인 저장소(${personal})를 받지 못했습니다: ${(e as Error).message.split('\n')[0]}`) }
}
// 앱 피드백: 실사용은 개인 저장소 사본의 feedback/ (RW_FEEDBACK_DIR로 바꿈), 개발용 예제 모드는 .sandbox/feedback/
// 개인 저장소를 정하지 않았으면 이 컴퓨터의 설정 폴더에만 쌓고 올리지 않는다
const feedbackDir = process.env.RW_SANDBOX === '1' ? path.join(sandboxRoot, 'feedback') : process.env.RW_FEEDBACK_DIR ?? (personal ? path.join(personalDir, 'feedback') : path.join(configDir, 'feedback'))
// 예전 위치(앱 폴더의 feedback/)에서 한 번 옮긴다: 개인 저장소에 아직 처리 기록이 없을 때만, 있는 파일은 덮어쓰지 않고. 예전 폴더는 그대로 둔다
const legacyFeedback = path.join(repoRoot, 'feedback')
if (personal && !process.env.RW_FEEDBACK_DIR && fs.existsSync(path.join(personalDir, '.git')) && !fs.existsSync(path.join(feedbackDir, 'status.yaml')) && fs.existsSync(path.join(legacyFeedback, 'status.yaml'))) {
  fs.cpSync(legacyFeedback, feedbackDir, { recursive: true, force: false, errorOnExist: false })
}
// 예제 모드의 피드백 화면 예: 처리 · 반려 · 다시 처리 · 승인을 주고받은 항목 몇 개 (fixtures/sandbox-feedback)
if (process.env.RW_SANDBOX === '1' && !fs.existsSync(feedbackDir)) cpSample(path.join(repoRoot, 'fixtures/sandbox-feedback'), feedbackDir, { recursive: true })
// 앱 업데이트(설정 화면): 실사용만. 지금 돌고 있는 코드의 커밋을 시작할 때 기억한다
const running = (() => { try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD']).toString().trim() } catch { return null } })()
const appRepo = process.env.RW_SANDBOX !== '1' && running ? { root: repoRoot, running, steps: macSteps() } : undefined
// 구글 연결: 예제 모드는 가짜 구글(이번 주 일정 몇 개)에 미리 연결해 둔다. 실사용은 설정 화면에서 연결
let google: Google | undefined
if (process.env.RW_SANDBOX === '1') {
  google = new Google(configDir, mockGoogleFetch(), true)
  if (!google.status().connected) await google.finish('mock', new URL(google.authUrl('http://127.0.0.1/api/google/callback', '/')).searchParams.get('state')!)
}
// 맥에만 있는 workbench/ 백업: 실사용만. 개인 저장소에 올린다
const backupRemote = appRepo ? personal : null
const backup = backupRemote ? { dir: path.join(configDir, 'backup'), remote: backupRemote, intervalMs: 60 * 60_000, settings: path.join(configDir, 'config.yaml') } : undefined
const app = buildApp({ configDir, google, watch: true, sandbox: process.env.RW_SANDBOX === '1', feedbackDir, feedbackPublish: process.env.RW_SANDBOX !== '1' && (!!personal || !!process.env.RW_FEEDBACK_DIR), feedbackAutoPublishMs: 30_000, feedbackSync: personal && !process.env.RW_FEEDBACK_DIR ? () => pullPersonal(personalDir) : undefined, appRepo, appAutoUpdate: { everyMs: 10 * 60_000, idleMs: 5 * 60_000 }, appVersion: running?.slice(0, 7), backup })

// RW_STATIC=1 (실사용 서비스): 빌드한 화면을 이 서버가 함께 내보낸다
if (process.env.RW_STATIC === '1') {
  const dist = path.join(repoRoot, 'apps/web/dist')
  // 자동 업데이트가 이 커밋으로 미리 빌드해 둔 화면이 있으면 바꿔 단다 (appupdate.ts)
  try {
    if (running && promoteNextBuild(repoRoot, running)) console.log('미리 빌드한 화면으로 바꿨습니다 (apps/web/dist-next → dist)')
  } catch (e) { console.error(`미리 빌드한 화면을 바꿔 달지 못했습니다: ${(e as Error).message}`) }
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error(`화면이 빌드되지 않았습니다: ${dist} — pnpm build 먼저`)
  serveStatic(app, dist)
}

// 이 컴퓨터 안에서만 접속을 받는다.
await app.listen({ host: '127.0.0.1', port })
console.log(`research-workspace server: http://127.0.0.1:${port}  config=${configDir}`)
