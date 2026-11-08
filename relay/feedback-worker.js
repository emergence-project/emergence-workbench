// Emergence Workbench feedback relay (Cloudflare Worker).
// Apps without GitHub access POST their feedback here; the worker commits it to the maintainer's private
// repository under <DIR>/from/<sender>/ so the maintainer's app shows it on the feedback screen.
// The GitHub token lives only here (a Worker secret), never in the app.
//
// Settings (Worker › Settings › Variables and Secrets):
//   GITHUB_TOKEN  secret: fine-grained token, one repository, Contents: Read and write
//   REPO          owner/name of the private repository, e.g. someone/research-workspace-backup
//   BRANCH        optional, default main
//   DIR           optional, default feedback
//   INVITE_CODE   optional: when set, apps must send the same code (header x-feedback-code)
//
// Folder and picture names must match the app's importer (apps/server/src/feedbackBundle.ts);
// apps/server/src/feedbackRelay.test.ts checks that both produce the same files.

const FORMAT = 'emergence-workbench-feedback'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const PICTURE = /^[\w.-]+\.(png|jpe?g)$/
const PICTURE_LINE = /^- 그림: pictures\/([\w.-]+\.(?:png|jpe?g))\s*$/gm
const LIMITS = { body: 25 * 1024 * 1024, days: 60, dayText: 300 * 1024, pictures: 40, picture: 4 * 1024 * 1024 }

export function senderFolder(from) {
  const s = String(from).normalize('NFC').replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return s || '보낸 사람'
}
export const folderFor = (from, id) => `${senderFolder(from)}${id && /^[a-z0-9]{6,32}$/.test(id) ? `-${id.slice(0, 6)}` : ''}`
export async function picturePrefix(folder) {
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(folder))
  return `from-${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 8)}-`
}
export const rewritePictures = (text, prefix) => text.replace(PICTURE_LINE, (_, name) => `- 그림: pictures/${prefix}${name}`)
const base64Size = (s) => Math.floor(s.length * 3 / 4)

/** Bundle → files to commit ({ path relative to DIR, content (utf8) or base64 }). Throws a message for bad input. */
export async function unpack(bundle) {
  if (!bundle || typeof bundle !== 'object' || bundle.format !== FORMAT || !bundle.days || typeof bundle.days !== 'object') throw new Error('not a feedback bundle')
  const folder = folderFor(typeof bundle.from === 'string' ? bundle.from : '', typeof bundle.id === 'string' ? bundle.id : undefined)
  const prefix = await picturePrefix(folder)
  const days = Object.entries(bundle.days).filter(([k, v]) => DAY.test(k) && typeof v === 'string')
  const pictures = Object.entries(bundle.pictures && typeof bundle.pictures === 'object' ? bundle.pictures : {}).filter(([k, v]) => PICTURE.test(k) && typeof v === 'string')
  if (days.length > LIMITS.days || pictures.length > LIMITS.pictures) throw new Error('too many files in one send')
  const files = []
  for (const [day, text] of days) {
    if (text.length > LIMITS.dayText) throw new Error(`day ${day} is too long`)
    files.push({ path: `from/${folder}/${day}.md`, utf8: rewritePictures(text, prefix) })
  }
  for (const [name, data] of pictures) {
    if (!data || base64Size(data) > LIMITS.picture) continue
    files.push({ path: `pictures/${prefix}${name}`, base64: data })
  }
  return { folder, files, count: days.reduce((n, [, text]) => n + (text.match(/^## /gm)?.length ?? 0), 0) }
}

async function gh(env, method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'emergence-workbench-feedback-relay', 'x-github-api-version': '2022-11-28', ...(body && { 'content-type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, data }
}

/** One commit with all files on top of the branch. Retries when someone else pushed in between. */
export async function commit(env, files, message) {
  const branch = env.BRANCH || 'main'
  const dir = (env.DIR || 'feedback').replace(/^\/+|\/+$/g, '')
  const tree = []
  for (const f of files) {
    const blob = await gh(env, 'POST', '/git/blobs', f.base64 !== undefined ? { content: f.base64, encoding: 'base64' } : { content: f.utf8, encoding: 'utf-8' })
    if (!blob.ok) throw new Error(`blob ${blob.status}`)
    tree.push({ path: `${dir}/${f.path}`, mode: '100644', type: 'blob', sha: blob.data.sha })
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh(env, 'GET', `/git/ref/heads/${branch}`)
    if (!ref.ok) throw new Error(`ref ${ref.status}`)
    const head = ref.data.object.sha
    const parent = await gh(env, 'GET', `/git/commits/${head}`)
    const t = await gh(env, 'POST', '/git/trees', { base_tree: parent.data.tree.sha, tree })
    if (!t.ok) throw new Error(`tree ${t.status}`)
    if (t.data.sha === parent.data.tree.sha) return null // nothing changed
    const c = await gh(env, 'POST', '/git/commits', { message, tree: t.data.sha, parents: [head] })
    if (!c.ok) throw new Error(`commit ${c.status}`)
    const moved = await gh(env, 'PATCH', `/git/refs/heads/${branch}`, { sha: c.data.sha, force: false })
    if (moved.ok) return c.data.sha.slice(0, 7)
    if (moved.status !== 422) throw new Error(`update ${moved.status}`)
  }
  throw new Error('branch kept moving, try again')
}

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/') return reply(200, { ok: true, invite: !!env.INVITE_CODE })
    if (request.method !== 'POST' || url.pathname !== '/feedback') return reply(404, { error: 'not found' })
    if (!env.GITHUB_TOKEN || !env.REPO) return reply(503, { error: 'relay is not set up (GITHUB_TOKEN, REPO)' })
    if (env.INVITE_CODE && request.headers.get('x-feedback-code') !== env.INVITE_CODE) return reply(403, { error: 'wrong invite code' })
    if (Number(request.headers.get('content-length') ?? 0) > LIMITS.body) return reply(413, { error: 'too large' })
    let bundle
    try { bundle = await request.json() } catch { return reply(400, { error: 'not JSON' }) }
    let unpacked
    try { unpacked = await unpack(bundle) } catch (e) { return reply(400, { error: e.message }) }
    if (!unpacked.files.length) return reply(200, { from: unpacked.folder, count: 0, commit: null })
    try {
      const sha = await commit(env, unpacked.files, `Add app feedback from ${unpacked.folder}`)
      return reply(200, { from: unpacked.folder, count: unpacked.count, commit: sha })
    } catch (e) { return reply(502, { error: `GitHub: ${e.message}` }) }
  },
}
