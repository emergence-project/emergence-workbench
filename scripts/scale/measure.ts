// Run: pnpm --filter @rw/server exec node --import tsx ../../scripts/scale/measure.ts [10000]
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { buildApp } from '../../apps/server/src/app.js'
// @ts-ignore standalone mjs fixture generator
import { fakeConcepts, sandboxPath, root } from './fake-concepts.mjs'

const endpoints = ['/api/knowledge', '/api/library', '/api/figures', '/api/papers/brief', '/api/figures/brief', '/api/concepts/list?limit=50', '/api/concepts/brief']
const child = process.argv[2] === '--run'
const count = child ? 0 : Number(process.argv[2] ?? 10000)
const base = sandboxPath(child ? process.argv[3]! : path.join(root, '.sandbox', `scale-${Date.now()}`))
fs.mkdirSync(base, { recursive: true })
let app: ReturnType<typeof buildApp> | undefined
try {
  if (!child) {
    const lib = fakeConcepts(path.join(base, 'library'), count)
    fs.mkdirSync(path.join(lib, 'figures'))
    fs.writeFileSync(path.join(lib, 'figures/scale-diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    fs.writeFileSync(path.join(lib, 'references.bib'), '@article{scale-paper, title={Scale paper}, author={Example, Author}, year={2026}}\n')
    const repo = path.join(base, 'sample-research')
    fs.cpSync(path.join(root, 'fixtures/sample-research'), repo, { recursive: true, filter: (src: string) => !src.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    const config = path.join(base, 'config')
    fs.mkdirSync(config)
    fs.writeFileSync(path.join(config, 'config.yaml'), `library: ${lib}\nstudy: ${base}/study\nreviews: ${base}/reviews\nresearches: []\n`)
    const rows = endpoints.map((url) => JSON.parse(execFileSync(process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url), '--run', base, url], { encoding: 'utf8' })))
    console.log(JSON.stringify({ count, node: process.version, rows }, null, 2))
  } else {
    const config = path.join(base, 'config')
    const repo = path.join(base, 'sample-research')
    const url = process.argv[4]!
    fs.rmSync(path.join(config, 'index'), { recursive: true, force: true })
    app = buildApp({ configDir: config, sandbox: true })
    if (!app.registry.ids().length) await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
    await app.ready()
    let maxLag = 0
    let last = performance.now()
    const timer = setInterval(() => { const now = performance.now(); maxLag = Math.max(maxLag, now - last - 10); last = now }, 10)
    const times = []
    let bytes = 0
    for (let i = 0; i < 3; i++) {
      // Third call crosses REFRESH_MS, so the fallback mtime scan is measured too.
      if (i === 2) await new Promise((r) => setTimeout(r, 1100))
      const t = performance.now()
      const res = await app.inject(url)
      times.push(+(performance.now() - t).toFixed(1))
      bytes = Buffer.byteLength(res.body)
      if (res.statusCode !== 200) throw new Error(`${url}: ${res.statusCode} ${res.body}`)
      await new Promise((r) => setTimeout(r, 15))
    }
    clearInterval(timer)
    console.log(JSON.stringify({ endpoint: url, first_ms: times[0], warm_ms: times[1], refresh_ms: times[2], bytes, max_event_loop_lag_ms: +maxLag.toFixed(1) }))
    await app.close(); app = undefined
  }
} finally {
  await app?.close()
  if (!child) fs.rmSync(sandboxPath(base), { recursive: true, force: true })
}
