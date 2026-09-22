import type { Snapshot } from '@/lib/studio/publish'

/** 고정 규칙(첫 system 블록 = 캐시 대상). 스펙 §6.1 채점 원칙. */
export const GRADING_RULES = [
  '당신은 다빈치스쿨 서논술형 채점자다. 주어진 채점표(루브릭)만 기준으로 학생 답안을 채점한다.',
  '요소마다 점수를 매기고, 그 점수의 근거가 되는 문장을 학생 답안에서 그대로 인용한다(evidence). 답안에 근거가 없으면 "해당 내용 없음"이라고 쓴다.',
  'score 는 요소 점수의 합이어야 한다. 요소 점수는 max 를 넘을 수 없다.',
  '잘한 점(strengths) 1~3개, 보완할 점(improvements) 1~3개. 보완할 점은 현재 점수보다 한 단계 위 기준을 보고 "다음 점수로 가려면 무엇을 더 쓰면 되는지"로 쓴다.',
  '학생에게 말하듯 존댓말로 쓰고, 학생 학년 수준의 어휘를 쓴다. 채점표에 없는 기준을 만들어 내지 않는다.',
  '예시 답안(상·중·하)과 그 점수는 기준의 눈금이다. 학생 답안이 예시와 비슷하면 비슷한 점수를 준다.',
].join('\n')

export type GradingPromptInput = { snapshot: Snapshot; itemNo: number; studentGrade: number; answer: string }

export function buildGradingPrompt({ snapshot, itemNo, studentGrade, answer }: GradingPromptInput) {
  const a = snapshot.assessment
  if (!a) throw new Error('snapshot has no assessment')
  const item = a.items[itemNo - 1]
  if (!item) throw new Error(`item ${itemNo} not found`)
  const rubric = 'criteria' in item.rubric
    ? item.rubric.criteria.map((c) => `- ${c.name}: 4=${c.bands['4']} / 3=${c.bands['3']} / 2=${c.bands['2']} / 1=${c.bands['1']} / 0=${c.bands['0']}`).join('\n')
    : item.rubric.levels.map((l) => `- ${l.points}점: ${l.expectation}${l.example ? ` (예: ${l.example})` : ''}`).join('\n')
  const criteriaHint = 'criteria' in item.rubric
    ? `요소 4개(${item.rubric.criteria.map((c) => c.name).join(', ')}) 각 0~4점, max=4`
    : `요소 1개(이름: "${item.kind} 채점표"), max=${item.points}`
  const exemplars = a.exemplars.map((e) => `[${e.level}] 총점 ${e.total} (${e.grade}등급)\n${e.text}`).join('\n\n')
  const user = [
    `학생 학년: ${snapshot.cover.level} ${studentGrade}학년 · 과목: ${snapshot.cover.subject}`,
    `문항(${item.kind}, ${item.points}점):\n${item.stem}`,
    `조건: 분량 ${item.conditions.length} / 필수 ${item.conditions.required.join(', ')} / 형식 ${item.conditions.format}`,
    `채점표:\n${rubric}`,
    `요소 구성: ${criteriaHint}`,
    `예시 답안(세트 전체 기준):\n${exemplars}`,
    `학생 답안:\n${answer}`,
  ].join('\n\n')
  return { system: [GRADING_RULES], user, fixtureKey: `grading-${item.kind}` }
}
