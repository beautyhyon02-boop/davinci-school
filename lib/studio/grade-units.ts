/**
 * 학교급·과목·학년별 교과서 단원(data/textbooks/grade-units.json, 비상 2022 목차) — 대표 결정 2026-10-07(C-44):
 * 학년을 정한 대주제에서 **수학·과학**은 교육과정이 학년 순서를 사실상 정해 두어 그 학년 단원 안의 성취기준·내용으로만 만든다.
 * 국어·영어·사회는 출판사·학교마다 배치가 달라 학년군 안이면 되므로 여기서 보지 않는다. 단원표는 지금 중학교("중")만 있어
 * 초등·고등 대주제에는 아무것도 붙지 않는다(검토 2026-10-07: 학교급을 안 보면 초등 2학년에 중학교 2학년 단원이 붙는다).
 * 1·2·3단계 생성·검토 프롬프트 블록(gradeUnitBlock)과 1·2단계 [TS] 참고 메모(checks.ts gradeUnitIssues)가 쓴다.
 */
import raw from '@/data/textbooks/grade-units.json'
import { gradeLabel } from './level-map'

type UnitRow = { unit: string; codes: string[] }
const DATA = raw as { source: string; levels: Record<string, Record<string, Record<string, UnitRow[]>>> }

/** 학년 단원을 엄격히 보는 과목(대표 2026-10-07). */
export const GRADE_STRICT_SUBJECTS = ['수학', '과학'] as const

export type StandardGrade = { grade: number; unit: string }

function table(level: string, subject: string): Record<string, UnitRow[]> | null {
  if (!(GRADE_STRICT_SUBJECTS as readonly string[]).includes(subject)) return null
  return DATA.levels[level]?.[subject] ?? null
}

/** 성취기준 코드가 실린 학년과 대단원. 단원표가 없는 학교급·과목이거나 모르는 코드면 null. */
export function standardGrade(level: string, subject: string, code: string): StandardGrade | null {
  const t = table(level, subject)
  if (!t) return null
  for (const [g, units] of Object.entries(t)) for (const u of units) if (u.codes.includes(code)) return { grade: Number(g), unit: u.unit }
  return null
}

/** 이 학년 단원에 없는 성취기준(모르는 코드는 짚지 않는다). 학년이 없거나 단원표가 없으면 빈 배열. */
export function outOfGradeStandards(level: string, subject: string, grade: number | null | undefined, codes: string[]): (StandardGrade & { code: string })[] {
  if (grade == null || !table(level, subject)) return []
  const out: (StandardGrade & { code: string })[] = []
  for (const code of codes) {
    const g = standardGrade(level, subject, code)
    if (g && g.grade !== grade) out.push({ code, ...g })
  }
  return out
}

/** 프롬프트에 붙이는 그 학년 단원 목록. 단원표가 없는 학교급·과목이거나 학년이 없으면 빈 문자열. */
export function gradeUnitBlock(level: string, subject: string, grade: number | null | undefined): string {
  const units = grade == null ? undefined : table(level, subject)?.[String(grade)]
  if (!units) return ''
  const head = `${gradeLabel(level, grade)} ${subject} 교과서 단원과 성취기준(교육과정 순서) — 이 학년 세트는 이 안에서만 추천·재구성·설계한다(C-44):`
  return [head, ...units.map((u) => `- ${u.unit}: ${u.codes.join(' · ')}`)].join('\n')
}
