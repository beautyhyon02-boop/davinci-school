// @vitest-environment jsdom
// [이 차시 빈칸 모두 O] → 학생 고르기(고침 라운드 2026-09-29): 눌러서 목록을 펴고, 체크한 학생만 서버로 보낸다. 쓰다 만 글 경고 한 줄.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const fillEmptyQuiz = vi.fn(async () => ({ ok: true as const, unfinalized: false }))
vi.mock('@/app/teacher/assignments/[setId]/actions', () => ({ setQuizCell: vi.fn(), fillEmptyQuiz, finalizeQuizLesson: vi.fn(), unfinalizeQuizLesson: vi.fn(), enterPaperScore: vi.fn(), confirmGrading: vi.fn() }))
const { QuizMatrix } = await import('@/app/teacher/assignments/[setId]/QuizMatrix')
const { PaperScoreForm } = await import('@/app/teacher/assignments/[setId]/PaperScoreForm')
const { app } = await import('@/content/site')
const copy = app.classroom.review

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const lessons = [{ no: 1, quizCount: 2, types: ['short', 'short'] as ('choice' | 'short')[] }, { no: 2, quizCount: 2, types: ['short', 'short'] as ('choice' | 'short')[] }]
const students = [
  { assignmentId: 'a1', name: '김하늘', openLessons: 2 },   // 1차시를 화면에서 다 풀었다
  { assignmentId: 'a2', name: '이바다', openLessons: 2 },   // 종이로 풀었다
  { assignmentId: 'a3', name: '박구름', openLessons: 2 },   // 결석
  { assignmentId: 'a4', name: '최노을', openLessons: 0 },   // 아직 열지 않음
]
const responses = [1, 2].map((quiz_no) => ({ assignment_id: 'a1', lesson_no: 1, quiz_no, response: '답', correct: true, source: 'student' as const }))

let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); fillEmptyQuiz.mockClear() })
afterEach(() => { act(() => root.unmount()); host.remove() })

const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined
const boxes = () => [...host.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const mount = () => act(() => root.render(createElement(QuizMatrix, { setId: 's1', lessons, students, responses, finalizations: [], finalizeAvailable: true })))

describe('빈칸을 채울 학생 고르기', () => {
  it('nothing is listed until the button is pressed; the hint says who is left out', () => {
    mount()
    expect(boxes()).toHaveLength(0)
    expect(host.textContent).toContain(copy.fillEmptyHint)
    expect(host.textContent).toContain(copy.fillEmptyAbsentHint)
    expect(host.textContent).not.toContain(copy.fillPick.heading)
  })
  it('pressing it lists, one per line and all unchecked, the students with an empty cell whose lesson is open', async () => {
    mount()
    await click(button(copy.fillEmpty)!)
    expect(host.textContent).toContain(copy.fillPick.heading)
    const items = [...host.querySelectorAll('li label')].filter((l) => l.querySelector('input[type="checkbox"]'))
    expect(items.map((l) => l.textContent)).toEqual(['이바다', '박구름'])          // 다 푼 학생·열지 않은 학생은 없다
    expect(boxes().every((b) => !b.checked)).toBe(true)
    expect(button(copy.fillPick.confirm)!.disabled).toBe(true)
    expect(button(copy.fillPick.cancel)!.disabled).toBe(false)
    expect(fillEmptyQuiz).not.toHaveBeenCalled()
  })
  it('only the ticked student is sent to the server', async () => {
    mount()
    await click(button(copy.fillEmpty)!)
    await click(boxes()[0])
    expect(button(copy.fillPick.confirm)!.disabled).toBe(false)
    await click(button(copy.fillPick.confirm)!)
    expect(fillEmptyQuiz).toHaveBeenCalledTimes(1)
    expect(fillEmptyQuiz).toHaveBeenCalledWith('s1', 1, ['a2'])
    expect(boxes()).toHaveLength(0)                                                  // 목록은 닫힌다
  })
  it('ticking then un-ticking disables the button again; cancel closes without a call and forgets the ticks', async () => {
    mount()
    await click(button(copy.fillEmpty)!)
    await click(boxes()[1]); await click(boxes()[1])
    expect(button(copy.fillPick.confirm)!.disabled).toBe(true)
    await click(boxes()[0])
    await click(button(copy.fillPick.cancel)!)
    expect(boxes()).toHaveLength(0)
    await click(button(copy.fillEmpty)!)
    expect(boxes().every((b) => !b.checked)).toBe(true)
    expect(fillEmptyQuiz).not.toHaveBeenCalled()
  })
  it('an empty cell of a student whose lesson is not open cannot be pressed; the others can', () => {
    mount()
    const cell = (name: string) => host.querySelector(`button[aria-label^="${name} 1번"]`) as HTMLButtonElement
    expect(cell('최노을').disabled).toBe(true)
    expect(cell('최노을').title).toBe(copy.quizCell.notOpen)
    expect(cell('박구름').disabled).toBe(false)
  })
  it('the finalised lesson tab mark comes from copy', () => {
    const fin = students.map((s) => ({ assignment_id: s.assignmentId, lesson_no: 2, finalized_at: '2026-09-29T03:00:00Z' }))
    act(() => root.render(createElement(QuizMatrix, { setId: 's1', lessons, students, responses, finalizations: fin, finalizeAvailable: true })))
    const tab = app.classroom.student.lessonTab
    expect(button(copy.finalize.tabDone(tab(2)))).toBeTruthy()
    expect(button(tab(1))).toBeTruthy()
  })
})

describe('종이 답안 점수 입력 — 쓰다 만 글 경고', () => {
  const rubric = [{ name: '근거 제시', max: 2, scale: [{ points: 0, descriptor: '없음' }, { points: 1, descriptor: '일부' }, { points: 2, descriptor: '충분' }] }]
  const mountForm = (draftWarning: boolean) => act(() => root.render(createElement(PaperScoreForm, { assignmentId: 'a1', itemNo: 1, label: '서술형', points: 2, rubric, draftWarning })))
  const opener = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(copy.paper.open))!

  it('shows one lemon line once opened, and saving is still allowed', async () => {
    mountForm(true)
    await click(opener())
    const lines = [...host.querySelectorAll('p')].filter((p) => p.textContent === copy.paper.draftWarning)
    expect(lines).toHaveLength(1)
    expect(lines[0].className).toContain('bg-lemon-100')
    await click(host.querySelectorAll('input[type="radio"]')[1])
    expect(button(copy.paper.save)!.disabled).toBe(false)
  })
  it('no line when the student left no draft', async () => {
    mountForm(false)
    await click(opener())
    expect(host.textContent).not.toContain(copy.paper.draftWarning)
  })
})
