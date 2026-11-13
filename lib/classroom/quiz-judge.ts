/**
 * 단답형 퀴즈 AI 뜻 판정(대표 2026-10-12): 글자 비교(lib/classroom/quiz.ts judgeQuiz)로 틀린 답만 가장 작은 모델에 보내
 * "맞음/부분/틀림 + 이유 한 줄"을 받는다. 맞음·부분이면 O(대표 2026-11-05: 뜻이 닿은 답을 X 로 두지 않는다), 틀림이면 X —
 * 부분은 원장 화면에 "확인 필요"로 보여 원장이 뒤집을 수 있다(QuizMatrix). 답 조건(L-23)이 있으면 함께 보내 그 조건을 기준으로 보게 한다.
 * 실패하면 null 을 돌려주고 채점은 글자 비교 결과로 남는다(제출을 막지 않는다).
 */
import { z } from 'zod'
import { callStructured } from '@/lib/ai/claude'
import { gradeLabel } from '@/lib/studio/level-map'

export const QUIZ_JUDGE_RULES = [
  '당신은 중·고등학교 수업의 마무리 퀴즈(단답형) 채점 보조자다. 학생 답이 정답과 같은 뜻인지 판정한다.',
  '기준은 문항·답 조건·정답 표기·해설·핵심어와, 주어졌다면 문항의 역할·이어지는 채점 요소·부분 답이 되는 경우·써야 하는 언어 형식·자료뿐이다. 새 기준을 만들지 않는다.',
  '표현·어순·조사·대소문자·관사·단위 표기가 달라도 뜻이 같으면 "맞음". 핵심어가 있으면 그 뜻이 담겼는지를 본다(글자 일치가 아니라 뜻).',
  '정답의 일부만 맞거나(여러 요소 중 하나만), 뜻은 비슷하지만 문항이 묻는 핵심(이유·목적·행동)이 빠졌으면 "부분".',
  '답 조건(답의 꼴·담을 것·가짓수)이 있으면 그 조건이 요구한 내용이 담겼는지도 본다 — 꼴(문장 끝맺음·어순)만 다르고 뜻이 같으면 "맞음", 조건이 요구한 내용(비교 대상·까닭 등)이 빠졌으면 "부분".',
  '다른 뜻이거나 문항과 무관하면 "틀림". 비어 있거나 "모름" 같은 답도 "틀림".',
  '이유는 원장이 한눈에 보게 한 줄(60자 안)로, 학생 답의 어느 부분을 보고 판정했는지 적는다. 학생을 평가하는 말은 쓰지 않는다.',
  '"문항의 역할"·"이어지는 채점 요소"·"부분 답이 되는 경우"가 주어지면 함께 본다 — 역할이 요구한 수행(배운 것을 과목의 말로 해 보기, 채점 요소 한 조각)을 했고 내용이 정답과 같은 뜻이면 "맞음", 핵심 수행은 했으나 "부분 답이 되는 경우"의 모습이면 "부분". 값·결론이 정답과 다르면 그 모습이어도 "틀림".',
  // 대표 2026-11-14: 영어 2·3번은 배운 목표 언어 형식으로 학생이 스스로 고른 내용을 쓴다 — 정답 표기는 예시일 뿐이라 형식과 자료의 사실로 본다
  '"써야 하는 언어 형식"이 주어졌는데 학생 답이 그 형식을 쓰지 않았으면 "틀림" — 뜻이 정답과 같아도, 답 조건에 그 형식이 적혀 있어도 "부분"이 아니라 "틀림"이다. 그 형식을 썼으나 꼴에 잘못이 있으면 "부분"(철자 하나·관사·대소문자 같은 작은 잘못은 "맞음").',
  // 독립 검토 2026-11-14: "정답 표기는 예시"는 학생이 자료에서 스스로 고르는 문항에만 — 값·항목 하나를 묻는 닫힌 문항(사회·과학·수학의 2번 등)은 자료가 있어도 정답 표기가 기준이다
  '"정답 표기(예시)"로 주어진 문항만 정답 표기가 예시다 — 학생이 자료에서 다른 항목·수치를 골라 썼어도 그 내용이 "자료"와 맞고 답 조건을 지켰으면 "맞음", 자료의 사실과 다르면(없는 항목, 틀린 수치, 뒤바뀐 크기) "틀림". 그 밖의 문항은 "자료"가 주어져도 정답 표기가 기준이다 — 자료는 학생 답이 정답과 같은 뜻인지 확인하는 데만 쓴다.',
].join('\n')

/** 문항 자리의 역할(L-10, 대표 2026-11-13) — 새 규칙을 따르는 판에서만 프롬프트에 넣는다. */
export const QUIZ_ROLE_LINE: Record<number, string> = {
  1: '핵심 지식 — 그 차시에 배운 개념·표현·값을 아는가',
  2: '과목답게 해 보기 — 배운 기능을 과목의 말로 직접 해 보는가',
  3: '단원 평가 디딤돌 — 단원 평가 채점 요소 하나를 한 문장·한 구로 작게 해 보는가',
}

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
  /** 답 조건(L-23) — 있으면 판정 기준에 넣는다. 옛 판·낱말 정답에는 없다. */
  condition?: string | null
  /** 문항 자리(1~3) — 새 규칙(L-10, 2026-11-13)을 따르는 판에서만 넘긴다: 1 핵심 지식 · 2 과목답게 해 보기 · 3 단원 평가 디딤돌. */
  quizNo?: number | null
  /** 3번이 잇는 단원 평가 채점 요소 이름(L-10). */
  criteriaRef?: string | null
  /** 부분 답이 되는 경우(L-25) — 있으면 맞음과 부분을 가르는 기준. */
  partialNote?: string | null
  /** 써야 하는 목표 언어 형식의 이름(영어 2·3번, S-영-10) — 있으면 그 형식을 썼는지 본다. */
  languageForm?: string | null
  /** 문항이 가리키는 자료의 글(quizMaterialsText) — 학생이 자료에서 골라 쓰는 문항(새 규칙의 2·3번)에서 사실 여부를 가리는 근거. */
  materials?: string | null
  /** 학생이 자료에서 스스로 골라 쓰는 문항(isOpenChoiceQuiz) — 참이면 정답 표기를 "예시"로 보여 준다. 닫힌 문항은 정답 표기가 기준이다. */
  openChoice?: boolean
  response: string
}

type JudgeMaterial = { id: string; title?: string | null; body?: string | null; table?: { columns?: string[]; rows?: (string | number)[][] } | null }
/** AI 판정에 보내는 자료 글의 상한 — 표 25행·본문 몇 문단이면 넉넉하다(넘으면 자르고 잘렸다고 적는다). */
export const JUDGE_MATERIALS_MAX = 4000
/**
 * 문항이 쓰는 자료(차시 materials_used)를 판정용 글로: `<자료 F> 제목`, 본문, 표는 `열 | 열` 줄로. 그 차시가 쓰는 자료가 없으면 ''.
 * 학생이 자료에서 스스로 골라 쓰는 문항은 정답이 여러 가지라 자료를 봐야 사실 여부를 가릴 수 있다(대표 2026-11-14).
 * 제출 길 위에서 불리므로 어떤 모양의 자료에도 던지지 않는다 — 옛 모양(v1)의 공동 자료·열 이름 없는 표도 있는 만큼만 글로 옮긴다.
 */
export function quizMaterialsText(materials: JudgeMaterial[] | null | undefined, ids: string[] | null | undefined): string {
  try {
    if (!Array.isArray(materials) || !Array.isArray(ids)) return ''
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const text = materials.filter((m) => !!m && ids.includes(m.id)).map((m) => {
      const columns = Array.isArray(m.table?.columns) ? m.table.columns.join(' | ') : ''
      const rows = Array.isArray(m.table?.rows) ? m.table.rows.filter((r) => Array.isArray(r)).map((r) => r.join(' | ')) : []
      return [`<자료 ${m.id}>${str(m.title) ? ` ${str(m.title)}` : ''}`, str(m.body), [columns, ...rows].filter(Boolean).join('\n')].filter(Boolean).join('\n')
    }).join('\n\n')
    return text.length > JUDGE_MATERIALS_MAX ? `${text.slice(0, JUDGE_MATERIALS_MAX)}…(이하 잘림)` : text
  } catch {
    return ''
  }
}

/**
 * 학생이 자료에서 스스로 골라 쓰는 문항인가 — 문항 글이 "골라"·"고른"·"스스로 정해"를 말할 때만(3단계 과제가 그렇게 쓰게 한다, L-24).
 * 이런 문항만 정답 표기를 예시로 보고 자료를 함께 보낸다. "고쳐 쓰세요"는 고르기가 아니다.
 */
export const isOpenChoiceQuiz = (q: string | null | undefined): boolean => /골라|고른|고르|스스로 정/.test(q ?? '')

/** 프롬프트: 규칙(캐시) + 이번 문항. 정답 표기(" / ")는 줄로 나눠 보여 준다. */
export function buildQuizJudgePrompt(i: QuizJudgeInput) {
  const keys = i.answer.split('/').map((k) => k.trim()).filter(Boolean)
  const kw = (i.keywords ?? []).map((k) => k.trim()).filter(Boolean)
  const user = [
    `과목: ${i.subject} · ${gradeLabel(i.level, i.grade ?? null)}`,
    `문항: ${i.q}`,
    i.quizNo && QUIZ_ROLE_LINE[i.quizNo] ? `문항의 역할: ${QUIZ_ROLE_LINE[i.quizNo]}` : '',
    i.condition?.trim() ? `답 조건: ${i.condition.trim()}` : '',
    i.languageForm?.trim() ? `써야 하는 언어 형식: ${i.languageForm.trim()}` : '',
    i.criteriaRef?.trim() ? `이어지는 채점 요소: ${i.criteriaRef.trim()}` : '',
    `${i.openChoice ? '정답 표기(예시 — 학생이 자료에서 다른 것을 골라 써도 된다)' : '정답 표기(어느 것이든 정답)'}:\n${keys.map((k) => `- ${k}`).join('\n')}`,
    `해설: ${i.explanation}`,
    kw.length ? `핵심어(뜻이 담겨야 함): ${kw.join(', ')}` : '',
    i.partialNote?.trim() ? `부분 답이 되는 경우: ${i.partialNote.trim()}` : '',
    i.materials?.trim() ? `자료:\n${i.materials.trim()}` : '',
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
