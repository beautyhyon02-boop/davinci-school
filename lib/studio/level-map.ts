import type { z } from 'zod'
import type { LevelExpectation as LevelExpectationSchema } from './schemas'

export type LevelExpectationT = z.infer<typeof LevelExpectationSchema>
export type LevelRef = 'A' | 'B' | 'C' | 'D' | 'E' | 'E 미만'
export type GradeBoundary = { grade: number; min: number; max: number; band: '상' | '중' | '하'; level_ref: LevelRef }

/** KICE 성취율 컷(총론 p.80): A 90 / B 80 / C 70 / D 60 / E 40 — 스펙 §1.1. */
const CUTS: [LevelExpectationT['level'], number][] = [['A', 0.9], ['B', 0.8], ['C', 0.7], ['D', 0.6], ['E', 0.4]]
const TRAITS: Record<LevelExpectationT['level'], string> = {
  A: '요구한 요소를 모두 정확히 충족하고 근거를 설명함',
  B: '요소를 대부분 충족하며 경미한 오류만 있음',
  C: '주어진 자료로 핵심 요소를 충족하나 설명이 부분적임',
  D: '일부 요소만 충족하고 해석이 부분적임',
  E: '시도했으나 핵심 요소가 빠짐(미응답 포함)',
}

/** 문항 배점을 A~E 예상 점수 구간으로 나눈다. 단조 감소, 0..points 전부 덮음, E는 0까지(E 미만을 흡수). */
export function levelMapFor(points: number): LevelExpectationT[] {
  const out: LevelExpectationT[] = []
  let hi = points
  for (const [level, ratio] of CUTS) {
    const min = level === 'E' ? 0 : Math.min(Math.ceil(ratio * points), Math.max(hi, 0))
    const max = Math.max(hi, min)
    out.push({ level, min, max, trait: TRAITS[level] })
    hi = min - 1
  }
  return out
}

/** 7등급(7이 최고, 대표님 확정) ↔ KICE 수준 참조열. 22점 기준 컷 A≥20 B≥18 C≥16 D≥14 E≥9 (스펙 §1.1). */
export function levelRefFor(grade: number): LevelRef {
  const map: Record<number, LevelRef> = { 7: 'A', 6: 'B', 5: 'C', 4: 'D', 3: 'E', 2: 'E 미만', 1: 'E 미만' }
  return map[grade] ?? 'E 미만'
}

export const GRADE_TABLE_22: GradeBoundary[] = [
  { grade: 7, min: 21, max: 22, band: '상', level_ref: 'A' },
  { grade: 6, min: 18, max: 20, band: '상', level_ref: 'B' },
  { grade: 5, min: 15, max: 17, band: '중', level_ref: 'C' },
  { grade: 4, min: 11, max: 14, band: '중', level_ref: 'D' },
  { grade: 3, min: 8, max: 10, band: '중', level_ref: 'E' },
  { grade: 2, min: 5, max: 7, band: '하', level_ref: 'E 미만' },
  { grade: 1, min: 0, max: 4, band: '하', level_ref: 'E 미만' },
]

/**
 * 학교급 전체(학년 미지정) 범위 — 대표 결정 2026-09-26: 2022 개정 성취기준은 학년군 단위라 대주제를 학년 하나에 묶지 않는다.
 * school·band 는 프롬프트 문구(gradeLabel)가 쓰고, 화면 문구는 content/site.ts(app.gradeBand)가 같은 낱말로 따로 갖는다
 * (tests/themes.test.ts 가 둘이 같은지 본다). codePrefixes 는 성취기준 코드 접두 — 1단계 적합성 판단은 이것만 본다.
 */
export const SCHOOL_BANDS: Record<'초' | '중' | '고', { school: string; band: string; codePrefixes: string[] }> = {
  초: { school: '초등학교', band: '3~6학년', codePrefixes: ['[4', '[6'] },
  중: { school: '중학교', band: '1~3학년군', codePrefixes: ['[9'] },
  고: { school: '고등학교', band: '1~3학년', codePrefixes: ['[1'] },
}

function bandOf(level: string) {
  return (SCHOOL_BANDS as Record<string, (typeof SCHOOL_BANDS)['중'] | undefined>)[level]
}

/**
 * 프롬프트용 학교급·학년 표기. 학년이 있으면 지금까지와 같은 "중학교 1학년", 없으면 "중학교(1~3학년군)" / "초등학교(3~6학년)".
 * 옛 게시 판(cover.grade 숫자)과 새 판(null)을 모두 받는다.
 */
export function gradeLabel(level: string, grade: number | null | undefined): string {
  const b = bandOf(level)
  const school = b?.school ?? level
  if (grade == null) return b ? `${school}(${b.band})` : school
  return `${school} ${grade}학년`
}

/** 이 학교급(과 학년) 성취기준 코드 접두. 초등 1~2학년으로 정한 대주제만 [2…](1~2학년군)를 더한다. */
export function standardCodePrefixes(level: string, grade: number | null | undefined): string[] {
  const b = bandOf(level)
  if (!b) return []
  return level === '초' && grade != null && grade <= 2 ? ['[2', ...b.codePrefixes] : b.codePrefixes
}
