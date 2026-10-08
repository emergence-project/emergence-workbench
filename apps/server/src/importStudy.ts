// pnpm --filter @rw/server import:study [--apply] [--no-fetch] [--include-index] [--include-chapters] [--report 파일]
// Study의 Concept-Space 개념 노트를 research-library/concepts/로 옮긴다 (studyImport.ts).
// 기본은 미리 보기: 아무것도 쓰지 않고 보고서만 낸다. --apply를 주면 개념노트·그림·references.bib 새 항목을 쓴다 (git 커밋은 하지 않음).
// 출처의 arXiv 번호·DOI는 arXiv·Crossref에서 문헌 정보를 받아 bib 항목으로 만든다 (읽기만 하는 요청). --no-fetch면 받지 않는다.
// Study·라이브러리 위치는 앱 설정(RW_CONFIG_DIR 또는 ~/.config/research-workspace)을 따른다. --study·--library로 바꿀 수 있다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Registry } from './registry.js'
import { applyStudyImport, importReport, planStudyImport, resolveSources } from './studyImport.js'

const args = process.argv.slice(2)
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const registry = new Registry(process.env.RW_CONFIG_DIR ?? path.join(os.homedir(), '.config/research-workspace'))
const study = opt('--study') ?? registry.studyPath
const lib = opt('--library') ?? registry.libraryPath
if (!study || !fs.existsSync(study)) { console.error(`Study 폴더가 없습니다: ${study ?? '(설정 없음)'}`); process.exit(1) }
if (!lib || !fs.existsSync(lib)) { console.error(`라이브러리 폴더가 없습니다: ${lib ?? '(설정 없음)'}`); process.exit(1) }

// 받은 문헌 정보는 설정 폴더의 study-import-cache.json에 남겨, 미리 보기와 --apply가 같은 결과를 쓰게 한다 (실패는 남기지 않고 두 번까지 다시 시도)
const cacheFile = path.join(registry.configDir, 'study-import-cache.json')
const cache: Record<string, string> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
const cachedFetch = (async (url: string) => {
  if (cache[url] !== undefined) return new Response(cache[url])
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'research-workspace study import (mailto:none)' } })
      if (r.ok) { const text = await r.text(); cache[url] = text; fs.writeFileSync(cacheFile, JSON.stringify(cache)); return new Response(text) }
      if (r.status === 404) return r
    } catch { /* 다시 시도 */ }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)))
  }
  return new Response('', { status: 503 })
}) as unknown as typeof fetch

const items = planStudyImport(study, lib, { includeIndex: args.includes('--include-index'), includeChapters: args.includes('--include-chapters') })
const newBib = args.includes('--no-fetch') ? [] : await resolveSources(lib, items, cachedFetch)
const report = importReport(items, newBib)
const out = opt('--report')
if (out) { fs.writeFileSync(out, report); console.log(`보고서: ${out}`) } else console.log(report)
if (args.includes('--apply')) {
  const r = applyStudyImport(study, lib, items, newBib)
  console.log(`옮김: 개념노트 ${r.written.length}개, 그림 ${r.images.length}개, bib 항목 ${r.bib}개 → ${lib}`)
}
