import type { z } from 'zod'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Histogram } from './Histogram'
import { RelativeFreqBars } from './RelativeFreqBars'
import { detectChart } from '@/lib/studio/charts'
import type { Snapshot } from '@/lib/studio/publish'
import type { Lesson as LessonSchema, QuizItem as QuizItemSchema, Material as MaterialSchema, AssessmentItem as AssessmentItemSchema, ShortRubric as ShortRubricSchema, ExtendedRubric as ExtendedRubricSchema } from '@/lib/studio/schemas'
import { app } from '@/content/site'

type Lesson = z.infer<typeof LessonSchema>
type QuizItem = z.infer<typeof QuizItemSchema>
type Material = z.infer<typeof MaterialSchema>
type AssessmentItem = z.infer<typeof AssessmentItemSchema>
type ShortRubric = z.infer<typeof ShortRubricSchema>
type ExtendedRubric = z.infer<typeof ExtendedRubricSchema>

const copy = app.packageView

function isShortRubric(rubric: ShortRubric | ExtendedRubric): rubric is ShortRubric {
  return 'levels' in rubric
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold">{children}</h2>
}

function MaterialTable({ material }: { material: Material }) {
  if (!material.table) return null
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-ink-500">
            {material.table.columns.map((col, i) => <th key={i} className="py-1 pr-3">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {material.table.rows.map((row, i) => (
            <tr key={i} className="border-b border-ink-50">
              {row.map((cell, j) => <td key={j} className="py-1 pr-3">{String(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MaterialChart({ material }: { material: Material }) {
  const spec = detectChart(material)
  if (!spec) return null
  if (spec.kind === 'histogram') return <div className="mt-3"><Histogram values={spec.values} binSize={spec.binSize} title={spec.title} /></div>
  return <div className="mt-3"><RelativeFreqBars rows={spec.rows} columns={spec.columns} title={spec.title} /></div>
}

export function MaterialsSection({ materials }: { materials: Material[] }) {
  if (materials.length === 0) return null
  return (
    <Card>
      <SectionHeading>{copy.materialsHeading}</SectionHeading>
      <div className="mt-3 space-y-4">
        {materials.map((m) => (
          <div key={m.id} className="rounded-xl border border-ink-100 p-3">
            <p className="text-sm font-semibold">{copy.materials.idLabel} {m.id} · {m.title}</p>
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
              <p><span className="font-semibold text-ink-500">{copy.lessons.flow.intro}</span> {l.flow.intro}</p>
              <p><span className="font-semibold text-ink-500">{copy.lessons.flow.main}</span> {l.flow.main}</p>
              <p><span className="font-semibold text-ink-500">{copy.lessons.flow.wrapup}</span> {l.flow.wrapup}</p>
            </div>
            {l.materials.length > 0 && (
              <p className="mt-2 text-sm"><span className="font-semibold text-ink-500">{copy.lessons.materialsLabel}:</span> {l.materials.join(', ')}</p>
            )}
            {(l.images ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(l.images ?? []).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={copy.lessons.imagesAlt(l.no, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <QuizView quiz={l.quiz} showAnswers={showAnswers} />
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

function RubricView({ rubric }: { rubric: ShortRubric | ExtendedRubric }) {
  const c = copy
  if (isShortRubric(rubric)) {
    return (
      <table className="mt-2 w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-ink-500">
            <th className="py-1 pr-3">{c.shortRubric.pointsLabel}</th>
            <th className="py-1 pr-3">{c.shortRubric.expectationLabel}</th>
            <th className="py-1 pr-3">{c.shortRubric.exampleLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rubric.levels.map((lv, i) => (
            <tr key={i} className="border-b border-ink-50">
              <td className="py-1 pr-3">{lv.points}</td>
              <td className="py-1 pr-3">{lv.expectation}</td>
              <td className="py-1 pr-3">{lv.example ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const bandKeys = ['4', '3', '2', '1', '0'] as const
  return (
    <table className="mt-2 w-full min-w-[640px] text-left text-sm">
      <thead>
        <tr className="border-b border-ink-100 text-ink-500">
          <th className="py-1 pr-3">{c.extendedRubric.criteriaLabel}</th>
          {bandKeys.map((k) => <th key={k} className="py-1 pr-3">{c.extendedRubric.bandLabel(Number(k))}</th>)}
        </tr>
      </thead>
      <tbody>
        {rubric.criteria.map((criterion, i) => (
          <tr key={i} className="border-b border-ink-50">
            <td className="py-1 pr-3 font-semibold">{criterion.name}</td>
            {bandKeys.map((k) => <td key={k} className="py-1 pr-3">{criterion.bands[k]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
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
        <li>{c.conditions.requiredLabel}: {item.conditions.required.join(', ')}</li>
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
          {assessment.exemplars.map((ex, i) => (
            <div key={i} className="rounded-xl border border-ink-100 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="gray">{e.levelLabel[ex.level]}</Badge>
                <Badge tone="gray">{e.gradeLabel(ex.grade)}</Badge>
                <Badge tone="gray">{e.totalLabel(ex.total)}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{ex.text}</p>
              <p className="mt-1 text-ink-500">{e.scoresLabel}: {ex.scores.join(', ')}</p>
            </div>
          ))}
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
          {snapshot.learning_goals.map((g, i) => <li key={i}>{g}</li>)}
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
