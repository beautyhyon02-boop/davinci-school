import type { Snapshot } from '@/lib/studio/publish'

/** 3단계 차시 스키마의 assessment 라벨. 순서 = 5단계 items 순서 = 문항 번호(1-based). */
export const ASSESSMENT_LABELS = ['서술형1', '서술형2', '논술형'] as const

/** 이 차시에 배치된 평가 문항 번호(1-based). 없으면 null. items[i].lesson_no 를 우선 쓰고, 없으면 차시 라벨로 맞춘다. */
export function assessmentItemNoForLesson(snapshot: Snapshot, lessonNo: number): number | null {
  const items = snapshot.assessment?.items ?? []
  const byLesson = items.findIndex((i) => i.lesson_no === lessonNo)
  if (byLesson >= 0) return byLesson + 1
  const lesson = snapshot.lessons.find((l) => l.no === lessonNo)
  if (!lesson?.assessment) return null
  const idx = ASSESSMENT_LABELS.indexOf(lesson.assessment)
  return idx >= 0 && idx < items.length ? idx + 1 : null
}

export function lessonNoForItem(snapshot: Snapshot, itemNo: number): number {
  const item = snapshot.assessment?.items[itemNo - 1]
  if (item?.lesson_no) return item.lesson_no
  const label = ASSESSMENT_LABELS[itemNo - 1]
  return snapshot.lessons.find((l) => l.assessment === label)?.no ?? snapshot.lessons.length
}

export function isLessonOpen(openLessons: number, lessonNo: number): boolean {
  return lessonNo >= 1 && lessonNo <= openLessons
}
