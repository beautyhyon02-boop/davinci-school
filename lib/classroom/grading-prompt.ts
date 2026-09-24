import type { Snapshot } from '@/lib/studio/publish'
import { GRADING_PROMPT_RULES } from '@/lib/studio/prompts/rules/grading'

/** 고정 규칙(첫 system 블록 = 캐시 대상). 부록 A.4 G-01~G-09 중 모델이 지킬 문장(rules/grading.ts). */
export const GRADING_RULES = GRADING_PROMPT_RULES

export type GradingPromptInput = { snapshot: Snapshot; itemNo: number; studentGrade: number; answer: string }

/**
 * 채점 프롬프트(스펙 §2.9 채점). 문항의 채점표(요소별 max 가변 척도)·총체적 기준·유의점·A~E 예상 구간·이 문항의 예시답안·조건을
 * 그대로 옮긴다 — G-03: 채점은 이것들만 근거로 한다. fixtureKey 는 mock 모드용 `grading-{종류}-{과목}` — 과목 파일
 * (예: grading-논술형-과학, 채점표 요소 이름이 과목마다 다르다)이 없으면 lib/ai/mock.ts 가 과목을 뗀 grading-{종류} 로 떨어진다.
 */
export function buildGradingPrompt({ snapshot, itemNo, studentGrade, answer }: GradingPromptInput) {
  const a = snapshot.assessment
  if (!a) throw new Error('snapshot has no assessment')
  const item = a.items[itemNo - 1]
  if (!item) throw new Error(`item ${itemNo} not found`)
  const { criteria, holistic, notes } = item.rubric
  const rubric = criteria
    .map((c) => `- ${c.name}(max=${c.max}, ${c.axis}, 조건 ${c.condition_nos.join('·')}): ${[...c.scale].sort((x, y) => y.points - x.points).map((s) => `${s.points}=${s.descriptor}${s.example ? ` (예: ${s.example})` : ''}`).join(' / ')}`)
    .join('\n')
  const exemplars = item.exemplar_answers
    .map((e) => `[${e.level ?? `${e.points}점`}] 요소별 ${e.scores.join('·')} = ${e.points}점 — ${e.rationale}\n${e.text}`)
    .join('\n\n')
  const levels = item.level_map.map((l) => `- ${l.level}: ${l.min}~${l.max}점 — ${l.trait}`).join('\n')
  const conditions = item.conditions.items.map((c) => `${c.no}. ${c.text}`).join('\n')
  const user = [
    `학생 학년: ${snapshot.cover.level} ${studentGrade}학년 · 과목: ${snapshot.cover.subject}`,
    `문항(${item.kind}, ${item.points}점):\n${item.stem}`,
    `조건:\n${conditions}\n분량 ${item.conditions.length} / 형식 ${item.conditions.format}${item.conditions.overflow_rule ? ` / ${item.conditions.overflow_rule}` : ''}`,
    `채점표(요소 ${criteria.length}개, 요소 이름과 max를 그대로 쓴다):\n${rubric}`,
    holistic ? `총체적 기준: 상=${holistic.상} / 중=${holistic.중} / 하=${holistic.하}` : '',
    `채점 시 유의점:\n${notes.map((n) => `- ${n}`).join('\n')}`,
    `A~E 예상 구간:\n${levels}`,
    `예시 답안(이 문항):\n${exemplars}`,
    `학생 답안:\n${answer}`,
  ].filter(Boolean).join('\n\n')
  return { system: [GRADING_RULES], user, fixtureKey: `grading-${item.kind}-${snapshot.cover.subject}` }
}
