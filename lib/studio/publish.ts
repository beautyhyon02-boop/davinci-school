import type { z } from 'zod'
import { Materials, Lessons } from './schemas'
import type { Material as MaterialSchema, Lesson as LessonSchema, Assessment as AssessmentSchema, TeacherGuide as TeacherGuideSchema } from './schemas'
import type { StageStatus } from './stages'

/**
 * 2A 시절에 저장된 materials/lessons 행에는 `images` 키가 없다 — zod 기본값(`images: []`)을 입혀
 * 화면(`m.images.length`)이 터지지 않게 한다. 스키마 자체를 벗어난 행(개수 제한 등)도 미리보기는 떠야 하므로
 * 그때는 기본값만 손으로 채워 그대로 통과시킨다.
 */
function withImageDefaults<T extends { images?: string[] }>(
  items: T[] | null | undefined,
  schema: typeof Materials | typeof Lessons,
  key: 'materials' | 'lessons',
): T[] {
  const list = items ?? []
  const r = schema.safeParse({ [key]: list })
  if (r.success) return (r.data as Record<string, unknown>)[key] as T[]
  return list.map((it) => ({ ...it, images: it.images ?? [] }))
}

type MaterialT = z.infer<typeof MaterialSchema>
type LessonT = z.infer<typeof LessonSchema>
type AssessmentT = z.infer<typeof AssessmentSchema>
type TeacherGuideT = z.infer<typeof TeacherGuideSchema>

export type PublishStandard = { code: string; text: string }

export type Snapshot = {
  cover: {
    title: string
    subject: string
    level: string
    grade: number
    unit?: string
    version: number
    published_at: string
  }
  standards: PublishStandard[]
  intro: string
  reconstruction: string
  learning_goals: string[]
  key_question: string
  lessons: LessonT[]
  materials: MaterialT[]
  assessment: AssessmentT | null
  teacher_guide: TeacherGuideT | null
  generated_with: { models: string[] }
}

/**
 * 세트를 게시할 수 있는지 순수하게 판정한다. 반환하는 blockers는 화면 문구 키(app.studio.publish.blockers)이며
 * 여기서 직접 한국어 문구를 만들지 않는다 — 문구는 content/site.ts에서만 고친다는 프로젝트 규칙 때문.
 * - 2~6단계가 모두 accepted 여야 한다.
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

  for (let stage = 2; stage <= 6; stage++) {
    if (statuses[`stage${stage}`]?.state !== 'accepted') blockers.push(`stageNotAccepted:${stage}`)
  }

  for (const standard of standards) {
    if (!standard.verified) blockers.push(`unverifiedStandard:${standard.code}`)
  }

  if (!keyQuestion || !keyQuestion.trim()) blockers.push('noKeyQuestion')

  return { ok: blockers.length === 0, blockers }
}

/**
 * 게시용 버전 스냅샷을 만든다. 자료는 대주제 공유 자료(theme.materials)와 세트 자료(itemSet.materials)를 id로 병합하되,
 * 같은 id가 있으면 대주제(공유) 자료가 이긴다(겹치는 세트 자료는 버린다) — 결과는 id 오름차순으로 정렬한다.
 * cover.version은 호출자가 넘긴다 — 다음 게시 버전 번호는 item_set_versions의 최댓값+1로 정하는데(고아 행에서도
 * 자연히 회복되도록), 그 계산은 이 함수의 책임이 아니라 publishItemSet/미리보기 화면이 DB를 조회해서 결정한다.
 */
export function buildSnapshot({
  theme,
  itemSet,
  standards,
  version,
}: {
  theme: { title: string; level: string; grade: number; intro: string | null; materials: MaterialT[] | null }
  itemSet: {
    subject: string
    level: string
    grade: number
    reconstruction: string | null
    learning_goals: string[] | null
    key_question: string | null
    lessons: LessonT[] | null
    materials: MaterialT[] | null
    assessment: AssessmentT | null
    teacher_guide: TeacherGuideT | null
    stage_status: Record<string, StageStatus | undefined> | null
  }
  standards: PublishStandard[]
  version: number
}): Snapshot {
  // 같은 id 가 겹치면 대주제(공유) 자료가 이긴다 — 스펙 §1 대로 한 대주제의 모든 과목이 자료 A~D 를 공유하므로,
  // 세트 자료가 같은 글자를 다시 쓰면 공유 자료가 조용히 사라지는 대신 세트 쪽을 버린다.
  const merged = new Map<string, MaterialT>()
  for (const m of withImageDefaults(theme.materials, Materials, 'materials')) merged.set(m.id, m)
  for (const m of withImageDefaults(itemSet.materials, Materials, 'materials')) {
    if (!merged.has(m.id)) merged.set(m.id, m)
  }
  const materials = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))

  const models = Array.from(
    new Set(
      Object.values(itemSet.stage_status ?? {})
        .map((s) => s?.model)
        .filter((m): m is string => !!m),
    ),
  )

  return {
    cover: {
      title: theme.title,
      subject: itemSet.subject,
      level: theme.level,
      grade: theme.grade,
      version,
      published_at: new Date().toISOString(),
    },
    standards,
    intro: theme.intro ?? '',
    reconstruction: itemSet.reconstruction ?? '',
    learning_goals: itemSet.learning_goals ?? [],
    key_question: itemSet.key_question ?? '',
    lessons: withImageDefaults(itemSet.lessons, Lessons, 'lessons'),
    materials,
    assessment: itemSet.assessment ?? null,
    teacher_guide: itemSet.teacher_guide ?? null,
    generated_with: { models },
  }
}
