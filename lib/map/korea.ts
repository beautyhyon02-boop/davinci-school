import data from '@/data/map/korea-sido.json'
import type { Sido } from '@/lib/academies/sido'

/** 시·도 경계 SVG 자료(설계 2026-10-25 §3). scripts/build-korea-map.ts 가 Natural Earth 에서 만든다 — 손으로 고치지 않는다. */
export type KoreaMapData = {
  viewBox: string
  source: string
  sidos: { code: Sido; d: string; label: [number, number] }[]
  markers: { name: string; x: number; y: number }[]
}
export const KOREA_MAP = data as KoreaMapData
