// 연구 저장소 폴더 (10/13 결정): 맨 위 표준 폴더 · 고유 폴더(folders:) · 결정(decisions/) · 프로젝트 규칙(rules/)
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkWorkbench } from './agentCheck.js'
import { generateStatus, listReviews } from './agentStatus.js'
import { withLang } from './i18n.js'
import { folderMap, listDecisions, listRules, usesStandardLayout } from './projectFolders.js'
import { makeRepo, useSampleApp } from './testkit.js'
import { classify } from './watcher.js'
import { Workbench } from './workbench.js'

useSampleApp()
let wb: Workbench
let serial = 0
beforeEach(() => { wb = new Workbench(path.join(makeRepo(`folders-${serial++}`), 'workbench')) })
/** workbench 기준 경로에 쓴다 (../로 저장소 맨 위) */
const write = (file: string, text: string) => {
  const abs = path.join(wb.root, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text)
}
const dirs = (...names: string[]) => { for (const n of names) fs.mkdirSync(path.join(wb.repo, n), { recursive: true }) }
const research = (extra = '') => write('research.yaml', `title: 연구\n${extra}`)
const check = () => withLang('ko', () => checkWorkbench(wb)).diagnostics
const section = (status: string, heading: string) => status.split(heading)[1]?.split('\n## ')[0]

describe('맨 위 폴더 지도', () => {
  it('표준 · 고유(folders:) · 그 밖으로 나누고, 점 폴더와 node_modules는 세지 않는다', () => {
    dirs('docs', 'code-space', 'biz-space', 'GOVERNMENT', '.github', 'node_modules')
    research('folders:\n  - biz-space — 사업 계획\n  - gone — 없는 폴더\n')
    const map = folderMap(wb)
    expect(map.standard.map((f) => f.name)).toEqual(['workbench', 'docs', 'code-space'])
    expect(map.own).toEqual([{ name: 'biz-space', note: '사업 계획', edit: '저장소 규칙대로' }])
    expect(map.other).toEqual(['GOVERNMENT'])
  })

  it('앱이 읽는 진술 폴더(statements/)는 적지 않아도, 적어도 앱의 고유 폴더다', () => {
    dirs('statements')
    expect(folderMap(wb).own).toEqual([expect.objectContaining({ name: 'statements', note: '진술: 정의·정리' })])
    research('folders:\n  - statements — 진술\n')
    expect(folderMap(wb).own).toEqual([expect.objectContaining({ name: 'statements', edit: expect.stringContaining('옮기지 않는다') })])
    expect(folderMap(wb).other).toEqual([])
  })

  it('주제 폴더나 folders:가 있어야 표준 배치를 쓰는 저장소다', () => {
    expect(usesStandardLayout(wb)).toBe(false)
    research('folders: []\n')
    expect(usesStandardLayout(wb)).toBe(true)
    research()
    fs.mkdirSync(path.join(wb.root, 'topics/a'), { recursive: true })
    expect(usesStandardLayout(new Workbench(wb.root))).toBe(true)
  })
})

describe('STATUS.md 폴더와 편집 규칙 · 프로젝트 규칙', () => {
  it('예전 배치에 workbench만 있으면 두 절을 생략한다', () => {
    const status = generateStatus(wb)
    expect(status).not.toContain('## 폴더와 편집 규칙')
    expect(status).not.toContain('## 프로젝트 규칙')
    expect(status).not.toContain('workbench/rules/')
  })

  it('있는 표준 폴더의 편집 규칙, 고유 폴더, 표준 밖 폴더를 정본 위치 바로 뒤에 보인다', () => {
    dirs('sources', 'data-space', 'statements', 'biz-space', 'legacy')
    research('folders:\n  - biz-space — 사업 계획\n')
    const status = generateStatus(wb)
    const folders = section(status, '## 폴더와 편집 규칙')!
    expect(folders).toContain('- `sources/` — 원자료와 받은 원본 · 고치지 않는다. 근거로만 쓴다')
    expect(folders).toContain('- `data-space/` — 계산이 만든 그림과 데이터 · 손으로 고치지 않고 스크립트로만 다시 만든다')
    expect(folders).toContain('- `statements/` (고유 폴더) — 진술: 정의·정리 · 앱이 읽는다. 앱 형식(docs/repo-format.md)대로 고치고 옮기지 않는다')
    expect(folders).toContain('- `biz-space/` (고유 폴더) — 사업 계획 · 저장소 규칙대로')
    expect(folders).toContain('저장소 규칙(`AGENTS.md`)')
    expect(folders).toContain('- 표준 밖: `legacy/` — 저장소 규칙대로. 옮기는 것은 사용자가 허락한 뒤')
    expect(folders).not.toContain('`docs/`')
    expect(folders.indexOf('`workbench/`')).toBeLessThan(folders.indexOf('`sources/`'))
    expect(status.indexOf('## 정본 위치')).toBeLessThan(status.indexOf('## 폴더와 편집 규칙'))
  })

  it('규칙·결정 수를 정본 위치에, 규칙 목록을 제목·status와 함께 보이고 in-review는 검토 대기에 넣는다', () => {
    write('rules/writing-style.md', '---\ntitle: 문체\nstatus: in-review\n---\n본문\n')
    write('rules/scope.md', '# 범위\n')
    write('decisions/2026-10-08-notes.md', '---\nstatus: accepted\n---\n# 연구노트가 정본\n')
    write('decisions/2026-10-09-split.md', '---\nstatus: in-review\ntitle: 저장소 나누기\n---\n')
    const status = generateStatus(wb)
    expect(status).toContain('- `workbench/rules/<이름>.md` — 프로젝트 규칙 2개')
    expect(status).toContain('- `workbench/decisions/<날짜-이름>.md` — 결정 2개')
    const rules = section(status, '## 프로젝트 규칙 2')!
    expect(rules).toContain('- `workbench/rules/scope.md` · 범위\n')
    expect(rules).toContain('- `workbench/rules/writing-style.md` · 문체 · in-review')
    expect(listRules(wb).map((r) => r.title)).toEqual(['범위', '문체'])
    expect(listDecisions(wb).map((r) => r.title)).toEqual(['연구노트가 정본', '저장소 나누기'])
    // 검토 문서로도 읽는다: sources.reviews에 적지 않아도, 적어도 한 번만
    const files = (reviews: string[]) => listReviews(wb.repo, { ...wb.readResearch().sources, reviews }).map((r) => r.file)
    expect(files([])).toEqual(['workbench/decisions/2026-10-08-notes.md', 'workbench/decisions/2026-10-09-split.md', 'workbench/rules/writing-style.md'])
    expect(files(['workbench/rules'])).toEqual(files([]))
    const waiting = section(status, '## 사용자 검토 대기 문서')!
    expect(waiting).toContain('workbench/rules/writing-style.md')
    expect(waiting).toContain('workbench/decisions/2026-10-09-split.md')
    expect(waiting).not.toContain('2026-10-08-notes.md')
  })

  it('규칙·결정 파일이 바뀌면 작업 탭이 다시 읽게 알린다', () => {
    expect(classify('/r/workbench', '/r/workbench/rules/style.md')).toEqual({ type: 'sources' })
    expect(classify('/r/workbench', '/r/workbench/decisions/2026-10-13-a.md')).toEqual({ type: 'sources' })
    expect(classify('/r/workbench', '/r/workbench/rules/old/style.md')).toBeNull()
    expect(classify('/r/workbench', '/r/workbench/rules/style.txt')).toBeNull()
  })
})

describe('agent:check 폴더 · 결정 · 규칙', () => {
  it('folders: 줄의 모양과 표준 밖 폴더를 본다 (표준 배치를 쓰는 저장소만)', () => {
    dirs('docs', 'statements', 'biz-space', 'legacy')
    expect(check().filter((d) => d.file === 'legacy/')).toEqual([])
    research('folders:\n  - biz-space — 사업\n  - docs — 글\n  - missing — 없음\n  - code-space/sub — 하위\n  - 3\n')
    const found = check()
    const at = (line: number) => found.find((d) => d.file === 'workbench/research.yaml' && d.line === line)
    expect(at(3)).toBeUndefined()
    expect(at(4)).toMatchObject({ level: 'warning', message: '표준 폴더는 folders:에 적지 않습니다: docs' })
    expect(at(5)).toMatchObject({ level: 'warning', message: '저장소 맨 위에 없는 폴더: missing' })
    expect(at(6)).toMatchObject({ level: 'error', message: 'folders:에는 맨 위 폴더 이름만 적습니다: code-space/sub' })
    expect(at(7)).toMatchObject({ level: 'error' })
    expect(found).toContainEqual(expect.objectContaining({ level: 'warning', file: 'legacy/', line: 1 }))
    expect(found.filter((d) => d.file === 'statements/' || d.file === 'biz-space/')).toEqual([])
  })

  it('결정·규칙의 이름, 머리말, status, 제목을 본다', () => {
    write('decisions/2026-10-13-ok.md', '---\ntitle: 됨\nstatus: accepted\n---\n')
    write('decisions/notes.md', '---\nstatus: accepted\n---\n# 이름이 틀림\n')
    write('rules/Style.md', '# 대문자\n')
    write('rules/bad-yaml.md', '---\nstatus: [\n---\n')
    write('rules/odd.md', '---\ntitle: 이상함\nstatus: done\n---\n')
    write('rules/old.md', '---\ntitle: 옛 이름\nstatus: needs-review\n---\n')
    write('rules/untitled.md', '---\nstatus: draft\n---\n본문만\n')
    const found = check().filter((d) => /\/(decisions|rules)\//.test(d.file))
    const of = (file: string) => found.filter((d) => d.file === `workbench/${file}`).map((d) => `${d.level}:${d.line}:${d.message}`)
    expect(of('decisions/2026-10-13-ok.md')).toEqual([])
    expect(of('decisions/notes.md')).toEqual(['warning:1:파일 이름은 YYYY-MM-DD-영문이름.md로 적으세요.'])
    expect(of('rules/Style.md')).toEqual(['warning:1:파일 이름은 영문이름.md (소문자·숫자·하이픈)로 적으세요.', 'warning:1:머리말(---)에 status가 없어 앱이 상태를 모릅니다.'])
    expect(of('rules/bad-yaml.md')).toEqual([expect.stringMatching(/^error:1:YAML 오류/)])
    expect(of('rules/odd.md')).toEqual([expect.stringMatching(/^warning:3:모르는 status: done/)])
    expect(of('rules/old.md')).toEqual([])
    expect(of('rules/untitled.md')).toEqual(['warning:1:머리말 title이나 # 제목이 없습니다.'])
  })
})
