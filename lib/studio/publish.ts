import type { z } from 'zod'
import { Materials, LessonDesign, isShortQuiz } from './schemas'
import type { Material as MaterialSchema, Lesson as LessonSchema, Assessment as AssessmentSchema, TeacherGuide as TeacherGuideSchema } from './schemas'
import type { StageStatus } from './stages'
import type { SnapshotV2, UnitPlanT, ReconstructedStandardT, LearningGoalT, NoticePlanT } from './compat'
import { upgradeSnapshot as upgradeSnapshotCompat } from './compat'
import { withMaterialDefaults, upgradeDraftColumns } from './draft-defaults'

/** 게시 판 스냅샷(v2). 모양은 compat.ts 에 정의되어 있다 — 옛 v1 판은 읽을 때 upgradeSnapshot 으로 올린다. */
export type Snapshot = SnapshotV2
export type PublishStandard = { code: string; text: string }

/**
 * 게시 판 읽기 입구(스펙 §4.3). v1 판은 compat 이 v2 로 올리고, v2 판이라도 대주제 공유 자료가 v1 모양(source 문자열)으로
 * 실린 채 게시됐을 수 있으므로 자료에 v2 기본값을 입힌다. 고칠 것이 없으면 같은 객체를 돌려준다.
 */
export function upgradeSnapshot(raw: unknown): Snapshot {
  const s = upgradeSnapshotCompat(raw)
  const broken = (m: MaterialT) => typeof m.source !== 'object' || m.source === null || !m.role || !Array.isArray(m.images)
  if (!(s.materials ?? []).some(broken)) return s
  // 고칠 자료만 새 객체로, 멀쩡한 v2 자료는 같은 객체 그대로
  return { ...s, materials: s.materials.map((m) => (broken(m) ? withMaterialDefaults(m) : m)) }
}

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
  const list = (items ?? []).map(withMaterialDefaults)
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
 * - 2~7단계가 모두 accepted([확인]) 여야 한다. 검토 결과·자동 검사 메모는 보지 않는다(대표 결정 2026-09-26: 검토는 참고).
 * - 연결된 성취기준이 전부 원문 검증(verified)되어야 한다.
 * - 핵심질문(keyQuestion)이 정해져 있어야 한다.
 * - 초안 차시(item_sets.lessons)의 퀴즈가 모두 단답형이어야 한다(대표 2026-09-26: 객관식 폐지) — 그 전에 3단계를 확정한 초안에
 *   선택형이 남아 있으면 차시마다 quizChoice:<차시 번호>. 게시 판(item_set_versions)은 보지 않는다(옛 판의 선택형은 그대로 읽힌다).
 */
export type DraftLessonQuizzes = { no: number; formative_check?: { quiz?: { type: string; choices: unknown }[] | null } | null }
export function canPublish({
  statuses,
  standards,
  keyQuestion,
  lessons = [],
}: {
  statuses: Record<string, StageStatus | undefined>
  standards: { code: string; verified: boolean }[]
  keyQuestion: string | null | undefined
  /** 초안 차시(3단계 출력이 저장된 item_sets.lessons). 없으면(null) 퀴즈 검사를 건너뛴다 — 3단계 미확정은 stageNotAccepted 가 막는다. */
  lessons?: DraftLessonQuizzes[] | null
}): { ok: boolean; blockers: string[] } {
  const blockers: string[] = []
  for (const stage of PUBLISH_STAGES) if (statuses[`stage${stage}`]?.state !== 'accepted') blockers.push(`stageNotAccepted:${stage}`)
  for (const standard of standards) if (!standard.verified) blockers.push(`unverifiedStandard:${standard.code}`)
  if (!keyQuestion || !keyQuestion.trim()) blockers.push('noKeyQuestion')
  for (const lesson of Array.isArray(lessons) ? lessons : []) {
    if ((lesson.formative_check?.quiz ?? []).some((q) => !isShortQuiz(q))) blockers.push(`quizChoice:${lesson.no}`)
  }
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
  /** grade null = 학년 지정 안 함 — 표지(cover.grade)에도 null 로 남는다(화면은 '중학교(1~3학년군)'). */
  theme: { title: string; level: string; grade: number | null; intro: string | null; materials: MaterialT[] | null }
  itemSet: {
    subject: string; level: string; grade: number | null
    reconstruction: string | null; reconstruction_detail: ReconstructedStandardT[] | null; learning_goals: LearningGoalT[] | null; key_question: string | null
    unit_plan: UnitPlanT | null; lessons: LessonT[] | null; materials: MaterialT[] | null; assessment: AssessmentT | null
    teacher_guide: TeacherGuideT | null; notice_plan: NoticePlanT | null; stage_status: Record<string, StageStatus | undefined> | null
  }
  standards: PublishStandard[]
  version: number
}): Snapshot {
  // 0011 이전 초안 열은 v1 모양일 수 있다 — v1 조각만 v2 로 올린다(v2 는 그대로). 미리보기가 터지지 않게 하는 가드.
  const up = upgradeDraftColumns(itemSet)
  // 같은 id 가 겹치면 대주제(공유) 자료가 이긴다 — 스펙 §1 대로 한 대주제의 모든 과목이 자료 A~D 를 공유하므로,
  // 세트 자료가 같은 글자를 다시 쓰면 공유 자료가 조용히 사라지는 대신 세트 쪽을 버린다.
  const merged = new Map<string, MaterialT>()
  for (const m of materialsWithDefaults(theme.materials)) merged.set(m.id, m)
  for (const m of materialsWithDefaults(up.materials)) if (!merged.has(m.id)) merged.set(m.id, m)
  const materials = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))
  const models = Array.from(new Set(Object.values(itemSet.stage_status ?? {}).map((s) => s?.model).filter((m): m is string => !!m)))
  return {
    schema_version: 2,
    cover: { title: theme.title, subject: itemSet.subject, level: theme.level, grade: theme.grade ?? null, version, published_at: new Date().toISOString() },
    standards,
    intro: theme.intro ?? '',
    reconstruction: itemSet.reconstruction ?? '',
    reconstruction_detail: itemSet.reconstruction_detail ?? [],
    learning_goals: up.learning_goals,
    key_question: itemSet.key_question ?? '',
    unit_plan: itemSet.unit_plan ?? null,
    lessons: lessonsWithDefaults(itemSet.unit_plan ?? null, up.lessons),
    materials,
    assessment: up.assessment,
    teacher_guide: up.teacher_guide,
    notice_plan: itemSet.notice_plan ?? null,
    references: collectReferences(up.assessment),
    generated_with: { models },
  }
}
