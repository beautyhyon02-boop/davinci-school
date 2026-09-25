import type { z } from 'zod'
import type { Material, Lesson, Assessment, TeacherGuide, LearningGoal } from './schemas'
import { upgradeLessonV1, upgradeAssessmentV1, upgradeTeacherGuideV1, normalizeLessonsV2, cleanAssessmentConditions } from './compat'
import { sortAssessmentScales } from './scale'
import { syncAssessmentSessionMaterials } from './assessment-structure'

type MaterialT = z.infer<typeof Material>
type LessonT = z.infer<typeof Lesson>
type AssessmentT = z.infer<typeof Assessment>
type GuideT = z.infer<typeof TeacherGuide>
type LearningGoalT = z.infer<typeof LearningGoal>

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * 자료 한 개에 v2 기본값을 입힌다. 대주제 공유 자료(themes.materials)와 2A 시절 세트 자료는 v1 모양
 * (source '자작' 문자열, role·images 없음)으로 저장돼 있다. role 은 'context' 로 적힌 것만 context, 나머지는 raw.
 */
export function withMaterialDefaults(m: unknown): MaterialT {
  const raw = (isObj(m) ? m : {}) as Obj
  const src = isObj(raw.source) ? raw.source : null
  const source = src
    ? { kind: src.kind === '공개' ? '공개' as const : '자작' as const, attribution: typeof src.attribution === 'string' ? src.attribution : null, ai_assisted: src.ai_assisted === true }
    : { kind: '자작' as const, attribution: null, ai_assisted: false }
  return { ...(raw as unknown as MaterialT), source, role: raw.role === 'context' ? 'context' : 'raw', images: Array.isArray(raw.images) ? (raw.images as string[]) : [] }
}

const isV1Lesson = (l: unknown) => isObj(l) && isObj(l.flow) && typeof l.flow.intro === 'string'
const isV1Assessment = (a: unknown) => {
  if (!isObj(a)) return false
  if ('exemplars' in a) return true
  const first = Array.isArray(a.items) ? a.items[0] : null
  return isObj(first) && isObj(first.conditions) && 'required' in first.conditions
}
const isV1Guide = (g: unknown) => isObj(g) && !('grading_guide' in g)

type DraftColumns = {
  learning_goals: unknown; lessons: unknown; materials: unknown; assessment: unknown; teacher_guide: unknown
}

/**
 * 초안(item_sets 열)을 스냅샷으로 만들기 전에 v1 모양 조각만 v2 로 올린다(관리자 미리보기·게시 공용 가드).
 * 스펙 §4.3 은 초안을 다시 만드는 것이 원칙이지만, 다시 만들기 전 미리보기가 터지지 않아야 한다.
 * v2 조각은 같은 객체를 그대로 돌려준다. 게시 판(item_set_versions)은 compat.upgradeSnapshot 이 따로 올린다.
 */
export function upgradeDraftColumns(c: DraftColumns): {
  learning_goals: LearningGoalT[]; lessons: LessonT[]; materials: MaterialT[]; assessment: AssessmentT | null; teacher_guide: GuideT | null
} {
  const goalsRaw = Array.isArray(c.learning_goals) ? c.learning_goals : []
  const learning_goals = goalsRaw.some((g) => typeof g === 'string')
    ? goalsRaw.map((g) => (typeof g === 'string' ? { text: g, axis: '과정·기능' as const } : (g as LearningGoalT)))
    : (goalsRaw as LearningGoalT[])

  const guideRaw = c.teacher_guide
  const notesFor = (no: number) => (isObj(guideRaw) && Array.isArray(guideRaw.per_lesson)
    ? ((guideRaw.per_lesson as { no: number; notes: string[] }[]).find((p) => p.no === no)?.notes ?? [])
    : [])
  const lessonsRaw = Array.isArray(c.lessons) ? c.lessons : []
  const lessons = lessonsRaw.some(isV1Lesson)
    ? lessonsRaw.map((l) => (isV1Lesson(l) ? upgradeLessonV1(l as never, notesFor((l as { no: number }).no)) : (l as LessonT)))
    : normalizeLessonsV2(lessonsRaw as LessonT[])   // 2026-09-26 이전 v2 초안의 차시 라벨(문자열)·kind 없음 → 배열·kind(같으면 같은 배열)

  const materials = (Array.isArray(c.materials) ? c.materials : []).map(withMaterialDefaults)
  const assessmentRaw = c.assessment == null ? null : isV1Assessment(c.assessment) ? upgradeAssessmentV1(c.assessment as never, materials) : (c.assessment as AssessmentT)
  // v1 은 upgradeAssessmentV1 이 이미 조건을 정리한다 — v2 초안(2026-09-26 이전에 저장돼 풀이 힌트가 남았을 수 있음)은 여기서 한 번 더 본다(C-32)
  // 척도는 0점부터 오름차순으로 맞춘다(생성 AI가 만점부터 적은 초안이 있다 — lib/studio/scale.ts)
  const assessment = sortAssessmentScales(cleanAssessmentConditions(assessmentRaw, materials))
  // 단원 평가 차시 materials_used를 5단계 문항의 실제 자료로 맞춘다(오너 규칙 2026-09-26 보완) — 다시 생성하지 않은
  // 옛 초안(예: 영어 세트가 대주제 공유 자료 A~D를 그대로 실은 3단계)도 미리보기·게시 시점에 여기서 바로잡힌다.
  const syncedLessons = syncAssessmentSessionMaterials(lessons, assessment?.items ?? null)
  const teacher_guide = guideRaw == null ? null : isV1Guide(guideRaw) ? upgradeTeacherGuideV1(guideRaw as never, syncedLessons, assessment) : (guideRaw as GuideT)
  return { learning_goals, lessons: syncedLessons, materials, assessment, teacher_guide }
}
