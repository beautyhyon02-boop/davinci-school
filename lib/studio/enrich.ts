import type { Stage } from './schemas'
import { getLevels, anchorLevel, minimumLevel } from '@/lib/reference/levels'

type Ctx = { standards: { code: string; text: string }[]; prior: Record<string, unknown> }
type Stage2 = { level_anchor: { code: string; level: 'B' | 'C'; statement: string }[] }
type Stage5 = { items: { lesson_no: number; min_competency: string | null }[] }
type Stage3Prior = { lessons?: { no: number; standards: string[] }[] }

/** 서버가 채우는 값(AI가 짓지 않음): 2단계 도달점 문장, 5단계 최소 능력(E) 문장. */
export function enrichOutput(stage: Stage, output: unknown, ctx: Ctx): unknown {
  if (stage === 2) {
    const o = output as Stage2
    const level_anchor = ctx.standards.flatMap((s) => {
      const r = getLevels(s.code); if (!r) return []
      const level = anchorLevel(r.scheme)
      return [{ code: s.code, level, statement: r.levels[level] ?? '' }]
    })
    return { ...o, level_anchor }
  }
  if (stage === 5) {
    const o = output as Stage5
    const lessons = (ctx.prior.stage3 as Stage3Prior | undefined)?.lessons ?? []
    const items = o.items.map((it) => {
      if (it.min_competency) return it
      // 한 차시에 문항이 여럿이면(단원 평가 차시: 서술형 → 논술형) 그 차시 성취기준을 문항 순서대로 짝짓는다(모자라면 마지막 것)
      const peers = o.items.filter((x) => x.lesson_no === it.lesson_no)
      const stds = lessons.find((l) => l.no === it.lesson_no)?.standards ?? []
      const code = stds[Math.min(peers.indexOf(it), stds.length - 1)] ?? ctx.standards[0]?.code
      const r = code ? getLevels(code) : null
      return { ...it, min_competency: r ? r.levels[minimumLevel(r.scheme)] ?? null : null }
    })
    return { ...o, items }
  }
  return output
}
