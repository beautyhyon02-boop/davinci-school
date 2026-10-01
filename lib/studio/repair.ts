import type { Stage } from './schemas'

/**
 * 모델 응답의 **기계적 형식 표기**를 zod 검증 전에 손본다 — 내용은 바꾸지 않는다.
 * 2026-10-01 영어 세트 5단계가 두 번 연속 "items.1: 문두는 "[16점]"으로 끝나야 함"으로 실패했다(모델이 문두 끝 배점 표기를 빠뜨림).
 * 배점은 points 에 이미 있으므로 표기만 맞춘다: 끝의 "[N점]"·"(N점)"·"N점" 꼬리를 떼고 "[points점]"을 붙인다.
 */
const TRAILING_POINTS = /\s*(?:[\[［(（]\s*\d+\s*점\s*[\]］)）]|\d+\s*점)\s*$/u

export function stemWithPoints(stem: string, points: number): string {
  const trimmed = stem.trim()
  if (trimmed.endsWith(`[${points}점]`)) return trimmed
  return `${trimmed.replace(TRAILING_POINTS, '').trimEnd()} [${points}점]`
}

/** 5단계: 문항마다 문두 끝 "[N점]"을 points 에 맞춘다. 모양이 다르면 손대지 않는다(검증이 알아서 거른다). */
export function repairAssessment(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { items?: unknown }).items)) return raw
  const items = (raw as { items: unknown[] }).items.map((it) => {
    if (!it || typeof it !== 'object') return it
    const { stem, points } = it as { stem?: unknown; points?: unknown }
    if (typeof stem !== 'string' || typeof points !== 'number' || !Number.isInteger(points)) return it
    return { ...(it as object), stem: stemWithPoints(stem, points) }
  })
  return { ...(raw as object), items }
}

export function repairOutput(stage: Stage, raw: unknown): unknown {
  return stage === 5 ? repairAssessment(raw) : raw
}
