import { describe, it, expect } from 'vitest'
import { assessmentItemNoForLesson, lessonNoForItem, isLessonOpen, ASSESSMENT_LABELS } from '@/lib/classroom/lessons'

// 최소 스냅샷: lessons 의 assessment 라벨과 assessment.items 의 순서로 문항 번호(1-based)를 정한다
const snapshot = {
  lessons: [
    { no: 1, assessment: null }, { no: 2, assessment: null }, { no: 3, assessment: '서술형1' },
    { no: 4, assessment: '서술형2' }, { no: 5, assessment: '논술형' },
  ],
  assessment: { items: [{ kind: '서술형', lesson_no: 3 }, { kind: '서술형', lesson_no: 4 }, { kind: '논술형', lesson_no: 5 }] },
} as never

describe('lesson ↔ item mapping', () => {
  it('finds the item number placed in a lesson', () => {
    expect(assessmentItemNoForLesson(snapshot, 3)).toBe(1)
    expect(assessmentItemNoForLesson(snapshot, 5)).toBe(3)
    expect(assessmentItemNoForLesson(snapshot, 1)).toBeNull()
  })
  it('finds the lesson of an item', () => {
    expect(lessonNoForItem(snapshot, 2)).toBe(4)
  })
  it('labels follow the lesson schema', () => {
    expect(ASSESSMENT_LABELS).toEqual(['서술형1', '서술형2', '논술형'])
  })
})

describe('isLessonOpen', () => {
  it('opens lessons up to open_lessons', () => {
    expect(isLessonOpen(3, 3)).toBe(true)
    expect(isLessonOpen(3, 4)).toBe(false)
  })
})
