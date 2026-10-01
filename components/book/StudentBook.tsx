import type { BookLesson, BookPlan } from '@/lib/book/plan'
import { app } from '@/content/site'
import { AnswerLines, Heading3, Heading4, ItemBody, MaterialBox, Section, SectionHeading, StudentFields, Toc, WritingSpace } from './parts'

// 학생용 교재(설계 §2 「학생용 교재 (답 없음)」): 표지 → 차례 → 이 단원에서 → 차시마다(제목·배울 내용 → 이 차시 자료 → 활동지(쓰는 칸) → 퀴즈(답 줄))
// → 단원 평가(문제지와 같은 내용) → 뒤표지. 정답·해설·채점표 서술·예시답안·수준 지도·출제 의도·발문·역량·번역은 플랜(lib/book/plan.ts, kind 'student')에
// 아예 없다 — 이 컴포넌트는 그 플랜만 그린다(tests/book-student-safety.test.ts 가 마크업을 훑어 확인). 흑백 인쇄 전제: 색이 아니라 괘선·굵기로 구분.

const copy = app.book
const pv = app.packageView

function Cover({ plan, draft }: { plan: BookPlan; draft: boolean }) {
  const c = plan.cover
  const section = plan.sections.find((s) => s.kind === 'cover')!
  return (
    <Section section={section} className="book-cover">
      <div>
        <p className="book-faint">{copy.cover.academy} · {copy.kindTitle.student}{draft && <> · <span data-book-draft>{copy.draftMark}</span></>}</p>
        <p className="book-cover-meta">{copy.cover.subjectLine(c.level, c.grade, c.subject)}</p>
        <h1 className="book-cover-title">{c.title}</h1>
        {c.setTitle && c.setTitle !== c.title && <p className="book-cover-sub">{c.setTitle}</p>}
        {c.unit && <p className="book-cover-sub">{c.unit}</p>}
      </div>
      <div>
        <StudentFields />
        <p className="book-faint">{copy.cover.versionLine(c.version)}</p>
      </div>
    </Section>
  )
}

function UnitIntro({ plan }: { plan: BookPlan }) {
  const u = copy.unit
  const section = plan.sections.find((s) => s.kind === 'unit')!
  return (
    <Section section={section}>
      <SectionHeading>{u.heading}</SectionHeading>
      {plan.keyQuestion && (
        <div className="book-block">
          <Heading3>{u.keyQuestion}</Heading3>
          <p className="book-key-question">{plan.keyQuestion}</p>
        </div>
      )}
      {plan.learningGoals.length > 0 && (
        <div className="book-block">
          <Heading3>{u.goals}</Heading3>
          {/* 학습 목표를 학생 말로 — 이미 있는 문장을 그대로, 축(지식·이해 …) 표시는 학생용에 두지 않는다 */}
          <ul className="book-list list-disc">{plan.learningGoals.map((g, i) => <li key={i}>{g.text}</li>)}</ul>
        </div>
      )}
      {plan.criteriaByItem.some((x) => x.criteria.length > 0) && (
        <div className="book-block" data-unit-criteria>
          <Heading3>{u.criteria}</Heading3>
          {plan.criteriaByItem.filter((x) => x.criteria.length > 0).map((x) => (
            <div key={x.itemNo} className="book-block">
              <Heading4>{u.criteriaItem(x.itemNo, x.kind)}</Heading4>
              <ul className="book-list list-disc">{x.criteria.map((cr, i) => <li key={i}>{pv.items.criterionLine(cr.name, cr.max)}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function LessonSection({ plan, l }: { plan: BookPlan; l: BookLesson }) {
  const c = copy.lesson
  const section = plan.sections.find((s) => s.kind === 'lesson' && s.lessonNo === l.no)!
  return (
    <Section section={section}>
      <SectionHeading>{l.title}</SectionHeading>
      {l.goal && <p className="book-lesson-goal"><span className="font-semibold">{c.goal}:</span> {l.goal}</p>}
      {l.keyQuestion && <p><span className="font-semibold">{c.keyQuestion}:</span> {l.keyQuestion}</p>}

      {l.materials.length > 0 && (
        <div className="book-block" data-lesson-materials>
          <Heading3>{c.materials}</Heading3>
          {l.materials.map((m) => <MaterialBox key={m.id} material={m} />)}
        </div>
      )}
      {l.images.length > 0 && (
        <div className="book-images">
          {l.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={pv.lessons.imagesAlt(l.no, i + 1)} />
          ))}
        </div>
      )}

      {l.tasks.length > 0 && (
        <div className="book-block" data-worksheet>
          <Heading3>{c.worksheet}</Heading3>
          <ol className="book-tasks">
            {l.tasks.map((w) => (
              <li key={w.no} data-book-task={w.no} className="book-task">
                <p className="font-semibold">{c.taskNo(w.no)} {w.prompt} <span className="book-faint font-normal">({c.tier(w.tier)})</span></p>
                <WritingSpace space={w.answer_space} />
              </li>
            ))}
          </ol>
          {l.selfCheck.length > 0 && (
            <div className="book-block">
              <Heading4>{c.selfCheck}</Heading4>
              <ul className="book-list">{l.selfCheck.map((s, i) => <li key={i}>{c.selfCheckBox} {s}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {l.quiz.length > 0 && (
        <div className="book-block" data-quiz>
          <Heading3>{c.quiz}</Heading3>
          <ol className="book-tasks">
            {l.quiz.map((q, i) => (
              <li key={i} data-book-quiz={i + 1} className="book-task">
                <p className="font-semibold">{c.quizNo(i + 1)} {q.q}</p>
                {/* 옛 판의 선택형 퀴즈만 보기 목록이 있다 — 새 세트는 단답형뿐 */}
                {q.choices && <ul className="book-list list-disc">{q.choices.map((ch, j) => <li key={j}>{ch}</li>)}</ul>}
                <p className="book-faint">{c.answerLabel}</p>
                <AnswerLines n={1} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  )
}

function AssessmentSection({ plan }: { plan: BookPlan }) {
  const a = plan.assessment
  if (!a) return null
  const section = plan.sections.find((s) => s.kind === 'assessment')!
  return (
    <Section section={section}>
      <SectionHeading>{copy.assessment.heading}</SectionHeading>
      <p className="book-faint">{copy.assessment.intro}</p>
      {a.items.map((it) => <ItemBody key={it.no} item={it} />)}
    </Section>
  )
}

function BackCover({ plan }: { plan: BookPlan }) {
  const section = plan.sections.find((s) => s.kind === 'back')!
  return (
    <Section section={section} className="book-back">
      <p className="book-faint">{copy.back.note}</p>
      <p className="book-faint">{copy.cover.academy}</p>
    </Section>
  )
}

/** 학생용 교재 한 권. draft = 본사 초안 미리보기 표시(게시 판이 없을 때). */
export function StudentBook({ plan, draft = false }: { plan: BookPlan; draft?: boolean }) {
  return (
    <article data-book="student" className="book">
      <Cover plan={plan} draft={draft} />
      <Toc plan={plan} />
      <UnitIntro plan={plan} />
      {plan.lessons.map((l) => <LessonSection key={l.no} plan={plan} l={l} />)}
      <AssessmentSection plan={plan} />
      <BackCover plan={plan} />
    </article>
  )
}
