/**
 * 단답형 퀴즈 AI 뜻 판정(대표 2026-10-12): 글자 비교(lib/classroom/quiz.ts judgeQuiz)로 틀린 답만 가장 작은 모델에 보내
 * "맞음/부분/틀림 + 이유 한 줄"을 받는다. 맞음이면 O, 부분·틀림이면 X — 부분은 원장 화면에 "확인 필요"로 보인다(QuizMatrix).
 * 실패하면 null 을 돌려주고 채점은 글자 비교 결과로 남는다(제출을 막지 않는다).
 */
import { z } from 'zod'
import { callStructured } from '@/lib/ai/claude'
import { gradeLabel } from '@/lib/studio/level-map'

export const QUIZ_JUDGE_RULES = [
  '당신은 중·고등학교 수업의 마무리 퀴즈(단답형) 채점 보조자다. 학생 답이 정답과 같은 뜻인지 판정한다.',
  '기준은 문항·정답 표기·해설·핵심어뿐이다. 새 기준을 만들지 않는다.',
  '표현·어순·조사·대소문자·관사·단위 표기가 달라도 뜻이 같으면 "맞음". 핵심어가 있으면 그 뜻이 담겼는지를 본다(글자 일치가 아니라 뜻).',
  '정답의 일부만 맞거나(여러 요소 중 하나만), 뜻은 비슷하지만 문항이 묻는 핵심(이유·목적·행동)이 빠졌으면 "부분".',
  '다른 뜻이거나 문항과 무관하면 "틀림". 비어 있거나 "모름" 같은 답도 "틀림".',
  '이유는 원장이 한눈에 보게 한 줄(60자 안)로, 학생 답의 어느 부분을 보고 판정했는지 적는다. 학생을 평가하는 말은 쓰지 않는다.',
].join('\n')

export const QuizVerdict = z.object({
  verdict: z.enum(['맞음', '부분', '틀림']),
  reason: z.string().min(1).max(120),
})
export type QuizVerdictT = z.infer<typeof QuizVerdict>

export type QuizJudgeInput = {
  subject: string
  level: string
  grade: number | null | undefined
  q: string
  answer: string
  explanation: string
  keywords?: string[] | null
  response: string
}

/** 프롬프트: 규칙(캐시) + 이번 문항. 정답 표기(" / ")는 줄로 나눠 보여 준다. */
export function buildQuizJudgePrompt(i: QuizJudgeInput) {
  const keys = i.answer.split('/').map((k) => k.trim()).filter(Boolean)
  const kw = (i.keywords ?? []).map((k) => k.trim()).filter(Boolean)
  const user = [
    `과목: ${i.subject} · ${gradeLabel(i.level, i.grade ?? null)}`,
    `문항: ${i.q}`,
    `정답 표기(어느 것이든 정답):\n${keys.map((k) => `- ${k}`).join('\n')}`,
    `해설: ${i.explanation}`,
    kw.length ? `핵심어(뜻이 담겨야 함): ${kw.join(', ')}` : '',
    `학생 답: ${i.response}`,
  ].filter(Boolean).join('\n\n')
  return { system: QUIZ_JUDGE_RULES, user, fixtureKey: 'quiz-judge' }
}

/** 판정 1회. 어떤 이유로든 결과를 못 받으면 null(호출 쪽이 X 로 둔다). */
export async function judgeShortWithAi(i: QuizJudgeInput): Promise<QuizVerdictT | null> {
  const p = buildQuizJudgePrompt(i)
  try {
    const r = await callStructured({ stage: 11, role: 'quiz', schema: QuizVerdict, system: p.system, user: p.user, effort: 'low', fixtureKey: p.fixtureKey })
    const parsed = QuizVerdict.safeParse(r?.data)
    return parsed.success ? parsed.data : null
  } catch (e) {
    console.error('[quiz-judge] failed', e)
    return null
  }
}
