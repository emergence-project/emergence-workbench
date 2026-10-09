import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hashOf, isInside as inside, writeAtomic } from './fsutil.js'
import { splitFrontmatter } from './conceptNotes.js'
import { acceptedSubjects, parseSubjects, readSubjects, subjectSlug } from './subjects.js'
import { parseBib } from './materials.js'
import { mappedSecondaries, normalizeSubjectPath, parseSubjectMapping } from './subjectMigrationMap.js'

const LEGACY = ['subject', 'subjects', 'domains', 'topics', 'tags', 'frontmatter-version'] as const
interface NotePlan { file: string; hash: string; afterHash: string; before: Record<string, unknown>; subjects: string[]; primaryFrom?: 'path' | 'note'; secondaryFrom?: string[] }
export interface SubjectProposal {
  version: 1; library: string; treeHash: string; subjectsYaml: string
  mapped?: true
  mappings: { before: string; after: string; depth: number; warning?: string }[]
  notes: NotePlan[]; figures: { file: string; subjects: string[] }[]; papers: { key: string; subjects: string[] }[]
}
/** Resolve existing ancestors too, so a symlink cannot redirect output into the library. */
function physical(file: string): string {
  const abs = path.resolve(file)
  if (fs.existsSync(abs)) return fs.realpathSync(abs)
  return path.join(physical(path.dirname(abs)), path.basename(abs))
}
function rewrite(raw: string, subjects: string[]): string {
  const { fmText, body } = splitFrontmatter(raw)
  const doc = YAML.parseDocument(fmText ?? '')
  if (doc.errors.length || (doc.contents !== null && !YAML.isMap(doc.contents))) throw new Error('머리말을 읽지 못했습니다')
  if (!doc.contents) doc.contents = doc.createNode({}) as never
  LEGACY.forEach((key) => doc.delete(key))
  doc.set('subjects', doc.createNode(subjects))
  // checked.hash covers only the normalized body. Preserve checked, including stale states.
  return `---\n${doc.toString({ lineWidth: 0 }).replace(/\n*$/, '\n')}---\n${body}`
}
function readUtf8(file: string): string {
  const bytes = fs.readFileSync(file)
  const raw = bytes.toString('utf8')
  if (!Buffer.from(raw).equals(bytes)) throw new Error(`UTF-8이 아닌 파일: ${file}`)
  return raw
}
export function planSubjects(library: string, mapFile?: string): SubjectProposal {
  const lib = fs.realpathSync(library)
  const tree = readSubjects(lib)
  const mapping = mapFile === undefined ? undefined : parseSubjectMapping(readUtf8(mapFile))
  const draft: Record<string, { name: string }> = Object.fromEntries(tree.items.map((s) => [s.id, { name: s.name }]))
  const ids = new Map<string, string>()
  const names = new Map<string, string>()
  const mappings: SubjectProposal['mappings'] = []
  const files = fs.readdirSync(path.join(lib, 'concepts')).filter((f) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(f) && f !== 'README.md' && !f.endsWith('.memo.md')).sort()
  const sources = files.map((file) => {
    const abs = path.join(lib, 'concepts', file)
    if (!inside(lib, physical(abs))) throw new Error(`라이브러리 밖 파일: ${file}`)
    const raw = readUtf8(abs)
    return { file: `concepts/${file}`, raw, fm: splitFrontmatter(raw).fm }
  })
  const paths = [...new Set(sources.map((s) => s.fm.subject).filter((s): s is string => typeof s === 'string' && !!s.trim()))].sort()
  if (mapping) {
    const unknownNotes = [...mapping.notes.keys()].filter((file) => !files.includes(file))
    const missingPaths = [...new Set(sources.filter((s) => !mapping.notes.has(path.basename(s.file)) && typeof s.fm.subject === 'string' && s.fm.subject.trim() && !mapping.paths.has(normalizeSubjectPath(s.fm.subject))).map((s) => normalizeSubjectPath(s.fm.subject as string)))].sort()
    const errors = [
      ...(missingPaths.length ? [`대응표에 없는 경로:\n${missingPaths.map((s) => `- ${s}`).join('\n')}`] : []),
      ...(unknownNotes.length ? [`대응표에 있지만 concepts/에 없는 노트:\n${unknownNotes.map((s) => `- ${s}`).join('\n')}`] : []),
    ]
    if (errors.length) throw new Error(errors.join('\n'))
    for (const [before, after] of mapping.paths) mappings.push({ before, after, depth: before.split('›').length })
  }
  for (const old of mapping ? [] : paths) {
    const segments = old.split(/\s*›\s*/).filter(Boolean)
    let parent = ''
    for (let i = 0; i < Math.min(segments.length, 3); i++) {
      const label = segments[i]!
      const oldPrefix = segments.slice(0, i + 1).join(' › ')
      if (ids.has(oldPrefix)) { parent = ids.get(oldPrefix)!; continue }
      const slug = subjectSlug(label) || `subject-${hashOf(label).slice(0, 6)}`
      let id = parent ? `${parent}/${slug}` : slug
      if ((names.has(id) && names.get(id) !== oldPrefix) || (draft[id] && draft[id]!.name !== label)) id += `-${hashOf(oldPrefix).slice(0, 6)}`
      draft[id] = { name: label }; names.set(id, oldPrefix); ids.set(oldPrefix, id); parent = id
    }
    ids.set(old, parent)
    mappings.push({ before: old, after: parent, depth: segments.length, ...(segments.length > 3 && { warning: `깊이 ${segments.length} → 3: ${segments.slice(3).join(' › ')}를 상위 분류로 합칠 제안` }) })
  }
  const subjectsYaml = mapping?.subjectsYaml ?? YAML.stringify(draft, { lineWidth: 0 })
  const proposedTree = { enabled: true, hash: hashOf(subjectsYaml), items: parseSubjects(subjectsYaml) }
  const notes = sources.map(({ file, raw, fm }): NotePlan => {
    let subjects = tree.enabled ? acceptedSubjects(tree, fm.subjects) : typeof fm.subject === 'string' && ids.get(fm.subject) ? [ids.get(fm.subject)!] : []
    let provenance: Pick<NotePlan, 'primaryFrom' | 'secondaryFrom'> = {}
    if (mapping) {
      const override = mapping.notes.get(path.basename(file))
      provenance = { primaryFrom: override === undefined ? 'path' : 'note', secondaryFrom: [] }
      if (override !== undefined) subjects = override
      // A freshly planned rerun must not interpret migrated IDs as legacy Study tags.
      else if (tree.enabled && !fm.subject) {
        subjects = acceptedSubjects(proposedTree, fm.subjects)
        if (!Array.isArray(fm.subjects) || subjects.length !== fm.subjects.length) throw new Error(`잘못된 기존 분류: ${file}`)
      } else {
        const result = mappedSecondaries(typeof fm.subject === 'string' ? mapping.paths.get(normalizeSubjectPath(fm.subject)) : undefined, fm, mapping.tags)
        subjects = result.subjects
        provenance.secondaryFrom = result.secondaryFrom
      }
    }
    return { file, hash: hashOf(raw), afterHash: hashOf(rewrite(raw, subjects)), before: Object.fromEntries(LEGACY.map((k) => [k, fm[k] ?? null])), subjects, ...provenance }
  })
  const figuresDir = path.join(lib, 'figures')
  const figures = (fs.existsSync(figuresDir) ? fs.readdirSync(figuresDir) : []).filter((f) => /\.(svg|png|jpe?g|pdf|tikz|tex)$/i.test(f)).sort().map((file) => ({ file: `figures/${file}`, subjects: [] as string[] }))
  const bib = path.join(lib, 'references.bib')
  const papers = (fs.existsSync(bib) ? parseBib(fs.readFileSync(bib, 'utf8')) : []).map((e) => ({ key: e.key, subjects: [] as string[] }))
  return { version: 1, library: lib, treeHash: tree.hash, subjectsYaml, mappings, notes, figures, papers, ...(mapping && { mapped: true as const }) }
}
const cell = (v: unknown) => JSON.stringify(v).replace(/\|/g, '\\|').replace(/\n/g, ' ')
export function proposalMarkdown(p: SubjectProposal): string {
  if (p.mapped) return mappedProposalMarkdown(p)
  return `# 라이브러리 분류 전환 제안\n\n라이브러리: ${p.library}\n\n## 분류 나무 초안\n\n\`\`\`yaml\n${p.subjectsYaml}\`\`\`\n\n## 경로 대응\n\n| 기존 경로 | 새 ID | 확인할 것 |\n| --- | --- | --- |\n${p.mappings.map((m) => `| ${m.before} | ${m.after} | ${m.warning ?? '—'} |`).join('\n')}\n\n## 노트 전후\n\n| 파일 | subject | Study subjects | domains | topics | tags | frontmatter-version | 새 subjects |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${p.notes.map((n) => `| ${n.file} | ${LEGACY.map((k) => cell(n.before[k])).join(' | ')} | ${cell(n.subjects)} |`).join('\n')}\n\n## 그림·논문\n\n분류를 자동으로 붙이지 않습니다. 기존 파일은 고치지 않습니다.\n\n| 종류 | 파일 / bib 키 | 새 subjects |\n| --- | --- | --- |\n${[...p.figures.map((f) => `| 그림 | ${f.file} | [] |`), ...p.papers.map((f) => `| 논문 | ${f.key} | [] |`)].join('\n')}\n\nstudy 원본 경로와 본문 바이트, checked는 그대로 둡니다. 해시가 달라진 파일은 건너뜁니다.\n`
}
/** Counts are distinct notes, including all primary and secondary assignments. */
function mappedProposalMarkdown(p: SubjectProposal): string {
  const tree = parseSubjects(p.subjectsYaml)
  const treeRows: string[] = []
  const visit = (parent: string | null, depth: number) => {
    for (const item of tree.filter((s) => s.parent === parent)) {
      const own = p.notes.filter((n) => n.subjects.includes(item.id)).length
      const total = p.notes.filter((n) => n.subjects.some((id) => id === item.id || id.startsWith(`${item.id}/`))).length
      treeRows.push(`| ${'　'.repeat(depth)}${item.name} | ${item.id} | ${own} | ${total} |`)
      visit(item.id, depth + 1)
    }
  }
  visit(null, 0)
  const exceptions = p.notes.filter((n) => n.primaryFrom === 'note' || n.subjects.length !== 1 || !!n.secondaryFrom?.length)
  return `# 라이브러리 분류 전환 제안

라이브러리: ${p.library}

## 분류 나무와 노트 수

주·보조 분류 모두 세며, 하위 포함 수는 같은 노트를 한 번만 셉니다.

| 분류 | ID | 직접 | 하위 포함 |
| --- | --- | --- | --- |
${treeRows.join('\n')}

## 경로 대응

| 기존 경로 | 새 ID |
| --- | --- |
${p.mappings.map((m) => `| ${cell(m.before)} | ${m.after} |`).join('\n')}

## 별도 확인할 노트

개별 지정·보조 분류·분류 없음만 표시합니다.

| 파일 | 기존 경로 | 새 subjects | 주 분류 근거 | 사용한 Study 태그 |
| --- | --- | --- | --- | --- |
${exceptions.map((n) => `| ${n.file} | ${cell(n.before.subject)} | ${cell(n.subjects)} | ${n.primaryFrom} | ${cell(n.secondaryFrom)} |`).join('\n')}

## 그림·논문

분류를 자동으로 붙이지 않습니다. 기존 파일은 고치지 않습니다.

| 종류 | 파일 / bib 키 | 새 subjects |
| --- | --- | --- |
${[...p.figures.map((f) => `| 그림 | ${f.file} | [] |`), ...p.papers.map((f) => `| 논문 | ${f.key} | [] |`)].join('\n')}

study 원본 경로와 본문 바이트, checked는 그대로 둡니다. 해시가 달라진 파일은 건너뜁니다.

<details>
<summary>전체 노트 전후</summary>

| 파일 | subject | Study subjects | domains | topics | tags | frontmatter-version | 새 subjects | primaryFrom | secondaryFrom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${p.notes.map((n) => `| ${n.file} | ${LEGACY.map((k) => cell(n.before[k])).join(' | ')} | ${cell(n.subjects)} | ${n.primaryFrom} | ${cell(n.secondaryFrom)} |`).join('\n')}

</details>
`
}
export function writeProposal(library: string, output: string, mapFile?: string): SubjectProposal {
  const lib = fs.realpathSync(library)
  const out = physical(output)
  if (inside(lib, out)) throw new Error('제안 출력은 라이브러리 밖이어야 합니다')
  const p = planSubjects(lib, mapFile)
  for (const file of ['proposal.json', 'proposal.md', 'subjects.yaml']) if (inside(lib, physical(path.join(out, file)))) throw new Error('제안 출력이 라이브러리를 가리킵니다')
  fs.mkdirSync(out, { recursive: true })
  writeAtomic(path.join(out, 'proposal.json'), JSON.stringify(p, null, 2) + '\n')
  writeAtomic(path.join(out, 'proposal.md'), proposalMarkdown(p))
  writeAtomic(path.join(out, 'subjects.yaml'), p.subjectsYaml)
  return p
}
export function applyProposal(p: SubjectProposal, sandbox: string, approval = false): { applied: string[]; skipped: { file: string; reason: string }[]; unchanged: string[] } {
  if (p.version !== 1) throw new Error('지원하지 않는 제안 형식입니다')
  const lib = fs.realpathSync(p.library)
  if (!approval && !inside(path.resolve(sandbox), lib)) throw new Error('.sandbox 밖 적용에는 --i-have-user-approval이 필요합니다')
  const items = parseSubjects(p.subjectsYaml)
  const tree = { enabled: true, hash: hashOf(p.subjectsYaml), items }
  const treeFile = path.join(lib, 'subjects.yaml')
  if (!inside(lib, physical(treeFile))) throw new Error('분류 나무가 라이브러리 밖을 가리킵니다')
  const currentTreeHash = hashOf(fs.existsSync(treeFile) ? fs.readFileSync(treeFile, 'utf8') : '')
  if (currentTreeHash !== p.treeHash && currentTreeHash !== tree.hash) throw new Error('계획 뒤 subjects.yaml이 바뀌어 적용하지 않았습니다')
  // Preflight every path and proposed ID before the first write.
  for (const note of p.notes) {
    if (!/^concepts\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(note.file) || !inside(lib, physical(path.join(lib, note.file)))) throw new Error(`허용하지 않는 파일: ${note.file}`)
    if (!Array.isArray(note.subjects) || acceptedSubjects(tree, note.subjects).length !== note.subjects.length) throw new Error(`잘못된 분류: ${note.file}`)
  }
  const result: ReturnType<typeof applyProposal> = { applied: [], skipped: [], unchanged: [] }
  for (const note of p.notes) {
    const file = path.join(lib, note.file)
    if (!fs.existsSync(file)) { result.skipped.push({ file: note.file, reason: '파일 없음' }); continue }
    const raw = readUtf8(file)
    const hash = hashOf(raw)
    if (hash === note.afterHash) { result.unchanged.push(note.file); continue }
    if (hash !== note.hash) { result.skipped.push({ file: note.file, reason: '계획 뒤 해시 바뀜' }); continue }
    const next = rewrite(raw, note.subjects)
    if (hashOf(next) !== note.afterHash) throw new Error(`제안 결과 해시가 맞지 않습니다: ${note.file}`)
    writeAtomic(file, next); result.applied.push(note.file)
  }
  if (currentTreeHash !== tree.hash) writeAtomic(treeFile, p.subjectsYaml)
  return result
}
