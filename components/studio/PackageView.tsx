import type { z } from 'zod'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Histogram } from './Histogram'
import { RelativeFreqBars } from './RelativeFreqBars'
import { detectChart } from '@/lib/studio/charts'
import type { Snapshot } from '@/lib/studio/publish'
import type { Lesson as LessonSchema, QuizItem as QuizItemSchema, Material as MaterialSchema, AssessmentItem as AssessmentItemSchema, Rubric as RubricSchema } from '@/lib/studio/schemas'
import { getLevels } from '@/lib/reference/levels'
import { cleanMaterialTitle } from '@/lib/studio/compat'
import { lessonAssessments, isAssessmentSession, isUnitAssessmentSession } from '@/lib/studio/assessment-structure'
import { SHORT_MINUTES, ESSAY_MINUTES } from '@/lib/studio/structure-text'
import { app } from '@/content/site'

// v2 패키지 화면(스펙 §2.9). 카드 순서 = 표지 → 소개 → 성취기준(+A~E 접이식) → 재구조화 표 → 학습 목표(축 배지) → 핵심질문 →
// 평가 계획 → 차시 카드(시간·소단계·발문 대본·준비물·유의점·활동지·퀴즈; 마지막 교수 차시 뒤 단원 평가 차시는 레몬 테두리 카드) →
// 자료(출처 배지) → 문항 카드 2장(서술형·논술형, 옛 판 3장) → 등급표(level_ref) →
// 피드백 틀 → 교사용 지침서 → 안내장 틀 → 참고한 공개 자료 → 생성 모델(관리자만).
// 정답·예시답안 같은 채점 자료는 <details> 로 묶는다 — 관리자 미리보기는 펼친 채, 원장 열람(mode='teacher')은 접힌 채로 시작한다.
// getLevels 가 node:fs 를 쓰므로 서버 컴포넌트에서만 렌더한다(사용처: 관리자 세트 page, 원장 문항 page, 학생 page 의 MaterialsSection).
type Lesson = z.infer<typeof LessonSchema>
type QuizItem = z.infer<typeof QuizItemSchema>
type Material = z.infer<typeof MaterialSchema>
type AssessmentItem = z.infer<typeof AssessmentItemSchema>
type Rubric = z.infer<typeof RubricSchema>

const copy = app.packageView

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold">{children}</h2>
}

function Label({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink-500">{children}</span>
}

/** 채점 자료 접이식. open = 관리자 미리보기(펼침), 원장 열람은 접힘. */
function Answers({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details open={open} data-print="omit" className="mt-3 rounded-lg bg-lemon-100/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink-500">{copy.answersToggle}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
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

/** 성취수준 표시 행: 묶인 수준(merged_levels)은 "A·B" 한 줄, 나머지는 수준별 한 줄. 순서는 levels 의 키 순서를 따른다. */
export function mergedLevelRows(levels: Record<string, string>, merged: string[][]): { label: string; text: string }[] {
  const groupOf = new Map<string, string[]>()
  for (const g of merged) for (const lv of g) groupOf.set(lv, g)
  const seen = new Set<string>()
  const rows: { label: string; text: string }[] = []
  for (const [k, v] of Object.entries(levels)) {
    if (seen.has(k)) continue
    const g = groupOf.get(k)
    if (g) { for (const lv of g) seen.add(lv); rows.push({ label: g.join('·'), text: v }) }
    else rows.push({ label: k, text: v })
  }
  return rows
}

export function MaterialsSection({ materials }: { materials: Material[] }) {
  if (materials.length === 0) return null
  const c = copy.materials
  return (
    <Card print="keep">
      <SectionHeading>{copy.materialsHeading}</SectionHeading>
      <div className="mt-3 space-y-6">
        {materials.map((m) => (
          <div key={m.id} data-print="material" className="rounded-xl border border-ink-100 bg-ink-100/30 p-4">
            {/* 자료마다 큰 라벨(자료 A/B…)로 구분이 한눈에 보이게. 공개 자료 출처만 배지로(스펙 §2.4, 2026-09-26 수정). */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-mint-500 px-3 py-1 text-sm font-bold text-white">{c.idLabel} {m.id}</span>
              <p className="text-base font-bold">{cleanMaterialTitle(m.title)}</p>
              {/* 대표님 지시(2026-09-26): 자작·원자료 같은 내부 표지는 화면에 내지 않는다. 공개 자료의 출처만 남긴다(공공누리 표기 의무). */}
              {m.source.kind === '공개' && m.source.attribution && <Badge tone="gray">{c.sourceLabel.공개} · {m.source.attribution}</Badge>}
            </div>
            {m.body && <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>}
            <MaterialTable material={m} />
            <MaterialChart material={m} />
            {m.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={c.imagesAlt(m.title, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function StandardsSection({ standards }: { standards: Snapshot['standards'] }) {
  return (
    <Card>
      <SectionHeading>{copy.standardsHeading}</SectionHeading>
      <ul className="mt-2 space-y-2 text-sm">
        {standards.map((s) => {
          const lv = getLevels(s.code)
          return (
            <li key={s.code}>
              <span className="font-semibold">{s.code}</span> {s.text}
              {lv && (
                <details className="mt-1 rounded-lg bg-ink-100/40 p-2">
                  <summary className="cursor-pointer text-ink-500">{copy.levelsToggle}</summary>
                  <ul className="mt-1 space-y-0.5">
                    {/* 평가원 표에서 두 수준이 한 칸으로 묶인 경우(merged_levels)는 "A·B"로 한 번만 보인다 — 같은 문장이 두 줄로 반복돼 오류처럼 보이지 않게 */}
                    {mergedLevelRows(lv.levels, lv.merged_levels).map((row) => <li key={row.label}><span className="font-semibold">{row.label}</span> {row.text}</li>)}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ReconstructionSection({ snapshot }: { snapshot: Snapshot }) {
  const c = copy.reconstructionTable.columns
  return (
    <Card>
      <SectionHeading>{copy.reconstructionHeading}</SectionHeading>
      <p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.reconstruction}</p>
      {snapshot.reconstruction_detail.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-ink-500">
                <th className="py-1 pr-3">{c.code}</th><th className="py-1 pr-3">{c.original}</th><th className="py-1 pr-3">{c.type}</th>
                <th className="py-1 pr-3">{c.reconstructed}</th><th className="py-1 pr-3">{c.reason}</th><th className="py-1 pr-3">{c.elements}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.reconstruction_detail.map((r) => (
                <tr key={r.code} className="border-b border-ink-50 align-top">
                  <td className="py-1 pr-3 font-semibold">{r.code}</td>
                  <td className="py-1 pr-3">{r.original_text}</td>
                  <td className="py-1 pr-3"><Badge tone="gray">{r.reconstruction_type}</Badge></td>
                  <td className="py-1 pr-3">{r.reconstructed_text}</td>
                  <td className="py-1 pr-3">{r.reason.join(', ')}</td>
                  <td className="py-1 pr-3">{r.learning_elements.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function UnitPlanSection({ plan }: { plan: Snapshot['unit_plan'] }) {
  if (!plan) return null
  const c = copy.unitPlan
  const p = plan.assessment_plan
  return (
    <Card>
      <SectionHeading>{copy.unitPlanHeading}</SectionHeading>
      <div className="mt-2 space-y-1 text-sm">
        <p><Label>{c.lessonMapLabel}:</Label> {plan.lesson_map.map((l) => c.lessonMapItem(l.lesson_no, l.topic)).join(' · ')}</p>
        <p><Label>{c.formativeLabel}:</Label> {p.formative}</p>
        <p><Label>{c.placementLabel}:</Label> {p.summative_placement.map((x) => c.placement(x.kind, x.lesson_no)).join(' · ')}</p>
        <div>
          <Label>{c.rubricNoteLabel}:</Label>
          <ul className="list-disc pl-5">
            {(['상', '중', '하'] as const).map((lv) => <li key={lv}><span className="font-semibold">{copy.feedbackLevels[lv]}</span> {p.rubric_note[lv]}</li>)}
          </ul>
        </div>
      </div>
    </Card>
  )
}

function QuizView({ quiz, showAnswers }: { quiz: QuizItem[]; showAnswers: boolean }) {
  if (quiz.length === 0) return null
  const c = copy.lessons.quiz
  return (
    <div className="mt-3">
      <p className="font-semibold text-ink-500">{copy.lessons.quizHeading}</p>
      <ol className="mt-1 list-decimal space-y-2 pl-5">
        {quiz.map((q, i) => (
          <li key={i}>
            <p>{q.q} <Badge tone="gray">{c.typeLabel[q.type]}</Badge></p>
            {/* 보기 목록은 2026-09-26 이전에 게시된 판의 선택형 퀴즈에만 있다 — 새 세트의 퀴즈는 단답형만(choices null) */}
            {q.choices && <ul className="mt-1 list-disc pl-5">{q.choices.map((ch, j) => <li key={j}>{ch}</li>)}</ul>}
          </li>
        ))}
      </ol>
      {!showAnswers && <p className="mt-1 text-ink-500">{c.answersHidden}</p>}
    </div>
  )
}

function LessonCard({ l, showAnswers, open }: { l: Lesson; showAnswers: boolean; open: boolean }) {
  const c = copy.lessons
  const t = l.time_budget
  const materials = l.materials_used.map((id) => `${copy.materials.idLabel} ${id}`).join(', ')
  const kinds = lessonAssessments(l)
  // 단원 평가 차시(대표 2026-09-26: 마지막 교수 차시 뒤, 서술형 작성 + 논술형 작성 — 분은 ASSESSMENT_SESSION)는 가르치는 차시와 구별되게 레몬 테두리와 안내 한 줄
  const session = isUnitAssessmentSession(l)
  return (
    <div data-lesson-kind={isAssessmentSession(l) ? 'assessment' : 'teaching'} className={`rounded-xl border p-3 text-sm ${session ? 'border-lemon-300 bg-lemon-100/30' : 'border-ink-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold">{c.columns.no} {l.no} · {l.topic}</p>
        {session && <Badge tone="lemon">{c.assessmentSessionBadge}</Badge>}
        <Badge tone="gray">{l.standards.join(', ')}</Badge>
        {kinds.length > 0 && <Badge tone="mint">{kinds.join(' + ')}</Badge>}
        {l.mergeable_with !== null && <Badge tone="gray">{c.mergeableLabel(l.mergeable_with)}</Badge>}
        <Badge tone="gray">{c.timeLabel(t.intro_min, t.main_min, t.wrapup_min)}</Badge>
      </div>
      {session && <p className="mt-2 text-ink-700">{c.assessmentSessionNote(SHORT_MINUTES, ESSAY_MINUTES)}</p>}
      <p className="mt-2"><Label>{c.columns.keyQuestion}:</Label> {l.key_question}</p>
      <p><Label>{c.columns.goal}:</Label> {l.goal}</p>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-ink-500">{c.flow.intro} ({t.intro_min}′)</p>
          <ul className="list-disc pl-5">{l.flow.intro.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div>
          <p className="font-semibold text-ink-500">{c.flow.main} ({t.main_min}′)</p>
          {l.flow.main.map((m, i) => (
            <div key={i} className="mt-1">
              <p className="font-semibold">{c.stepLabel(m.step_label, m.minutes)}</p>
              <ul className="list-disc pl-5">{m.activities.map((x, j) => <li key={j}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
        <div>
          <p className="font-semibold text-ink-500">{c.flow.wrapup} ({t.wrapup_min}′)</p>
          <ul className="list-disc pl-5">{l.flow.wrapup.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>

      {(l.materials_used.length > 0 || l.materials_needed.length > 0) && (
        <p className="mt-2">
          {l.materials_used.length > 0 && <><Label>{c.materialsLabel}:</Label> {materials}</>}
          {l.materials_used.length > 0 && l.materials_needed.length > 0 && ' · '}
          {l.materials_needed.length > 0 && <><Label>{c.needsLabel}:</Label> {l.materials_needed.join(', ')}</>}
        </p>
      )}

      {l.caution_notes.length > 0 && (
        <div className="mt-2">
          <p className="font-semibold text-ink-500">{c.cautionHeading}</p>
          <ul className="list-disc pl-5">{l.caution_notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {l.merge_note && <p className="mt-1 text-ink-500">{c.mergeNoteLabel}: {l.merge_note}</p>}

      {l.worksheet.tasks.length > 0 && (
        <div className="mt-2">
          <p className="font-semibold text-ink-500">{c.worksheetHeading}</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            {l.worksheet.tasks.map((w) => <li key={w.no}><Badge tone="gray">{c.worksheetTier(w.tier, w.level_ref)}</Badge> {w.prompt}</li>)}
          </ol>
          {l.worksheet.self_check.length > 0 && <p className="mt-1 text-ink-500">{c.selfCheckHeading}: {l.worksheet.self_check.join(' / ')}</p>}
        </div>
      )}

      {l.images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {l.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={c.imagesAlt(l.no, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
          ))}
        </div>
      )}

      <QuizView quiz={l.formative_check.quiz} showAnswers={showAnswers} />

      {showAnswers && (l.teacher_script.questions.length > 0 || l.worksheet.tasks.length > 0 || l.formative_check.quiz.length > 0) && (
        <Answers open={open}>
          {l.teacher_script.questions.length > 0 && (
            <div>
              <p className="font-semibold text-ink-500">{c.scriptHeading}</p>
              <ol className="list-decimal pl-5">
                {l.teacher_script.questions.map((q, i) => (
                  <li key={i}>{q.prompt} <span className="text-ink-500">— {c.scriptExpected}: {q.expected_answer} · {c.scriptStuck}: {q.if_stuck}</span></li>
                ))}
              </ol>
            </div>
          )}
          {l.worksheet.tasks.length > 0 && (
            <div>
              <p className="font-semibold text-ink-500">{c.worksheetHeading} · {c.worksheetExpected}</p>
              <ol className="list-decimal pl-5">{l.worksheet.tasks.map((w) => <li key={w.no}>{w.expected}</li>)}</ol>
            </div>
          )}
          {l.formative_check.quiz.length > 0 && (
            <div>
              <p className="font-semibold text-ink-500">{c.quizHeading}</p>
              <ol className="list-decimal pl-5">
                {l.formative_check.quiz.map((q, i) => <li key={i} className="text-mint-700">{c.quiz.answerLabel}: {q.answer} · {c.quiz.explanationLabel}: {q.explanation}</li>)}
              </ol>
            </div>
          )}
        </Answers>
      )}
    </div>
  )
}

// v2 채점표: 요소마다 0..max 척도(서술형 2~3요소 합 6점 — 옛 판 1~3요소 합 3점, 논술형 4요소 × 0~4). 요소마다 점수·기대 수행·예 표 하나.
// 총체적 상/중/하는 두 문항 모두(C-15, 대표 2026-09-26) — 옛 판 서술형은 없을 수 있다.
function RubricView({ rubric }: { rubric: Rubric }) {
  const c = copy.rubric
  const s = copy.shortRubric
  return (
    <div className="space-y-3">
      {rubric.criteria.map((cr, i) => (
        <div key={i} className="overflow-x-auto">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {c.criterionLabel(cr.name, cr.max)} <Badge tone="gray">{cr.axis}</Badge> <span className="font-normal text-ink-500">{c.conditionsLabel(cr.condition_nos)}</span>
          </p>
          <table className="mt-1 w-full min-w-[420px] text-left">
            <thead>
              <tr className="border-b border-ink-100 text-ink-500">
                <th className="w-16 py-1 pr-3">{s.pointsLabel}</th><th className="py-1 pr-3">{s.expectationLabel}</th><th className="py-1 pr-3">{s.exampleLabel}</th>
              </tr>
            </thead>
            <tbody>
              {[...cr.scale].sort((a, b) => b.points - a.points).map((step) => (
                <tr key={step.points} className="border-b border-ink-50 align-top">
                  <td className="py-1 pr-3">{c.pointLabel(step.points)}</td>
                  <td className="py-1 pr-3">{step.descriptor}</td>
                  <td className="py-1 pr-3 text-ink-500">{step.example ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {rubric.holistic && (
        <div>
          <p className="font-semibold text-ink-500">{c.holisticHeading}</p>
          <ul className="list-disc pl-5">
            {(['상', '중', '하'] as const).map((lv) => <li key={lv}><span className="font-semibold">{copy.feedbackLevels[lv]}</span> {rubric.holistic![lv]}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// 문제지 인쇄 답란(data-print="sheet-only" → 화면·평소 인쇄에는 안 보임). 서술형 10줄(6점 = 값·문장 서너 개), 논술형 20줄, 종이 답안 문항은 네모 칸.
export const ANSWER_LINES = { 서술형: 10, 논술형: 20 } as const

function AnswerSpace({ item }: { item: AssessmentItem }) {
  if (item.conditions.answer_mode === 'paper') {
    return <div data-print="sheet-only" data-answer-kind="paper" className="answer-space"><div className="answer-box">{copy.print.paperBox}</div></div>
  }
  return (
    <div data-print="sheet-only" data-answer-kind={item.kind} className="answer-space mt-2">
      {Array.from({ length: ANSWER_LINES[item.kind] }, (_, i) => <div key={i} data-answer-line className="answer-line" />)}
    </div>
  )
}

function AssessmentItemView({ item, no, showAnswers, open }: { item: AssessmentItem; no: number; showAnswers: boolean; open: boolean }) {
  const c = copy.assessment
  const cd = c.conditions
  return (
    <div data-print="item" className="rounded-xl border border-ink-100 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{no}.</span>
        <span data-print="omit" className="flex flex-wrap items-center gap-2">
          <Badge tone="gray">{c.kindLabel[item.kind]}</Badge>
          <Badge tone="gray">{c.lessonLabel(item.lesson_no)}</Badge>
          <Badge tone="mint">{c.pointsLabel(item.points)}</Badge>
          <Badge tone={item.conditions.answer_mode === 'paper' ? 'lemon' : 'gray'}>{cd.answerMode[item.conditions.answer_mode]}</Badge>
        </span>
      </div>
      <div data-print="omit">
        <p className="mt-2"><Label>{c.elementsLabel}:</Label> {item.evaluation_elements.join(' · ')}</p>
        {item.situation && <p><Label>{c.situationLabel}:</Label> {c.situation(item.situation.role, item.situation.audience, item.situation.purpose, item.situation.product)}</p>}
        <p><Label>{c.materialsLabel}:</Label> {item.materials_used.map((id) => `${copy.materials.idLabel} ${id}`).join(', ')}</p>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-base font-semibold">{item.stem}</p>

      <div className="mt-2 rounded-lg bg-ink-100/40 p-2">
        {/* 조건 문장이 없는 문항(서술형, C-32)은 "조건" 머리글·빈 목록 없이 분량·형식 줄만(화면·문제지 인쇄 모두) */}
        {item.conditions.items.length > 0 && (
          <>
            <p className="font-semibold text-ink-500">{cd.heading}</p>
            <ul className="space-y-0.5">
              {item.conditions.items.map((x) => (
                <li key={x.no}>
                  <span className="font-semibold">{cd.itemNo(x.no)}</span> {x.text}{' '}
                  <span data-print="omit"><Badge tone="gray">{x.category}</Badge></span>
                  {x.points !== null && <> <Badge tone="gray">{cd.pointsLabel(x.points)}</Badge></>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={`${item.conditions.items.length > 0 ? 'mt-1 ' : ''}text-ink-500`}>
          {cd.lengthLabel}: {item.conditions.length} · {cd.formatLabel}: {item.conditions.format}
          {item.conditions.overflow_rule && ` · ${cd.overflowLabel}: ${item.conditions.overflow_rule}`}
        </p>
      </div>

      <AnswerSpace item={item} />

      {showAnswers && (
        <Answers open={open}>
          <p className="font-semibold text-ink-500">{copy.rubricHeading}</p>
          <RubricView rubric={item.rubric} />
          <div>
            <p className="font-semibold text-ink-500">{c.notesHeading}</p>
            <ul className="list-disc pl-5">{item.rubric.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold text-ink-500">{c.exemplarsHeading}</p>
            <div className="space-y-2">
              {item.exemplar_answers.map((e, i) => (
                <div key={i} className="rounded-lg bg-white p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="mint">{c.exemplarLabel(e.level, e.points)}</Badge>
                    <span className="text-ink-500">{c.exemplarScores(e.scores)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{e.text}</p>
                  <p className="mt-1 text-ink-500">{c.rationaleLabel}: {e.rationale}</p>
                </div>
              ))}
            </div>
          </div>
          <p><Label>{c.levelMapHeading}:</Label> {item.level_map.map((l) => `${l.level} ${l.min}~${l.max}`).join(' / ')}</p>
          <ul className="list-disc pl-5 text-ink-500">{item.level_map.map((l) => <li key={l.level}>{l.level}: {l.trait}</li>)}</ul>
          {item.min_competency && <p><Label>{c.minCompetencyLabel}:</Label> {item.min_competency}</p>}
        </Answers>
      )}
    </div>
  )
}

function AssessmentSection({ assessment, showAnswers, open }: { assessment: Snapshot['assessment']; showAnswers: boolean; open: boolean }) {
  if (!assessment) return null
  const gb = copy.gradeBoundaries
  return (
    <>
      <Card print="keep">
        <SectionHeading>{copy.assessmentHeading}</SectionHeading>
        <div className="mt-3 space-y-3">
          {assessment.items.map((item, i) => <AssessmentItemView key={i} item={item} no={i + 1} showAnswers={showAnswers} open={open} />)}
        </div>
      </Card>

      <Card>
        <SectionHeading>{copy.gradeBoundariesHeading}</SectionHeading>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-ink-500">
                <th className="py-1 pr-3">{gb.gradeLabel}</th><th className="py-1 pr-3">{gb.rangeLabel}</th><th className="py-1 pr-3">{gb.bandLabel}</th><th className="py-1 pr-3">{gb.levelRefLabel}</th>
              </tr>
            </thead>
            <tbody>
              {assessment.grade_boundaries.map((b) => (
                <tr key={b.grade} className="border-b border-ink-50">
                  <td className="py-1 pr-3">{b.grade}</td><td className="py-1 pr-3">{b.min}~{b.max}</td><td className="py-1 pr-3">{b.band}</td><td className="py-1 pr-3">{b.level_ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionHeading>{copy.feedbackTemplatesHeading}</SectionHeading>
        <div className="mt-3 space-y-2 text-sm">
          {(['상', '중', '하'] as const).map((lv) => <p key={lv}><span className="font-semibold">{copy.feedbackLevels[lv]}</span>: {assessment.feedback_templates[lv]}</p>)}
        </div>
      </Card>
    </>
  )
}

function TeacherGuideSection({ guide }: { guide: Snapshot['teacher_guide'] }) {
  if (!guide) return null
  const c = copy.teacherGuide
  const g = guide.grading_guide
  const perLesson = guide.per_lesson.filter((l) => l.notes.length > 0)
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
          <ul className="mt-1 list-disc space-y-1 pl-5">{guide.glossary.map((x, i) => <li key={i}>{x.term} — {x.explanation}</li>)}</ul>
        </div>
        {guide.merge_guide.length > 0 && (
          <div>
            <p className="font-semibold text-ink-500">{c.mergeHeading}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {guide.merge_guide.map((m, i) => (
                <li key={i}>
                  <span className="font-semibold">{c.mergeLabel(m.lessons[0], m.lessons[1])}</span> — {c.mergeSkip}: {m.skip_activities.join(', ')}
                  <span className="text-ink-500"> ({c.mergeTime(m.time_budget_120.intro_min, m.time_budget_120.main_min, m.time_budget_120.wrapup_min)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="font-semibold text-ink-500">{c.gradingHeading}</p>
          <p className="mt-1 font-semibold">{c.commonErrors}</p>
          <ul className="list-disc pl-5">{g.common_errors.map((e, i) => <li key={i}><span className="font-semibold">{c.commonErrorItem(e.item_no)}</span> {e.error} → {e.how_to_read}</li>)}</ul>
          <p className="mt-1 font-semibold">{c.reviewTips}</p>
          <ul className="list-disc pl-5">{g.review_tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="mt-1"><Label>{c.retryLabel}:</Label> {g.retry_guidance}</p>
        </div>
        {perLesson.length > 0 && (
          <div>
            <p className="font-semibold text-ink-500">{c.perLessonHeading}</p>
            <ul className="mt-1 space-y-2">
              {perLesson.map((l) => (
                <li key={l.no}>
                  <p className="font-semibold">{c.lessonLabel(l.no)}</p>
                  <ul className="list-disc space-y-0.5 pl-5">{l.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

function NoticePlanSection({ plan }: { plan: Snapshot['notice_plan'] }) {
  if (!plan) return null
  const c = copy.noticePlan
  return (
    <Card>
      <SectionHeading>{copy.noticePlanHeading}</SectionHeading>
      <div className="mt-3 space-y-2 text-sm">
        {plan.per_lesson.map((p) => (
          <div key={p.lesson_no} className="rounded-xl border border-ink-100 p-3">
            <p className="font-semibold">{c.lessonLabel(p.lesson_no)}</p>
            <p><Label>{c.summary}:</Label> {p.topic_summary}</p>
            <p><Label>{c.preview}:</Label> {p.preview}</p>
            <p><Label>{c.home}:</Label> {p.home_study_suggestion}</p>
            {p.quiz_notes.length > 0 && <p className="text-ink-500">{c.quizNotes}: {p.quiz_notes.map((q) => `${q.quiz_no}) ${q.wrong_note}`).join(' / ')}</p>}
            {p.criteria_phrases && (
              <div className="mt-1">
                <p className="font-semibold text-ink-500">{c.phrases}</p>
                <ul className="list-disc pl-5">
                  {p.criteria_phrases.map((cp) => (
                    <li key={cp.criterion_name}><span className="font-semibold">{cp.criterion_name}</span> — {c.good}: {cp.good.join(' / ')} · {c.improve}: {cp.improve.join(' / ')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <p className="text-ink-500">{plan.footer_disclaimer}</p>
      </div>
    </Card>
  )
}

export function PackageView({ snapshot, mode, showAnswers = false }: { snapshot: Snapshot; mode: 'admin' | 'teacher'; showAnswers?: boolean }) {
  const c = copy
  // 관리자 미리보기는 채점 자료를 펼친 채, 원장 열람은 접힌 채로 시작한다(스펙 §2.9).
  const open = mode === 'admin'
  return (
    <div data-package-view className="space-y-4">
      {/* 문제지 인쇄(html.print-questions)에서는 print="keep" 칸(표지·핵심질문·자료·문항)만 남는다 — app/globals.css */}
      <Card print="keep">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
          <span data-print="omit"><Badge tone="mint">{c.cover.versionLabel(snapshot.cover.version)}</Badge></span>
        </div>
        <p className="mt-1 text-sm text-ink-500">{c.cover.meta(snapshot.cover.level, snapshot.cover.grade, snapshot.cover.subject)}</p>
        <p data-print="omit" className="mt-1 text-xs text-ink-500">{c.cover.publishedAtLabel}: {snapshot.cover.published_at}</p>
        <div data-print="sheet-only">
          <p className="student-line">{c.print.studentLine.name} <span /> {c.print.studentLine.date} <span /></p>
        </div>
      </Card>

      {snapshot.intro.trim() !== '' && (
        <Card>
          <SectionHeading>{c.intro}</SectionHeading>
          <p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.intro}</p>
        </Card>
      )}

      <StandardsSection standards={snapshot.standards} />
      <ReconstructionSection snapshot={snapshot} />

      <Card>
        <SectionHeading>{c.learningGoalsHeading}</SectionHeading>
        <ul className="mt-2 space-y-1 text-sm">
          {snapshot.learning_goals.map((g, i) => <li key={i}><Badge tone="lavender">{c.learningGoals.axisLabel(g.axis)}</Badge> {g.text}</li>)}
        </ul>
      </Card>

      <Card print="keep">
        <SectionHeading>{c.keyQuestionHeading}</SectionHeading>
        <p className="mt-2 text-sm">{snapshot.key_question}</p>
      </Card>

      <UnitPlanSection plan={snapshot.unit_plan} />

      {snapshot.lessons.length > 0 && (
        <Card>
          <SectionHeading>{c.lessonsHeading}</SectionHeading>
          <div className="mt-3 space-y-4">{snapshot.lessons.map((l) => <LessonCard key={l.no} l={l} showAnswers={showAnswers} open={open} />)}</div>
        </Card>
      )}

      <MaterialsSection materials={snapshot.materials} />
      <AssessmentSection assessment={snapshot.assessment} showAnswers={showAnswers} open={open} />
      <TeacherGuideSection guide={snapshot.teacher_guide} />
      <NoticePlanSection plan={snapshot.notice_plan} />

      {snapshot.references.length > 0 && (
        <Card>
          <SectionHeading>{c.assessment.referencesHeading}</SectionHeading>
          <ul className="mt-2 list-disc pl-5 text-sm">{snapshot.references.map((r) => <li key={r.id}>{r.id} — {r.source}</li>)}</ul>
        </Card>
      )}

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
