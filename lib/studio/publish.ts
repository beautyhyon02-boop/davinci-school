import type { z } from 'zod'
import type { Material as MaterialSchema, Lesson as LessonSchema, Assessment as AssessmentSchema, TeacherGuide as TeacherGuideSchema } from './schemas'
import type { StageStatus } from './stages'

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
 * 같은 id가 있으면 세트 쪽이 이긴다(더 구체적인 세트 전용 자료로 덮어씀) — 결과는 id 오름차순으로 정렬한다.
 * cover.version은 "다음에 게시될 버전"(현재 버전 + 1)이다: 관리자 미리보기 탭도, 실제 게시 액션도 같은 값을 보게 하기 위함.
 */
export function buildSnapshot({
  theme,
  itemSet,
  standards,
}: {
  theme: { title: string; level: string; grade: number; intro: string | null; materials: MaterialT[] | null }
  itemSet: {
    subject: string
    level: string
    grade: number
    version: number | null
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
}): Snapshot {
  const merged = new Map<string, MaterialT>()
  for (const m of theme.materials ?? []) merged.set(m.id, m)
  for (const m of itemSet.materials ?? []) merged.set(m.id, m)
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
      version: (itemSet.version ?? 0) + 1,
      published_at: new Date().toISOString(),
    },
    standards,
    intro: theme.intro ?? '',
    reconstruction: itemSet.reconstruction ?? '',
    learning_goals: itemSet.learning_goals ?? [],
    key_question: itemSet.key_question ?? '',
    lessons: itemSet.lessons ?? [],
    materials,
    assessment: itemSet.assessment ?? null,
    teacher_guide: itemSet.teacher_guide ?? null,
    generated_with: { models },
  }
}
