import type { Snapshot } from '@/lib/studio/publish'
type AssessmentItem = NonNullable<Snapshot['assessment']>['items'][number]

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

/** 차시가 쓰는 자료 ID(v2 materials_used, 중복 제거·오름차순). 준비물(materials_needed)은 자료가 아니다. */
export function materialIdsForLesson(lesson: { materials_used: string[] }): string[] {
  return [...new Set(lesson.materials_used)].sort()
}

/** 표·그래프를 종이에 직접 작성하는 문항(answer_mode 'paper')인지. 학생 화면은 입력칸 대신 종이 답안 안내를 보인다. */
export function isPaperItem(snapshot: Snapshot, itemNo: number): boolean {
  return snapshot.assessment?.items[itemNo - 1]?.conditions.answer_mode === 'paper'
}

/** 학생 답안 칸에 넘기는 조건(스펙 §2.9 학생 화면: 조건 문장·분량·형식만 + 답안 방식). 동사·배점·분류는 넘기지 않는다. */
export function studentConditions(item: AssessmentItem): { length: string; format: string; answer_mode: 'screen' | 'paper'; items: { no: number; text: string }[] } {
  const c = item.conditions
  return { length: c.length, format: c.format, answer_mode: c.answer_mode, items: c.items.map((x) => ({ no: x.no, text: x.text })) }
}
