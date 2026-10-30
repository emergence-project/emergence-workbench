import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { changesApi, type ChangeItem, type Changes } from './api'
import { qk } from './queries'
import { go, type Route } from './router'
import { t } from './i18n'
import { InfoShell, SubHead } from './ProjectInfoPage'

const KIND: Record<ChangeItem['kind'], string> = {
  note: t('노트', 'Note'), flow: t('흐름 점', 'Flow dot'), task: t('맡긴 일', 'Task'), record: t('기록', 'Records'), file: t('파일', 'File'),
}
const ACTION: Record<ChangeItem['action'], string> = {
  created: t('새로 만듦', 'created'), edited: t('고침', 'edited'), moved: t('옮김', 'moved'), deleted: t('지움', 'deleted'),
}

const pad = (n: number) => String(n).padStart(2, '0')
const day = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
/** 10/27 04:56 */
export const changeTime = (iso: string) => { const d = new Date(iso); return `${day(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
/** 작성일시: 하루 안이면 마지막 시각, 여러 날이면 "10/26 – 10/27" */
export function changeWhen(i: Pick<ChangeItem, 'first' | 'last'>): string {
  const a = new Date(i.first), b = new Date(i.last)
  return a.toDateString() === b.toDateString() ? changeTime(i.last) : `${day(a)} – ${day(b)}`
}

/** 줄을 누르면 여는 곳. 지운 것과 다른 파일 가운데 저장소 밖 것은 없음 */
export function changeRoute(rid: string, i: ChangeItem): Route | null {
  if (i.action === 'deleted') return null
  switch (i.kind) {
    case 'note': {
      return i.main ? { page: 'part', rid, file: i.main } : null
    }
    case 'flow': return { page: 'flow', rid }
    case 'task': return { page: 'task', rid, task: i.id }
    case 'record': return { page: 'records', rid }
    case 'file': return { page: 'file', rid, path: i.id }
  }
}

/** 에이전트 칸: 그 에이전트가 이 줄의 마지막 변경 뒤에 받았으면 ✓, 아니면 ○ */
function AgentCell({ who, at, item, cls }: { who: string; at: string | null; item: ChangeItem; cls: string }) {
  const seen = !!at && at >= item.last
  const tip = seen ? t(`${who}가 봄 (${changeTime(at!)}에 받음)`, `${who} has seen it (fetched ${changeTime(at!)})`) : at ? t(`${who}가 아직 안 봄 (마지막으로 받은 때 ${changeTime(at)})`, `${who} has not seen it yet (last fetched ${changeTime(at)})`) : t(`${who}가 아직 받은 적 없음`, `${who} has not fetched changes yet`)
  return <td className={`chg-ag ${cls}${seen ? ' on' : ''}`} title={tip} aria-label={tip}>{seen ? '✓' : '○'}</td>
}

/**
 * 프로젝트 정보 › 변경사항 (10/27 사용자 결정, 시안 안 B): 내가 마지막으로 이 쪽을 연 뒤 바뀐 것을 한 줄씩.
 * 변경사항 · 작성자 · 작성일시 · Claude · Codex 칸. 에이전트 칸은 MCP changes_since로 받았는지(✓ 봄 · ○ 아직)를 에이전트 색으로.
 * 열면 내 기준이 지금으로 옮겨 홈 카드의 수가 사라진다. 이 쪽을 보는 동안에는 처음 연 기준으로 계속 보인다.
 */
export function ChangesPage({ rid }: { rid: string }) {
  const client = useQueryClient()
  const [since, setSince] = useState<string>()
  const q = useQuery({ queryKey: [...qk.changes(rid), since ?? 'mine'], queryFn: () => changesApi(rid).list(since) })
  const data: Changes | undefined = q.data
  useEffect(() => {
    if (!data || since) return
    setSince(data.since)
    void changesApi(rid).seen().then(() => client.invalidateQueries({ queryKey: qk.changesCount(rid) })).catch(() => { /* 기준을 못 옮기면 다음에 다시 보일 뿐 */ })
  }, [data, since, rid, client])

  return (
    <InfoShell ui="변경사항 쪽">
      <SubHead title={t('변경사항', 'Changes')} desc={t('내가 마지막으로 본 뒤 이 프로젝트의 변경사항입니다. 에이전트는 MCP changes_since로 같은 목록을 받습니다.', 'What changed in this project since you last looked. Agents get the same list with MCP changes_since.')} />
      <section className="info-sec" data-ui="변경사항 표">
        <p className="chg-bar muted">
          {data ? <>
            <span>{t(`내가 본 ${changeTime(data.since)} 뒤로 ${data.items.length}개`, `${data.items.length} since you looked at ${changeTime(data.since)}`)}</span>
            <span title={t('커밋하지 않은 것은 이 맥 것만 보입니다', 'Only this Mac\'s uncommitted edits are shown')}>{t(`이 맥: ${data.machine}`, `This Mac: ${data.machine}`)}</span>
            <span>{t('✓ 봄 ○ 아직', '✓ seen ○ not yet')}</span>
          </> : q.error ? <span className="error-text">{t(`읽지 못했습니다 — ${(q.error as Error).message}`, `Could not read: ${(q.error as Error).message}`)}</span> : t('읽는 중…', 'Loading…')}
        </p>
        {data && (data.items.length ? (
          <div className="chg-scroll">
            <table className="chg-table">
              <thead><tr>
                <th>{t('변경사항', 'Change')}</th><th>{t('작성자', 'Author')}</th><th className="r">{t('작성일시', 'When')}</th>
                <th className="chg-ag" title="Claude Code">Claude</th><th className="chg-ag">Codex</th>
              </tr></thead>
              <tbody>
                {data.items.map((i) => {
                  const to = changeRoute(rid, i)
                  const name = i.kind === 'file' ? i.id : i.name
                  return (
                    <tr key={`${i.kind}:${i.id}`} data-ui="변경사항 줄" data-ui-item={name}>
                      <td className="chg-what">
                        {to ? <button className="a chg-name" title={i.files.join('\n')} onClick={() => go(to)}>{name}</button> : <span className="chg-name" title={i.files.join('\n')}>{name}</span>}
                        <span className="chg-kind"> · {KIND[i.kind]} · {ACTION[i.action]}</span>
                        {i.uncommitted && <span className="tag chg-uncommitted" title={t('이 맥에서 아직 커밋하지 않았습니다', 'Not committed on this Mac yet')}>{t('커밋 안 됨', 'Not committed')}</span>}
                      </td>
                      <td className="chg-who">{i.authors.join(', ')}</td>
                      <td className="chg-who r">{changeWhen(i)}</td>
                      <AgentCell who="Claude" at={data.agents.claude} item={i} cls="cc" />
                      <AgentCell who="Codex" at={data.agents.codex} item={i} cls="cx" />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t('변경사항이 없습니다', 'Nothing changed')}</p>)}
      </section>
    </InfoShell>
  )
}
