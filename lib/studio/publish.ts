import type { z } from 'zod'
import { Materials, LessonDesign } from './schemas'
import type { Material as MaterialSchema, Lesson as LessonSchema, Assessment as AssessmentSchema, TeacherGuide as TeacherGuideSchema } from './schemas'
import type { StageStatus } from './stages'
import type { SnapshotV2, UnitPlanT, ReconstructedStandardT, LearningGoalT, NoticePlanT } from './compat'
export { upgradeSnapshot } from './compat'

/** 게시 판 스냅샷(v2). 모양은 compat.ts 에 정의되어 있다 — 옛 v1 판은 읽을 때 upgradeSnapshot 으로 올린다. */
export type Snapshot = SnapshotV2
export type PublishStandard = { code: string; text: string }

type MaterialT = z.infer<typeof MaterialSchema>
type LessonT = z.infer<typeof LessonSchema>
type AssessmentT = z.infer<typeof AssessmentSchema>
type TeacherGuideT = z.infer<typeof TeacherGuideSchema>

/**
 * 2A 시절에 저장된 materials/lessons 행에는 `images`(v2 에선 `role`·`merge_note`도) 키가 없다 — zod 기본값을 입혀
 * 화면(`m.images.length`)이 터지지 않게 한다. 스키마 자체를 벗어난 행(개수 제한 등)도 미리보기는 떠야 하므로
 * 그때는 기본값만 손으로 채워 그대로 통과시킨다.
 */
function materialsWithDefaults(items: MaterialT[] | null | undefined): MaterialT[] {
  const list = items ?? []
  const r = Materials.safeParse({ materials: list })
  return r.success ? r.data.materials : list.map((m) => ({ ...m, images: m.images ?? [], role: m.role ?? 'raw' }))
}
function lessonsWithDefaults(unitPlan: UnitPlanT | null, items: LessonT[] | null | undefined): LessonT[] {
  const list = items ?? []
  const r = LessonDesign.safeParse({ unit_plan: unitPlan, lessons: list })
  return r.success ? r.data.lessons : list.map((l) => ({ ...l, images: l.images ?? [], merge_note: l.merge_note ?? null }))
}

/** 게시 전에 확정돼 있어야 하는 단계(7 = 안내장 틀). */
export const PUBLISH_STAGES = [2, 3, 4, 5, 6, 7] as const

/**
 * 세트를 게시할 수 있는지 순수하게 판정한다. 반환하는 blockers는 화면 문구 키(app.studio.publish.blockers)이며
 * 여기서 직접 한국어 문구를 만들지 않는다 — 문구는 content/site.ts에서만 고친다는 프로젝트 규칙 때문.
 * - 2~7단계가 모두 accepted 여야 한다.
 * - 연결된 성취기준이 전부 원문 검증(verified)되어야 한다.
 * - 핵심질문(keyQuestion)이 정해져 있어야 한다.
 */
export function canPublish({
  statuses,
  standards,
  keyQuestion,
}: {
  statuses: Record<string, StageStatus | undefined>
  standards: { code: string; verified: boolean }[]
  keyQuestion: string | null | undefined
}): { ok: boolean; blockers: string[] } {
  const blockers: string[] = []
  for (const stage of PUBLISH_STAGES) if (statuses[`stage${stage}`]?.state !== 'accepted') blockers.push(`stageNotAccepted:${stage}`)
  for (const standard of standards) if (!standard.verified) blockers.push(`unverifiedStandard:${standard.code}`)
  if (!keyQuestion || !keyQuestion.trim()) blockers.push('noKeyQuestion')
  return { ok: blockers.length === 0, blockers }
}

/** 문항 카드들이 참고한 공개 자료(예시 은행 id·출처)의 합집합. 같은 id 는 한 번만, id 오름차순. */
export function collectReferences(assessment: AssessmentT | null): { id: string; source: string }[] {
  const map = new Map<string, string>()
  for (const it of assessment?.items ?? []) for (const r of it.references ?? []) map.set(r.id, r.source)
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => ({ id, source }))
}

/**
 * 게시용 버전 스냅샷(v2)을 만든다. 자료는 대주제 공유 자료(theme.materials)와 세트 자료(itemSet.materials)를 id로 병합하되,
 * 같은 id가 있으면 대주제(공유) 자료가 이긴다(겹치는 세트 자료는 버린다) — 결과는 id 오름차순으로 정렬한다.
 * cover.version은 호출자가 넘긴다 — 다음 게시 버전 번호는 item_set_versions의 최댓값+1로 정하는데(고아 행에서도
 * 자연히 회복되도록), 그 계산은 이 함수의 책임이 아니라 publishItemSet/미리보기 화면이 DB를 조회해서 결정한다.
 */
export function buildSnapshot({ theme, itemSet, standards, version }: {
  theme: { title: string; level: string; grade: number; intro: string | null; materials: MaterialT[] | null }
  itemSet: {
    subject: string; level: string; grade: number
    reconstruction: string | null; reconstruction_detail: ReconstructedStandardT[] | null; learning_goals: LearningGoalT[] | null; key_question: string | null
    unit_plan: UnitPlanT | null; lessons: LessonT[] | null; materials: MaterialT[] | null; assessment: AssessmentT | null
    teacher_guide: TeacherGuideT | null; notice_plan: NoticePlanT | null; stage_status: Record<string, StageStatus | undefined> | null
  }
  standards: PublishStandard[]
  version: number
}): Snapshot {
  // 같은 id 가 겹치면 대주제(공유) 자료가 이긴다 — 스펙 §1 대로 한 대주제의 모든 과목이 자료 A~D 를 공유하므로,
  // 세트 자료가 같은 글자를 다시 쓰면 공유 자료가 조용히 사라지는 대신 세트 쪽을 버린다.
  const merged = new Map<string, MaterialT>()
  for (const m of materialsWithDefaults(theme.materials)) merged.set(m.id, m)
  for (const m of materialsWithDefaults(itemSet.materials)) if (!merged.has(m.id)) merged.set(m.id, m)
  const materials = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))
  const models = Array.from(new Set(Object.values(itemSet.stage_status ?? {}).map((s) => s?.model).filter((m): m is string => !!m)))
  return {
    schema_version: 2,
    cover: { title: theme.title, subject: itemSet.subject, level: theme.level, grade: theme.grade, version, published_at: new Date().toISOString() },
    standards,
    intro: theme.intro ?? '',
    reconstruction: itemSet.reconstruction ?? '',
    reconstruction_detail: itemSet.reconstruction_detail ?? [],
    learning_goals: itemSet.learning_goals ?? [],
    key_question: itemSet.key_question ?? '',
    unit_plan: itemSet.unit_plan ?? null,
    lessons: lessonsWithDefaults(itemSet.unit_plan ?? null, itemSet.lessons),
    materials,
    assessment: itemSet.assessment ?? null,
    teacher_guide: itemSet.teacher_guide ?? null,
    notice_plan: itemSet.notice_plan ?? null,
    references: collectReferences(itemSet.assessment ?? null),
    generated_with: { models },
  }
}
