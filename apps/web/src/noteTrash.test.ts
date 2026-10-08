import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlashAction } from './App'
import type { ManuscriptInfo, ResearchApi, TrashedNote } from './api'
import { askConfirm } from './askText'
import { trashNoteWithUndo } from './Topics'

// 노트 화면의 PDF 의존성 없이 지우기와 되돌리기 동작을 검증한다.
vi.mock('./Manuscript', () => ({ openPart: vi.fn() }))
vi.mock('./askText', () => ({ askConfirm: vi.fn().mockResolvedValue(false), askText: vi.fn() }))

const note: ManuscriptInfo = {
  key: 'note/example', main: 'workbench/notes/example/note.md', name: '예제 노트',
  kind: 'note', parts: [], hasPdf: false, pdfState: 'missing',
}
const trashed: TrashedNote = {
  id: 'example-20261006T120000', name: note.name, from: 'workbench/notes/example',
  at: '2026-10-06T12:00:00.000Z', until: '2026-10-21T12:00:00.000Z',
}

function setup() {
  const trashNote = vi.fn<ResearchApi['trashNote']>().mockResolvedValue(trashed)
  const restoreNote = vi.fn<ResearchApi['restoreNote']>().mockResolvedValue({ path: trashed.from })
  const rapi = { trashNote, restoreNote } as unknown as ResearchApi
  const onChanged = vi.fn<() => void>()
  const onSaved = vi.fn<(message: string, action?: FlashAction) => void>()
  return { rapi, trashNote, restoreNote, onChanged, onSaved }
}

beforeEach(() => vi.clearAllMocks())

describe('노트 지우기와 되돌리기', () => {
  it('확인 없이 바로 지우고 요청이 끝난 뒤 목록과 알림을 바꾼다', async () => {
    const { rapi, trashNote, onChanged, onSaved } = setup()
    let finish!: (item: TrashedNote) => void
    trashNote.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))

    const pending = trashNoteWithUndo(rapi, note, onChanged, onSaved)
    expect(askConfirm).not.toHaveBeenCalled()
    expect(trashNote).toHaveBeenCalledExactlyOnceWith(note.key)
    expect(onChanged).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    finish(trashed)
    await pending
    expect(onChanged).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledExactlyOnceWith('"예제 노트"을 지웠습니다', { label: '되돌리기', run: expect.any(Function) })
    expect(onChanged.mock.invocationCallOrder[0]).toBeLessThan(onSaved.mock.invocationCallOrder[0]!)
  })

  it('응답의 휴지통 id로 되살린 뒤 목록을 새로 읽고 결과를 알린다', async () => {
    const { rapi, restoreNote, onChanged, onSaved } = setup()
    await trashNoteWithUndo(rapi, note, onChanged, onSaved)
    const action = onSaved.mock.calls[0]![1]!
    expect(restoreNote).not.toHaveBeenCalled()

    await action.run()
    expect(restoreNote).toHaveBeenCalledExactlyOnceWith(trashed.id)
    expect(onChanged).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenLastCalledWith('되살렸습니다')
    expect(onChanged.mock.invocationCallOrder[1]).toBeLessThan(onSaved.mock.invocationCallOrder[1]!)
  })

  it('지우지 못하면 되돌리기 없이 오류를 알리고 목록은 새로 읽지 않는다', async () => {
    const { rapi, trashNote, restoreNote, onChanged, onSaved } = setup()
    trashNote.mockRejectedValueOnce(new Error('지울 수 없습니다'))

    await trashNoteWithUndo(rapi, note, onChanged, onSaved)
    expect(onSaved).toHaveBeenCalledExactlyOnceWith('지울 수 없습니다')
    expect(onChanged).not.toHaveBeenCalled()
    expect(restoreNote).not.toHaveBeenCalled()
  })

  it('되살리지 못하면 성공 알림 대신 오류를 알린다', async () => {
    const { rapi, restoreNote, onChanged, onSaved } = setup()
    restoreNote.mockRejectedValueOnce(new Error('되살릴 수 없습니다'))
    await trashNoteWithUndo(rapi, note, onChanged, onSaved)
    const action = onSaved.mock.calls[0]![1]!

    await action.run()
    expect(restoreNote).toHaveBeenCalledExactlyOnceWith(trashed.id)
    expect(onChanged).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenLastCalledWith('되살릴 수 없습니다')
  })
})
