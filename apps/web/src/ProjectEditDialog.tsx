import { useEffect, useRef, useState } from 'react'
import { api, ConflictError, LIMITS, type ProjectColor, type ResearchApi, type ResearchListItem, type ResearchSummary } from './api'
import { CardEditDialog } from './CardEditDialog'
import { CardImageField, CardImagePicker } from './CardImagePicker'
import { ProjectCard } from './HomePage'
import { onListKey } from './listInput'
import { isDialogHostDisplayed } from './dialogVisibility'
import { autoProjectColor, PROJECT_COLOR_HEX, PROJECT_COLOR_LABEL, projectColor } from './format'
import { projectTextState, readProjectEditSnapshot } from './projectEdit'
import { ProjectProfileFields, ProjectRailCheck, type ProfilePatch } from './ProjectProfileFields'
import { t } from './i18n'

/**
 * 프로젝트 첫 화면과 정보 화면의 공용 고치기 창: 이름 · 설명 · 시작일 · 카드 그림(research.yaml)과
 * 성격 · 분야 · 진행 상태 · 색(이 컴퓨터의 설정)을 함께 고친다. 카드 그림 · 색 · 시작일은 오른쪽 미리보기 바로 아래에 있다 (10/10 A안). 읽은 값과 해시를 짝지어 바깥 수정을 보호한다.
 */
export function ProjectEditDialog({ rapi, summary, listed, all, pc, last, onProfile, onChanged, onSaved, onDone }: {
  rapi: ResearchApi
  summary: ResearchSummary
  listed: ResearchListItem
  all: ResearchListItem[]
  pc: string
  last?: number
  onProfile(patch: ProfilePatch, message: string): Promise<void>
  onChanged(): void
  onSaved(message: string): void
  onDone(): void
}) {
  const [title, setTitle] = useState(summary.research.title)
  const [question, setQuestion] = useState(summary.research.question)
  const [started, setStarted] = useState(summary.research.started)
  const [image, setImage] = useState(summary.research.image ?? '')
  const [pickingImage, setPickingImage] = useState(false)
  const [profile, setProfile] = useState<{ kind: ResearchListItem['kind']; fields: string[]; state: ResearchListItem['state']; rail: boolean; color: ProjectColor | null }>({ kind: listed.kind, fields: listed.fields, state: listed.state, rail: listed.rail, color: listed.color ?? null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = useRef({ ...summary.research, image: summary.research.image ?? '' })
  const [baseHash, setBaseHash] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const loaded = !!baseHash
  useEffect(() => {
    if (loaded && isDialogHostDisplayed(nameInput.current)) nameInput.current?.focus()
  }, [loaded])
  useEffect(() => {
    let active = true
    setBaseHash(null)
    readProjectEditSnapshot(rapi).then(({ research, hash }) => {
      if (!active) return
      base.current = { ...research, image: research.image ?? '' }
      setTitle(research.title); setQuestion(research.question)
      setStarted(research.started); setImage(research.image ?? '')
      setBaseHash(hash)
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [rapi])
  const { counts, valid } = projectTextState(title, question, base.current ? { title: base.current.title, description: base.current.question } : undefined)
  const canSave = !busy && !!baseHash && valid
  const saving = useRef(false)
  const save = async () => {
    if (!canSave || saving.current) return
    const trimmed = title.replace(/\s+/g, ' ').trim()
    if (!trimmed) { setError(t('이름이 비어 있습니다', 'The name is empty')); return }
    saving.current = true
    setBusy(true); setError(null)
    try {
      const info: { title?: string; question?: string; started?: string; image?: string } = {}
      if (trimmed !== base.current.title) info.title = trimmed
      if (question.trim() !== base.current.question) info.question = question.trim()
      if (started.trim() !== base.current.started) info.started = started.trim()
      if (image.trim() !== base.current.image) info.image = image.trim()
      if (Object.keys(info).length) {
        if (!baseHash) throw new Error(t('research.yaml을 아직 읽지 못했습니다. 잠시 뒤 다시 저장해 주세요', 'research.yaml has not been read yet. Try saving again in a moment'))
        const r = await rapi.setInfo(info, baseHash)
        // 다음 저장(아래 성격 저장이 실패해 다시 누를 때)은 방금 쓴 것을 기준으로
        setBaseHash(r.hash)
        base.current = { ...base.current, ...info }
        onChanged()
      }
      const patch: ProfilePatch = {}
      if (profile.kind !== listed.kind) patch.kind = profile.kind
      if (profile.fields.join('\u0000') !== listed.fields.join('\u0000')) patch.fields = profile.fields
      if (profile.state !== listed.state) patch.state = profile.state
      if (profile.rail !== listed.rail) patch.rail = profile.rail
      if (profile.color !== (listed.color ?? null)) patch.color = profile.color
      if (Object.keys(patch).length) await onProfile(patch, t('저장했습니다 — 성격 · 분야 · 진행 상태는 이 컴퓨터의 설정에', 'Saved. Kind, field and status go to this computer\'s settings'))
      else if (Object.keys(info).length) onSaved(t('저장했습니다 — workbench/research.yaml', 'Saved to workbench/research.yaml'))
      onDone()
    } catch (e) {
      setError(e instanceof ConflictError ? t('다른 곳에서 research.yaml이 바뀌었습니다. 다시 열어 고쳐 주세요', 'research.yaml changed elsewhere. Reopen it and edit again') : (e as Error).message)
    } finally { saving.current = false; setBusy(false) }
  }
  const auto = autoProjectColor(listed.id, all)
  const shown = profile.color ? projectColor(listed.id, profile.color) : auto
  const swatches = (
    <span className="td-sws" role="radiogroup" aria-label={t('프로젝트 색', 'Project color')}>
      <button type="button" role="radio" aria-checked={!profile.color} className={`td-sw-auto${profile.color ? '' : ' on'}`} style={{ ['--sw' as string]: auto }}
        title={t('자동: 다른 프로젝트와 겹치지 않는 색', 'Auto: a color no other project uses')} onClick={() => setProfile((cur) => ({ ...cur, color: null }))}><i aria-hidden />{t('자동', 'Auto')}</button>
      {(Object.keys(PROJECT_COLOR_HEX) as ProjectColor[]).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={profile.color === c} className={`td-sw solid${profile.color === c ? ' on' : ''}`} style={{ ['--sw' as string]: PROJECT_COLOR_HEX[c] }}
          aria-label={`${t('프로젝트 색', 'Project color')}: ${PROJECT_COLOR_LABEL[c]}`} title={PROJECT_COLOR_LABEL[c]} onClick={() => setProfile((cur) => ({ ...cur, color: c }))} />
      ))}
    </span>
  )
  return (<>
    <CardEditDialog title={t('프로젝트 고치기', 'Edit project')} location={`${t('홈', 'Home')} › ${summary.research.title}`} pc={shown} ui="프로젝트 고치기 칸"
      className="project-dialog" canSave={canSave} onClose={() => { if (!saving.current) onDone() }} onSave={() => void save()} preview={
        <ProjectCard preview pc={shown} r={{ ...listed, ...profile, color: profile.color ?? undefined, title: title.trim() }} question={question} image={image.trim()}
          last={last} issues={summary.tree.issues.length} mark={summary.tree.issues.length ? 'check' : null} />
      } lower={
        <fieldset className="td-fields" disabled={busy || !baseHash}>
          <ProjectProfileFields kind={profile.kind} fields={profile.fields} state={profile.state} all={all}
            onChange={(p) => setProfile((cur) => ({ ...cur, ...p }))} />
        </fieldset>
      } foot={
        <fieldset className="td-fields" disabled={busy || !baseHash}>
          <ProjectRailCheck state={profile.state} rail={profile.rail} onChange={(p) => setProfile((cur) => ({ ...cur, ...p }))} />
        </fieldset>
      } look={<>
        <div className="td-row">
          <span className="td-rl">{t('카드 그림', 'Card image')}</span>
          <CardImageField value={image} legacyUrl={api.imageUrl(listed.id, image)} ui="프로젝트 카드 그림" disabled={busy || !baseHash} onOpen={() => setPickingImage(true)} onChange={setImage} />
        </div>
        <div className="td-row" data-ui="프로젝트 색">
          <span className="td-rl">{t('색', 'Color')}</span>
          {swatches}
        </div>
        <label className="td-row">
          <span className="td-rl">{t('시작일', 'Start date')}</span>
          <input type="date" className="td-in" value={started} disabled={busy || !baseHash} aria-label={t('시작일', 'Start date')} data-ui="프로젝트 시작일" onChange={(e) => setStarted(e.target.value)} />
        </label>
      </>}>
      <fieldset className="td-fields" disabled={busy || !baseHash}>
        <label className="td-f">
          <span className="td-lab"><span>{t('이름', 'Name')}</span><span className={`td-n${counts.title > LIMITS.title ? ' over' : ''}`}>{counts.title} / {LIMITS.title}</span></span>
          <input ref={nameInput} className="td-in" value={title} aria-label={t('프로젝트 이름', 'Project name')} data-ui="프로젝트 이름" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="td-f grow">
          <span className="td-lab"><span>{t('설명', 'Description')}</span><span className={`td-n${counts.description > LIMITS.cardDescription ? ' over' : ''}`}>{counts.description} / {LIMITS.cardDescription}</span></span>
          <textarea className="td-in td-ta" rows={4} value={question} aria-label={t('설명', 'Description')} data-ui="프로젝트 설명" placeholder={t('이 프로젝트가 무엇을 묻는지 한두 문장으로. 줄 앞에 ‘- ’를 쓰면 글머리표 목록이 됩니다. 홈 카드에는 한 줄로 보입니다.', 'One or two sentences on what this project asks. Start a line with ‘- ’ for a bulleted list. The home card shows one line.')}
            onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { onListKey(e, setQuestion) }} />
        </label>
      </fieldset>
      {!baseHash && !error && <p className="td-help" role="status">{t('프로젝트 정보를 읽는 중…', 'Reading project info…')}</p>}
      {error && <p className="td-err" role="alert">{error}</p>}
    </CardEditDialog>
    {pickingImage && <CardImagePicker rid={listed.id} project={title} pc={pc} value={image} onChange={setImage} onClose={() => setPickingImage(false)} />}
  </>)
}
