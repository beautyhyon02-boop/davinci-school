import { app } from '@/content/site'
import { Aside, KV, LabeledLines, Lines, SectionTitle, SubLabel, arr } from './common'

// 교사용 지침서 전체 보기(카드 틀 없이) — 전체 안내·용어 설명·병합 안내·검수 요령·차시별 유의점.
// 원장 패키지 화면(PackageView)과 제작소 6단계 탭이 같은 모양을 쓴다(오너 규칙 2026-09-26: 단계 탭은 완성본 그대로).
// lessons 를 주면 차시별 유의점에 그 차시의 주제를 함께 적어 어느 차시 메모인지 바로 보이게 한다.
// 읽기 위계(오너 요청 2026-09-26): 칸 제목(굵게) → 소제목 → 한 줄에 하나씩. 준비물·생략 활동도 쉼표로 잇지 않는다.
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
  const errors = arr(g?.common_errors)
  const perLesson = arr(guide.per_lesson).filter((l) => arr(l.notes).length > 0)
  const topicOf = (no: number) => lessons.find((l) => l.no === no)?.topic
  return (
    <div className="mt-3 space-y-6 text-sm">
      {general && (
        <section className="space-y-3">
          <SectionTitle>{c.generalHeading}</SectionTitle>
          <KV stacked label={c.purposeLabel}>{general.purpose}</KV>
          <LabeledLines label={c.materialsLabel} items={arr(general.materials)} />
          <KV stacked label={c.scheduleLabel}>{general.schedule_note}</KV>
        </section>
      )}
      {glossary.length > 0 && (
        <section>
          <SectionTitle>{c.glossaryHeading}</SectionTitle>
          <ul className="mt-2 space-y-2">
            {glossary.map((x, i) => (
              <li key={i}>
                <p className="font-semibold">{x.term}</p>
                <p className="mt-0.5 pl-3 text-ink-700">{x.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {merge.length > 0 && (
        <section>
          <SectionTitle>{c.mergeHeading}</SectionTitle>
          <ul className="mt-2 space-y-3">
            {merge.map((m, i) => {
              const t = m.time_budget_120
              return (
                <li key={i}>
                  <p className="font-semibold">{c.mergeLabel(m.lessons[0], m.lessons[1])}</p>
                  {t && <p className="text-xs text-ink-500">{c.mergeTime(t.intro_min, t.main_min, t.wrapup_min)}</p>}
                  <LabeledLines className="mt-1" label={c.mergeSkip} items={arr(m.skip_activities)} />
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {g && (
        <section className="space-y-3">
          <SectionTitle>{c.gradingHeading}</SectionTitle>
          {errors.length > 0 && (
            <div>
              <SubLabel>{c.commonErrors}</SubLabel>
              <ul className="mt-1 space-y-2">
                {errors.map((e, i) => (
                  <li key={i}>
                    <p><span className="font-semibold">{c.commonErrorItem(e.item_no)}</span> {e.error}</p>
                    <Aside label={c.howToReadLabel}>{e.how_to_read}</Aside>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <LabeledLines label={c.reviewTips} items={arr(g.review_tips)} />
          <KV stacked label={c.retryLabel}>{g.retry_guidance}</KV>
        </section>
      )}
      {perLesson.length > 0 && (
        <section>
          <SectionTitle>{c.perLessonHeading}</SectionTitle>
          <ul className="mt-2 space-y-3">
            {perLesson.map((l) => {
              const topic = topicOf(l.no)
              return (
                <li key={l.no} data-guide-lesson={l.no}>
                  <p className="font-semibold">{topic ? c.lessonWithTopic(l.no, topic) : c.lessonLabel(l.no)}</p>
                  <Lines items={arr(l.notes)} />
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
