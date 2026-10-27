// 고침 검토 화면(review)을 찍으려고 예제 연구노트에 에이전트 고침을 넣었다가, 찍은 뒤 되돌린다 (다른 화면 그림이 바뀌지 않게)
import fs from 'node:fs'
import path from 'node:path'
const FILE = 'workbench/notes/kempe-recoloring/note.md'

async function call(base, url, init) {
  const res = await fetch(base + url, init)
  return { status: res.status, body: await res.json().catch(() => null) }
}
const post = (base, url, payload) => call(base, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })

/** 본문 문단 하나에 한 문장을 덧붙이고, 그 뒤에 새 문단 하나를 넣고, 다른 절 문단에 낱말 하나를 더한다. 확인된 노트(해결)가 있으면 쓰기 시도 하나 */
export async function seedAgentEdits(base, rid, lang) {
  const part = await call(base, `api/researches/${encodeURIComponent(rid)}/manuscript/part?file=${encodeURIComponent(FILE)}`)
  if (part.status !== 200) return `읽지 못함 ${part.status}`
  const { content, hash } = part.body
  const para = content.split(/\n\s*\n/).map((p) => p.trim()).find((p) => /^[^#$!<*|\-\d]/.test(p) && p.length > 20)
  if (!para) return '고칠 문단 없음'
  // 그린 글 보기(수식 · 굵은 글씨)가 그림에 보이게
  const add = lang === 'en' ? ' Each **component** $H_{ab}$ can be swapped on its own.' : ' 각 **성분** $H_{ab}$는 따로 바꿀 수 있다.'
  const extra = lang === 'en' ? 'Whether four colors suffice is not checked yet.' : '네 색으로 줄일 수 있는지는 아직 확인하지 않았다.'
  // 다른 절의 문단에서는 낱말 하나만 더한다 (절 헤더가 둘, 바뀐 낱말만 칠한 모습이 보이게)
  const [word, worded] = lang === 'en' ? ['on a triangulation', 'on a planar triangulation'] : ['삼각분할에서', '평면 삼각분할에서']
  // 첫 고침에는 이유 한 줄 (10/14: 후 칸 아래에 옅게 보인다)
  const reason = lang === 'en' ? 'The swap step was too terse to follow.' : '바꾸는 단계가 짧아 따라가기 어려워 풀어 썼습니다.'
  const edits = [{ old: para, new: `${para}${add}\n\n${extra}`, reason }, ...(content.split(word).length === 2 ? [{ old: word, new: worded }] : [])]
  const w = await post(base, 'api/agent-edits/write', { target: { kind: 'note', rid, file: FILE }, baseHash: hash, edits, agent: 'claude-code', summary: lang === 'en' ? 'Clarify the swap and note an open question' : '바꾸기를 풀어 쓰고 남은 질문을 적음' })
  if (w.status !== 200) return `쓰지 못함 ${w.status}`
  const notes = await call(base, `api/researches/${encodeURIComponent(rid)}/notes`)
  const solved = (notes.body?.notes ?? []).find((n) => n.status === 'solved' && n.file !== FILE)
  if (solved) {
    const r = await call(base, `api/researches/${encodeURIComponent(rid)}/manuscript/part?file=${encodeURIComponent(solved.file)}`)
    const text = r.body?.content ?? ''
    const old = text.split('\n').find((l) => l.trim().length > 8 && !/^[%#-]/.test(l.trim()))
    if (old) await post(base, 'api/agent-edits/write', { target: { kind: 'note', rid, file: solved.file }, baseHash: r.body.hash, edits: [{ old, new: `${old} ` }], agent: 'claude-code', summary: lang === 'en' ? 'Fix a typo in the proof' : '증명의 오타 고치기' })
  }
  return null
}

/** 바뀐 곳에서 묻기 (10/14): 첫 바뀐 곳에 질문 하나와 에이전트의 답을 넣는다. 답은 기록 파일에 직접 덧붙인다 (앱이 Claude를 부르지 않게) */
let talkFile = null
export async function seedEditTalk(base, rid, lang) {
  const key = `note:${rid}:${FILE}`
  const v = (await call(base, `api/agent-edits/review?key=${encodeURIComponent(key)}`)).body?.review
  if (!v?.record) return '고침 검토가 없음'
  const h = v.hunks[0]
  const repo = ((await call(base, 'api/researches')).body?.researches ?? []).find((r) => r.id === rid)?.path
  if (!repo) return '연구 폴더를 찾지 못함'
  const file = path.join(repo, 'workbench/comments', `${v.record.target}.md`)
  talkFile = { file, before: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null }
  const q = lang === 'en' ? 'Why mention $H_{ab}$ here? It is not defined until the next section.' : '$H_{ab}$를 여기서 왜 말해? 다음 절에서야 정의되는데.'
  const r = await post(base, `api/researches/${encodeURIComponent(rid)}/comments/${encodeURIComponent(v.record.target)}`, { kind: '질문', title: v.record.title, source: v.record.source, quote: h.current, edit: '질문', editBase: h.base.slice(0, 200), text: q })
  if (r.status !== 200) return `묻지 못함 ${r.status}`
  const a = lang === 'en' ? 'Each component of the two-colored subgraph is swapped independently; naming it $H_{ab}$ now lets the next section refer back to it. I can move the definition up if you prefer.' : '두 색 부분그래프의 성분마다 따로 바꾼다는 점을 여기서 이름 붙여 두면 다음 절이 그대로 가리킬 수 있어서입니다. 정의를 앞으로 옮기는 편이 낫다면 수정으로 알려 주세요.'
  fs.appendFileSync(file, `\n### 답 · claude-code · 2026-10-14 13:40\n\n${a}\n\n- 상태: 답함\n`)
  return null
}

/** 넣은 고침을 모두 되돌리고 쓰기 시도를 지운다 */
export async function clearAgentEdits(base) {
  if (talkFile) {
    if (talkFile.before === null) fs.rmSync(talkFile.file, { force: true })
    else fs.writeFileSync(talkFile.file, talkFile.before)
    talkFile = null
  }
  const list = await call(base, 'api/agent-edits')
  for (const a of list.body?.attempts ?? []) await call(base, `api/agent-edits/attempts?key=${encodeURIComponent(a.key)}`, { method: 'DELETE' })
  for (const r of list.body?.reviews ?? []) {
    for (let i = 0; i < 20; i++) {
      const v = (await call(base, `api/agent-edits/review?key=${encodeURIComponent(r.key)}`)).body?.review
      if (!v) break
      await post(base, 'api/agent-edits/review', { key: r.key, hash: v.hash, hunk: v.hunks[0].id, action: 'revert' })
    }
  }
}
