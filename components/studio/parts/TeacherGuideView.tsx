import { app } from '@/content/site'
import { Label, arr } from './common'

// 교사용 지침서 전체 보기(카드 틀 없이) — 전체 안내·용어 설명·병합 안내·검수 요령·차시별 유의점.
// 원장 패키지 화면(PackageView)과 제작소 6단계 탭이 같은 모양을 쓴다(오너 규칙 2026-09-26: 단계 탭은 완성본 그대로).
// lessons 를 주면 차시별 유의점에 그 차시의 주제를 함께 적어 어느 차시 메모인지 바로 보이게 한다.
// 저장된 출력(옛 판·손으로 고친 판)을 그대로 받으므로 모든 필드를 느슨하게 읽는다.

type Time = { intro_min: number; main_min: number; wrapup_min: number }
export type TeacherGuideLike = {
  general?: { materials?: string[]; schedule_note?: string; purpose?: string } | null
  glossary?: { term: string; explanation: string }[]
  merge_guide?: { lessons: number[]; skip_activities?: string[]; time_budget_120?: Time | null }[]
  grading_guide?: {
    common_errors?: { item_no: number; error: string; how_to_read: string }[]
    review_tips?: string[]
    retry_guidance?: string
  } | null
  per_lesson?: { no: number; notes?: string[] }[]
}

const copy = app.packageView
const c = copy.teacherGuide

export function TeacherGuideView({ guide, lessons = [] }: { guide: TeacherGuideLike; lessons?: { no: number; topic?: string }[] }) {
  const general = guide.general
  const glossary = arr(guide.glossary)
  const merge = arr(guide.merge_guide)
  const g = guide.grading_guide
  const perLesson = arr(guide.per_lesson).filter((l) => arr(l.notes).length > 0)
  const topicOf = (no: number) => lessons.find((l) => l.no === no)?.topic
  return (
    <div className="mt-3 space-y-3 text-sm">
      {general && (
        <div>
          <p className="font-semibold text-ink-500">{c.generalHeading}</p>
          <p className="mt-1">{c.purposeLabel}: {general.purpose}</p>
          <p className="mt-1">{c.materialsLabel}: {arr(general.materials).join(', ')}</p>
          <p className="mt-1">{c.scheduleLabel}: {general.schedule_note}</p>
        </div>
      )}
      {glossary.length > 0 && (
        <div>
          <p className="font-semibold text-ink-500">{c.glossaryHeading}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{glossary.map((x, i) => <li key={i}>{x.term} — {x.explanation}</li>)}</ul>
        </div>
      )}
      {merge.length > 0 && (
        <div>
          <p className="font-semibold text-ink-500">{c.mergeHeading}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {merge.map((m, i) => {
              const t = m.time_budget_120
              return (
                <li key={i}>
                  <span className="font-semibold">{c.mergeLabel(m.lessons[0], m.lessons[1])}</span> — {c.mergeSkip}: {arr(m.skip_activities).join(', ')}
                  {t && <span className="text-ink-500"> ({c.mergeTime(t.intro_min, t.main_min, t.wrapup_min)})</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {g && (
        <div>
          <p className="font-semibold text-ink-500">{c.gradingHeading}</p>
          <p className="mt-1 font-semibold">{c.commonErrors}</p>
          <ul className="list-disc pl-5">{arr(g.common_errors).map((e, i) => <li key={i}><span className="font-semibold">{c.commonErrorItem(e.item_no)}</span> {e.error} → {e.how_to_read}</li>)}</ul>
          <p className="mt-1 font-semibold">{c.reviewTips}</p>
          <ul className="list-disc pl-5">{arr(g.review_tips).map((x, i) => <li key={i}>{x}</li>)}</ul>
          {g.retry_guidance && <p className="mt-1"><Label>{c.retryLabel}:</Label> {g.retry_guidance}</p>}
        </div>
      )}
      {perLesson.length > 0 && (
        <div>
          <p className="font-semibold text-ink-500">{c.perLessonHeading}</p>
          <ul className="mt-1 space-y-2">
            {perLesson.map((l) => {
              const topic = topicOf(l.no)
              return (
                <li key={l.no} data-guide-lesson={l.no}>
                  <p className="font-semibold">{topic ? c.lessonWithTopic(l.no, topic) : c.lessonLabel(l.no)}</p>
                  <ul className="list-disc space-y-0.5 pl-5">{arr(l.notes).map((n, i) => <li key={i}>{n}</li>)}</ul>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
