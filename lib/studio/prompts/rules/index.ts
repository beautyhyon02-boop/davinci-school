import type { Rule } from './types'
import { COMMON_RULES } from './common'
import { LESSON_RULES } from './lesson'
import { GRADING_RULES_V2, GRADING_PROMPT_RULES } from './grading'
import { NOTICE_RULES, NOTICE_PROMPT_RULES } from './notice'
import { KOREAN_RULES } from './subjects/국어'
import { MATH_RULES } from './subjects/수학'
import { SOCIAL_RULES } from './subjects/사회'
import { HISTORY_RULES } from './subjects/역사'
import { SCIENCE_RULES } from './subjects/과학'
import { ENGLISH_RULES } from './subjects/영어'

export type { Rule }
export { COMMON_RULES, LESSON_RULES, GRADING_RULES_V2, GRADING_PROMPT_RULES, NOTICE_RULES, NOTICE_PROMPT_RULES }

/** 과목 이름 → 과목 규칙. 옛 한국사·세계사는 역사 규칙을 쓴다. 사회 세트의 프롬프트에는 rulesFor 가 역사 규칙을 덧붙인다. */
export const SUBJECT_RULES: Record<string, Rule[]> = {
  '국어': KOREAN_RULES, '수학': MATH_RULES, '사회': SOCIAL_RULES,
  '역사': HISTORY_RULES, '한국사': HISTORY_RULES, '세계사': HISTORY_RULES,
  '과학': SCIENCE_RULES, '영어': ENGLISH_RULES,
}

const SUBJECT_HEADING: Record<string, string> = { '사회': '사회 — 역사 포함', '한국사': '역사', '세계사': '역사' }
const HISTORY_BLOCK_HEADING = '[사회 — 역사 영역(역사 성취기준을 고른 세트에 적용)]'

/** 운영 성격(O)이 섞인 규칙(O·SO)은 모델이 할 일이 아니므로 생성·검토 프롬프트에서 뺀다. */
const promptable = (r: Rule) => r.nature !== 'O' && r.nature !== 'SO'
const line = (r: Rule) => `${r.id} ${r.text}`
const cache = new Map<string, string>()

/** 생성·검토 system 첫 블록(캐시 대상). 같은 과목이면 항상 같은 문자열. */
export function rulesFor(subject: string): string {
  const key = subject || ''
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const subjectRules = SUBJECT_RULES[key]
  const parts = [
    '당신은 다빈치스쿨 본사의 서·논술형 문항 설계자다. 아래 규칙을 항상 지킨다. 출력은 요청된 JSON 형식만.',
    '[공통]', ...COMMON_RULES.filter(promptable).map(line),
    '[재구성·차시]', ...LESSON_RULES.filter(promptable).map(line),
    ...(subjectRules ? [`[${SUBJECT_HEADING[key] ?? key}]`, ...subjectRules.filter(promptable).map(line)] : []),
    // 사회는 통합 과목(대표 결정 2026-09-30) — 역사 영역 성취기준을 고를 수 있으므로 역사 규칙을 함께 싣는다(문장·ID는 그대로)
    ...(key === '사회' ? [HISTORY_BLOCK_HEADING, ...HISTORY_RULES.filter(promptable).map(line)] : []),
  ]
  const text = parts.join('\n')
  cache.set(key, text)
  return text
}

/** 코드에 있는 모든 규칙 ID(중복 없이). 부록 A와 1:1인지 tests/rules.test.ts가 검사한다. */
export function allRuleIds(): string[] {
  const uniq = new Map<string, Rule>()
  for (const r of [...COMMON_RULES, ...LESSON_RULES, ...KOREAN_RULES, ...MATH_RULES, ...SOCIAL_RULES, ...HISTORY_RULES, ...SCIENCE_RULES, ...ENGLISH_RULES, ...GRADING_RULES_V2, ...NOTICE_RULES]) uniq.set(r.id, r)
  return [...uniq.keys()]
}
