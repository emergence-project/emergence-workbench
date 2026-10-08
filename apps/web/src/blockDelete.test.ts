import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, type ResearchApi } from './api'
import { askConfirm } from './askText'
import { deleteBlockWithConfirm } from './blockDelete'

vi.mock('./askText', () => ({ askConfirm: vi.fn() }))

const note = { id: 'example', name: '예제', file: 'workbench/blocks/example.md', hash: 'read-hash' }
const setup = () => {
  const deleteBlock = vi.fn<ResearchApi['deleteBlock']>().mockResolvedValue({ ok: true })
  return { rapi: { deleteBlock } as unknown as ResearchApi, deleteBlock, onDeleted: vi.fn(), onSaved: vi.fn() }
}
beforeEach(() => vi.clearAllMocks())

describe('보조 노트 영구 지우기', () => {
  it('지워지는 파일과 남는 기록·링크·PDF를 알리고 취소하면 요청하지 않는다', async () => {
    vi.mocked(askConfirm).mockResolvedValue(false)
    const { rapi, deleteBlock, onDeleted, onSaved } = setup()
    await deleteBlockWithConfirm(rapi, note, onDeleted, onSaved)
    const prompt = vi.mocked(askConfirm).mock.calls[0]![0]
    expect(prompt.ok).toBe('지우기')
    expect(prompt.hint).toContain(`${note.file} 파일만 영구히`)
    expect(prompt.hint).toContain('되돌릴 수 없습니다')
    expect(prompt.hint).toContain('workbench/comments/block-example.md')
    expect(prompt.hint).toContain('링크와 기존 PDF는 남습니다')
    expect(deleteBlock).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('확인 뒤 읽을 때의 해시로 요청하고 성공 응답 뒤에만 화면을 닫는다', async () => {
    let confirm!: (v: boolean) => void
    vi.mocked(askConfirm).mockReturnValue(new Promise((resolve) => { confirm = resolve }))
    const { rapi, deleteBlock, onDeleted, onSaved } = setup()
    let finish!: (v: { ok: true }) => void
    deleteBlock.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const pending = deleteBlockWithConfirm(rapi, note, onDeleted, onSaved)
    expect(deleteBlock).not.toHaveBeenCalled()
    confirm(true)
    await Promise.resolve()
    expect(deleteBlock).toHaveBeenCalledExactlyOnceWith(note.id, note.hash)
    expect(onDeleted).not.toHaveBeenCalled()
    finish({ ok: true })
    await pending
    expect(onDeleted).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledExactlyOnceWith('"예제"을 지웠습니다')
  })

  it.each([new ConflictError('new-hash'), new Error('지울 수 없습니다')])('실패하면 화면을 남기고 오류를 알린다 (%s)', async (error) => {
    vi.mocked(askConfirm).mockResolvedValue(true)
    const { rapi, deleteBlock, onDeleted, onSaved } = setup()
    deleteBlock.mockRejectedValue(error)
    await deleteBlockWithConfirm(rapi, note, onDeleted, onSaved)
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(error instanceof ConflictError
      ? '다른 곳에서 노트가 바뀌어 지우지 않았습니다. 파일을 다시 읽고 확인해 주세요.' : error.message)
  })
})
