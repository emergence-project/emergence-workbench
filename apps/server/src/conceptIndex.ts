import crypto from 'node:crypto'
import { readSubjects, acceptedSubjects, subjectLabel } from './subjects.js'
import { setImmediate } from 'node:timers/promises'
import { hashOf } from './fsutil.js'
import { REFRESH_MS } from './readCache.js'
import type { LibraryNote } from './libraryNotes.js'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CONCEPTS_DIR, MEMO_SUFFIX, checkStateOf, EMPTY_NOTE, hasSource, inlineCites, metaOf, splitFrontmatter, unfinishedReasons } from './conceptNotes.js'
import { parseBib } from './materials.js'
import { parseKnowledgeMarkdown, topicKey, wikiTargets, type Parsed } from './knowledge.js'

/**
 * 개념노트 색인 (2026-10-04, 노트가 수만 개가 되어도).
 * 원본은 research-library/concepts/*.md 그대로이고, 이 색인은 앱 옆(설정 폴더)의 SQLite 파일 하나다.
 * 지워도 다음에 다시 만든다. 파일이 바뀌면 그 파일만 다시 읽는다 (고친 때·크기로 비교).
 * - notes: 목록 한 줄에 필요한 것 (이름·분류·미완성·확인함·잠김)
 * - names: 이름·다른 이름의 topicKey → 노트 ([[링크]]를 노트로 옮길 때)
 * - links: 본문 [[링크]]와 머리말 related (보낸 노트 → 받는 이름의 key)
 * - fts: 이름·다른 이름·분류·본문 전문 검색 (trigram: 한글·부분 문자열도 찾는다)
 * - cites: 머리말 sources:와 본문 [@키] (노트 → bib 키). bib_keys(임시 표)는 references.bib의 키
 */

export type ConceptFilter = 'all' | 'unfinished' | 'checked'

export interface ConceptRow {
  id: string
  /** 지식 화면의 주제 key (지도·주소와 맞춘다): Study에서 옮긴 노트는 Study 파일 이름, 아니면 제목 */
  key: string
  title: string
  subject: string
  subjects?: string[]
  aliases: string[]
  /** 미완성인 이유 (없으면 빈 배열) */
  unfinished: string[]
  checked: 'none' | 'ok' | 'changed'
  locked: boolean
}

export const ISSUE_SQL = {
  empty: 'n.is_empty = 1',
  emptySection: `n.unfinished LIKE '%"빈 절:%'`,
  todo: `n.unfinished LIKE '%"TODO·작성 중 표시"%'`,
  brokenLink: 'EXISTS (SELECT 1 FROM links l WHERE l.src = n.id AND NOT EXISTS (SELECT 1 FROM names m WHERE m.key = l.key))',
  noSource: 'n.is_empty = 0 AND n.has_source = 0',
  // references.bib가 없으면 대 볼 것이 없으니 세지 않는다
  unknownCite: 'EXISTS (SELECT 1 FROM bib_keys) AND EXISTS (SELECT 1 FROM cites c WHERE c.src = n.id AND NOT EXISTS (SELECT 1 FROM bib_keys b WHERE b.key = c.key))',
} as const
export type ConceptIssue = keyof typeof ISSUE_SQL
export type ConceptCheck = 'unchecked' | 'changedAfterCheck' | 'draftsToReview'
export type ConceptSort = 'title' | 'subject' | 'sources' | 'links' | 'issues' | 'mtime' | 'projects' | 'aliases' | 'checked'
export interface ConceptTableRow extends ConceptRow {
  sources: number
  links: number
  issues: ConceptIssue[]
  mtime: number
  projects: string[]
}

export interface ListQuery {
  subjectPrefix?: string
  issue?: ConceptIssue
  /** 경로에서 공용 점검 함수로 id를 구한 뒤 ids에 넣는다 */
  check?: ConceptCheck
  ids?: string[]
  sort?: ConceptSort
  dir?: 'asc' | 'desc'
  /** 직접 쓰는 프로젝트 이름. 요청마다 한 번 구해 임시 표에 넣는다 */
  projects?: Record<string, string[]>
  q?: string
  subject?: string
  filter?: ConceptFilter
  /** 'all'에서 빈 노트(제목·틀뿐)도 보이기. 찾기 중에는 늘 보인다 */
  showEmpty?: boolean
  offset?: number
  limit?: number
}

// 5: 한글 이름의 key가 비어 있던 것을 고침 (topicKey). 6: 출처 있음(has_source), 할 일 상자를 TODO로, Definition 판정 뺌 (10/6 지식 점검 기준).
// 버전이 바뀌면 열 때 색인을 처음부터 다시 만든다
// 7: 표의 서로 다른 출처 수(sources). 나가는 링크 수와 이상은 links · 공용 판정식에서 센다.
// 8: 라이브러리 목록과 지식 메타자료(note_details)를 같은 파일 읽기로 보관 (L4). 목록용 notes 표는 작게 유지한다.
// 9: ordered note–subject IDs and subjects.yaml-driven classification (L5).
// 10: 인용 키(cites) — bib에 없는 키 점검 (2026-10-08)
const SCHEMA = 10

export class ConceptIndex {
  private db: DatabaseSync
  private lastRefresh = -Infinity
  private pending: Promise<void> | null = null
  private dirty = false
  revision = 0
  private treeHash: string | undefined
  /** 마지막으로 읽은 references.bib의 고친 때·크기 (없으면 'none') */
  private bibStamp: string | undefined

  constructor(readonly lib: string, dbFile = ':memory:') {
    if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true })
    this.db = new DatabaseSync(dbFile)
    const v = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (v !== SCHEMA) {
      this.db.exec('DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS names; DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS fts; DROP TABLE IF EXISTS note_details; DROP TABLE IF EXISTS note_subjects; DROP TABLE IF EXISTS index_meta; DROP TABLE IF EXISTS cites;')
      this.db.exec(`
        CREATE TABLE notes (id TEXT PRIMARY KEY, key TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, aliases TEXT NOT NULL,
          unfinished TEXT NOT NULL, is_unfinished INTEGER NOT NULL, is_empty INTEGER NOT NULL, checked TEXT NOT NULL,
          locked INTEGER NOT NULL, mtime REAL NOT NULL, size INTEGER NOT NULL, has_source INTEGER NOT NULL, sources INTEGER NOT NULL, subjects TEXT NOT NULL);
        CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE note_subjects (note TEXT NOT NULL, subject TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(note, subject));
        CREATE INDEX note_subjects_path ON note_subjects(subject, note);
        CREATE TABLE note_details (id TEXT PRIMARY KEY, library TEXT NOT NULL, knowledge TEXT NOT NULL);
        CREATE INDEX notes_file ON notes(id, mtime, size);
        CREATE INDEX notes_subject ON notes(subject, title COLLATE NOCASE);
        CREATE INDEX notes_title ON notes(title COLLATE NOCASE);
        CREATE INDEX notes_mtime ON notes(mtime);
        CREATE TABLE names (key TEXT NOT NULL, id TEXT NOT NULL, rank INTEGER NOT NULL);
        CREATE INDEX names_key ON names(key, rank);
        CREATE INDEX names_id ON names(id);
        CREATE TABLE links (src TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL);
        CREATE INDEX links_src ON links(src);
        CREATE INDEX links_key ON links(key);
        CREATE TABLE cites (src TEXT NOT NULL, key TEXT NOT NULL);
        CREATE INDEX cites_src ON cites(src);
        CREATE VIRTUAL TABLE fts USING fts5(id UNINDEXED, title, aliases, subject, body, tokenize='trigram');
        PRAGMA user_version = ${SCHEMA};`)
    }
    this.treeHash = (this.db.prepare("SELECT value FROM index_meta WHERE key = 'tree'").get() as { value: string } | undefined)?.value
    this.db.exec('CREATE TEMP TABLE bib_keys (key TEXT PRIMARY KEY);')
    this.db.exec('CREATE TEMP TABLE note_projects (id TEXT PRIMARY KEY, projects TEXT NOT NULL, count INTEGER NOT NULL);')
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  }

  /** 설정 폴더 안, 라이브러리 경로마다 파일 하나 */
  static fileFor(configDir: string, lib: string): string {
    const h = crypto.createHash('sha1').update(path.resolve(lib)).digest('hex').slice(0, 12)
    return path.join(configDir, 'index', `concepts-${h}.sqlite`)
  }

  close(): void | Promise<void> {
    if (this.pending) return this.pending.then(() => this.db.close(), () => this.db.close())
    this.db.close()
  }
  invalidate(): void { this.dirty = true; this.lastRefresh = -Infinity }

  /** HTTP 경로는 이 문을 통과한다. 첫 색인도 50개마다 이벤트 루프를 돌려 다른 요청을 받는다.
   * 같은 색인의 동시 요청은 하나의 갱신을 기다린다. 트랜잭션 중간 결과를 내보내지 않는다. */
  async ready(): Promise<void> {
    if (this.pending) return this.pending
    this.pending = (async () => {
      do {
        this.dirty = false
        for (const _ of this.refreshSteps(false)) await setImmediate()
      } while (this.dirty)
    })()
    try { await this.pending } finally { this.pending = null }
  }

  /** 동기 소비자도 같은 갱신 구현을 쓴다. 바뀐 파일만, force가 아니면 1초에 한 번까지. */
  refresh(force = false): { read: number; removed: number } {
    if (this.pending) return { read: 0, removed: 0 }
    const steps = this.refreshSteps(force)
    let step = steps.next()
    while (!step.done) step = steps.next()
    return step.value
  }

  private *refreshSteps(force: boolean): Generator<void, { read: number; removed: number }> {
    const tree = readSubjects(this.lib)
    const treeHash = tree.enabled ? tree.hash : 'legacy'
    const treeChanged = this.treeHash !== treeHash
    const now = Date.now()
    if (!treeChanged && !force && now - this.lastRefresh < REFRESH_MS) return { read: 0, removed: 0 }
    this.lastRefresh = now
    this.refreshBib()
    const dir = path.join(this.lib, CONCEPTS_DIR)
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.endsWith(MEMO_SUFFIX) && !f.startsWith('.') && f !== 'README.md') : []
    const known = new Map((this.db.prepare('SELECT id, mtime, size FROM notes').all() as { id: string; mtime: number; size: number }[]).map((r) => [r.id, r]))
    const seen = new Set<string>()
    const changed: { id: string; file: string; mtime: number; size: number }[] = []
    let scanned = 0
    for (const f of files) {
      if (++scanned % 100 === 0) yield
      const id = f.slice(0, -3)
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) continue
      seen.add(id)
      const file = path.join(dir, f)
      let st: fs.Stats
      try { st = fs.statSync(file) } catch { continue }
      const k = known.get(id)
      if (treeChanged || !k || k.mtime !== st.mtimeMs || k.size !== st.size) changed.push({ id, file, mtime: st.mtimeMs, size: st.size })
    }
    const removed = [...known.keys()].filter((id) => !seen.has(id))
    if (!changed.length && !removed.length) { this.treeHash = treeHash; this.db.prepare("INSERT OR REPLACE INTO index_meta VALUES ('tree', ?)").run(treeHash); this.lastRefresh = this.dirty ? -Infinity : Date.now(); return { read: 0, removed: 0 } }
    // fts는 notes의 rowid로 지운다 (id 열은 색인이 없어 WHERE id = ?는 전체를 훑는다)
    const del = [
      'DELETE FROM fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)',
      'DELETE FROM note_subjects WHERE note = ?', 'DELETE FROM notes WHERE id = ?', 'DELETE FROM note_details WHERE id = ?', 'DELETE FROM names WHERE id = ?', 'DELETE FROM links WHERE src = ?', 'DELETE FROM cites WHERE src = ?',
    ].map((s) => this.db.prepare(s))
    const insNote = this.db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const insSubject = this.db.prepare('INSERT INTO note_subjects VALUES (?,?,?)')
    const insDetails = this.db.prepare('INSERT INTO note_details VALUES (?,?,?)')
    const insName = this.db.prepare('INSERT INTO names VALUES (?,?,?)')
    const insLink = this.db.prepare('INSERT INTO links VALUES (?,?,?)')
    const insCite = this.db.prepare('INSERT INTO cites VALUES (?,?)')
    const insFts = this.db.prepare('INSERT INTO fts (rowid, id, title, aliases, subject, body) VALUES (?,?,?,?,?,?)')
    this.db.exec('BEGIN')
    try {
      let processed = 0
      for (const id of removed) {
        if (++processed % 50 === 0) {
          this.db.exec('COMMIT'); this.revision++
          yield
          this.db.exec('BEGIN')
        }
        for (const d of del) d.run(id)
      }
      for (const c of changed) {
        if (++processed % 50 === 0) {
          this.db.exec('COMMIT'); this.revision++
          yield
          this.db.exec('BEGIN')
        }
        let raw: string
        try { raw = fs.readFileSync(c.file, 'utf8') } catch { continue }
        if (known.has(c.id)) for (const d of del) d.run(c.id)
        const { fm, body } = splitFrontmatter(raw)
        const meta = metaOf(fm, c.id)
        const ids = acceptedSubjects(tree, fm.subjects)
        const subject = tree.enabled ? (ids[0] ? subjectLabel(tree, ids[0]) : '') : meta.subject ?? ''
        const unf = unfinishedReasons(body)
        const key = (meta.study && topicKey(path.basename(meta.study, '.md'))) || topicKey(meta.title) || `concept-${c.id}`
        const checked = checkStateOf(meta, body)
        const cites = new Set([...meta.sources, ...inlineCites(body)])
        const library: LibraryNote = { kind: 'concept', id: c.id, title: meta.title, status: checked === 'ok' ? 'reviewed' : 'draft',
          empty: unf.includes(EMPTY_NOTE), study: meta.study, mtime: c.mtime, hash: hashOf(raw), format: 'md', unfinished: unf, checked, locked: meta.locked }
        const knowledge = parseKnowledgeMarkdown(raw, c.mtime, c.size, fm)
        const { lastInsertRowid } = insNote.run(c.id, key, meta.title, subject, JSON.stringify(meta.aliases), JSON.stringify(unf), unf.length ? 1 : 0,
          unf.includes(EMPTY_NOTE) ? 1 : 0, checked, meta.locked ? 1 : 0, c.mtime, c.size, hasSource(meta, body) ? 1 : 0, cites.size, JSON.stringify(ids))
        for (const k of cites) insCite.run(c.id, k)
        ids.forEach((id, position) => insSubject.run(c.id, id, position))
        insDetails.run(c.id, JSON.stringify(library), JSON.stringify(knowledge))
        // 이름이 겹치면 제목(0)이 다른 이름(1)보다, 파일 이름(2)보다 먼저
        const names = new Map<string, number>()
        for (const [n, rank] of [[meta.title, 0], ...meta.aliases.map((a) => [a, 1] as const), [c.id, 2]] as const) {
          const k = topicKey(n)
          if (k && !names.has(k)) names.set(k, rank)
        }
        for (const [k, rank] of names) insName.run(k, c.id, rank)
        const targets = new Map<string, string>()
        for (const n of [...wikiTargets(body), ...meta.related]) { const k = topicKey(n); if (k && !targets.has(k)) targets.set(k, n) }
        for (const [k, n] of targets) insLink.run(c.id, k, n)
        insFts.run(lastInsertRowid, c.id, meta.title, meta.aliases.join(' '), tree.enabled ? ids.map((id) => `${id} ${subjectLabel(tree, id)}`).join(' ') : meta.subject ?? '', body)
      }
      this.db.prepare("INSERT OR REPLACE INTO index_meta VALUES ('tree', ?)").run(treeHash)
      this.db.exec('COMMIT')
      this.treeHash = treeHash
      this.revision++
      this.lastRefresh = this.dirty ? -Infinity : Date.now()
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    return { read: changed.length, removed: removed.length }
  }

  /** references.bib가 바뀌었으면 키 표를 다시 채운다 (bib에 없는 키 점검). 노트 파일과 따로 본다 */
  private refreshBib(): void {
    const file = path.join(this.lib, 'references.bib')
    let stamp = 'none'
    try { const st = fs.statSync(file); stamp = `${st.mtimeMs}:${st.size}` } catch { /* bib 없음 */ }
    if (stamp === this.bibStamp) return
    let keys: string[] = []
    if (stamp !== 'none') try { keys = parseBib(fs.readFileSync(file, 'utf8')).map((e) => e.key) } catch { /* 못 읽으면 다음에 */ return }
    this.db.exec('DELETE FROM bib_keys')
    const ins = this.db.prepare('INSERT OR IGNORE INTO bib_keys VALUES (?)')
    for (const k of keys) ins.run(k)
    this.bibStamp = stamp
    this.revision++
  }

  /**
   * 본문 찾기 (에이전트 입구 search_library): 모든 낱말이 이름·다른 이름·본문 어딘가에 있는 노트와,
   * 낱말이 있는 줄마다 그 줄이 속한 절 제목. 노트 전체를 읽지 않고 필요한 절로 가게 한다.
   */
  /** hits의 line은 머리말을 뺀 본문의 줄 번호 (read_concept의 body와 같은 기준) */
  searchBody(query: string, opts: { limit?: number; hitsPerNote?: number } = {}): { id: string; title: string; hits: { line: number; heading: string; text: string }[] }[] {
    this.refresh()
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 100))
    const per = Math.max(1, Math.min(opts.hitsPerNote ?? 3, 20))
    // 세 글자 이상인 낱말은 전문 색인으로 후보를 줄이고, 모든 낱말은 아래에서 글자로 확인한다
    const long = words.filter((w) => [...w].length >= 3)
    const rows = (long.length
      ? this.db.prepare('SELECT n.id, n.title, n.aliases, fts.body FROM fts JOIN notes n ON n.rowid = fts.rowid WHERE fts MATCH ? ORDER BY n.title COLLATE NOCASE, n.id')
        .all(long.map((w) => `"${w.replace(/"/g, '""')}"`).join(' '))
      : this.db.prepare('SELECT n.id, n.title, n.aliases, fts.body FROM fts JOIN notes n ON n.rowid = fts.rowid ORDER BY n.title COLLATE NOCASE, n.id').all()) as { id: string; title: string; aliases: string; body: string }[]
    const out: { id: string; title: string; hits: { line: number; heading: string; text: string }[] }[] = []
    for (const r of rows) {
      const lower = `${r.id} ${r.title} ${r.aliases} ${r.body}`.toLowerCase()
      if (!words.every((w) => lower.includes(w))) continue
      const hits: { line: number; heading: string; text: string }[] = []
      let heading = ''
      let fence = false
      const lines = r.body.split('\n')
      for (let i = 0; i < lines.length && hits.length < per; i++) {
        const l = lines[i]!
        if (/^\s*```/.test(l)) fence = !fence
        const h = !fence && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(l)
        if (h) heading = h[1]!
        const ll = l.toLowerCase()
        if (words.some((w) => ll.includes(w))) hits.push({ line: i + 1, heading, text: l.trim().slice(0, 200) })
      }
      out.push({ id: r.id, title: r.title, hits })
      if (out.length >= limit) break
    }
    return out
  }

  /** 큰 JSON 메타자료는 목록 SQL과 분리하고, 꺼낼 때도 한 번에 200개만 파싱한다. */
  async details(): Promise<{ notes: LibraryNote[]; markdown: Map<string, Parsed>; revision: number }> {
    await this.ready()
    const revision = this.revision
    const notes: LibraryNote[] = []
    const markdown = new Map<string, Parsed>()
    const read = this.db.prepare('SELECT id, library, knowledge FROM note_details WHERE id > ? ORDER BY id LIMIT 200')
    let after = ''
    while (true) {
      const rows = read.all(after) as { id: string; library: string; knowledge: string }[]
      for (const r of rows) { notes.push(JSON.parse(r.library) as LibraryNote); markdown.set(r.id, JSON.parse(r.knowledge) as Parsed) }
      if (rows.length < 200) break
      after = rows[rows.length - 1]!.id
      await setImmediate()
      // 갱신이나 설정 변경이 사이에 들어온 경우 같은 버전 전체를 다시 얻는다.
      await this.pending
      if (revision !== this.revision) return this.details()
    }
    return { notes, markdown, revision }
  }

  private where(qr: ListQuery, withSubject: boolean): { sql: string; args: (string | number)[] } {
    const conds: string[] = []
    const args: (string | number)[] = []
    const q = (qr.q ?? '').trim()
    if (q) {
      const key = topicKey(q)
      // 이름·다른 이름은 key로 (악센트·띄어쓰기 무시), 본문·분류는 전문 검색 (세 글자 이상)
      const parts = ['n.id IN (SELECT id FROM names WHERE key LIKE ?)']
      args.push(`%${key || q.toLowerCase()}%`)
      if ([...q].length >= 3) { parts.push('n.id IN (SELECT id FROM fts WHERE fts MATCH ?)'); args.push(`"${q.replace(/"/g, '""')}"`) }
      conds.push(`(${parts.join(' OR ')})`)
    }
    const tree = readSubjects(this.lib)
    if (tree.enabled && withSubject && (qr.subjectPrefix !== undefined || qr.subject !== undefined)) {
      const prefix = qr.subjectPrefix ?? qr.subject!
      if (prefix === '') conds.push('NOT EXISTS (SELECT 1 FROM note_subjects s WHERE s.note = n.id)')
      else {
        conds.push(`EXISTS (SELECT 1 FROM note_subjects s WHERE s.note = n.id AND (s.subject = ? ${qr.subjectPrefix !== undefined ? "OR (s.subject >= ? AND s.subject < ?)" : ''}))`)
        args.push(prefix)
        if (qr.subjectPrefix !== undefined) args.push(`${prefix}/`, `${prefix}0`)
      }
    } else if (!tree.enabled) {
      if (withSubject && qr.subject !== undefined) { conds.push('n.subject = ?'); args.push(qr.subject) }
      if (withSubject && qr.subjectPrefix !== undefined) {
        conds.push("(n.subject = ? OR (? <> '' AND substr(n.subject, 1, length(?) + 3) = ? || ' › '))")
        args.push(qr.subjectPrefix, qr.subjectPrefix, qr.subjectPrefix, qr.subjectPrefix)
      }
    }
    if (qr.issue) conds.push(`(${ISSUE_SQL[qr.issue]})`)
    if (qr.ids !== undefined) { conds.push('n.id IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(qr.ids)) }
    const filter = qr.filter ?? 'all'
    if (filter === 'unfinished') conds.push('n.is_unfinished = 1')
    else if (filter === 'checked') conds.push("n.checked = 'ok'")
    else if (!qr.showEmpty && !q) conds.push('n.is_empty = 0')
    return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args }
  }

  /** 목록 한 쪽: 찾기·분류·거르기, offset부터 limit개 */
  list(qr: ListQuery): { total: number; items: ConceptTableRow[] } {
    this.refresh()
    const { sql, args } = this.where(qr, true)
    const total = (this.db.prepare(`SELECT count(*) AS n FROM notes n ${sql}`).get(...args) as { n: number }).n
    const limit = Math.max(1, Math.min(qr.limit ?? 50, 500))
    const offset = Math.max(0, qr.offset ?? 0)
    // 프로젝트 수 정렬도 LIMIT 전에 SQL에서 한다. 원본 노트나 영구 색인은 쓰지 않는다.
    this.db.exec('DELETE FROM note_projects')
    const put = this.db.prepare('INSERT INTO note_projects VALUES (?, ?, ?)')
    for (const [id, projects] of Object.entries(qr.projects ?? {})) put.run(id, JSON.stringify(projects), projects.length)
    const issueSelect = Object.entries(ISSUE_SQL).map(([kind, condition]) => `CASE WHEN ${condition} THEN 1 ELSE 0 END AS issue_${kind}`).join(', ')
    const issueCount = Object.values(ISSUE_SQL).map((condition) => `(CASE WHEN ${condition} THEN 1 ELSE 0 END)`).join(' + ')
    const fields = { title: 'n.title COLLATE NOCASE', subject: 'n.subject COLLATE NOCASE', sources: 'n.sources', links: 'links_out',
      issues: 'issue_count', mtime: 'n.mtime', projects: 'project_count', aliases: 'n.aliases COLLATE NOCASE', checked: 'n.checked' }
    const empty = { title: "n.title = ''", subject: "n.subject = ''", sources: 'n.sources = 0', links: 'links_out = 0',
      issues: 'issue_count = 0', mtime: 'n.mtime = 0', projects: 'project_count = 0', aliases: "n.aliases = '[]'", checked: "n.checked = 'none'" }
    const q = (qr.q ?? '').trim()
    const sort = qr.sort ?? 'title'
    const dir = qr.dir === 'desc' ? 'DESC' : 'ASC'
    // 옛 찾기 호출은 이름 일치 우선 순서를 유지한다.
    const ranked = q && !qr.sort
    const order = ranked ? `(SELECT min(CASE WHEN key = ? THEN 0 WHEN key LIKE ? THEN 1 ELSE 2 END) FROM names WHERE names.id = n.id), n.title COLLATE NOCASE, n.id`
      : `(${empty[sort]}) ASC, ${fields[sort]} ${dir}, n.title COLLATE NOCASE, n.id`
    const oargs = ranked ? [topicKey(q), `${topicKey(q)}%`] : []
    const rows = this.db.prepare(`SELECT n.*, (SELECT count(*) FROM links WHERE src = n.id) AS links_out,
      ${issueSelect}, (${issueCount}) AS issue_count, coalesce(p.count, 0) AS project_count, coalesce(p.projects, '[]') AS projects
      FROM notes n LEFT JOIN note_projects p ON p.id = n.id ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, ...oargs, limit, offset) as Record<string, unknown>[]
    return { total, items: rows.map((r) => ({ ...rowOf(r), sources: r.sources as number, links: r.links_out as number,
      issues: (Object.keys(ISSUE_SQL) as ConceptIssue[]).filter((kind) => r[`issue_${kind}`] === 1),
      mtime: r.mtime as number, projects: JSON.parse(r.projects as string) as string[] })) }
  }

  /** 분류마다 노트 수 (같은 찾기·거르기로). 분류 나무를 접어 둔 채 숫자만 보일 때 */
  subjects(qr: ListQuery): { subject: string; count: number; name?: string; parent?: string | null; model?: 'ids' }[] {
    this.refresh()
    const { sql, args } = this.where(qr, false)
    const tree = readSubjects(this.lib)
    if (tree.enabled) {
      const conjunction = sql ? `${sql} AND` : 'WHERE'
      const count = this.db.prepare(`SELECT count(*) AS count FROM notes n ${conjunction}
        EXISTS (SELECT 1 FROM note_subjects s WHERE s.note = n.id AND (s.subject = ? OR (s.subject >= ? AND s.subject < ?)))`)
      const rows = tree.items.map((s) => ({ subject: s.id, name: s.name, parent: s.parent, model: 'ids' as const,
        count: (count.get(...args, s.id, `${s.id}/`, `${s.id}0`) as { count: number }).count }))
      const unclassified = this.db.prepare(`SELECT count(*) AS count FROM notes n ${conjunction} NOT EXISTS (SELECT 1 FROM note_subjects s WHERE s.note = n.id)`).get(...args) as { count: number }
      return [...rows, { subject: '', name: '분류 없음', parent: null, model: 'ids', count: unclassified.count }]
    }
    return this.db.prepare(`SELECT n.subject AS subject, count(*) AS count FROM notes n ${sql} GROUP BY n.subject ORDER BY n.subject = '', n.subject COLLATE NOCASE`).all(...args) as { subject: string; count: number }[]
  }

  /** Exact assignments, not descendant counts, for explainable frequent-subject suggestions. */
  subjectFrequencies(): Map<string, number> {
    this.refresh()
    const rows = this.db.prepare('SELECT subject, count(*) AS count FROM note_subjects GROUP BY subject').all() as { subject: string; count: number }[]
    return new Map(rows.map((r) => [r.subject, r.count]))
  }

  /** 이 노트가 가리키는 노트, 이 노트를 가리키는 노트, 노트가 없는 링크 이름 */
  links(id: string): { out: ConceptRow[]; back: ConceptRow[]; missing: string[] } {
    this.refresh()
    const resolve = 'SELECT id FROM names WHERE names.key = l.key ORDER BY rank LIMIT 1'
    const out = this.db.prepare(`SELECT DISTINCT n.* FROM links l JOIN notes n ON n.id = (${resolve}) WHERE l.src = ? AND n.id <> ? ORDER BY n.title COLLATE NOCASE`).all(id, id) as Record<string, unknown>[]
    const missing = (this.db.prepare(`SELECT l.name FROM links l WHERE l.src = ? AND NOT EXISTS (SELECT 1 FROM names WHERE names.key = l.key) ORDER BY l.name`).all(id) as { name: string }[]).map((r) => r.name)
    const back = this.db.prepare(`SELECT DISTINCT n.* FROM links l JOIN notes n ON n.id = l.src WHERE l.key IN (SELECT key FROM names WHERE id = ?) AND (${resolve}) = ? AND l.src <> ? ORDER BY n.title COLLATE NOCASE`).all(id, id, id) as Record<string, unknown>[]
    return { out: out.map(rowOf), back: back.map(rowOf), missing }
  }

  /** [[이름]]이 가리키는 노트 (제목 > 다른 이름 > 파일 이름 순) */
  resolve(name: string): ConceptRow | null {
    const key = topicKey(name.replace(/#.*$/, '').split('/').pop()!.replace(/\.md$/, ''))
    if (!key) return null
    this.refresh()
    const r = this.db.prepare('SELECT n.* FROM names m JOIN notes n ON n.id = m.id WHERE m.key = ? ORDER BY m.rank LIMIT 1').get(key) as Record<string, unknown> | undefined
    return r ? rowOf(r) : null
  }

  /** 노트 수 */
  count(): number {
    this.refresh()
    return (this.db.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n
  }

  /** 최근 고친 노트 limit개 (고친 때가 같으면 제목 순) */
  recent(limit = 8): (ConceptRow & { mtime: number })[] {
    this.refresh()
    const rows = this.db.prepare('SELECT * FROM notes ORDER BY mtime DESC, title COLLATE NOCASE LIMIT ?').all(Math.max(1, Math.min(limit, 100))) as Record<string, unknown>[]
    return rows.map((r) => ({ ...rowOf(r), mtime: r.mtime as number }))
  }

  /** 이 노트들이 [[링크]]·related로 가리키는 노트 (한 단계, 자기 자신과 이미 든 것은 뺌) */
  linkedFrom(ids: string[]): string[] {
    if (!ids.length) return []
    this.refresh()
    const qs = ids.map(() => '?').join(',')
    const resolve = 'SELECT id FROM names WHERE names.key = l.key ORDER BY rank LIMIT 1'
    const rows = this.db.prepare(`SELECT DISTINCT (${resolve}) AS id FROM links l WHERE l.src IN (${qs})`).all(...ids) as { id: string | null }[]
    const have = new Set(ids)
    return rows.map((r) => r.id).filter((id): id is string => !!id && !have.has(id)).sort()
  }

  /** id마다 확인 상태 (없는 id는 뺀다) */
  checkStates(ids: string[]): Map<string, ConceptRow['checked']> {
    if (!ids.length) return new Map()
    this.refresh()
    const out = new Map<string, ConceptRow['checked']>()
    // SQLite 인자 수 한도를 넘지 않게 나눠서
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500)
      const rows = this.db.prepare(`SELECT id, checked FROM notes WHERE id IN (${part.map(() => '?').join(',')})`).all(...part) as { id: string; checked: ConceptRow['checked'] }[]
      for (const r of rows) out.set(r.id, r.checked)
    }
    return out
  }

  /**
   * 지식 점검의 이상 종류마다 노트 id (제목 순): 비어 있음 · 빈 절 · TODO · 끊긴 링크 · 출처 없음(빈 노트 제외) · bib에 없는 키.
   * 빈 절 · TODO는 미완성 이유 글(unfinishedReasons)에서 읽는다.
   */
  issues(): Record<ConceptIssue, string[]> {
    this.refresh()
    const ids = (sql: string) => (this.db.prepare(`SELECT n.id FROM notes n WHERE ${sql} ORDER BY n.title COLLATE NOCASE, n.id`).all() as { id: string }[]).map((r) => r.id)
    return Object.fromEntries(Object.entries(ISSUE_SQL).map(([kind, sql]) => [kind, ids(sql)])) as Record<ConceptIssue, string[]>
  }

  /** 여러 id(또는 주제 key)의 목록 줄 (최근 연 노트, 지금 연 노트) */
  rows(ids: string[]): ConceptRow[] {
    if (!ids.length) return []
    this.refresh()
    // id 또는 주제 key (지도·주소에서 온 것)
    const qs = ids.map(() => '?').join(',')
    const rows = this.db.prepare(`SELECT * FROM notes WHERE id IN (${qs}) OR key IN (${qs})`).all(...ids, ...ids) as Record<string, unknown>[]
    const by = new Map(rows.flatMap((r) => [[r.key as string, rowOf(r)], [r.id as string, rowOf(r)]] as [string, ConceptRow][]))
    return ids.map((id) => by.get(id)).filter((r): r is ConceptRow => !!r)
  }
}

function rowOf(r: Record<string, unknown>): ConceptRow {
  return {
    id: r.id as string,
    key: r.key as string,
    title: r.title as string,
    subject: r.subject as string,
    subjects: JSON.parse((r.subjects as string) || '[]') as string[],
    aliases: JSON.parse(r.aliases as string) as string[],
    unfinished: JSON.parse(r.unfinished as string) as string[],
    checked: r.checked as ConceptRow['checked'],
    locked: r.locked === 1,
  }
}

/** 서버 하나가 라이브러리 경로마다 색인 하나를 연다 (라이브러리를 바꾸면 새로). 파일을 못 열면 메모리에 */
export function conceptIndexOpener(configDir: string): { get(lib: string | undefined): ConceptIndex | null; close(): Promise<void> } {
  const indexes = new Map<string, ConceptIndex>()
  return {
    get(lib) {
      if (!lib) return null
      let index = indexes.get(lib)
      if (!index) {
        try { index = new ConceptIndex(lib, ConceptIndex.fileFor(configDir, lib)) } catch { index = new ConceptIndex(lib) }
        indexes.set(lib, index)
      }
      return index
    },
    async close() { await Promise.all([...indexes.values()].map((index) => index.close())); indexes.clear() },
  }
}
