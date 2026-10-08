import fs from 'node:fs'
import path from 'node:path'
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

export function serveStatic(app: FastifyInstance, root: string): void {
  const base = fs.realpathSync(root)
  const index = path.join(base, 'index.html')
  app.setNotFoundHandler((req, reply) => {
    const url = decodeURIComponent((req.url.split('?')[0] ?? '/'))
    if (req.method !== 'GET' || url.startsWith('/api/')) return reply.status(404).send({ error: t('없는 주소', 'Not found') })
    const file = path.resolve(base, `.${url}`)
    const inside = file === base || file.startsWith(`${base}${path.sep}`)
    if (inside && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
      // 빌드 결과 파일 이름에 해시가 붙어 있어 오래 저장해도 된다. index.html만 매번 새로 읽게 한다.
      const cache = url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      return reply.type(type).header('cache-control', cache).send(fs.createReadStream(file))
    }
    // 화면 안의 주소(#/r/…)는 모두 index.html이 처리한다
    return reply.type(TYPES['.html']!).header('cache-control', 'no-cache').send(fs.createReadStream(index))
  })
}
