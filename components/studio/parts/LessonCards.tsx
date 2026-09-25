import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { lessonAssessments, isAssessmentSession, isUnitAssessmentSession } from '@/lib/studio/assessment-structure'
import { SHORT_MINUTES, ESSAY_MINUTES } from '@/lib/studio/structure-text'
import { app } from '@/content/site'
import { Answers, Aside, KV, LabeledLines, Lines, SectionTitle, SubLabel, arr } from './common'

// 차시 카드 — 주제·목표·핵심질문·시간 배분·흐름(도입/전개 소단계 분/정리)·자료·준비물·활동지(기본/표준/도전)·퀴즈(문제·정답·해설)와
// "교사용 지침" 칸(발문 대본의 예상 답·막힐 때, 지도상 유의점, 교사용 지침서의 그 차시 메모). 오너 규칙(2026-09-26): 제작소 3단계 탭은
// 요약이 아니라 원장이 보는 완성본 그대로 — 원장 패키지 화면(PackageView)과 같은 카드를 쓴다. 학생 화면은 이 카드를 쓰지 않는다
// (학생 차시 패널은 핵심질문·목표·자료·퀴즈만 — app/student/assignments/[id]/page.tsx).
// 읽기 위계(오너 요청 2026-09-26, 모든 과목): 내용은 옆으로 잇지 않고 한 줄에 하나씩 — 발문 → 아랫줄 예상 답 → 아랫줄 막힐 때,
// 퀴즈 문제 → 정답 → 해설, 활동지는 층별 목록. 틀은 parts/common.tsx(SectionTitle·SubLabel·Lines·LabeledLines·KV·Aside).
// 저장된 출력(옛 판·손으로 고친 판)을 그대로 받으므로 모든 필드를 느슨하게 읽는다.

export type QuizLike = { q: string; type?: string; choices?: string[] | null; answer?: string; explanation?: string; level_ref?: string }
export type LessonLike = {
  no: number
  kind?: string
  standards?: string[]
  topic?: string
  key_question?: string
  goal?: string
  time_budget?: { intro_min: number; main_min: number; wrapup_min: number } | null
  flow?: { intro?: string[]; main?: { step_label: string; minutes: number; activities?: string[] }[]; wrapup?: string[] } | null
  teacher_script?: { questions?: { prompt: string; expected_answer?: string; if_stuck?: string }[] } | null
  materials_used?: string[]
  materials_needed?: string[]
  caution_notes?: string[]
  worksheet?: { tasks?: { no: number; prompt: string; tier: string; level_ref: string; expected?: string }[]; self_check?: string[] } | null
  formative_check?: { quiz?: QuizLike[] } | null
  quiz?: QuizLike[]
  assessment?: string[] | string | null
  mergeable_with?: number | null
  merge_note?: string | null
  images?: string[]
}
/** 교사용 지침서(6단계)의 차시별 메모. */
export type GuideNotes = { no: number; notes?: string[] }[]

const copy = app.packageView
const c = copy.lessons

const quizOf = (l: LessonLike) => arr(l.formative_check?.quiz ?? l.quiz)
const isQuizType = (t: string | undefined): t is keyof typeof c.quiz.typeLabel => !!t && t in c.quiz.typeLabel

/** 퀴즈 문제(학생이 보는 것) — 한 문제에 한 블록, 문제는 굵게. 정답·해설은 채점 자료 접이식(QuizAnswers)에. */
function QuizView({ quiz, showAnswers }: { quiz: QuizLike[]; showAnswers: boolean }) {
  if (quiz.length === 0) return null
  return (
    <div data-quiz className="mt-4">
      <SubLabel>{c.quizHeading}</SubLabel>
      <ol className="mt-1 list-decimal space-y-2 pl-5">
        {quiz.map((q, i) => (
          <li key={i}>
            <p className="font-semibold">{q.q} {isQuizType(q.type) && <Badge tone="gray">{c.quiz.typeLabel[q.type]}</Badge>}</p>
            {/* 보기 목록은 2026-09-26 이전에 게시된 판의 선택형 퀴즈에만 있다 — 새 세트의 퀴즈는 단답형만(choices null) */}
            {q.choices && <ul className="mt-1 list-disc pl-5">{q.choices.map((ch, j) => <li key={j}>{ch}</li>)}</ul>}
          </li>
        ))}
      </ol>
      {!showAnswers && <p className="mt-1 text-ink-500">{c.quiz.answersHidden}</p>}
    </div>
  )
}

/** 퀴즈 정답·해설 — 문제(굵게) / 정답 / 해설을 세 줄로 쌓는다(가로로 잇지 않음). */
function QuizAnswers({ quiz }: { quiz: QuizLike[] }) {
  if (quiz.length === 0) return null
  return (
    <div>
      <SubLabel>{c.quizHeading}</SubLabel>
      <ol className="mt-1 list-decimal space-y-3 pl-5">
        {quiz.map((q, i) => (
          <li key={i} data-quiz-answer={i + 1}>
            <p className="font-semibold">{q.q}</p>
            {q.answer && <Aside kind="answer" label={c.quiz.answerLabel}><span className="text-mint-700">{q.answer}</span></Aside>}
            {q.explanation && <Aside kind="explanation" label={c.quiz.explanationLabel} faint>{q.explanation}</Aside>}
          </li>
        ))}
      </ol>
    </div>
  )
}

type Task = NonNullable<NonNullable<LessonLike['worksheet']>['tasks']>[number]

/** 활동지 과제를 층(기본/표준/도전 + 수준)별로 묶는다 — 처음 나온 순서대로. */
function tiersOf(tasks: Task[]): { label: string; tasks: Task[] }[] {
  const groups: { label: string; tasks: Task[] }[] = []
  for (const w of tasks) {
    const label = c.worksheetTier(w.tier, w.level_ref)
    const g = groups.find((x) => x.label === label)
    if (g) g.tasks.push(w)
    else groups.push({ label, tasks: [w] })
  }
  return groups
}

/** 활동지 — 층마다 이름표 + 한 줄에 한 과제(과제 번호 유지). */
function WorksheetView({ tasks, selfCheck }: { tasks: Task[]; selfCheck: string[] }) {
  if (tasks.length === 0) return null
  return (
    <div data-worksheet className="mt-4">
      <SubLabel>{c.worksheetHeading}</SubLabel>
      <div className="mt-1 grid gap-3 sm:grid-cols-3">
        {tiersOf(tasks).map((g) => (
          <div key={g.label} data-worksheet-tier={g.label}>
            <Badge tone="gray">{g.label}</Badge>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {g.tasks.map((w) => <li key={w.no} value={w.no}>{w.prompt}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <LabeledLines className="mt-2" label={c.selfCheckHeading} items={selfCheck} />
    </div>
  )
}

/**
 * 교사용 지침 칸 — 이 차시를 어떻게 가르칠지: 발문 대본(예상 답·막힐 때), 지도상 유의점, 퀴즈 수준(L-10: 문항마다 D~E 회상·C 이해·적용·B 관계·추론,
 * 대표 2026-09-26), 교사용 지침서의 이 차시 메모. 예상 답·막힐 때는 채점 자료를 보이는 화면(showAnswers)에서만. 퀴즈 수준은 답이 아니라
 * 늘 보이되 이 카드는 관리자·원장 화면에만 있다 — 학생 차시 패널은 수준을 보이지 않는다. 수준이 없는 옛 퀴즈(2026-09-26 이전)면 줄을 두지 않는다.
 * 발문 대본(오너 요청 2026-09-26): 발문(굵게) → 아랫줄 예상 답 → 아랫줄 막힐 때 — 두 줄은 들여쓰고 옅게. 옆으로 잇지 않는다.
 */
function TeacherBlock({ l, guideNotes, showAnswers }: { l: LessonLike; guideNotes: string[]; showAnswers: boolean }) {
  const questions = arr(l.teacher_script?.questions)
  const cautions = arr(l.caution_notes)
  const quiz = quizOf(l)
  const levels = quiz.some((q) => q.level_ref) ? quiz.map((q, i) => c.quizLevel(i + 1, q.level_ref)) : []
  if (questions.length === 0 && cautions.length === 0 && guideNotes.length === 0 && levels.length === 0) return null
  return (
    <div data-teacher-guide className="mt-4 space-y-3 rounded-lg border border-lavender-100 bg-lavender-50 p-4">
      <SectionTitle>{c.teacherBlockHeading}</SectionTitle>
      {questions.length > 0 && (
        <div>
          <SubLabel>{c.scriptHeading}</SubLabel>
          <ol className="mt-1 list-decimal space-y-3 pl-5">
            {questions.map((q, i) => (
              <li key={i} data-script-question={i + 1}>
                <p data-script-prompt className="font-semibold">{q.prompt}</p>
                {showAnswers && q.expected_answer && <Aside kind="expected" label={c.scriptExpected}>{q.expected_answer}</Aside>}
                {showAnswers && q.if_stuck && <Aside kind="stuck" label={c.scriptStuck} faint>{q.if_stuck}</Aside>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <LabeledLines label={c.cautionHeading} items={cautions} />
      {levels.length > 0 && (
        <div data-quiz-levels>
          <SubLabel>{c.quizLevelsHeading}</SubLabel>
          <Lines items={levels} />
        </div>
      )}
      <LabeledLines label={c.guideNotesHeading} items={guideNotes} />
    </div>
  )
}

const minutesOf = (n: number | undefined) => (typeof n === 'number' ? ` (${n}′)` : '')

/** 흐름 한 칸(도입·전개·정리) — 이름표 + 활동 한 줄에 하나씩. */
function FlowBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-mint-50 p-3">
      <SubLabel>{label}</SubLabel>
      {children}
    </div>
  )
}

/**
 * 차시 카드 한 장 — 주제(굵은 제목) → 배지(성취기준·평가·병합) → 시간 배분(작은 줄) → 핵심질문·목표(이름표 줄) → 흐름 세 칸 →
 * 자료·준비물(한 줄에 하나) → 교사용 지침 칸(라벤더) → 활동지(층별 목록) → 퀴즈 → 채점 자료 접이식(기대 답·정답·해설).
 */
export function LessonCard({ l, showAnswers, open, guideNotes = [] }: { l: LessonLike; showAnswers: boolean; open: boolean; guideNotes?: string[] }) {
  const t = l.time_budget
  const used = arr(l.materials_used)
  const needed = arr(l.materials_needed)
  const standards = arr(l.standards)
  const tasks = arr(l.worksheet?.tasks)
  const selfCheck = arr(l.worksheet?.self_check)
  const quiz = quizOf(l)
  const images = arr(l.images)
  const kinds = lessonAssessments(l)
  // 단원 평가 차시(대표 2026-09-26: 마지막 교수 차시 뒤, 서술형 작성 + 논술형 작성 — 분은 ASSESSMENT_SESSION)는 가르치는 차시와 구별되게 레몬 테두리와 안내 한 줄
  const session = isUnitAssessmentSession(l)
  return (
    <div data-lesson-kind={isAssessmentSession(l) ? 'assessment' : 'teaching'} data-lesson-no={l.no} className={`rounded-xl border p-4 text-sm ${session ? 'border-lemon-300 bg-lemon-100/30' : 'border-ink-100'}`}>
      <h3 className="text-base font-bold">{c.columns.no} {l.no}{l.topic ? ` · ${l.topic}` : ''}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {session && <Badge tone="lemon">{c.assessmentSessionBadge}</Badge>}
        {standards.length > 0 && <Badge tone="gray">{standards.join(', ')}</Badge>}
        {kinds.length > 0 && <Badge tone="mint">{kinds.join(' + ')}</Badge>}
        {l.mergeable_with != null && <Badge tone="gray">{c.mergeableLabel(l.mergeable_with)}</Badge>}
      </div>
      {t && <p data-time-budget className="mt-1 text-xs text-ink-500">{c.timeLabel(t.intro_min, t.main_min, t.wrapup_min)}</p>}
      {session && <p className="mt-2 text-ink-700">{c.assessmentSessionNote(SHORT_MINUTES, ESSAY_MINUTES)}</p>}
      {(l.key_question || l.goal) && (
        <div className="mt-3 space-y-1">
          <KV label={c.columns.keyQuestion}>{l.key_question}</KV>
          <KV label={c.columns.goal}>{l.goal}</KV>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FlowBlock label={`${c.flow.intro}${minutesOf(t?.intro_min)}`}>
          <Lines items={arr(l.flow?.intro)} />
        </FlowBlock>
        <FlowBlock label={`${c.flow.main}${minutesOf(t?.main_min)}`}>
          {arr(l.flow?.main).map((m, i) => (
            <div key={i} className="mt-2">
              <p className="font-semibold">{c.stepLabel(m.step_label, m.minutes)}</p>
              <Lines items={arr(m.activities)} />
            </div>
          ))}
        </FlowBlock>
        <FlowBlock label={`${c.flow.wrapup}${minutesOf(t?.wrapup_min)}`}>
          <Lines items={arr(l.flow?.wrapup)} />
        </FlowBlock>
      </div>

      {(used.length > 0 || needed.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <LabeledLines label={c.materialsLabel} items={used.map((id) => `${copy.materials.idLabel} ${id}`)} />
          <LabeledLines label={c.needsLabel} items={needed} />
        </div>
      )}

      <TeacherBlock l={l} guideNotes={guideNotes} showAnswers={showAnswers} />
      {l.merge_note && <KV className="mt-2 text-ink-500" label={c.mergeNoteLabel}>{l.merge_note}</KV>}

      <WorksheetView tasks={tasks} selfCheck={selfCheck} />

      {images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={c.imagesAlt(l.no, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
          ))}
        </div>
      )}

      <QuizView quiz={quiz} showAnswers={showAnswers} />

      {showAnswers && (tasks.length > 0 || quiz.length > 0) && (
        <Answers open={open}>
          {tasks.length > 0 && (
            <div>
              <SubLabel>{c.worksheetHeading} · {c.worksheetExpected}</SubLabel>
              <ol className="mt-1 list-decimal space-y-3 pl-5">
                {tasks.map((w) => (
                  <li key={w.no} value={w.no} data-worksheet-answer={w.no}>
                    <p className="font-semibold">{w.prompt}</p>
                    {w.expected && <Aside kind="expected" label={c.worksheetExpected}>{w.expected}</Aside>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <QuizAnswers quiz={quiz} />
        </Answers>
      )}
    </div>
  )
}

/** 교사용 지침서의 차시별 메모에서 이 차시(no) 것만. */
export const guideNotesFor = (guide: GuideNotes | null | undefined, no: number): string[] => arr(arr(guide).find((g) => g.no === no)?.notes)

/** 차시 카드 목록(카드 틀 없이). guide = 교사용 지침서 per_lesson — 있으면 각 차시 카드의 교사용 지침 칸에 그 차시 메모를 싣는다. */
export function LessonCards({ lessons, showAnswers, open, guide }: { lessons: LessonLike[]; showAnswers: boolean; open: boolean; guide?: GuideNotes | null }) {
  return (
    <div className="mt-3 space-y-4">
      {lessons.map((l) => <LessonCard key={l.no} l={l} showAnswers={showAnswers} open={open} guideNotes={guideNotesFor(guide, l.no)} />)}
    </div>
  )
}
