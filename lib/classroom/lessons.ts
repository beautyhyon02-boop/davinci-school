import type { Snapshot } from '@/lib/studio/publish'
import { itemLabels, lessonAssessments, isAssessmentSession } from '@/lib/studio/assessment-structure'
type AssessmentItem = NonNullable<Snapshot['assessment']>['items'][number]

/**
 * 문항 번호(1-based) = assessment.items 순서. 지금 구조(대표 2026-09-26)는 1 = 서술형, 2 = 논술형이고 둘 다 마지막 교수 차시 뒤
 * 단원 평가 차시에 있다. 옛 판(서술형 2 + 논술형)은 1·2·3 그대로다 — 학생 답안(answers.item_no)이 이 번호에 묶여 있다.
 */

/** 문항 라벨(화면 표시): 지금 구조는 '서술형'·'논술형', 옛 판은 '서술형1'·'서술형2'·'논술형'. */
export function itemLabel(snapshot: Snapshot, itemNo: number): string {
  const items = snapshot.assessment?.items ?? []
  return itemLabels(items)[itemNo - 1] ?? ''
}

/**
 * 이 차시에 배치된 문항 번호들(1-based, 오름차순). items[i].lesson_no 로 찾고, 없으면 차시 라벨(lessons[].assessment)을
 * 문항 라벨(itemLabels)과 맞춘다 — 단원 평가 차시는 [서술형, 논술형] 두 개, 교수 차시는 보통 빈 배열.
 */
export function itemNosForLesson(snapshot: Snapshot, lessonNo: number): number[] {
  const items = snapshot.assessment?.items ?? []
  const byLesson = items.flatMap((it, i) => (it.lesson_no === lessonNo ? [i + 1] : []))
  if (byLesson.length) return byLesson
  const lesson = snapshot.lessons.find((l) => l.no === lessonNo)
  if (!lesson) return []
  const labels = itemLabels(items)
  return lessonAssessments(lesson).flatMap((label) => { const i = labels.indexOf(label); return i >= 0 ? [i + 1] : [] })
}

export function lessonNoForItem(snapshot: Snapshot, itemNo: number): number {
  const item = snapshot.assessment?.items[itemNo - 1]
  if (item?.lesson_no) return item.lesson_no
  const label = itemLabel(snapshot, itemNo)
  return snapshot.lessons.find((l) => lessonAssessments(l).includes(label))?.no ?? snapshot.lessons.length
}

export function isLessonOpen(openLessons: number, lessonNo: number): boolean {
  return lessonNo >= 1 && lessonNo <= openLessons
}

/**
 * 차시가 쓰는 자료 ID(v2 materials_used, 중복 제거·오름차순). 준비물(materials_needed)은 자료가 아니다.
 * 단원 평가 차시는 그 차시에 있는 문항들이 쓰는 자료도 합친다(학생이 답을 쓰며 자료를 다시 본다).
 */
export function materialIdsForLesson(lesson: { materials_used: string[]; kind?: string }, items: { materials_used: string[] }[] = []): string[] {
  const fromItems = isAssessmentSession(lesson) ? items.flatMap((i) => i.materials_used) : []
  return [...new Set([...lesson.materials_used, ...fromItems])].sort()
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
