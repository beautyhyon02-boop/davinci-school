// 단원 리포트 테스트용 입력 — mock fixture(data/studio-fixtures, 읽기만)로 조립한 v2 스냅샷과 기본 한국어 문구.
// 실제 화면 문구는 content/site.ts 가 갖는다(5번 작업) — 여기 문구는 테스트 전용이다.
import { readFileSync } from 'node:fs'
import { upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'
import type { UnitReportCopy, ReportSubjectInput, ReportQuizInput, ReportGradingInput } from '@/lib/classroom/report'
import type { Competency } from '@/lib/studio/competency'

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const reportCopy: UnitReportCopy = {
  subjectSummary: {
    quizAndAssessment: (a) => `${a.subject}: 퀴즈 ${a.quizTotal}문항 중 ${a.quizCorrect}문항 정답, 평가 ${a.assessmentMax}점 중 ${a.assessmentPoints}점`,
    quizOnly: (a) => `${a.subject}: 퀴즈 ${a.quizTotal}문항 중 ${a.quizCorrect}문항 정답`,
    assessmentOnly: (a) => `${a.subject}: 평가 ${a.assessmentMax}점 중 ${a.assessmentPoints}점`,
    none: (a) => `${a.subject}: 아직 확인된 기록이 없습니다.`,
  },
  overall: {
    strongAndWeak: (a) => `${a.studentName} 학생은 이번 단원에서 「${a.strong}」이(가) 돋보였고, 「${a.weak}」을(를) 조금 더 연습하면 좋겠습니다.`,
    even: (a) => `${a.studentName} 학생은 이번 단원에서 여러 역량을 고르게 보여 주었습니다.`,
    neutral: (a) => `${a.studentName} 학생의 「${a.themeTitle}」 단원 학습 기록입니다.`,
  },
}

export type Tags = {
  /** 퀴즈 역량 꼬리표: 차시 안 문항 자리(0..2)마다. 모든 교수 차시에 같은 꼬리표를 붙인다. */
  quiz?: (Competency | undefined)[]
  /** 채점 요소 역량 꼬리표: 요소 이름 → 역량. */
  criteria?: Record<string, Competency>
}

type Fx = { lessons: { no: number; formative_check: { quiz: Record<string, unknown>[] } }[]; unit_plan: unknown }
type Fx5 = { items: { rubric: { criteria: ({ name: string; max: number } & Record<string, unknown>)[] } }[] }

/** 과목 하나의 게시 판. variant '과학' 은 과학 mock, 그 밖은 수학 mock(과목 이름만 바꿔 쓴다). */
export function snapshotFor(subject: string, opts: { variant?: '수학' | '과학'; noticePlan?: boolean; tags?: Tags } = {}): Snapshot {
  const sfx = opts.variant === '과학' ? '-과학' : ''
  const s3 = clone(json(`data/studio-fixtures/stage3-generate${sfx}.json`)) as Fx
  const s5 = clone(json(`data/studio-fixtures/stage5-generate${sfx}.json`)) as Fx5
  const s7 = json(`data/studio-fixtures/stage7-generate${sfx}.json`)
  // mock fixture 에는 역량 꼬리표(C-40)가 붙어 있다 — 테스트는 꼬리표 없는 바탕에서 시작해 opts.tags 로만 붙인다
  for (const l of s3.lessons) for (const q of l.formative_check.quiz) delete q.competency
  for (const it of s5.items) for (const c of it.rubric.criteria) delete c.competency
  if (opts.tags?.quiz) for (const l of s3.lessons) l.formative_check.quiz.forEach((q, i) => { const c = opts.tags!.quiz![i]; if (c) q.competency = c })
  if (opts.tags?.criteria) for (const it of s5.items) for (const c of it.rubric.criteria) { const t = opts.tags.criteria[c.name]; if (t) c.competency = t }
  return upgradeSnapshot({
    schema_version: 2, cover: { title: 'T', subject, level: '중', grade: 1, version: 1, published_at: '' },
    standards: [], intro: '', reconstruction: '', reconstruction_detail: [], learning_goals: [], key_question: `${subject} q`,
    unit_plan: s3.unit_plan, lessons: s3.lessons, materials: [], assessment: s5, teacher_guide: null,
    notice_plan: opts.noticePlan === false ? null : s7, references: [], generated_with: { models: [] },
  })
}

export const TEACHING_LESSONS = [1, 2, 3, 4, 5]

/** 차시마다 3문항. wrong 에 든 "차시-번호"만 틀린 것으로. */
export function quizRows(lessons: number[], wrong: string[] = []): ReportQuizInput[] {
  return lessons.flatMap((lesson_no) => [1, 2, 3].map((quiz_no) => ({ lesson_no, quiz_no, correct: !wrong.includes(`${lesson_no}-${quiz_no}`) })))
}

/** 게시 판의 채점표에서 확정 채점을 만든다. drop: 요소마다 만점에서 뺄 점수(요소 이름별로 따로 줄 수 있다). */
export function gradingFor(snapshot: Snapshot, item_no: number, drop: number | Record<string, number> = 0): ReportGradingInput {
  const item = snapshot.assessment!.items[item_no - 1]
  return {
    item_no,
    final_criteria: item.rubric.criteria.map((c) => {
      const d = typeof drop === 'number' ? drop : drop[c.name] ?? 0
      return { name: c.name, points: Math.max(0, c.max - d), max: c.max }
    }),
  }
}

/** 모든 차시가 확인되고 두 문항이 모두 확정된 과목. */
export function fullSubject(subject: string, opts: Parameters<typeof snapshotFor>[1] & { wrong?: string[]; drop?: number | Record<string, number> } = {}): ReportSubjectInput {
  const snapshot = snapshotFor(subject, opts)
  return {
    subject, key_question: snapshot.key_question, snapshot,
    quiz: quizRows(TEACHING_LESSONS, opts.wrong), finalizedLessons: TEACHING_LESSONS,
    gradings: [gradingFor(snapshot, 1, opts.drop), gradingFor(snapshot, 2, opts.drop)],
  }
}

/** 여섯 축에 고루 꼬리표가 붙은 세트(수학 mock 의 요소 이름). */
export const SIX_AXIS_TAGS: Tags = {
  quiz: ['지식·이해', '자료 읽기', '자료 읽기'],
  criteria: {
    '상대도수 계산': '지식·이해', '비율 변화 해석': '자료 읽기', '상대도수로 비교하는 이유': '근거 들어 설명하기',
    '자료 정리의 정확성': '과정·기능', '해석의 타당성': '근거 들어 설명하기', '제안과 근거의 연결': '가치·태도', '수학적 표현과 서술': '글로 표현하기',
  },
}

export const student = { name: '김OO', seq: 7 }
export const theme = { title: '학교 축제, 일회용품을 줄이자' }
