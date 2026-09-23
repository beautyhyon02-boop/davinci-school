import type { z } from 'zod'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Histogram } from './Histogram'
import { RelativeFreqBars } from './RelativeFreqBars'
import { detectChart } from '@/lib/studio/charts'
import type { Snapshot } from '@/lib/studio/publish'
import type { Lesson as LessonSchema, QuizItem as QuizItemSchema, Material as MaterialSchema, AssessmentItem as AssessmentItemSchema, Rubric as RubricSchema } from '@/lib/studio/schemas'
import { app } from '@/content/site'

// v2 스냅샷을 기존 카드 배치 그대로 보여 주는 최소 판(흐름·준비물·퀴즈 위치, 요소별 척도, 문항별 예시답안).
// 스펙 §2.9 의 v2 카드(재구조화 표·평가 계획·발문 대본·활동지·A~E·안내장 틀·참고 자료) 재작성은 Task 7.
type Lesson = z.infer<typeof LessonSchema>
type QuizItem = z.infer<typeof QuizItemSchema>
type Material = z.infer<typeof MaterialSchema>
type AssessmentItem = z.infer<typeof AssessmentItemSchema>
type Rubric = z.infer<typeof RubricSchema>

const copy = app.packageView

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold">{children}</h2>
}

const SPLIT_ROWS_OVER = 12

function TableGrid({ columns, rows, className }: { columns: string[]; rows: (string | number)[][]; className: string }) {
  return (
    <table className={className}>
      <thead>
        <tr className="border-b border-ink-100 text-ink-500">
          {columns.map((col, i) => <th key={i} className="px-3 py-1 text-center">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-ink-50">
            {row.map((cell, j) => <td key={j} className={`px-3 py-1 ${typeof cell === 'number' ? 'text-center tabular-nums' : 'text-left'}`}>{String(cell)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MaterialTable({ material }: { material: Material }) {
  if (!material.table) return null
  const { columns, rows } = material.table
  // 두 열짜리 긴 표(부스 20개 등)는 반으로 나눠 나란히 — 세로 스크롤을 절반으로(대표님 요청 2026-09-23).
  if (columns.length === 2 && rows.length > SPLIT_ROWS_OVER) {
    const half = Math.ceil(rows.length / 2)
    return (
      <div className="mx-auto mt-2 grid max-w-[560px] grid-cols-2 gap-6 text-sm">
        <TableGrid columns={columns} rows={rows.slice(0, half)} className="w-full" />
        <TableGrid columns={columns} rows={rows.slice(half)} className="w-full" />
      </div>
    )
  }
  return (
    <div className="mt-2 overflow-x-auto">
      {/* 표는 가운데 정렬, 너무 넓지 않게(최대 560px). 머리글·숫자 칸은 가운데, 글자 칸은 왼쪽. */}
      <TableGrid columns={columns} rows={rows} className="mx-auto w-full max-w-[560px] min-w-[320px] text-sm" />
    </div>
  )
}

function MaterialChart({ material }: { material: Material }) {
  const spec = detectChart(material)
  if (!spec) return null
  // 그래프는 가운데, 최대 480px — 넓은 화면에서 화면을 다 차지하지 않게(대표님 요청 2026-09-23).
  if (spec.kind === 'histogram') return <div className="mx-auto mt-3 w-full max-w-[480px]"><Histogram values={spec.values} binSize={spec.binSize} title={spec.title} /></div>
  return <div className="mx-auto mt-3 w-full max-w-[480px]"><RelativeFreqBars rows={spec.rows} columns={spec.columns} title={spec.title} /></div>
}

export function MaterialsSection({ materials }: { materials: Material[] }) {
  if (materials.length === 0) return null
  return (
    <Card>
      <SectionHeading>{copy.materialsHeading}</SectionHeading>
      <div className="mt-3 space-y-6">
        {materials.map((m) => (
          <div key={m.id} className="rounded-xl border border-ink-100 bg-ink-100/30 p-4">
            {/* 자료마다 큰 라벨(자료 A/B…)로 구분이 한눈에 보이게 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-mint-500 px-3 py-1 text-sm font-bold text-white">{copy.materials.idLabel} {m.id}</span>
              <p className="text-base font-bold">{m.title}</p>
            </div>
            {m.body && <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>}
            <MaterialTable material={m} />
            <MaterialChart material={m} />
            {(m.images ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(m.images ?? []).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={copy.materials.imagesAlt(m.title, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function QuizView({ quiz, showAnswers }: { quiz: QuizItem[]; showAnswers: boolean }) {
  if (quiz.length === 0) return null
  const c = copy.lessons.quiz
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-ink-500">{copy.lessons.quizHeading}</p>
      <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm">
        {quiz.map((q, i) => (
          <li key={i}>
            <p>{q.q} <Badge tone="gray">{c.typeLabel[q.type]}</Badge></p>
            {q.choices && (
              <ul className="mt-1 list-disc pl-5">
                {q.choices.map((choice, j) => <li key={j}>{choice}</li>)}
              </ul>
            )}
            {showAnswers ? (
              <p className="mt-1 text-mint-700">{c.answerLabel}: {q.answer} · {c.explanationLabel}: {q.explanation}</p>
            ) : (
              <p className="mt-1 text-ink-500">{c.answersHidden}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function LessonsSection({ lessons, showAnswers }: { lessons: Lesson[]; showAnswers: boolean }) {
  if (lessons.length === 0) return null
  const c = copy.lessons.columns
  return (
    <Card>
      <SectionHeading>{copy.lessonsHeading}</SectionHeading>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-ink-500">
              <th className="py-1 pr-3">{c.no}</th>
              <th className="py-1 pr-3">{c.standards}</th>
              <th className="py-1 pr-3">{c.keyQuestion}</th>
              <th className="py-1 pr-3">{c.goal}</th>
              <th className="py-1 pr-3">{c.assessment}</th>
              <th className="py-1 pr-3">{c.mergeable}</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => (
              <tr key={l.no} className="border-b border-ink-50">
                <td className="py-1 pr-3">{l.no}</td>
                <td className="py-1 pr-3">{l.standards.join(', ')}</td>
                <td className="py-1 pr-3">{l.key_question}</td>
                <td className="py-1 pr-3">{l.goal}</td>
                <td className="py-1 pr-3">{l.assessment ?? copy.lessons.noAssessment}</td>
                <td className="py-1 pr-3">{l.mergeable_with ?? copy.lessons.noAssessment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-4">
        {lessons.map((l) => (
          <div key={l.no} className="rounded-xl border border-ink-100 p-3">
            <p className="text-sm font-semibold">{c.no} {l.no}</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <p><span className="font-semibold text-ink-500">{copy.lessons.flow.intro}</span> {l.flow.intro.join(' ')}</p>
              <p><span className="font-semibold text-ink-500">{copy.lessons.flow.main}</span> {l.flow.main.map((s) => `${s.step_label}(${s.minutes}′): ${s.activities.join(' ')}`).join(' / ')}</p>
              <p><span className="font-semibold text-ink-500">{copy.lessons.flow.wrapup}</span> {l.flow.wrapup.join(' ')}</p>
            </div>
            {l.materials_used.length + l.materials_needed.length > 0 && (
              <p className="mt-2 text-sm"><span className="font-semibold text-ink-500">{copy.lessons.materialsLabel}:</span> {[...l.materials_used.map((id) => `${copy.materials.idLabel} ${id}`), ...l.materials_needed].join(', ')}</p>
            )}
            {(l.images ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(l.images ?? []).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={copy.lessons.imagesAlt(l.no, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <QuizView quiz={l.formative_check.quiz} showAnswers={showAnswers} />
          </div>
        ))}
      </div>
    </Card>
  )
}

function TeacherGuideSection({ guide }: { guide: Snapshot['teacher_guide'] }) {
  if (!guide) return null
  const c = copy.teacherGuide
  return (
    <Card>
      <SectionHeading>{copy.teacherGuideHeading}</SectionHeading>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <p className="font-semibold text-ink-500">{c.generalHeading}</p>
          <p className="mt-1">{c.purposeLabel}: {guide.general.purpose}</p>
          <p className="mt-1">{c.materialsLabel}: {guide.general.materials.join(', ')}</p>
          <p className="mt-1">{c.scheduleLabel}: {guide.general.schedule_note}</p>
        </div>
        <div>
          <p className="font-semibold text-ink-500">{c.glossaryHeading}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {guide.glossary.map((g, i) => <li key={i}>{g.term} — {g.explanation}</li>)}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-500">{c.perLessonHeading}</p>
          <ul className="mt-1 space-y-2">
            {guide.per_lesson.map((l) => (
              <li key={l.no}>
                <p className="font-semibold">{c.lessonLabel(l.no)}</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {l.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

// v2 채점표: 요소마다 0..max 척도(서술형 1~3요소, 논술형 4요소 × 0~4). 요소별로 점수·기대 응답·예시 표를 하나씩 그린다.
function RubricView({ rubric }: { rubric: Rubric }) {
  const c = copy
  return (
    <div className="mt-2 space-y-3">
      {rubric.criteria.map((criterion, i) => (
        <div key={i} className="overflow-x-auto">
          <p className="text-sm font-semibold">{c.extendedRubric.criteriaLabel}: {criterion.name} · {c.extendedRubric.bandLabel(criterion.max)}</p>
          <table className="mt-1 w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-ink-500">
                <th className="py-1 pr-3">{c.shortRubric.pointsLabel}</th>
                <th className="py-1 pr-3">{c.shortRubric.expectationLabel}</th>
                <th className="py-1 pr-3">{c.shortRubric.exampleLabel}</th>
              </tr>
            </thead>
            <tbody>
              {[...criterion.scale].sort((a, b) => b.points - a.points).map((step) => (
                <tr key={step.points} className="border-b border-ink-50">
                  <td className="py-1 pr-3">{step.points}</td>
                  <td className="py-1 pr-3">{step.descriptor}</td>
                  <td className="py-1 pr-3">{step.example ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function AssessmentItemView({ item }: { item: AssessmentItem }) {
  const c = copy.assessment
  return (
    <div className="rounded-xl border border-ink-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray">{c.kindLabel[item.kind]}</Badge>
        <Badge tone="gray">{c.lessonLabel(item.lesson_no)}</Badge>
        <Badge tone="mint">{c.pointsLabel(item.points)}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{item.stem}</p>
      <ul className="mt-2 space-y-0.5 text-sm text-ink-500">
        <li>{c.conditions.lengthLabel}: {item.conditions.length}</li>
        <li>{c.conditions.requiredLabel}: {item.conditions.items.map((cond) => cond.text).join(', ')}</li>
        <li>{c.conditions.formatLabel}: {item.conditions.format}</li>
      </ul>
      <div>
        <p className="mt-3 text-sm font-semibold text-ink-500">{copy.rubricHeading}</p>
        <RubricView rubric={item.rubric} />
      </div>
    </div>
  )
}

function AssessmentSection({ assessment }: { assessment: Snapshot['assessment'] }) {
  if (!assessment) return null
  const c = copy.gradeBoundaries
  const e = copy.exemplars
  return (
    <>
      <Card>
        <SectionHeading>{copy.assessmentHeading}</SectionHeading>
        <div className="mt-3 space-y-3">
          {assessment.items.map((item, i) => <AssessmentItemView key={i} item={item} />)}
        </div>
      </Card>

      <Card>
        <SectionHeading>{copy.gradeBoundariesHeading}</SectionHeading>
        <table className="mt-3 w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-ink-500">
              <th className="py-1 pr-3">{c.gradeLabel}</th>
              <th className="py-1 pr-3">{c.rangeLabel}</th>
              <th className="py-1 pr-3">{c.bandLabel}</th>
            </tr>
          </thead>
          <tbody>
            {assessment.grade_boundaries.map((b, i) => (
              <tr key={i} className="border-b border-ink-50">
                <td className="py-1 pr-3">{b.grade}</td>
                <td className="py-1 pr-3">{b.min}~{b.max}</td>
                <td className="py-1 pr-3">{b.band}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <SectionHeading>{copy.exemplarsHeading}</SectionHeading>
        <div className="mt-3 space-y-3">
          {/* v2: 예시답안은 문항마다 있다(세트 공통 exemplars 폐지) */}
          {assessment.items.flatMap((item, itemIdx) => item.exemplar_answers.map((ex, i) => (
            <div key={`${itemIdx}-${i}`} className="rounded-xl border border-ink-100 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="gray">{copy.assessment.kindLabel[item.kind]}</Badge>
                <Badge tone="gray">{copy.assessment.lessonLabel(item.lesson_no)}</Badge>
                {ex.level && <Badge tone="gray">{e.levelLabel[ex.level]}</Badge>}
                <Badge tone="gray">{e.totalLabel(ex.points)}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{ex.text}</p>
              <p className="mt-1 text-ink-500">{e.scoresLabel}: {ex.scores.join(', ')}</p>
            </div>
          )))}
        </div>
      </Card>

      <Card>
        <SectionHeading>{copy.feedbackTemplatesHeading}</SectionHeading>
        <div className="mt-3 space-y-2 text-sm">
          {(['상', '중', '하'] as const).map((level) => (
            <p key={level}><span className="font-semibold">{copy.feedbackLevels[level]}</span>: {assessment.feedback_templates[level]}</p>
          ))}
        </div>
      </Card>
    </>
  )
}

export function PackageView({
  snapshot,
  mode,
  showAnswers = false,
}: {
  snapshot: Snapshot
  mode: 'admin' | 'teacher'
  showAnswers?: boolean
}) {
  const c = copy
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
          <Badge tone="mint">{c.cover.versionLabel(snapshot.cover.version)}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-500">{c.cover.meta(snapshot.cover.level, snapshot.cover.grade, snapshot.cover.subject)}</p>
        <p className="mt-1 text-xs text-ink-500">{c.cover.publishedAtLabel}: {snapshot.cover.published_at}</p>
      </Card>

      {snapshot.intro.trim() !== '' && (
        <Card>
          <SectionHeading>{c.intro}</SectionHeading>
          <p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.intro}</p>
        </Card>
      )}

      <Card>
        <SectionHeading>{c.standardsHeading}</SectionHeading>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {snapshot.standards.map((s) => <li key={s.code}><span className="font-semibold">{s.code}</span> {s.text}</li>)}
        </ul>
      </Card>

      <Card>
        <SectionHeading>{c.reconstructionHeading}</SectionHeading>
        <p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.reconstruction}</p>
      </Card>

      <Card>
        <SectionHeading>{c.learningGoalsHeading}</SectionHeading>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {snapshot.learning_goals.map((g, i) => <li key={i}>{g.text}</li>)}
        </ul>
      </Card>

      <Card>
        <SectionHeading>{c.keyQuestionHeading}</SectionHeading>
        <p className="mt-2 text-sm">{snapshot.key_question}</p>
      </Card>

      <LessonsSection lessons={snapshot.lessons} showAnswers={showAnswers} />
      <TeacherGuideSection guide={snapshot.teacher_guide} />
      <MaterialsSection materials={snapshot.materials} />
      <AssessmentSection assessment={snapshot.assessment} />

      {mode === 'admin' && (
        <Card>
          <SectionHeading>{c.generatedWithHeading}</SectionHeading>
          <div className="mt-2 flex flex-wrap gap-2">
            {snapshot.generated_with.models.map((m) => <Badge key={m} tone="lavender">{m}</Badge>)}
          </div>
        </Card>
      )}
    </div>
  )
}
