import { useMutation, useQuery } from '@tanstack/react-query'
import { pluginsCalls, type PluginRow } from './api'
import { flash } from './flash'
import { lang, t } from './i18n'
import { qk, queryClient } from './queries'
import { reviewLine, useRulesView } from './ResearchTables'
import { href } from './router'

/**
 * 설정 › 기능 (2026-11-27 사용자 결정 "실험 기능을 플러그인으로 설치 · 제거, 컴퓨터마다"):
 * 내장 플러그인마다 한 줄. 설치 상태는 이 컴퓨터의 config.yaml `plugins:`에만 적고, 제거는 등록을 건너뛸 뿐 연구 파일을 지우지 않는다.
 * 되돌릴 수 있으므로 확인 창 없이 바꾸고, 알림의 「되돌리기」로 돌린다. 실험이면 다시 볼 날과 판단을 소개 › 연구의 그 줄(규칙 목록)에서 읽어 보인다.
 */

const pick = (x: { ko: string; en: string }) => (lang === 'ko' ? x.ko : x.en)

export function FeatureSettings() {
  const q = useQuery({ queryKey: qk.plugins, queryFn: pluginsCalls.plugins, staleTime: Infinity })
  const rules = useRulesView().data
  const names = new Map((q.data?.plugins ?? []).map((p) => [p.id, pick(p.name)]))
  const change = useMutation({
    mutationFn: ({ id, installed }: { id: string; installed: boolean }) => pluginsCalls.setPlugin(id, installed),
    onSuccess: (view, { id, installed }) => {
      queryClient.setQueryData(qk.plugins, view)
      const name = names.get(id) ?? id
      flash(installed ? t(`${name} 기능을 설치했습니다`, `Installed ${name}`) : t(`${name} 기능을 제거했습니다`, `Removed ${name}`),
        { label: t('되돌리기', 'Undo'), run: () => change.mutate({ id, installed: !installed }) })
    },
    onError: (e) => flash(e instanceof Error ? e.message : String(e), undefined, { error: true }),
  })
  if (q.isError) return <p className="set-desc">{t('기능 목록을 읽지 못했습니다.', 'Could not read the feature list.')}</p>
  const rows = q.data?.plugins ?? []
  return (
    <>
      <p className="set-desc feat-lead">{t('이 컴퓨터에서 쓸 기능을 고릅니다. 제거해도 연구 파일은 남고, 다시 설치하면 그대로 돌아옵니다.', 'Choose the features this computer uses. Removing one keeps its research files; installing it again brings them back.')}</p>
      <div className="set-rows">
        {rows.map((p) => <FeatureRow key={p.id} p={p} names={names} review={rules?.rows.find((r) => r.entry.id === p.rule)?.entry} busy={change.isPending} onChange={(installed) => change.mutate({ id: p.id, installed })} />)}
      </div>
    </>
  )
}

function FeatureRow({ p, names, review, busy, onChange }: {
  p: PluginRow; names: Map<string, string>; review?: Parameters<typeof reviewLine>[0]; busy: boolean; onChange(installed: boolean): void
}) {
  const lockedBy = p.installed ? p.requiredBy.map((id) => names.get(id) ?? id) : []
  return (
    <div className="set-row feat-row" data-ui="기능 줄" data-ui-item={p.id}>
      <div>
        <div className="set-name">
          {pick(p.name)}
          <span className="tag feat-stage">{p.stage === 'experiment' ? t('실험', 'Experiment') : t('정식', 'Stable')}</span>
          {!p.installed && <span className="feat-off">{t('제거됨', 'Removed')}</span>}
        </div>
        <div className="set-desc">{pick(p.summary)}</div>
        {(review || p.keeps.length > 0) && (
          <div className="set-desc feat-meta">
            {review && <a className="a" href={href({ page: 'about', part: 'research' })} data-ui="기능 다시 볼 날">{reviewLine(review)}</a>}
            {p.keeps.length > 0 && <span title={p.keeps.join(', ')}>{t('제거해도 남는 파일: ', 'Kept when removed: ')}<code>{p.keeps.join(', ')}</code></span>}
          </div>
        )}
        {lockedBy.length > 0 && <div className="set-desc">{t(`${lockedBy.join(', ')} 기능이 쓰고 있어 제거할 수 없습니다.`, `Used by ${lockedBy.join(', ')}, so it cannot be removed.`)}</div>}
      </div>
      <button className="btn" data-ui={p.installed ? '기능 제거 버튼' : '기능 설치 버튼'} disabled={busy || lockedBy.length > 0} onClick={() => onChange(!p.installed)}>
        {p.installed ? t('제거', 'Remove') : t('설치', 'Install')}
      </button>
    </div>
  )
}
