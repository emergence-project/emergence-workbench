// 고침 검토 화면(review)을 찍으려고 예제 연구노트에 에이전트 고침을 넣었다가, 찍은 뒤 되돌린다 (다른 화면 그림이 바뀌지 않게)
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
  const edits = [{ old: para, new: `${para}${add}\n\n${extra}` }, ...(content.split(word).length === 2 ? [{ old: word, new: worded }] : [])]
  const w = await post(base, 'api/agent-edits/write', { target: { kind: 'note', rid, file: FILE }, baseHash: hash, edits, agent: 'claude-code', summary: lang === 'en' ? 'Clarify the swap and note an open question' : '바꾸기를 풀어 쓰고 남은 질문을 적음' })
  if (w.status !== 200) return `쓰지 못함 ${w.status}`
  const notes = await call(base, `api/researches/${encodeURIComponent(rid)}/notes`)
  const solved = (notes.body?.notes ?? []).find((n) => n.status === 'solved' && n.file !== FILE)
  if (solved) {
    const block = /^workbench\/blocks\/([^/]+)\.(md|tex)$/.exec(solved.file)
    const r = await call(base, block ? `api/researches/${encodeURIComponent(rid)}/blocks/${encodeURIComponent(block[1])}` : `api/researches/${encodeURIComponent(rid)}/manuscript/part?file=${encodeURIComponent(solved.file)}`)
    const text = r.body?.content ?? ''
    const old = text.split('\n').find((l) => l.trim().length > 8 && !/^[%#-]/.test(l.trim()))
    if (old) await post(base, 'api/agent-edits/write', { target: { kind: 'note', rid, file: solved.file }, baseHash: r.body.hash, edits: [{ old, new: `${old} ` }], agent: 'claude-code', summary: lang === 'en' ? 'Fix a typo in the proof' : '증명의 오타 고치기' })
  }
  return null
}

/** 넣은 고침을 모두 되돌리고 쓰기 시도를 지운다 */
export async function clearAgentEdits(base) {
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
