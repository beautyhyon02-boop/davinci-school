import type { BookFeedbackPlan, BookItem, BookLesson, BookPlan, BookScriptQuestion, BookTask } from '@/lib/book/plan'
import { sortScale } from '@/lib/studio/scale'
import { TeacherGuideView } from '@/components/studio/parts/TeacherGuideView'
import { NoticePlanView } from '@/components/studio/parts/NoticePlanView'
import { app } from '@/content/site'
import { Below, BookTable, Heading3, Heading4, ItemBody, KV, LabeledList, MaterialBox, Section, SectionHeading, Toc } from './parts'

// 교사용 지도서(설계 §2 「교사용 지도서 (답 있음)」): 표지(교사용) → 차례 → 단원 계획(성취기준 원문·재구성, 학습목표 3차원, 핵심질문, 차시 구성표) →
// 차시마다(수업 흐름 → 교사 발문과 예상 답(아랫줄) → 자료 → 활동지와 정답·예시 답 → 퀴즈 정답·해설·역량 → 준비물·유의점·지침서 메모) →
// 단원 평가(문항 + 조건 + 채점 기준 + 예시 답안 + 수준 지도 + 출제 의도) → 교사용 지침 전체(영어 세트는 번역 포함) → 안내장 틀.
// 답은 질문 아랫줄에(Below). 원장·본사만 연다(학생 경로 없음).

const copy = app.book
const pv = app.packageView

function Cover({ plan, draft }: { plan: BookPlan; draft: boolean }) {
  const c = plan.cover
  const section = plan.sections.find((s) => s.kind === 'cover')!
  return (
    <Section section={section} className="book-cover">
      <div>
        <p className="book-faint">{copy.cover.academy} · <span data-book-teacher-mark className="font-bold">{copy.cover.teacherMark}</span> · {copy.kindTitle.teacher}{draft && <> · <span data-book-draft>{copy.draftMark}</span></>}</p>
        <p className="book-cover-meta">{copy.cover.subjectLine(c.level, c.grade, c.subject)}</p>
        <h1 className="book-cover-title">{c.title}</h1>
        {c.setTitle && c.setTitle !== c.title && <p className="book-cover-sub">{c.setTitle}</p>}
        {c.unit && <p className="book-cover-sub">{c.unit}</p>}
      </div>
      <div>
        <p className="book-faint">{copy.cover.versionLine(c.version)} · {pv.cover.publishedAtLabel} {c.published_at.slice(0, 10)}</p>
      </div>
    </Section>
  )
}

function UnitPlanSection({ plan }: { plan: BookPlan }) {
  const p = copy.plan
  const t = plan.teacher!
  const section = plan.sections.find((s) => s.kind === 'plan')!
  const detailOf = (code: string) => t.reconstructionDetail.find((r) => r.code === code)
  return (
    <Section section={section}>
      <SectionHeading>{p.heading}</SectionHeading>
      {t.standards.length > 0 && (
        <div className="book-block" data-plan-standards>
          <Heading3>{p.standards}</Heading3>
          <ul className="book-list">
            {t.standards.map((s) => {
              const d = detailOf(s.code)
              return (
                <li key={s.code} className="book-block">
                  <p className="font-semibold">{s.code}</p>
                  <Below kind="original" label={p.original}>{s.text}</Below>
                  {d && <Below kind="reconstructed" label={p.reconstructed(d.reconstruction_type)}>{d.reconstructed_text === s.text ? p.sameAsOriginal : d.reconstructed_text}</Below>}
                  {/* 재구조화 해설(L-14) — 그 뒤에 게시된 판에만 */}
                  {d?.reason_note && <Below kind="reason-note" label={pv.reconstructionTable.columns.note}>{d.reason_note}</Below>}
                </li>
              )
            })}
          </ul>
          {t.reconstruction && <KV stacked label={p.reconstructionNote}>{t.reconstruction}</KV>}
          {/* 세트 범위 메모(L-16) — 교사용 */}
          {t.scopeNote && <div data-scope-note><KV stacked label={p.scopeNote}>{t.scopeNote}</KV></div>}
        </div>
      )}
      {plan.learningGoals.length > 0 && (
        <div className="book-block">
          <Heading3>{p.goals}</Heading3>
          <ul className="book-list list-disc">{plan.learningGoals.map((g, i) => <li key={i}>{g.text} <span className="book-faint">({g.axis})</span></li>)}</ul>
        </div>
      )}
      {plan.keyQuestion && (
        <div className="book-block">
          <Heading3>{p.keyQuestion}</Heading3>
          <p className="book-key-question">{plan.keyQuestion}</p>
        </div>
      )}
      {t.planRows.length > 0 && (
        <div className="book-block" data-plan-table>
          <Heading3>{p.table}</Heading3>
          {/* 길러 주는 평가 요소 열(L-17)은 criteria_focus 가 있는 판에만 */}
          <BookTable
            columns={[p.columns.no, p.columns.topic, p.columns.materials, p.columns.assessment, ...(t.planRows.some((r) => r.criteria) ? [p.columns.criteria] : [])]}
            rows={t.planRows.map((r) => [
              r.no, r.topic,
              r.materials.length ? r.materials.map((id) => copy.lesson.materialLabel(id)).join(', ') : p.none,
              [...r.assessment, ...(r.quizCount > 0 ? [p.quizCell(r.quizCount)] : [])].join(' + ') || p.none,
              ...(t.planRows.some((x) => x.criteria) ? [r.criteria?.length ? r.criteria.join(' · ') : p.none] : []),
            ])}
          />
          {t.formative && <KV label={p.formative}>{t.formative}</KV>}
        </div>
      )}
    </Section>
  )
}

function Flow({ l }: { l: BookLesson }) {
  const c = copy.lesson
  const tp = l.teacher!
  const f = tp.flow
  if (!f) return null
  const tb = tp.time_budget
  const min = (n: number | undefined) => (typeof n === 'number' ? ` (${c.minutes(n)})` : '')
  return (
    <div className="book-block" data-lesson-flow>
      <Heading3>{c.flow}</Heading3>
      <LabeledList label={`${c.flowStep.intro}${min(tb?.intro_min)}`} items={f.intro ?? []} />
      <div className="book-block">
        <Heading4>{`${c.flowStep.main}${min(tb?.main_min)}`}</Heading4>
        {(f.main ?? []).map((m, i) => (
          <div key={i} className="book-block">
            <p className="font-semibold">{pv.lessons.stepLabel(m.step_label, m.minutes)}</p>
            <ul className="book-list list-disc">{(m.activities ?? []).map((x, j) => <li key={j}>{x}</li>)}</ul>
          </div>
        ))}
      </div>
      <LabeledList label={`${c.flowStep.wrapup}${min(tb?.wrapup_min)}`} items={f.wrapup ?? []} />
    </div>
  )
}

/** 교사 발문 → 아랫줄 예상 답 → 아랫줄 막힐 때 도움말. */
function ScriptList({ questions }: { questions: BookScriptQuestion[] }) {
  const c = copy.lesson
  if (questions.length === 0) return null
  return (
    <div className="book-block" data-lesson-script>
      <Heading3>{c.script}</Heading3>
      <ol className="book-tasks">
        {questions.map((q, i) => (
          <li key={i} data-script-question={i + 1} className="book-task">
            <p data-script-prompt className="font-semibold">{q.prompt}</p>
            {q.expected_answer && <Below kind="expected" label={c.expected}>{q.expected_answer}</Below>}
            {q.if_stuck && <Below kind="stuck" label={c.stuck}>{q.if_stuck}</Below>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 활동지 과제 → 아랫줄 기대 답, 그 뒤 자기평가(와 마지막 교수 차시의 자기 점검표). 결함 찾기 과제(L-19)는 표시만(학생용 교재에는 과제 문장만). */
function WorksheetAnswers({ tasks, selfCheck, selfCheckList = [] }: { tasks: BookTask[]; selfCheck: string[]; selfCheckList?: string[] }) {
  const c = copy.lesson
  if (tasks.length === 0 && selfCheckList.length === 0) return null
  return (
    <div className="book-block" data-worksheet>
      {tasks.length > 0 && (
        <>
          <Heading3>{c.worksheetAnswers}</Heading3>
          <ol className="book-tasks">
            {tasks.map((w) => (
              <li key={w.no} data-book-task={w.no} className="book-task">
                <p className="font-semibold">{c.taskNo(w.no)} {w.prompt} <span className="book-faint font-normal">({pv.lessons.worksheetTier(w.tier, w.level_ref)}{w.flaw_check ? ` · ${c.flawCheck}` : ''})</span></p>
                {w.expected && <Below kind="expected" label={pv.lessons.worksheetExpected}>{w.expected}</Below>}
              </li>
            ))}
          </ol>
          <LabeledList label={c.selfCheck} items={selfCheck} />
        </>
      )}
      {selfCheckList.length > 0 && <div data-self-check-list><LabeledList label={c.selfCheckList} items={selfCheckList} /></div>}
    </div>
  )
}

/** 확인·피드백 계획(L-20) — 누구에게 → 아랫줄 무엇을 확인하고 어떻게 → 아랫줄 자기참조 문장 틀. 교사용. */
function FeedbackPlanBlock({ plan }: { plan: BookFeedbackPlan | null }) {
  const c = copy.lesson
  if (!plan) return null
  return (
    <div className="book-block" data-feedback-plan>
      <Heading3>{c.feedbackPlan}</Heading3>
      <p className="font-semibold">{c.feedbackWho(plan.who)}</p>
      <p>{plan.how}</p>
      {plan.sentence_frame && <Below kind="frame" label={c.feedbackFrame}>{plan.sentence_frame}</Below>}
    </div>
  )
}

function LessonSection({ plan, l }: { plan: BookPlan; l: BookLesson }) {
  const c = copy.lesson
  const tp = l.teacher!
  const section = plan.sections.find((s) => s.kind === 'lesson' && s.lessonNo === l.no)!
  return (
    <Section section={section}>
      <SectionHeading>{l.title}</SectionHeading>
      <p className="book-faint">
        {tp.standards.length > 0 && <>{c.standards} {tp.standards.join(', ')}</>}
        {tp.assessment.length > 0 && <> · {tp.assessment.join(' + ')}</>}
        {tp.mergeableWith != null && <> · {c.mergeable(tp.mergeableWith)}</>}
      </p>
      {l.goal && <p className="book-lesson-goal"><span className="font-semibold">{c.goal}:</span> {l.goal}</p>}
      {l.keyQuestion && <p><span className="font-semibold">{c.keyQuestion}:</span> {l.keyQuestion}</p>}

      <Flow l={l} />

      <ScriptList questions={tp.script} />

      {l.materials.length > 0 && (
        <div className="book-block" data-lesson-materials>
          <Heading3>{c.materials}</Heading3>
          {l.materials.map((m) => <MaterialBox key={m.id} material={m} teacherLabels />)}
        </div>
      )}

      <WorksheetAnswers tasks={l.tasks} selfCheck={l.selfCheck} selfCheckList={l.selfCheckList} />

      {l.quiz.length > 0 && (
        <div className="book-block" data-quiz>
          <Heading3>{c.quizAnswers}</Heading3>
          <ol className="book-tasks">
            {l.quiz.map((q, i) => (
              <li key={i} data-book-quiz={i + 1} className="book-task">
                <p className="font-semibold">{c.quizNo(i + 1)} {q.q}</p>
                {q.choices && <ul className="book-list list-disc">{q.choices.map((ch, j) => <li key={j}>{ch}</li>)}</ul>}
                {q.answer && <Below kind="answer" label={c.quizAnswer}>{q.answer}</Below>}
                {q.explanation && <Below kind="explanation" label={c.quizExplanation}>{q.explanation}</Below>}
                {(q.competency || q.level_ref) && (
                  <p className="book-faint">
                    {q.level_ref && <span>{c.quizLevel(q.level_ref)}</span>}
                    {q.competency && <span data-competency={q.competency}>{q.level_ref ? ' · ' : ''}{c.competency(q.competency)}</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <FeedbackPlanBlock plan={tp.feedbackPlan} />
      <LabeledList label={c.needs} items={tp.needed} />
      <LabeledList label={c.cautions} items={tp.cautions} />
      {tp.mergeNote && <KV label={c.mergeNote}>{tp.mergeNote}</KV>}
      <LabeledList label={c.guideNotes} items={tp.guideNotes} />
    </Section>
  )
}

function Rubric({ item }: { item: BookItem }) {
  const a = copy.assessment
  const r = item.teacher!.rubric
  return (
    <div data-book-rubric={item.no} className="book-block">
      <Heading3>{a.rubric}</Heading3>
      {r.criteria.map((cr, i) => (
        <div key={i} className="book-block" data-book-criterion>
          <p className="font-semibold">
            {a.criterion(cr.name, cr.max)} <span className="book-faint">({cr.axis})</span>
            {cr.competency && <span data-competency={cr.competency} className="book-faint"> · {copy.lesson.competency(cr.competency)}</span>}
            {cr.condition_nos.length > 0 && <span className="book-faint"> · {pv.rubric.conditionsLabel(cr.condition_nos)}</span>}
          </p>
          {(cr.taught_in?.length ?? 0) > 0 && <p data-taught-in className="book-faint">{a.taughtIn(cr.taught_in!)}</p>}
          <BookTable columns={[pv.shortRubric.pointsLabel, pv.shortRubric.expectationLabel, a.scaleExample]} rows={sortScale(cr.scale).map((s) => [a.scalePoints(s.points), s.descriptor, s.example ?? '-'])} />
        </div>
      ))}
      {r.holistic && <LabeledList label={a.holistic} items={(['상', '중', '하'] as const).map((lv) => <><span className="font-semibold">{pv.feedbackLevels[lv]}</span> {r.holistic![lv]}</>)} />}
      <LabeledList label={a.notes} items={r.notes ?? []} />
    </div>
  )
}

function ItemTeacherPart({ item }: { item: BookItem }) {
  const a = copy.assessment
  const t = item.teacher!
  return (
    <div className="book-item-teacher">
      <LabeledList label={a.intent} items={t.evaluation_elements} />
      {t.situation && <KV label={a.situation}>{pv.assessment.situation(t.situation.role, t.situation.audience, t.situation.purpose, t.situation.product)}</KV>}
      <Rubric item={item} />
      {t.exemplar_answers.length > 0 && (
        <div className="book-block" data-book-exemplars>
          <Heading3>{a.exemplars}</Heading3>
          {t.exemplar_answers.map((e, i) => (
            <div key={i} className="book-block book-exemplar">
              <p className="font-semibold">{a.exemplarLabel(e.level, e.points)} <span className="book-faint font-normal">{a.exemplarScores(e.scores)}</span></p>
              <p className="whitespace-pre-wrap">{e.text}</p>
              <Below kind="rationale" label={a.rationale}>{e.rationale}</Below>
            </div>
          ))}
        </div>
      )}
      {t.level_map.length > 0 && (
        <div className="book-block" data-level-map>
          <Heading3>{a.levelMap}</Heading3>
          <ul className="book-list">
            {t.level_map.map((l) => <li key={l.level}><span className="inline-block w-6 font-bold">{l.level}</span> <span className="tabular-nums">{l.min}~{l.max}</span>{l.trait && <span className="book-faint"> — {l.trait}</span>}</li>)}
          </ul>
        </div>
      )}
      <KV label={a.minCompetency}>{t.min_competency}</KV>
    </div>
  )
}

function AssessmentSection({ plan }: { plan: BookPlan }) {
  const a = copy.assessment
  const as = plan.assessment
  if (!as) return null
  const section = plan.sections.find((s) => s.kind === 'assessment')!
  const session = as.teacher?.session ?? null
  const gb = as.teacher?.grade_boundaries && as.teacher.feedback_templates ? { grade_boundaries: as.teacher.grade_boundaries, feedback_templates: as.teacher.feedback_templates } : null
  return (
    <Section section={section}>
      <SectionHeading>{a.heading}</SectionHeading>
      {session && (
        <div className="book-block" data-assessment-session>
          <Heading3>{a.sessionFlow}</Heading3>
          {session.time_budget && <p className="book-faint">{pv.lessons.timeLabel(session.time_budget.intro_min, session.time_budget.main_min, session.time_budget.wrapup_min)}</p>}
          <LabeledList label={copy.lesson.flowStep.intro} items={session.flow?.intro ?? []} />
          {(session.flow?.main ?? []).map((m, i) => <LabeledList key={i} label={pv.lessons.stepLabel(m.step_label, m.minutes)} items={m.activities ?? []} />)}
          <LabeledList label={copy.lesson.flowStep.wrapup} items={session.flow?.wrapup ?? []} />
          <LabeledList label={copy.lesson.cautions} items={session.caution_notes ?? []} />
          {/* 옛 판의 논술형 차시에는 발문·활동지가 있다(지금 구조의 단원 평가 차시는 비어 있다) */}
          <ScriptList questions={(session.teacher_script?.questions ?? []).map((q) => ({ prompt: q.prompt, expected_answer: q.expected_answer, if_stuck: q.if_stuck }))} />
          <WorksheetAnswers tasks={(session.worksheet?.tasks ?? []).map((w) => ({ no: w.no, prompt: w.prompt, tier: w.tier, level_ref: w.level_ref, answer_space: w.answer_space, expected: w.expected }))} selfCheck={session.worksheet?.self_check ?? []} />
        </div>
      )}
      {as.items.map((it) => (
        <div key={it.no} className="book-block">
          <ItemBody item={it} headerExtra={it.teacher ? <span className="book-faint"> · {a.linkedLesson(it.teacher.lesson_no)}</span> : null} />
          {it.teacher && <ItemTeacherPart item={it} />}
        </div>
      ))}
      {gb && (
        <div className="book-block" data-grade-boundaries>
          <Heading3>{a.gradeBoundaries}</Heading3>
          <BookTable columns={[a.gradeColumns.grade, a.gradeColumns.range, a.gradeColumns.band, a.gradeColumns.levelRef]} rows={gb.grade_boundaries.map((b) => [b.grade, `${b.min}~${b.max}`, b.band, b.level_ref])} />
          <Heading3>{a.feedback}</Heading3>
          <ul className="book-list">
            {(['상', '중', '하'] as const).map((lv) => <li key={lv}><p className="font-semibold">{pv.feedbackLevels[lv]}</p><p>{gb.feedback_templates[lv]}</p></li>)}
          </ul>
        </div>
      )}
    </Section>
  )
}

function GuideSection({ plan }: { plan: BookPlan }) {
  const g = plan.teacher?.guide
  const section = plan.sections.find((s) => s.kind === 'guide')
  if (!g || !section) return null
  const lessons = plan.lessons.map((l) => ({ no: l.no, topic: l.topic }))
  const materials = plan.lessons.flatMap((l) => l.materials).concat(plan.assessment?.items.flatMap((it) => it.materials.map((e) => e.material)).filter((m): m is NonNullable<typeof m> => !!m) ?? [])
  const uniq = [...new Map(materials.map((m) => [m.id, { id: m.id, title: m.title }])).values()]
  return (
    <Section section={section}>
      <SectionHeading>{copy.guide.heading}</SectionHeading>
      <div data-book-guide><TeacherGuideView guide={g} lessons={lessons} materials={uniq} /></div>
    </Section>
  )
}

function NoticeSection({ plan }: { plan: BookPlan }) {
  const n = plan.teacher?.noticePlan
  const section = plan.sections.find((s) => s.kind === 'notice')
  if (!n || !section) return null
  return (
    <Section section={section}>
      <SectionHeading>{copy.notice.heading}</SectionHeading>
      <div data-book-notice><NoticePlanView plan={n} /></div>
    </Section>
  )
}

/** 교사용 지도서 한 권. draft = 본사 초안 미리보기 표시(게시 판이 없을 때). */
export function TeacherBook({ plan, draft = false }: { plan: BookPlan; draft?: boolean }) {
  return (
    <article data-book="teacher" className="book">
      <Cover plan={plan} draft={draft} />
      <Toc plan={plan} />
      <UnitPlanSection plan={plan} />
      {plan.lessons.map((l) => <LessonSection key={l.no} plan={plan} l={l} />)}
      <AssessmentSection plan={plan} />
      <GuideSection plan={plan} />
      <NoticeSection plan={plan} />
    </article>
  )
}
