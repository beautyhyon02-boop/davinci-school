import type { z } from 'zod'
import type { SnapshotV2, ReconstructedStandardT, LearningGoalT, NoticePlanT } from '@/lib/studio/compat'
import type { Lesson, Material, AssessmentItem, TeacherGuide } from '@/lib/studio/schemas'
import { isAssessmentSession, lessonAssessments } from '@/lib/studio/assessment-structure'
import { itemMaterialLabels, type ItemMaterialLabel } from '@/lib/studio/item-materials'
import { visibleCriteria, type VisibleCriterion } from '@/components/studio/parts/ItemCriteria'
import { app } from '@/content/site'

// 제본용 교재 판 짜기(설계 docs/superpowers/specs/2026-10-01-booklet-design.md §2·§5) — 게시 판 스냅숏(SnapshotV2)만 읽는 순수 함수.
// 학생용 교재('student')는 정답·해설·채점표 서술·예시답안·수준 지도·출제 의도·발문·역량 꼬리표·번역을 **판 자체에 싣지 않는다**(구조로 보장) —
// 학생용 플랜의 퀴즈에는 answer/explanation 칸이 없고, 활동지 과제에는 expected 가 없으며, 문항에는 teacher 조각이 없다.
// 교사용 지도서('teacher')는 모두 싣는다. 옛 판(v1 → upgradeSnapshot)도 있는 것만 그린다 — 빠진 칸은 빈 배열·null.
// 쪽 번호는 서버에서 셀 수 없다(브라우저가 인쇄할 때 매긴다, app/globals.css @page book) — 차례는 절 제목을 순서대로만 적는다.

type LessonT = z.infer<typeof Lesson>
type MaterialT = z.infer<typeof Material>
type ItemT = z.infer<typeof AssessmentItem>
type GuideT = z.infer<typeof TeacherGuide>
type QuizT = LessonT['formative_check']['quiz'][number]
type TaskT = LessonT['worksheet']['tasks'][number]

export type BookKind = 'student' | 'teacher'
export type BookSectionKind = 'cover' | 'toc' | 'unit' | 'plan' | 'lesson' | 'assessment' | 'guide' | 'notice' | 'back'
/** 절 하나 — id 는 안정적(표지 'cover', 차례 'toc', 차시 'lesson-3', …). 차례(toc)는 cover·toc 를 뺀 나머지 절을 순서대로 싣는다. */
export type BookSection = { id: string; kind: BookSectionKind; title: string; lessonNo?: number }

/** 퀴즈 한 문항 — 학생용 판에는 answer·explanation·competency·level_ref 가 없다(빼고 만든다). */
export type BookQuiz = { q: string; type: string; choices: string[] | null; answer?: string; explanation?: string; competency?: string; level_ref?: string }
/** 활동지 과제 — 학생용 판에는 expected·flaw_check(결함 찾기 표시, L-19)가 없다. */
export type BookTask = { no: number; prompt: string; tier: string; level_ref: string; answer_space: TaskT['answer_space']; expected?: string; flaw_check?: boolean }
export type BookScriptQuestion = { prompt: string; expected_answer: string; if_stuck: string }
/** 확인·피드백 계획(L-20, 2026-10-01) — 교사용. */
export type BookFeedbackPlan = { who: string; how: string; sentence_frame: string | null }

/** 교사용 지도서에만 싣는 차시 조각(수업 흐름·발문·준비물·유의점·지침서 메모·확인·피드백 계획). 학생용 판에는 없다. */
export type LessonTeacherPart = {
  standards: string[]
  time_budget: LessonT['time_budget'] | null
  flow: LessonT['flow'] | null
  script: BookScriptQuestion[]
  needed: string[]
  cautions: string[]
  guideNotes: string[]
  mergeNote: string | null
  mergeableWith: number | null
  assessment: string[]
  feedbackPlan: BookFeedbackPlan | null
}
export type BookLesson = {
  no: number
  title: string
  topic: string
  goal: string
  keyQuestion: string
  materials: MaterialT[]
  images: string[]
  tasks: BookTask[]
  selfCheck: string[]
  /** 마지막 교수 차시의 자기 점검표(L-21): 단원 평가 채점 요소의 이름만 — 학생용 판에도 실린다(설계상 학생이 읽는 것). 다른 차시·옛 판은 빈 배열. */
  selfCheckList: string[]
  quiz: BookQuiz[]
  teacher?: LessonTeacherPart
}

export type BookCondition = { no: number; text: string; points: number | null; category: string }
/** 교사용 지도서에만 싣는 문항 조각(채점표·예시답안·수준 지도·출제 의도·과제 상황). 학생용 판에는 없다. */
export type ItemTeacherPart = {
  evaluation_elements: string[]
  situation: ItemT['situation']
  rubric: ItemT['rubric']
  exemplar_answers: ItemT['exemplar_answers']
  level_map: ItemT['level_map']
  min_competency: string | null
  lesson_no: number
}
export type BookItem = {
  no: number
  kind: ItemT['kind']
  points: number
  stem: string
  materials: { label: ItemMaterialLabel; material: MaterialT | null }[]
  conditions: { items: BookCondition[]; length: string; format: string; overflow_rule: string | null; answer_mode: 'screen' | 'paper' }
  /** 학생에게 보이는 평가 요소(이름·만점)만 — 척도 서술은 teacher.rubric 에만 */
  criteria: VisibleCriterion[]
  /** 답란 줄 수(서술형 10·논술형 20). 종이 답안 문항은 null(네모 칸). */
  answerLines: number | null
  teacher?: ItemTeacherPart
}
export type BookAssessment = {
  items: BookItem[]
  /** 교사용만: 단원 평가 차시(kind 'assessment', 수업 흐름·유의점 — 발문의 예상 답이 있어 학생용 판에는 싣지 않는다)·등급표·피드백 틀. */
  teacher?: {
    session: LessonT | null
    grade_boundaries: NonNullable<SnapshotV2['assessment']>['grade_boundaries'] | null
    feedback_templates: NonNullable<SnapshotV2['assessment']>['feedback_templates'] | null
  }
}
/** 교사용 단원 계획의 차시 구성표 한 줄(차시·주제·자료·평가/퀴즈·길러 주는 평가 요소(L-17, 없으면 null)). */
export type PlanRow = { no: number; topic: string; materials: string[]; assessment: string[]; quizCount: number; criteria: string[] | null }

export type BookPlan = {
  kind: BookKind
  cover: SnapshotV2['cover'] & { setTitle: string | null }
  sections: BookSection[]
  toc: BookSection[]
  keyQuestion: string
  learningGoals: LearningGoalT[]
  /** 이 단원의 평가 요소(문항별, 학생에게 보이는 이름·만점) */
  criteriaByItem: { itemNo: number; kind: ItemT['kind']; criteria: VisibleCriterion[] }[]
  lessons: BookLesson[]
  assessment: BookAssessment | null
  sharedIds: string[]
  /** 영어 세트(공동 자료의 영어판이 하나라도 있으면) */
  isEnglish: boolean
  /** 교사용만: 성취기준·재구성·차시 구성표·지침서·안내장 틀. 학생용 판에는 없다. */
  teacher?: {
    standards: SnapshotV2['standards']
    reconstruction: string
    reconstructionDetail: ReconstructedStandardT[]
    /** 세트 범위 메모(L-16) — 그 뒤에 게시된 판에만. */
    scopeNote: string | null
    planRows: PlanRow[]
    formative: string | null
    guide: GuideT | null
    noticePlan: NoticePlanT | null
  }
}

/** 문제지와 같은 답란 줄 수(components/studio/PackageView ANSWER_LINES 와 같다 — tests/book-plan.test.ts 가 대조). */
export const BOOK_ANSWER_LINES = { 서술형: 10, 논술형: 20 } as const

const copy = app.book
const arr = <T,>(v: readonly T[] | null | undefined): T[] => (Array.isArray(v) ? [...v] : [])

/**
 * 영어 세트(S-영-09): 공동 자료의 영어판(english_version_of = 원본 ID)이 있으면 원본 대신 영어판만 — 차시·문항이 원본과 영어판을
 * 둘 다 적었으면 영어판만 남고, 원본만 적었어도 영어판으로 바꾼다(학생에게 한국어 원본을 주지 않는다). 순서는 처음 나온 자리를 지키고
 * 같은 ID 는 한 번만. 영어판이 없는 세트(수학·과학)는 그대로다.
 */
export function substituteEnglishVersions(ids: readonly unknown[] | null | undefined, materials: MaterialT[]): string[] {
  const englishOf = new Map<string, string>()
  for (const m of materials) if (typeof m.english_version_of === 'string' && m.english_version_of !== '') englishOf.set(m.english_version_of, m.id)
  const out: string[] = []
  for (const raw of arr(ids)) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const id = englishOf.get(raw) ?? raw
    if (!out.includes(id)) out.push(id)
  }
  return out
}

const materialsFor = (ids: readonly unknown[] | null | undefined, materials: MaterialT[]): MaterialT[] => {
  const byId = new Map(materials.map((m) => [m.id, m]))
  return substituteEnglishVersions(ids, materials).map((id) => byId.get(id)).filter((m): m is MaterialT => !!m)
}

function quizFor(l: LessonT, kind: BookKind): BookQuiz[] {
  return arr(l.formative_check?.quiz).map((q: QuizT) => {
    const base: BookQuiz = { q: q.q, type: q.type, choices: Array.isArray(q.choices) ? q.choices : null }
    if (kind === 'student') return base
    return { ...base, answer: q.answer, explanation: q.explanation, competency: q.competency, level_ref: q.level_ref }
  })
}

function tasksFor(l: LessonT, kind: BookKind): BookTask[] {
  return arr(l.worksheet?.tasks).map((w: TaskT) => {
    const base: BookTask = { no: w.no, prompt: w.prompt, tier: w.tier, level_ref: w.level_ref, answer_space: w.answer_space }
    return kind === 'student' ? base : { ...base, expected: w.expected, ...(w.flaw_check ? { flaw_check: true } : {}) }
  })
}

function lessonFor(l: LessonT, s: SnapshotV2, kind: BookKind): BookLesson {
  const topic = l.topic ?? ''
  const base: BookLesson = {
    no: l.no, title: copy.lesson.heading(l.no, topic), topic, goal: l.goal ?? '', keyQuestion: l.key_question ?? '',
    materials: materialsFor(l.materials_used, s.materials), images: arr(l.images),
    tasks: tasksFor(l, kind), selfCheck: arr(l.worksheet?.self_check), selfCheckList: arr(l.self_check), quiz: quizFor(l, kind),
  }
  if (kind === 'student') return base
  const notes = arr(s.teacher_guide?.per_lesson).find((p) => p.no === l.no)?.notes ?? []
  const fp = l.feedback_plan
  const teacher: LessonTeacherPart = {
    standards: arr(l.standards), time_budget: l.time_budget ?? null, flow: l.flow ?? null,
    script: arr(l.teacher_script?.questions).map((q) => ({ prompt: q.prompt, expected_answer: q.expected_answer, if_stuck: q.if_stuck })),
    needed: arr(l.materials_needed), cautions: arr(l.caution_notes), guideNotes: arr(notes),
    mergeNote: l.merge_note ?? null, mergeableWith: l.mergeable_with ?? null, assessment: lessonAssessments(l),
    feedbackPlan: fp ? { who: fp.who, how: fp.how, sentence_frame: fp.sentence_frame ?? null } : null,
  }
  return { ...base, teacher }
}

function itemFor(it: ItemT, no: number, s: SnapshotV2, kind: BookKind): BookItem {
  const byId = new Map(s.materials.map((m) => [m.id, m]))
  const used = substituteEnglishVersions(it.materials_used, s.materials)
  const materials = itemMaterialLabels({ materials_used: used }).map((label) => ({ label, material: byId.get(label.id) ?? null }))
  const c = it.conditions
  const base: BookItem = {
    no, kind: it.kind, points: it.points, stem: it.stem, materials,
    conditions: {
      items: arr(c?.items).map((x) => ({ no: x.no, text: x.text, points: x.points ?? null, category: x.category })),
      length: c?.length ?? '', format: c?.format ?? '', overflow_rule: c?.overflow_rule ?? null, answer_mode: c?.answer_mode === 'paper' ? 'paper' : 'screen',
    },
    criteria: visibleCriteria(it.rubric),
    answerLines: c?.answer_mode === 'paper' ? null : (BOOK_ANSWER_LINES[it.kind] ?? BOOK_ANSWER_LINES.서술형),
  }
  if (kind === 'student') return base
  const teacher: ItemTeacherPart = {
    evaluation_elements: arr(it.evaluation_elements), situation: it.situation ?? null, rubric: it.rubric,
    exemplar_answers: arr(it.exemplar_answers), level_map: arr(it.level_map) as ItemT['level_map'], min_competency: it.min_competency ?? null, lesson_no: it.lesson_no,
  }
  return { ...base, teacher }
}

/** 교사용 단원 계획 차시 구성표: 차시마다 주제·자료(영어판 치환 뒤)·평가 라벨·퀴즈 수. */
export function planRowsFor(s: SnapshotV2): PlanRow[] {
  const map = arr(s.unit_plan?.lesson_map)
  return arr(s.lessons).map((l) => {
    const focus = map.find((m) => m.lesson_no === l.no)?.criteria_focus
    return {
      no: l.no, topic: l.topic ?? '', materials: substituteEnglishVersions(l.materials_used, s.materials),
      assessment: lessonAssessments(l), quizCount: arr(l.formative_check?.quiz).length,
      criteria: Array.isArray(focus) ? [...focus] : null,
    }
  })
}

/** 세트가 영어 세트인가 — 공동 자료의 영어판(english_version_of)이 하나라도 실려 있으면. */
export const isEnglishSet = (s: Pick<SnapshotV2, 'materials' | 'cover'>): boolean =>
  s.cover.subject === '영어' || arr(s.materials).some((m) => typeof m.english_version_of === 'string' && m.english_version_of !== '')

/**
 * 스냅숏 → 교재 판. 절 순서(설계 §2):
 * 학생용 — 표지 → 차례 → 이 단원에서 → 차시마다(교수 차시) → 단원 평가 → 뒤표지.
 * 교사용 — 표지(교사용) → 차례 → 단원 계획 → 차시마다 → 단원 평가 → 교사용 지침 전체 → 안내장 틀.
 * 단원 평가 차시(kind 'assessment' — 옛 판의 논술형 차시 포함)는 차시 절이 아니라 단원 평가 절에 들어간다.
 */
export function buildBookPlan(s: SnapshotV2, kind: BookKind): BookPlan {
  const lessonsAll = arr(s.lessons)
  const teaching = lessonsAll.filter((l) => !isAssessmentSession(l))
  const session = lessonsAll.find(isAssessmentSession) ?? null
  const lessons = teaching.map((l) => lessonFor(l, s, kind))
  const items = arr(s.assessment?.items).map((it, i) => itemFor(it, i + 1, s, kind))
  const hasAssessment = !!s.assessment || session !== null
  const assessment: BookAssessment | null = !hasAssessment ? null
    : kind === 'student' ? { items }
    : { items, teacher: { session, grade_boundaries: s.assessment ? arr(s.assessment.grade_boundaries) : null, feedback_templates: s.assessment?.feedback_templates ?? null } }

  const sections: BookSection[] = [{ id: 'cover', kind: 'cover', title: copy.kindTitle[kind] }, { id: 'toc', kind: 'toc', title: copy.toc.heading }]
  if (kind === 'student') sections.push({ id: 'unit', kind: 'unit', title: copy.unit.heading })
  else sections.push({ id: 'plan', kind: 'plan', title: copy.plan.heading })
  for (const l of lessons) sections.push({ id: `lesson-${l.no}`, kind: 'lesson', title: l.title, lessonNo: l.no })
  if (assessment) sections.push({ id: 'assessment', kind: 'assessment', title: copy.assessment.heading })
  if (kind === 'teacher') {
    if (s.teacher_guide) sections.push({ id: 'guide', kind: 'guide', title: copy.guide.heading })
    if (s.notice_plan) sections.push({ id: 'notice', kind: 'notice', title: copy.notice.heading })
  } else sections.push({ id: 'back', kind: 'back', title: copy.back.heading })

  const plan: BookPlan = {
    kind,
    cover: { ...s.cover, setTitle: s.unit_plan?.set_title ?? null },
    sections,
    toc: sections.filter((x) => x.kind !== 'cover' && x.kind !== 'toc' && x.kind !== 'back'),
    keyQuestion: s.key_question ?? '',
    learningGoals: arr(s.learning_goals),
    criteriaByItem: items.map((it) => ({ itemNo: it.no, kind: it.kind, criteria: it.criteria })),
    lessons, assessment,
    sharedIds: arr(s.shared_material_ids),
    isEnglish: isEnglishSet(s),
  }
  if (kind === 'student') return plan
  return {
    ...plan,
    teacher: {
      standards: arr(s.standards), reconstruction: s.reconstruction ?? '', reconstructionDetail: arr(s.reconstruction_detail),
      scopeNote: typeof s.scope_note === 'string' && s.scope_note.trim() ? s.scope_note : null,
      planRows: planRowsFor(s), formative: s.unit_plan?.assessment_plan?.formative ?? null,
      guide: s.teacher_guide ?? null, noticePlan: s.notice_plan ?? null,
    },
  }
}
