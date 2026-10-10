// 구글 계정: 로그인, 달력 일정, 설정 동기화 (서버 google.ts)
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/google'
import { parseBody, replies } from '../contract.js'
import { parseGitHubRepo } from '../clone.js'
import type { Google, SyncedResearch, SyncedSettings } from '../google.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

/** 이 컴퓨터 안에서 온 주소만 로그인 돌아올 곳으로 쓴다 */
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/

/** 저장소의 GitHub 주소 (origin). 없으면 null */
/** 구글에 올릴 원격 주소. https://user:token@host/… 꼴이면 로그인 정보를 뺀다(드라이브에 토큰이 남지 않게) */
export function publicRemote(url: string): string | null {
  return parseGitHubRepo(url)?.url ?? (url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1') || null)
}

function remoteOf(repoPath: string): string | null {
  try {
    const url = execFileSync('git', ['-C', repoPath, 'config', '--get', 'remote.origin.url'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return publicRemote(url)
  } catch { return null }
}

const sameRepo = (a: string | null, b: string | null) => !!a && !!b && (parseGitHubRepo(a)?.url ?? a).toLowerCase() === (parseGitHubRepo(b)?.url ?? b).toLowerCase()

export function registerGoogle(app: FastifyInstance, ctx: RouteContext, google: Google): void {
  const { registry } = ctx

  const snapshot = (): SyncedSettings => ({
    version: 1,
    savedAt: new Date().toISOString(),
    machine: os.hostname(),
    ui: registry.ui,
    engine: registry.engine,
    latexTemplates: registry.latexTemplates,
    latexDefault: registry.latexDefault,
    authors: registry.authors,
    people: registry.people,
    researches: registry.list().map((r) => ({ id: r.id, title: r.title, tags: r.tags, remote: remoteOf(r.path), folder: path.basename(r.path) })),
  })

  /** 구글에 있는 프로젝트 중 이 컴퓨터에 등록된 것과 아닌 것 */
  const compare = (remote: SyncedSettings | null) => {
    const local = registry.list().map((r) => ({ ...r, remote: remoteOf(r.path), folder: path.basename(r.path) }))
    const match = (s: SyncedResearch) => local.find((l) => sameRepo(l.remote, s.remote)) ?? (!s.remote ? local.find((l) => l.folder === s.folder) : undefined)
    const rs = remote?.researches ?? []
    return {
      missing: rs.filter((s) => !match(s)),
      matched: rs.flatMap((s) => { const l = match(s); return l ? [{ remote: s, localId: l.id }] : [] }),
    }
  }

  // 설정이 바뀌면 잠시 모아 구글에 올린다. 한 번이라도 동기화를 맞춘 뒤에만 (새 컴퓨터의 빈 설정이 덮지 않게)
  let lastPush: { at: string; error?: string } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const push = async () => {
    try { await google.writeSettings(snapshot()); lastPush = { at: new Date().toISOString() } } catch (e) { lastPush = { at: new Date().toISOString(), error: (e as Error).message } }
  }
  registry.onSave(() => {
    const s = google.status()
    if (!s.connected || !s.synced) return
    clearTimeout(timer)
    timer = setTimeout(() => void push(), 3000)
  })
  app.addHook('onClose', async () => clearTimeout(timer))

  app.get('/api/google', replies(C.GoogleStatus), async (): Promise<C.GoogleStatus> => ({ ...google.status(), lastPush }))

  app.put('/api/google/client', replies(C.GoogleStatus), async (req): Promise<C.GoogleStatus> => {
    const { clientId, clientSecret } = parseBody(C.GoogleClientBody, req.body)
    return google.setClient(clientId, clientSecret)
  })

  /** 구글 로그인 화면으로 보낸다. 끝나면 /api/google/callback 으로 돌아온다 */
  app.get<{ Querystring: { return?: string } }>('/api/google/connect', async (req, reply) => {
    const host = req.headers.host ?? ''
    if (!LOOPBACK.test(host)) throw new WorkbenchError(400, t('이 컴퓨터의 앱(127.0.0.1)에서만 구글에 연결할 수 있습니다.', 'You can connect to Google only from the app on this computer (127.0.0.1).'))
    const ret = typeof req.query.return === 'string' && /^\/(?![/\\])/.test(req.query.return) ? req.query.return : '/#/settings'
    return reply.redirect(google.authUrl(`http://${host}/api/google/callback`, ret))
  })

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/google/callback', async (req, reply) => {
    const { code, state, error } = req.query
    try {
      if (error) throw new WorkbenchError(400, error === 'access_denied' ? t('구글에서 허용하지 않았습니다.', 'Google did not allow access.') : t(`구글 로그인 오류: ${error}`, `Google sign-in error: ${error}`))
      if (!code || !state) throw new WorkbenchError(400, t('구글이 돌려준 값이 없습니다.', 'Google returned no values.'))
      return reply.redirect(await google.finish(code, state))
    } catch (e) {
      const msg = String((e as Error).message).replace(/[<>&]/g, '')
      return reply.status(400).type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>${t('구글 연결', 'Connect Google')}</title><body style="font:15px system-ui;padding:40px"><p>${msg}</p><p><a href="/#/settings">${t('설정으로 돌아가기', 'Back to Settings')}</a></p>`)
    }
  })

  app.post('/api/google/disconnect', replies(C.GoogleStatus), async (): Promise<C.GoogleStatus> => { await google.disconnect(); lastPush = null; return google.status() })

  app.get<{ Querystring: { from?: string; to?: string } }>('/api/google/events', replies(C.GoogleEvents), async (req): Promise<C.GoogleEvents> => {
    if (!google.status().connected) return { connected: false, events: [] }
    return { connected: true, events: await google.events(String(req.query.from ?? ''), String(req.query.to ?? '')) }
  })

  /** 구글에 저장된 설정과 이 컴퓨터를 비교한다 */
  app.get('/api/google/sync', replies(C.GoogleSync), async (): Promise<C.GoogleSync> => {
    const remote = await google.readSettings()
    return { remote, ...compare(remote), localCount: registry.list().length }
  })

  /** 이 컴퓨터의 설정을 구글에 올린다 (덮어씀) */
  app.post('/api/google/sync/push', replies(C.GooglePushed), async (): Promise<C.GooglePushed> => {
    await google.writeSettings(snapshot())
    lastPush = { at: new Date().toISOString() }
    return { ok: true, lastPush }
  })

  /**
   * 구글의 설정을 이 컴퓨터에 들인다: 화면 설정, LaTeX 공통 설정과 저자, 이미 등록한 프로젝트의 태그.
   * 아직 없는 프로젝트는 목록만 돌려준다 (화면에서 GitHub 주소로 받아 등록).
   */
  app.post('/api/google/sync/restore', replies(C.GoogleRestored), async (): Promise<C.GoogleRestored> => {
    const remote = await google.readSettings()
    if (!remote) throw new WorkbenchError(404, t('구글에 저장된 설정이 없습니다.', 'No settings are saved in Google.'))
    const { matched, missing } = compare(remote)
    if (remote.ui) registry.setUi(remote.ui)
    if (remote.latexTemplates) registry.restoreTemplates(remote.latexTemplates, remote.latexDefault)
    if (Array.isArray(remote.authors)) registry.setAuthors(remote.authors)
    if (Array.isArray(remote.people)) registry.setPeople(remote.people)
    for (const m of matched) {
      if (m.remote.tags?.length) registry.setTags(m.localId, m.remote.tags)
    }
    google.markSynced()
    return { ok: true, restored: matched.length, missing }
  })
}
