import type { z } from 'zod'
import { NOTICE_DISCLAIMER, type Lesson, type Assessment, type NoticePlan } from './schemas'

type LessonT = z.infer<typeof Lesson>
type AssessmentT = z.infer<typeof Assessment>
export type NoticePlanT = z.infer<typeof NoticePlan>

/**
 * n자 안으로 줄인다(zod max 길이). 따옴표는 먼저 지워 인용 중간에서 끊기지 않게 하고, 넘치면 앞 절반 이후의 마지막 낱말 경계
 * (공백·쉼표)에서 끊어 '…'을 붙인다. 끊은 자리에 짝 없는 여는 괄호가 남으면 그 괄호 앞에서 끊는다.
 */
export function clip(s: string, n: number): string {
  const t = s.replace(/["“”'‘’]/g, '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  let head = t.slice(0, n - 1)
  const at = Math.max(head.lastIndexOf(' '), head.lastIndexOf(','))
  if (at >= Math.floor(n / 2)) head = head.slice(0, at)
  const open = head.lastIndexOf('(')
  if (open > head.lastIndexOf(')')) head = head.slice(0, open)
  return `${head.replace(/[\s,·/+(]+$/u, '')}…`
}

/** 목적격 조사: 마지막 글자가 받침 없는 한글이면 '를', 받침 있으면 '을', 한글이 아니면 '을(를)'. */
export function objectParticle(word: string): '을' | '를' | '을(를)' {
  const code = word.trim().codePointAt(word.trim().length - 1) ?? 0
  if (code < 0xac00 || code > 0xd7a3) return '을(를)'
  return (code - 0xac00) % 28 === 0 ? '를' : '을'
}

const LIMIT = 60
const STEP_UP = ['까지 해냈으나, ', '까지 써 봅시다'] as const
const NEXT_LEVEL = ['에서 한 단계 더: ', ' 수준까지 써 봅시다'] as const

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
        topic_summary: clip(`${l.topic} 활동에서 오늘의 핵심을 배웠습니다.`, 60),
        preview: next ? clip(`다음 시간에는 ${next.topic}${objectParticle(next.topic)} 배워요.`, 50) : '이번 세트를 마무리했어요. 정리한 내용을 다시 읽어 봅시다.',
        home_study_suggestion: item ? '오늘 쓴 글의 보완할 점 한 가지를 고쳐 다시 써 봅시다.' : '오늘 퀴즈 중 틀린 문항과 같은 유형 1개를 다시 풀어 봅시다.',
        quiz_notes: l.formative_check.quiz.map((q, k) => ({ quiz_no: k + 1, wrong_note: clip(`다시 보면: ${q.explanation}`, 40) })),
        criteria_phrases: item
          ? item.rubric.criteria.map((c) => {
              const at = (p: number) => c.scale.find((s) => s.points === p)
              const top = at(c.max)!; const mid = at(Math.max(1, c.max - 1))!; const low = at(1) ?? mid
              // 보완 문구는 서술을 먼저 줄여 끼운다 — 문장 끝의 청유("써 봅시다")가 잘리지 않게(합이 LIMIT 을 넘지 않도록 칸을 나눈다)
              const half = Math.floor((LIMIT - STEP_UP[0].length - STEP_UP[1].length) / 2)
              const name = clip(c.name, 16)
              const rest = LIMIT - NEXT_LEVEL[0].length - NEXT_LEVEL[1].length - name.length
              return {
                criterion_name: c.name,
                good: [clip(top.descriptor, LIMIT), clip(mid.descriptor, LIMIT)],
                improve: [`${clip(low.descriptor, half)}${STEP_UP[0]}${clip(top.descriptor, half)}${STEP_UP[1]}`, `${name}${NEXT_LEVEL[0]}${clip(top.descriptor, rest)}${NEXT_LEVEL[1]}`],
              }
            })
          : null,
      }
    }),
    footer_disclaimer: NOTICE_DISCLAIMER,
  }
}
