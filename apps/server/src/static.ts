import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { t } from './i18n.js'

/**
 * 실사용 모드: 미리 빌드한 화면(apps/web/dist)을 이 서버가 함께 내보낸다.
 * 화면과 API가 한 주소·한 프로세스라, 백그라운드 서비스 하나로 앱 전체가 돈다.
 */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

/** 줄여 보낼 글 파일. 그림 · 글꼴은 이미 줄어 있어 그대로 보낸다. */
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.map', '.svg', '.txt'])
/** 이보다 작은 파일은 줄여도 얻는 것이 없다 */
const GZIP_MIN = 1024

const gzip = promisify(zlib.gzip)
/** 줄인 결과를 파일마다 한 번만 만들어 둔다(파일이 바뀌면 다시). 스트림으로 흘려 줄이면 읽기 오류나 끊긴 요청에서 응답이 끝나지 않을 수 있다 */
const zipped = new Map<string, { key: string; body: Promise<Buffer> }>()
const ZIP_KEEP = 80
function gzipped(file: string, stat: fs.Stats): Promise<Buffer> {
  const key = `${stat.mtimeMs}:${stat.size}`
  const hit = zipped.get(file)
  if (hit?.key === key) return hit.body
  if (zipped.size >= ZIP_KEEP) zipped.clear() // 업데이트로 옛 빌드 파일이 쌓이지 않게
  const body = fs.promises.readFile(file).then((raw) => gzip(raw))
  zipped.set(file, { key, body })
  body.catch(() => zipped.delete(file))
  return body
}

export function serveStatic(app: FastifyInstance, root: string): void {
  const base = fs.realpathSync(root)
  const index = path.join(base, 'index.html')
  app.setNotFoundHandler((req, reply) => {
    let url: string
    try { url = decodeURIComponent(req.url.split('?')[0] ?? '/') } catch { return reply.status(404).send({ error: t('없는 주소', 'Not found') }) }
    if (req.method !== 'GET' || url.startsWith('/api/')) return reply.status(404).send({ error: t('없는 주소', 'Not found') })
    const file = path.resolve(base, `.${url}`)
    const inside = file === base || file.startsWith(`${base}${path.sep}`)
    const stat = inside ? fs.statSync(file, { throwIfNoEntry: false }) : undefined
    if (stat?.isFile()) {
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
      // 빌드 결과 파일 이름에 해시가 붙어 있어 오래 저장해도 된다. index.html만 매번 새로 읽게 한다.
      const cache = url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      reply.type(type).header('cache-control', cache)
      // 폰처럼 느린 길로 받을 때 화면 코드(몇 MB)가 3분의 1로 줄어든다. 줄인 결과는 파일마다 한 번 만들어 둔다.
      if (TEXT.has(path.extname(file)) && stat.size >= GZIP_MIN) {
        reply.header('vary', 'accept-encoding')
        if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
          // 읽지 못하면 그 실패 응답(500)은 저장하지 않게 한다 (11/26: 위의 「1년 저장」 머리가 실패 응답에도 붙어 나갔다)
          return gzipped(file, stat).then((body) => reply.header('content-encoding', 'gzip').send(body), (e: unknown) => { void reply.header('cache-control', 'no-store'); throw e })
        }
      }
      return reply.send(fs.createReadStream(file))
    }
    // 화면 안의 주소(#/r/…)는 모두 index.html이 처리한다
    return reply.type(TYPES['.html']!).header('cache-control', 'no-cache').send(fs.createReadStream(index))
  })
}
