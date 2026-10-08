// node scripts/subjects/plan.mjs --library <path> --out <outside-directory> [--map <mapping.yaml>]
// node scripts/subjects/plan.mjs --apply <proposal.json> [--i-have-user-approval]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tsxApi } from '../ci/tsx-api.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { register } = await tsxApi()
register()
const { writeProposal, applyProposal } = await import('../../apps/server/src/subjectMigration.ts')
const args = process.argv.slice(2)
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
try {
  if (value('--apply')) {
    const proposal = JSON.parse(fs.readFileSync(value('--apply'), 'utf8'))
    console.log(JSON.stringify(applyProposal(proposal, path.join(root, '.sandbox'), args.includes('--i-have-user-approval')), null, 2))
  } else if (value('--library') && value('--out')) {
    if (args.includes('--map') && (!value('--map') || value('--map').startsWith('--'))) throw new Error('--map에는 대응표 YAML 경로가 필요합니다')
    const p = writeProposal(value('--library'), value('--out'), value('--map'))
    console.log(`제안: ${path.resolve(value('--out'))}/proposal.md · proposal.json · subjects.yaml (${p.notes.length}개 노트)`)
  } else throw new Error('사용법: --library <라이브러리> --out <출력 폴더> [--map <대응표.yaml>] 또는 --apply <proposal.json> [--i-have-user-approval]')
} catch (e) { console.error(e.message); process.exitCode = 1 }
