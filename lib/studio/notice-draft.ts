import type { z } from 'zod'
import { NOTICE_DISCLAIMER, type Lesson, type Assessment, type NoticePlan } from './schemas'
import { isAssessmentSession, lessonAssessments } from './assessment-structure'
import { stepAt } from './scale'

type LessonT = z.infer<typeof Lesson>
type AssessmentT = z.infer<typeof Assessment>
type ItemT = AssessmentT['items'][number]
type QuizT = LessonT['formative_check']['quiz'][number]
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
const NOTE_LIMIT = 40

/** 채점표 서술을 안내장 문구로 쓸 수 있게 다듬는다: 괄호 속 예시·수치(답이 들어 있기도 하다)와 0점 꼬리를 떼고 따옴표·공백을 정리한다. */
function plain(descriptor: string): string {
  let s = descriptor
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(/\s*\([^()]*\)/g, '') }
  return s.replace(/["“”'‘’]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * (max−1) 단계 서술의 '모자란 곳'을 다음 행동으로 옮기는 표(N-12: 혼자 실행 가능한 구체 행동, 청유형). 위에서부터 맞는 것 두 개를 쓴다.
 * 순서가 뜻을 가른다 — '상대도수 구분이 흐림'이 도수 행동으로, '목표 수치의 근거가 약함'이 수치 행동으로 가지 않게 구분·근거를 먼저 본다.
 */
const NEXT_ACTIONS: [RegExp, string][] = [
  [/왜/, '왜 그렇게 판단했는지 이유를 한 문장 더 이어 써 봅시다'],
  [/구분|차원/, '비교하는 두 가지를 나누어 각각 분명하게 써 봅시다'],
  [/근거|이유|연결/, '근거가 되는 자료 내용을 한 문장 더 이어 써 봅시다'],
  [/수치[^,]*(오류|틀)/, '인용한 수치를 자료와 한 번 더 대조해 봅시다'],
  [/반올림|소수/, '계산한 값을 소수 둘째 자리까지 다시 확인해 봅시다'],
  [/경계|이상|미만/, '계급을 이상·미만 표현으로 바르게 써 봅시다'],
  [/(?<!상대)도수|합계/, '도수와 합계를 원자료와 한 번 더 세어 맞춰 봅시다'],
  [/구체|막연|일반적|간단|약함|약하게|부족/, '예를 하나 들어 더 구체적으로 써 봅시다'],
  [/조건|분량|형식|종결/, '작성 조건을 하나씩 확인하며 고쳐 써 봅시다'],
  [/용어|표현/, '교과서 용어를 바르게 썼는지 점검해 봅시다'],
]
const FALLBACK_ACTION = '만점 기준과 내 답을 한 줄씩 대조해 봅시다'

/**
 * (max−1) 단계 서술 → 보완 문구 두 개(부분 긍정 + 역접 + 다음 행동, 한 문장씩). 서술의 첫 갈래(" / " 앞)에서
 * "…으나/…하나/…되나 " 역접을 찾아 앞쪽을 "…지만"으로 바꿔 부분 긍정으로 쓰고, 뒤쪽(모자란 곳)의 낱말로 다음 행동을 고른다.
 * 역접이 없으면 "기준에 거의 다가갔지만"으로 연다. 둘째 문구는 "잘 쓴 부분은 살리고,"로 열고 다음으로 맞는 행동(다른 갈래 포함)을 쓴다.
 * 1점 서술(scale[1])은 쓰지 않는다 — 그 단계는 부분 긍정의 근거가 아니다.
 */
function improvePhrases(nearTop: string): [string, string] {
  const [first, ...others] = nearTop.split(' / ')
  const m = first.match(/^(.+?)(으나|(?<=\S)하나|되나)\s+(.+)$/u)
  const stem = m ? plain(`${m[1]}${m[2] === '하나' ? '하' : m[2] === '되나' ? '되' : ''}`) : ''
  const gap = m ? m[3] : first
  const match = (text: string) => NEXT_ACTIONS.filter(([re]) => re.test(text)).map(([, a]) => a)
  const actions = [...new Set([...match(gap), ...match(others.join(' '))])]
  const [a1, a2] = [actions[0] ?? FALLBACK_ACTION, actions[1] ?? (actions[0] ? FALLBACK_ACTION : '한 곳만 골라 고쳐 다시 써 봅시다')]
  const lead = stem && stem.length + a1.length + 5 <= LIMIT ? `${stem}지만` : '기준에 거의 다가갔지만'
  return [`${lead}, ${a1}.`, `잘 쓴 부분은 살리고, ${a2}.`]
}

/**
 * 잘한 점 문구 두 개: 최고 단계 서술 + (논술형) 총체적 상의 이 요소 몫이 최고 단계와 다르면 그것, 아니면 성취수준 A 특성.
 * (max−1)·1점 서술은 오류·누락을 말하므로 잘한 점에 쓰지 않는다.
 */
function goodPhrases(item: ItemT, criterionIndex: number, top: string): [string, string] {
  const g1 = clip(plain(top), LIMIT)
  // 총체적 상이 요소별 서술을 " / "로 이은 모양(옛 판 compat)일 때만 이 요소 몫을 쓴다 — 한 문장짜리 총체적 기준(서술형 포함)은 요소 몫이 아니다
  const parts = item.rubric.holistic ? item.rubric.holistic.상.split(' / ') : []
  const holisticPart = parts.length === item.rubric.criteria.length ? plain(parts[criterionIndex] ?? '') : ''
  const traitA = item.level_map.find((l) => l.level === 'A')?.trait ?? ''
  const g2 = [holisticPart, plain(traitA), '채점 기준의 가장 높은 단계를 충족함'].find((t) => t && clip(t, LIMIT) !== g1)!
  return [g1, clip(g2, LIMIT)]
}

/**
 * 퀴즈 코멘트(40자): 해설 첫 문장이 들어가면 그대로, 길면 문장·쉼표 경계에서 끊는다(말줄임 없이) —
 * 뒤 절이 홀로 서는 문장이면 뒤 절, "…이며,"로 끝나는 앞 절은 "…이다."로, 괄호·"41·42·…" 같은 수 나열을 빼서 들어가면 그것.
 * 어느 것도 맞지 않으면 해설을 다시 보게 하는 문장.
 */
/** 앞 절을 가리키는 말(이를·이것·그것 …)이 있는 뒤 절은 홀로 서지 못한다. */
const STANDS_FOR_EARLIER = /(^|\s)(이를|이것|이는|그것|그를|이|그)(\s|$)/u
function wrongNote(q: QuizT): string {
  const fits = (s: string) => (s.length <= NOTE_LIMIT ? s : s.replace(/\.$/, '').length <= NOTE_LIMIT ? s.replace(/\.$/, '') : null)
  const sentence = q.explanation.replace(/["“”'‘’]/g, '').replace(/\s+/g, ' ').trim().split(/(?<=다\.)\s+/u)[0]
  const clauses = sentence.split(/,\s+/)
  const last = clauses.length > 1 ? clauses[clauses.length - 1] : ''
  const firstAsSentence = clauses.length > 1 && /(이며|하며)$/u.test(clauses[0]) ? clauses[0].replace(/이며$/u, '이다.').replace(/하며$/u, '한다.') : ''
  const compact = sentence.replace(/\s*\([^()]*\)/g, '').replace(/\s*\d+(?:·\d+)+의?(?=\s)/g, '').replace(/\s+/g, ' ')
  return fits(sentence)
    ?? (last && /다\.?$/u.test(last) && !STANDS_FOR_EARLIER.test(last) && last.length >= 12 ? fits(last) : null)
    ?? (firstAsSentence ? fits(firstAsSentence) : null)
    ?? fits(compact)
    ?? '해설을 다시 읽고 근거가 되는 곳을 찾아봅시다.'
}

/**
 * 가정 학습 제안(N-12): 문항 모양을 따른다 — 종이에 표·그래프를 만드는 문항은 다시 그리기, 서술형은 한 문장 고쳐 쓰기, 논술형은 문단 고쳐 쓰기.
 * 단원 평가 차시(서술형 + 논술형)는 두 답 가운데 하나를 골라 고쳐 쓰게 한다(종이 답안 문항이 있으면 그 문항 모양이 먼저).
 */
function homeStudy(items: ItemT[]): string {
  if (items.length > 1 && !items.some((i) => i.conditions.answer_mode === 'paper')) return '오늘 쓴 서술형·논술형 답 가운데 하나를 골라 보완할 점 한 가지를 고쳐 써 봅시다.'
  const item = items.find((i) => i.conditions.answer_mode === 'paper') ?? items[0] ?? null
  if (!item) return '오늘 퀴즈 중 틀린 문항과 같은 유형 1개를 다시 풀어 봅시다.'
  const shape = `${item.conditions.format} ${item.stem}`
  if (item.conditions.answer_mode === 'paper') {
    if (/표/.test(shape)) return '오늘 만든 표를 원자료와 하나씩 대조하며 다시 그려 봅시다.'
    if (/그래프|히스토그램|다각형/.test(shape)) return '오늘 그린 그래프의 눈금과 칸을 원자료와 대조하며 다시 그려 봅시다.'
    return '오늘 종이에 쓴 풀이를 작성 조건과 대조하며 다시 써 봅시다.'
  }
  return item.kind === '논술형'
    ? '오늘 쓴 글의 보완할 점 한 가지를 골라 그 문단을 다시 써 봅시다.'
    : '오늘 쓴 답의 보완할 점 한 가지를 고쳐 한 문장으로 다시 써 봅시다.'
}

/** 다음 차시 예고(50자). 다음이 평가 차시(단원 평가, 옛 판의 논술형 차시)면 "배워요" 대신 그 차시의 문항에 답한다고 알린다. */
function previewOf(next: LessonT): string {
  const kinds = lessonAssessments(next)
  if (isAssessmentSession(next) && kinds.length) {
    const full = `다음 시간에는 ${next.topic}에서 ${kinds.join('·')} 문항에 답해요.`
    return full.length <= 50 ? full : `다음 시간에는 ${kinds.join('·')} 문항에 답해요.`   // 주제가 길면(옛 판 목표 문장) 주제를 뺀다
  }
  return clip(`다음 시간에는 ${next.topic}${objectParticle(next.topic)} 배워요.`, 50)
}

/**
 * 안내장 틀(7단계)의 결정적 초안 — fixture·mock용. AI 생성본과 같은 모양이며 문장 규칙(N-05·N-06·N-12)을 지킨다.
 * 서·논술형 문항이 있는 차시만 criteria_phrases 를 채우고 나머지는 null(대표님 잠정 결정: 안내장은 서·논술형 차시만) —
 * 지금 구조(2026-09-26)에서는 단원 평가 차시 하나에 두 문항의 요소가 모두 들어간다(요소 이름은 문항 사이에 겹치지 않는다, [TS]).
 */
export function draftNoticePlan(lessons: LessonT[], assessment: AssessmentT | null): NoticePlanT {
  const sorted = [...lessons].sort((a, b) => a.no - b.no)
  return {
    per_lesson: sorted.map((l, i) => {
      const next = sorted[i + 1]
      const items = assessment?.items.filter((it) => it.lesson_no === l.no) ?? []
      return {
        lesson_no: l.no,
        topic_summary: clip(l.goal, LIMIT),
        preview: next ? previewOf(next) : '이번 세트를 마무리했어요. 정리한 내용을 다시 읽어 봅시다.',
        home_study_suggestion: homeStudy(items),
        quiz_notes: l.formative_check.quiz.map((q, k) => ({ quiz_no: k + 1, wrong_note: wrongNote(q) })),
        criteria_phrases: items.length
          ? items.flatMap((item) => item.rubric.criteria.map((c, ci) => {
              const at = (p: number) => stepAt(c.scale, p)   // 척도는 점수로 찾는다(배열 순서 아님)
              const top = at(c.max)!; const nearTop = at(Math.max(1, c.max - 1))!
              return { criterion_name: c.name, good: goodPhrases(item, ci, top.descriptor), improve: improvePhrases(nearTop.descriptor) }
            }))
          : null,
      }
    }),
    footer_disclaimer: NOTICE_DISCLAIMER,
  }
}
