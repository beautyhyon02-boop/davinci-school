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
