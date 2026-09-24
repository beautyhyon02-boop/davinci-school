import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { itemNosForLesson, lessonNoForItem, itemLabel, isLessonOpen, materialIdsForLesson, isPaperItem, studentConditions } from '@/lib/classroom/lessons'

// 지금 구조(대표 2026-09-26): 교수 차시 1~5 + 단원 평가 차시 6에 서술형(1)·논술형(2)
const snapshot = {
  lessons: [1, 2, 3, 4, 5].map((no) => ({ no, kind: 'teaching', assessment: [] })).concat({ no: 6, kind: 'assessment', assessment: ['서술형', '논술형'] } as never),
  assessment: { items: [{ kind: '서술형', lesson_no: 6 }, { kind: '논술형', lesson_no: 6 }] },
} as never
// 옛 판(서술형 2 + 논술형, compat 이 라벨을 배열로 올린 모양)
const legacy = {
  lessons: [
    { no: 1, assessment: [] }, { no: 2, assessment: [] }, { no: 3, assessment: ['서술형'] },
    { no: 4, assessment: ['서술형'] }, { no: 5, kind: 'assessment', assessment: ['논술형'] },
  ],
  assessment: { items: [{ kind: '서술형', lesson_no: 3 }, { kind: '서술형', lesson_no: 4 }, { kind: '논술형', lesson_no: 5 }] },
} as never

describe('lesson ↔ item mapping', () => {
  it('the 단원 평가 차시 carries both items; teaching lessons carry none', () => {
    expect(itemNosForLesson(snapshot, 6)).toEqual([1, 2])
    expect(itemNosForLesson(snapshot, 5)).toEqual([])
    expect(lessonNoForItem(snapshot, 2)).toBe(6)
  })
  it('an old 판 keeps one item per lesson and its numbering', () => {
    expect(itemNosForLesson(legacy, 3)).toEqual([1])
    expect(itemNosForLesson(legacy, 5)).toEqual([3])
    expect(itemNosForLesson(legacy, 1)).toEqual([])
    expect(lessonNoForItem(legacy, 2)).toBe(4)
  })
  it('labels: 서술형·논술형 now, 서술형1·서술형2·논술형 on an old 판', () => {
    expect([1, 2].map((n) => itemLabel(snapshot, n))).toEqual(['서술형', '논술형'])
    expect([1, 2, 3].map((n) => itemLabel(legacy, n))).toEqual(['서술형1', '서술형2', '논술형'])
    expect(itemLabel(snapshot, 3)).toBe('')
  })
  it('falls back to the lesson labels when items have no lesson_no', () => {
    const noLessonNo = { lessons: [{ no: 6, kind: 'assessment', assessment: ['서술형', '논술형'] }], assessment: { items: [{ kind: '서술형' }, { kind: '논술형' }] } } as never
    expect(itemNosForLesson(noLessonNo, 6)).toEqual([1, 2])
  })
})

describe('isLessonOpen', () => {
  it('opens lessons up to open_lessons', () => {
    expect(isLessonOpen(3, 3)).toBe(true)
    expect(isLessonOpen(3, 4)).toBe(false)
  })
})

describe('materialIdsForLesson', () => {
  it('returns the ids from materials_used sorted, ignoring preparation items', () => {
    expect(materialIdsForLesson({ materials_used: ['B', 'A'], materials_needed: ['축제 삽화 3장'] } as never)).toEqual(['A', 'B'])
    expect(materialIdsForLesson({ materials_used: ['A', 'A'] })).toEqual(['A'])
    expect(materialIdsForLesson({ materials_used: [] } as never)).toEqual([])
  })
  it('the 단원 평가 차시 also shows every material its items use (a teaching lesson does not take item materials)', () => {
    const items = [{ materials_used: ['B'] }, { materials_used: ['A', 'D'] }]
    expect(materialIdsForLesson({ kind: 'assessment', materials_used: ['A'] }, items)).toEqual(['A', 'B', 'D'])
    expect(materialIdsForLesson({ kind: 'teaching', materials_used: ['C'] }, items)).toEqual(['C'])
  })
})

describe('isPaperItem', () => {
  it('is true only for an item whose conditions.answer_mode is paper', () => {
    const s = { assessment: { items: [{ conditions: { answer_mode: 'paper' } }, { conditions: { answer_mode: 'screen' } }] } } as never
    expect(isPaperItem(s, 1)).toBe(true)
    expect(isPaperItem(s, 2)).toBe(false)
    expect(isPaperItem(s, 3)).toBe(false)
    expect(isPaperItem({ assessment: null } as never, 1)).toBe(false)
  })
})

describe('studentConditions', () => {
  it('keeps only what the student sees: numbered texts, length, format and answer mode', () => {
    const item = { conditions: { items: [{ no: 1, text: '조건 문장', verb: '쓰다', points: 1, category: '내용' }], length: '두 문장', format: '문장', answer_mode: 'paper', overflow_rule: '앞의 것만' } } as never
    expect(studentConditions(item)).toEqual({ length: '두 문장', format: '문장', answer_mode: 'paper', items: [{ no: 1, text: '조건 문장' }] })
  })
})

describe('isPaperItem on the demo fixtures (server-side paper guard in student actions)', () => {
  // 대표 2026-09-26: 수학 서술형 1(종이 답안 도수분포표)을 빼서 시연 세트에는 종이 답안 문항이 없다 — 가드는 합성 판으로 본다
  for (const sfx of ['', '-과학']) it(`stage5${sfx}: no paper item; a synthetic paper 서술형 is caught and nothing else`, () => {
    const assessment = JSON.parse(readFileSync(`data/studio-fixtures/stage5-generate${sfx}.json`, 'utf8'))
    expect([1, 2].map((n) => isPaperItem({ assessment } as never, n))).toEqual([false, false])
    const paper = structuredClone(assessment); paper.items[0].conditions.answer_mode = 'paper'
    const snap = { assessment: paper } as never
    expect([0, 1, 2, 3].map((n) => isPaperItem(snap, n))).toEqual([false, true, false, false])
  })
})
