import type { z } from 'zod'
import { NOTICE_DISCLAIMER, type Lesson, type Assessment, type NoticePlan } from './schemas'

type LessonT = z.infer<typeof Lesson>
type AssessmentT = z.infer<typeof Assessment>
export type NoticePlanT = z.infer<typeof NoticePlan>

/** n자를 넘으면 n-1자 + '…'(zod max 길이를 지킨다). */
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

/**
 * 안내장 틀(7단계)의 결정적 초안 — fixture·mock용. AI 생성본과 같은 모양이며 문장 규칙(N-05·N-12)을 지킨다.
 * 서·논술형 문항이 있는 차시만 criteria_phrases 를 채우고 나머지는 null(대표님 잠정 결정: 안내장은 서·논술형 차시만).
 */
export function draftNoticePlan(lessons: LessonT[], assessment: AssessmentT | null): NoticePlanT {
  const sorted = [...lessons].sort((a, b) => a.no - b.no)
  return {
    per_lesson: sorted.map((l, i) => {
      const next = sorted[i + 1]
      const item = assessment?.items.find((it) => it.lesson_no === l.no) ?? null
      return {
        lesson_no: l.no,
        topic_summary: cut(`${l.topic} 활동에서 오늘의 핵심을 배웠습니다.`, 60),
        preview: next ? cut(`다음 시간에는 ${next.topic}을(를) 배워요.`, 50) : '이번 세트를 마무리했어요. 정리한 내용을 다시 읽어 봅시다.',
        home_study_suggestion: item ? '오늘 쓴 글의 보완할 점 한 가지를 고쳐 다시 써 봅시다.' : '오늘 퀴즈 중 틀린 문항과 같은 유형 1개를 다시 풀어 봅시다.',
        quiz_notes: l.formative_check.quiz.map((q, k) => ({ quiz_no: k + 1, wrong_note: cut(`다시 보면: ${q.explanation}`, 40) })),
        criteria_phrases: item
          ? item.rubric.criteria.map((c) => {
              const at = (p: number) => c.scale.find((s) => s.points === p)
              const top = at(c.max)!; const mid = at(Math.max(1, c.max - 1))!; const low = at(1) ?? mid
              return {
                criterion_name: c.name,
                good: [cut(top.descriptor, 60), cut(mid.descriptor, 60)],
                improve: [cut(`${low.descriptor}까지 해냈으나, ${top.descriptor}까지 써 봅시다`, 60), cut(`${c.name}에서 한 단계 더: ${top.descriptor}를 확인해 봅시다`, 60)],
              }
            })
          : null,
      }
    }),
    footer_disclaimer: NOTICE_DISCLAIMER,
  }
}
