import { Badge } from '@/components/ui/Badge'
import { lessonAssessments, isAssessmentSession, isUnitAssessmentSession } from '@/lib/studio/assessment-structure'
import { SHORT_MINUTES, ESSAY_MINUTES } from '@/lib/studio/structure-text'
import { app } from '@/content/site'
import { Answers, Label, arr } from './common'

// 차시 카드 — 주제·목표·핵심질문·시간 배분·흐름(도입/전개 소단계 분/정리)·자료·준비물·활동지(기본/표준/도전)·퀴즈(문제·정답·해설)와
// "교사용 지침" 칸(발문 대본의 예상 답·막힐 때, 지도상 유의점, 교사용 지침서의 그 차시 메모). 오너 규칙(2026-09-26): 제작소 3단계 탭은
// 요약이 아니라 원장이 보는 완성본 그대로 — 원장 패키지 화면(PackageView)과 같은 카드를 쓴다. 학생 화면은 이 카드를 쓰지 않는다
// (학생 차시 패널은 핵심질문·목표·자료·퀴즈만 — app/student/assignments/[id]/page.tsx).
// 저장된 출력(옛 판·손으로 고친 판)을 그대로 받으므로 모든 필드를 느슨하게 읽는다.

export type QuizLike = { q: string; type?: string; choices?: string[] | null; answer?: string; explanation?: string }
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

function QuizView({ quiz, showAnswers }: { quiz: QuizLike[]; showAnswers: boolean }) {
  if (quiz.length === 0) return null
  return (
    <div className="mt-3">
      <p className="font-semibold text-ink-500">{c.quizHeading}</p>
      <ol className="mt-1 list-decimal space-y-2 pl-5">
        {quiz.map((q, i) => (
          <li key={i}>
            <p>{q.q} {isQuizType(q.type) && <Badge tone="gray">{c.quiz.typeLabel[q.type]}</Badge>}</p>
            {/* 보기 목록은 2026-09-26 이전에 게시된 판의 선택형 퀴즈에만 있다 — 새 세트의 퀴즈는 단답형만(choices null) */}
            {q.choices && <ul className="mt-1 list-disc pl-5">{q.choices.map((ch, j) => <li key={j}>{ch}</li>)}</ul>}
          </li>
        ))}
      </ol>
      {!showAnswers && <p className="mt-1 text-ink-500">{c.quiz.answersHidden}</p>}
    </div>
  )
}

/**
 * 교사용 지침 칸 — 이 차시를 어떻게 가르칠지: 발문 대본(예상 답·막힐 때), 지도상 유의점, 교사용 지침서의 이 차시 메모.
 * 예상 답·막힐 때는 채점 자료를 보이는 화면(showAnswers)에서만.
 */
function TeacherBlock({ l, guideNotes, showAnswers }: { l: LessonLike; guideNotes: string[]; showAnswers: boolean }) {
  const questions = arr(l.teacher_script?.questions)
  const cautions = arr(l.caution_notes)
  if (questions.length === 0 && cautions.length === 0 && guideNotes.length === 0) return null
  return (
    <div data-teacher-guide className="mt-3 space-y-2 rounded-lg bg-lavender-50 p-3">
      <p className="font-bold">{c.teacherBlockHeading}</p>
      {questions.length > 0 && (
        <div>
          <p className="font-semibold text-ink-500">{c.scriptHeading}</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            {questions.map((q, i) => (
              <li key={i}>
                {q.prompt}
                {showAnswers && (q.expected_answer || q.if_stuck) && (
                  <span className="text-ink-500"> — {c.scriptExpected}: {q.expected_answer ?? '-'} · {c.scriptStuck}: {q.if_stuck ?? '-'}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {cautions.length > 0 && (
        <div>
          <p className="font-semibold text-ink-500">{c.cautionHeading}</p>
          <ul className="list-disc pl-5">{cautions.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {guideNotes.length > 0 && (
        <div>
          <p className="font-semibold text-ink-500">{c.guideNotesHeading}</p>
          <ul className="list-disc pl-5">{guideNotes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

const minutesOf = (n: number | undefined) => (typeof n === 'number' ? ` (${n}′)` : '')

export function LessonCard({ l, showAnswers, open, guideNotes = [] }: { l: LessonLike; showAnswers: boolean; open: boolean; guideNotes?: string[] }) {
  const t = l.time_budget
  const used = arr(l.materials_used)
  const needed = arr(l.materials_needed)
  const standards = arr(l.standards)
  const tasks = arr(l.worksheet?.tasks)
  const selfCheck = arr(l.worksheet?.self_check)
  const quiz = quizOf(l)
  const images = arr(l.images)
  const materials = used.map((id) => `${copy.materials.idLabel} ${id}`).join(', ')
  const kinds = lessonAssessments(l)
  // 단원 평가 차시(대표 2026-09-26: 마지막 교수 차시 뒤, 서술형 작성 + 논술형 작성 — 분은 ASSESSMENT_SESSION)는 가르치는 차시와 구별되게 레몬 테두리와 안내 한 줄
  const session = isUnitAssessmentSession(l)
  return (
    <div data-lesson-kind={isAssessmentSession(l) ? 'assessment' : 'teaching'} data-lesson-no={l.no} className={`rounded-xl border p-3 text-sm ${session ? 'border-lemon-300 bg-lemon-100/30' : 'border-ink-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold">{c.columns.no} {l.no}{l.topic ? ` · ${l.topic}` : ''}</p>
        {session && <Badge tone="lemon">{c.assessmentSessionBadge}</Badge>}
        {standards.length > 0 && <Badge tone="gray">{standards.join(', ')}</Badge>}
        {kinds.length > 0 && <Badge tone="mint">{kinds.join(' + ')}</Badge>}
        {l.mergeable_with != null && <Badge tone="gray">{c.mergeableLabel(l.mergeable_with)}</Badge>}
        {t && <Badge tone="gray">{c.timeLabel(t.intro_min, t.main_min, t.wrapup_min)}</Badge>}
      </div>
      {session && <p className="mt-2 text-ink-700">{c.assessmentSessionNote(SHORT_MINUTES, ESSAY_MINUTES)}</p>}
      {l.key_question && <p className="mt-2"><Label>{c.columns.keyQuestion}:</Label> {l.key_question}</p>}
      {l.goal && <p><Label>{c.columns.goal}:</Label> {l.goal}</p>}

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-ink-500">{c.flow.intro}{minutesOf(t?.intro_min)}</p>
          <ul className="list-disc pl-5">{arr(l.flow?.intro).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div>
          <p className="font-semibold text-ink-500">{c.flow.main}{minutesOf(t?.main_min)}</p>
          {arr(l.flow?.main).map((m, i) => (
            <div key={i} className="mt-1">
              <p className="font-semibold">{c.stepLabel(m.step_label, m.minutes)}</p>
              <ul className="list-disc pl-5">{arr(m.activities).map((x, j) => <li key={j}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
        <div>
          <p className="font-semibold text-ink-500">{c.flow.wrapup}{minutesOf(t?.wrapup_min)}</p>
          <ul className="list-disc pl-5">{arr(l.flow?.wrapup).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>

      {(used.length > 0 || needed.length > 0) && (
        <p className="mt-2">
          {used.length > 0 && <><Label>{c.materialsLabel}:</Label> {materials}</>}
          {used.length > 0 && needed.length > 0 && ' · '}
          {needed.length > 0 && <><Label>{c.needsLabel}:</Label> {needed.join(', ')}</>}
        </p>
      )}

      <TeacherBlock l={l} guideNotes={guideNotes} showAnswers={showAnswers} />
      {l.merge_note && <p className="mt-1 text-ink-500">{c.mergeNoteLabel}: {l.merge_note}</p>}

      {tasks.length > 0 && (
        <div className="mt-2">
          <p className="font-semibold text-ink-500">{c.worksheetHeading}</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            {tasks.map((w) => <li key={w.no}><Badge tone="gray">{c.worksheetTier(w.tier, w.level_ref)}</Badge> {w.prompt}</li>)}
          </ol>
          {selfCheck.length > 0 && <p className="mt-1 text-ink-500">{c.selfCheckHeading}: {selfCheck.join(' / ')}</p>}
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
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
              <p className="font-semibold text-ink-500">{c.worksheetHeading} · {c.worksheetExpected}</p>
              <ol className="list-decimal pl-5">{tasks.map((w) => <li key={w.no}>{w.expected}</li>)}</ol>
            </div>
          )}
          {quiz.length > 0 && (
            <div>
              <p className="font-semibold text-ink-500">{c.quizHeading}</p>
              <ol className="list-decimal pl-5">
                {quiz.map((q, i) => <li key={i} className="text-mint-700">{c.quiz.answerLabel}: {q.answer} · {c.quiz.explanationLabel}: {q.explanation}</li>)}
              </ol>
            </div>
          )}
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
