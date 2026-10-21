import type { CommentEntry, RecordFile } from './api'
import { monthDay, recordDay } from './format'
import { t } from './i18n'
import { kindLabel } from './recordLabels'
import { RecordList } from './RecordList'
import { recordKind } from './recordsPanelHelpers'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { recordLine, type FlatRecord } from './workRecords'

/**
 * 기록 화면의 차례 줄 (10/21 "작업 탭을 기록 안으로", 시안 "다시 그린 시안: 시각 위계").
 * 처음에는 한 줄(점 · 종류 · 첫 줄 · 대상 · 날짜)만 보이고, 누르면 그 줄만 펼쳐 기록 전체와 할 수 있는 일을 보인다.
 * 판단 카드(WorkTasks TaskCard)와 같은 모양(.tk)이라 한 목록에 섞여도 같은 무게로 읽힌다
 */
export function TurnRecordRow({ rid, item, open, turn, onToggle, onGo }: {
  rid: string; item: FlatRecord; open: boolean
  /** 주황 점: 나를 기다리는 것 (에이전트가 물은 것). 아니면 옅은 점 */
  turn: boolean
  onToggle(): void; onGo(file: RecordFile, entry: CommentEntry): void
}) {
  const { file, entry } = item
  const kind = recordKind(entry)
  const where = file.target === 'project' ? t('이 프로젝트', 'This project') : file.title
  const day = recordDay(entry.id)
  return (
    <article className={`tk tk-rec${open ? ' open' : ''}`} data-ui="차례 기록 줄" data-ui-item={`${file.target}/${entry.id}`}>
      <button className="tk-row" aria-expanded={open} onClick={onToggle}>
        {turn ? <StatusDot s="blocked" name={t('내 차례', 'Your turn')} /> : <span className="g none" role="img" aria-label={t('기다림', 'Waiting')} />}
        <span className="tk-title"><span className="tk-kind">{kindLabel(kind)}</span>{recordLine(entry) || t('(빈 기록)', '(empty)')}</span>
        <span className="tk-meta"><span>{entry.by ?? where}</span>{day && <span>{monthDay(day)}</span>}</span>
        <span className="tk-chev" aria-hidden />
      </button>
      {open && <div className="tk-open tk-rec-open">
        <RecordList rid={rid} file={file} filter={kind === '질문' || kind === '지시' || kind === '할 일' ? kind : '메모'} items={[entry]} work onGo={(c) => onGo(file, c)} />
      </div>}
    </article>
  )
}

/** 내 차례의 수정 검토: 한 줄로 보이고 누르면 수정 검토 화면으로 간다 (표가 커서 따로 둔다) */
export function EditReviewRow({ rid, count }: { rid: string; count: number }) {
  return (
    <article className="tk" data-ui="차례 수정 검토 줄">
      <button className="tk-row" onClick={() => go({ page: 'edits', rid })}>
        <StatusDot s="blocked" name={t('내 차례', 'Your turn')} />
        <span className="tk-title"><span className="tk-kind">{t('수정 검토', 'Edit review')}</span>{t(`에이전트가 고친 노트 ${count}`, `${count} note(s) changed by agents`)}</span>
        <span className="tk-meta"><span>{t('수정 검토에서 보기 ›', 'Open edit review ›')}</span></span>
        <span />
      </button>
    </article>
  )
}
