import type { z } from 'zod'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { Snapshot } from '@/lib/studio/publish'
import type { AssessmentItem as AssessmentItemSchema, Rubric as RubricSchema } from '@/lib/studio/schemas'
import { getLevels } from '@/lib/reference/levels'
import { sortScale } from '@/lib/studio/scale'
import { app } from '@/content/site'
import { Answers, Aside, KV, LabeledLines, SubLabel } from './parts/common'
import { MaterialsSection, ItemMaterials, type MaterialLike } from './parts/MaterialsFull'
import { embeddedMaterialIds } from '@/lib/studio/item-materials'
import { LessonCards } from './parts/LessonCards'
import { UnitPlanView } from './parts/UnitPlanView'
import { TeacherGuideView } from './parts/TeacherGuideView'
import { NoticePlanView } from './parts/NoticePlanView'

// v2 패키지 화면(스펙 §2.9). 카드 순서 = 표지 → 소개 → 성취기준(+A~E 접이식) → 재구조화 표 → 학습 목표(축 배지) → 핵심질문 →
// 평가 계획 → 차시 카드(시간·소단계·발문 대본·준비물·유의점·활동지·퀴즈; 마지막 교수 차시 뒤 단원 평가 차시는 레몬 테두리 카드) →
// 자료(출처 배지) → 문항 카드 2장(서술형·논술형, 옛 판 3장; 문항 = 자료 + 문항 한 덩어리 — 카드 안에 그 문항의 <자료 1>·<자료 2> 상자, 문항별 채점표는 카드 안 접이식) →
// 채점 기준(두 문항 공통 등급표 level_ref·피드백 틀, 접이식 — 2026-09-25) → 교사용 지침서 → 안내장 틀 → 참고한 공개 자료 → 생성 모델(관리자만).
// 정답·예시답안 같은 채점 자료는 <details> 로 묶는다 — 관리자 미리보기는 펼친 채, 원장 열람(mode='teacher')은 접힌 채로 시작한다.
// 차시 카드·자료·평가 계획·교사용 지침서·안내장 틀은 components/studio/parts/ 의 조각(서버·클라이언트 공용, 제작소 단계 탭도 같은 조각을 쓴다).
// 이 파일은 성취기준(getLevels 가 node:fs)·문항·채점 기준처럼 서버에서만 그리는 칸과 조립만 맡는다(사용처: 관리자 세트 page, 원장 문항 page).
// 차시 카드의 "교사용 지침" 칸(발문 대본·유의점·지침서의 그 차시 메모)은 관리자·원장 화면에만 있다 — 학생 화면은 이 조립을 쓰지 않는다.
// 읽기 위계(오너 요청 2026-09-26, 모든 과목): 내용 목록은 옆으로 잇지 않고 한 줄에 하나씩 — 평가 요소·조건(번호)·분량/형식·유의점·
// 예시답안·A~E(수준마다 한 줄). 문두는 text-base 굵게, 소제목은 SubLabel, 보조 설명은 옅게. 코드·배지·자료 ID 같은 메타데이터만 한 줄에.

type AssessmentItem = z.infer<typeof AssessmentItemSchema>
type Rubric = z.infer<typeof RubricSchema>

const copy = app.packageView

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold">{children}</h2>
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

// 학생 차시 패널(app/student/assignments/[id]/page.tsx)이 쓰던 import 경로 호환 — 본체는 parts/MaterialsFull.tsx
export { MaterialsSection }

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
                  <td className="py-1 pr-3"><ul className="space-y-0.5">{r.reason.map((x, i) => <li key={i}>{x}</li>)}</ul></td>
                  <td className="py-1 pr-3"><ul className="space-y-0.5">{r.learning_elements.map((x, i) => <li key={i}>{x}</li>)}</ul></td>
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
  return (
    <Card>
      <SectionHeading>{copy.unitPlanHeading}</SectionHeading>
      <UnitPlanView plan={plan} />
    </Card>
  )
}

// v2 채점표: 요소마다 0..max 척도(서술형 2~3요소 합 6점 — 옛 판 1~3요소 합 3점, 논술형 4요소 × 0~4). 요소마다 점수·기대 수행·예 표 하나.
// 척도는 0점부터 오름차순(저장 순서와 무관 — lib/studio/scale.ts, 제작소 5단계 요약·채점 프롬프트와 같은 순서).
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
              {sortScale(cr.scale).map((step) => (
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
        <LabeledLines
          label={c.holisticHeading}
          items={(['상', '중', '하'] as const).map((lv) => <><span className="font-semibold">{copy.feedbackLevels[lv]}</span> {rubric.holistic![lv]}</>)}
        />
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

function AssessmentItemView({ item, no, materials, showAnswers, open }: { item: AssessmentItem; no: number; materials: MaterialLike[]; showAnswers: boolean; open: boolean }) {
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
      <div data-print="omit" className="mt-3 space-y-2">
        <LabeledLines label={c.elementsLabel} items={item.evaluation_elements} />
        {item.situation && <KV label={c.situationLabel}>{c.situation(item.situation.role, item.situation.audience, item.situation.purpose, item.situation.product)}</KV>}
        {/* 자료 ID 는 짧은 메타데이터라 한 줄에 */}
        <KV label={c.materialsLabel}>{item.materials_used.map((id) => `${copy.materials.idLabel} ${id}`).join(', ')}</KV>
      </div>

      <p data-item-stem className="mt-3 whitespace-pre-wrap text-base font-semibold leading-relaxed">{item.stem}</p>

      {/* 전제문·발문 아래, 조건 위에 그 문항의 자료(대표 연수 2기 p.18~20: 자료와 문항은 한 덩어리) — 화면·문제지 인쇄 모두 */}
      <ItemMaterials item={item} materials={materials} />

      <div data-item-conditions className="mt-3 space-y-2 rounded-lg bg-ink-100/40 p-3">
        {/* 조건 문장이 없는 문항(서술형, C-32)은 "조건" 머리글·빈 목록 없이 분량·형식 줄만(화면·문제지 인쇄 모두) */}
        {item.conditions.items.length > 0 && (
          <div>
            <SubLabel>{cd.heading}</SubLabel>
            <ol className="mt-1 space-y-1">
              {item.conditions.items.map((x) => (
                <li key={x.no}>
                  <span className="font-semibold">{cd.itemNo(x.no)}</span> {x.text}{' '}
                  <span data-print="omit"><Badge tone="gray">{x.category}</Badge></span>
                  {x.points !== null && <> <Badge tone="gray">{cd.pointsLabel(x.points)}</Badge></>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {/* 분량·형식·초과 응답은 한 줄에 하나씩 */}
        <div className="space-y-0.5 text-ink-700">
          <KV label={cd.lengthLabel}>{item.conditions.length}</KV>
          <KV label={cd.formatLabel}>{item.conditions.format}</KV>
          <KV label={cd.overflowLabel}>{item.conditions.overflow_rule}</KV>
        </div>
      </div>

      <AnswerSpace item={item} />

      {showAnswers && (
        <Answers open={open}>
          <SubLabel>{copy.rubricHeading}</SubLabel>
          <RubricView rubric={item.rubric} />
          <LabeledLines label={c.notesHeading} items={item.rubric.notes} />
          <div>
            <SubLabel>{c.exemplarsHeading}</SubLabel>
            <div className="mt-1 space-y-2">
              {item.exemplar_answers.map((e, i) => (
                <div key={i} className="rounded-lg bg-white p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="mint">{c.exemplarLabel(e.level, e.points)}</Badge>
                    <span className="text-ink-500">{c.exemplarScores(e.scores)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{e.text}</p>
                  <Aside kind="rationale" label={c.rationaleLabel} faint>{e.rationale}</Aside>
                </div>
              ))}
            </div>
          </div>
          {/* A~E: 수준마다 한 줄 — 수준(굵게)·예상 점수·특징 */}
          <div data-level-map>
            <SubLabel>{c.levelMapHeading}</SubLabel>
            <ul className="mt-1 space-y-1">
              {item.level_map.map((l) => (
                <li key={l.level}>
                  <span className="inline-block w-6 font-bold">{l.level}</span> <span className="tabular-nums">{l.min}~{l.max}</span>
                  {l.trait && <span className="text-ink-500"> — {l.trait}</span>}
                </li>
              ))}
            </ul>
          </div>
          <KV stacked label={c.minCompetencyLabel}>{item.min_competency}</KV>
        </Answers>
      )}
    </div>
  )
}

function AssessmentSection({ assessment, materials, showAnswers, open }: { assessment: Snapshot['assessment']; materials: MaterialLike[]; showAnswers: boolean; open: boolean }) {
  if (!assessment) return null
  return (
    <>
      <Card print="keep">
        <SectionHeading>{copy.assessmentHeading}</SectionHeading>
        <div className="mt-3 space-y-3">
          {assessment.items.map((item, i) => <AssessmentItemView key={i} item={item} no={i + 1} materials={materials} showAnswers={showAnswers} open={open} />)}
        </div>
      </Card>

      {showAnswers && <GradingCriteriaCard assessment={assessment} open={open} />}
    </>
  )
}

/**
 * 두 문항 공통 채점 기준(등급표 + 피드백 틀) — 문항 카드와 떨어진 칸(오너 요청 2026-09-25, 모든 과목 공통).
 * 문항별 채점표는 각 문항 카드의 접이식에 그대로 둔다. 채점 자료라 문항 채점표와 같은 접이식(관리자 펼침·원장 접힘,
 * data-print="omit")에 담는다 — 문제지 인쇄(print="keep" 칸만)에는 원래 나오지 않는다.
 */
function GradingCriteriaCard({ assessment, open }: { assessment: NonNullable<Snapshot['assessment']>; open: boolean }) {
  const gb = copy.gradeBoundaries
  return (
    <Card>
      <SectionHeading>{copy.gradingCriteriaHeading}</SectionHeading>
      <p className="mt-1 text-sm text-ink-500">{copy.gradingCriteriaNote}</p>
      <Answers open={open}>
        <h3 className="text-base font-bold">{copy.gradeBoundariesHeading}</h3>
        <div className="overflow-x-auto">
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
        <h3 className="pt-2 text-base font-bold">{copy.feedbackTemplatesHeading}</h3>
        <ul className="space-y-2 text-sm">
          {(['상', '중', '하'] as const).map((lv) => (
            <li key={lv}>
              <p className="font-semibold">{copy.feedbackLevels[lv]}</p>
              <p className="mt-0.5 pl-3 text-ink-700">{assessment.feedback_templates[lv]}</p>
            </li>
          ))}
        </ul>
      </Answers>
    </Card>
  )
}

function TeacherGuideSection({ guide, lessons }: { guide: Snapshot['teacher_guide']; lessons: Snapshot['lessons'] }) {
  if (!guide) return null
  return (
    <Card>
      <SectionHeading>{copy.teacherGuideHeading}</SectionHeading>
      <TeacherGuideView guide={guide} lessons={lessons} />
    </Card>
  )
}

function NoticePlanSection({ plan }: { plan: Snapshot['notice_plan'] }) {
  if (!plan) return null
  return (
    <Card>
      <SectionHeading>{copy.noticePlanHeading}</SectionHeading>
      <NoticePlanView plan={plan} />
    </Card>
  )
}

export function PackageView({ snapshot, mode, showAnswers = false }: { snapshot: Snapshot; mode: 'admin' | 'teacher'; showAnswers?: boolean }) {
  const c = copy
  // 관리자 미리보기는 채점 자료를 펼친 채, 원장 열람은 접힌 채로 시작한다(스펙 §2.9).
  const open = mode === 'admin'
  return (
    <div data-package-view className="space-y-4">
      {/* 문제지 인쇄(html.print-questions)에서는 print="keep" 칸(표지·핵심질문·문항 — 자료는 문항 안에; 문항 밖 자료가 있을 때만 자료 칸)만 남는다 — app/globals.css */}
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
          <LessonCards lessons={snapshot.lessons} showAnswers={showAnswers} open={open} guide={snapshot.teacher_guide?.per_lesson} />
        </Card>
      )}

      {/* 자료 칸은 화면에 그대로(차시도 쓴다). 문제지 인쇄에는 문항 안에 실린 자료를 빼고, 전부 실렸으면 칸째 뺀다 */}
      <MaterialsSection materials={snapshot.materials} embeddedIds={[...embeddedMaterialIds(snapshot.assessment?.items)]} />
      {mode === 'admin' && (snapshot.materials_omitted?.length ?? 0) > 0 && (
        <p data-print="omit" className="text-sm text-ink-500">{c.materialsOmitted(snapshot.materials_omitted!)}</p>
      )}
      <AssessmentSection assessment={snapshot.assessment} materials={snapshot.materials} showAnswers={showAnswers} open={open} />
      <TeacherGuideSection guide={snapshot.teacher_guide} lessons={snapshot.lessons} />
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
