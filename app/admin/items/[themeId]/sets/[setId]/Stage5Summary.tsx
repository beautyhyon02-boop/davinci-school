import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'
import { sortScale, stepAt } from '@/lib/studio/scale'
import { ItemMaterials, type MaterialLike } from '@/components/studio/parts/MaterialsFull'

// 5단계(문항) 요약 — 오너 지적(2026-09-25): 문두·등급표·예시답안 개수만 보여서 논술형 조건 4개와 두 문항의 채점표를
// 볼 수 없었다("조건이 없다", "루브릭이 형편없다"). 문항 카드마다 조건·분량·채점표(요소 × 점수 표, 0점부터)·총체적 기준·유의점·
// 예시답안(접힘)·A~E를 모두 보여 주고, 두 문항 공통의 등급표·피드백 틀은 문항과 떨어진 "채점 기준표(공통)" 칸에 둔다.
// PackageView 는 서버 전용(getLevels 가 node:fs)이라 여기서 쓰지 못한다 — 같은 모양을 평범한 데이터로 그린다.
// 저장된 출력은 옛 판·손으로 고친 판일 수 있으므로 모든 필드를 선택적으로 읽는다(빠진 칸은 그리지 않는다).
// 문항 = 자료 + 문항 한 덩어리(대표 연수 2기 p.18~20): 문두 아래·조건 위에 그 문항의 <자료 1>·<자료 2> 상자(원장·학생 화면과 같은 조각).
const copy = app.studio.wizard.stage5

type Step = { points: number; descriptor: string; example?: string | null }
type Criterion = { name: string; axis?: string; condition_nos?: number[]; max: number; scale?: Step[] }
type Levels = { 상: string; 중: string; 하: string }
type Item = {
  kind: string
  lesson_no?: number
  points: number
  stem: string
  situation?: { role: string; audience: string; purpose: string; product: string } | null
  materials_used?: string[]
  conditions?: { items?: { no: number; text: string; points?: number | null; category?: string }[]; length?: string; format?: string; answer_mode?: string; overflow_rule?: string | null }
  rubric?: { criteria?: Criterion[]; holistic?: Levels | null; notes?: string[] }
  exemplar_answers?: { level?: string | null; points: number; scores?: number[]; text: string; rationale?: string }[]
  level_map?: { level: string; min: number; max: number; trait?: string }[]
  references?: { id: string; source: string }[]
}
type Stage5Output = {
  items?: Item[]
  grade_boundaries?: { grade: number; min: number; max: number; band: string; level_ref?: string }[]
  feedback_templates?: Levels
}

const LEVELS = ['상', '중', '하'] as const

function SubHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-ink-500">{children}</p>
}

/** 채점표: 행 = 평가 요소, 열 = 0점 … 최고점(0점부터 오름차순). 요소의 만점보다 높은 칸은 "—". */
function RubricTable({ criteria }: { criteria: Criterion[] }) {
  const top = Math.max(...criteria.map((c) => c.max))
  const cols = Array.from({ length: top + 1 }, (_, p) => p)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ink-100 text-ink-500">
            <th className="w-40 py-1 pr-2">{copy.criterionColumn}</th>
            {cols.map((p) => <th key={p} className="py-1 pr-2">{copy.pointColumn(p)}</th>)}
          </tr>
        </thead>
        <tbody>
          {criteria.map((c, i) => {
            const scale = sortScale(c.scale ?? [])
            return (
              <tr key={i} className="border-b border-ink-50 align-top">
                <td className="py-1 pr-2">
                  <p className="font-semibold">{copy.criterionLabel(c.name, c.max)}</p>
                  {c.axis && <p className="text-ink-500">{c.axis}</p>}
                  {(c.condition_nos?.length ?? 0) > 0 && <p className="text-ink-500">{copy.conditionRefs(c.condition_nos!)}</p>}
                </td>
                {cols.map((p) => {
                  const step = stepAt(scale, p)
                  return (
                    <td key={p} className="py-1 pr-2">
                      {step ? (
                        <>
                          <p className="whitespace-pre-wrap">{step.descriptor}</p>
                          {step.example && <p className="mt-0.5 text-ink-500">{copy.exampleLabel}: {step.example}</p>}
                        </>
                      ) : <span className="text-ink-400">{copy.noStep}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ItemCard({ item, no, materials }: { item: Item; no: number; materials: MaterialLike[] }) {
  const cd = item.conditions
  const conds = cd?.items ?? []
  const criteria = item.rubric?.criteria ?? []
  const exemplars = item.exemplar_answers ?? []
  return (
    <div data-stage5-item className="rounded-xl border border-ink-100 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{copy.itemLabel(no)}</span>
        <Badge tone="lavender">{item.kind}</Badge>
        <Badge tone="mint">{copy.pointsLabel(item.points)}</Badge>
        {item.lesson_no != null && <Badge tone="gray">{copy.lessonLabel(item.lesson_no)}</Badge>}
        {cd?.answer_mode && <Badge tone={cd.answer_mode === 'paper' ? 'lemon' : 'gray'}>{copy.answerMode[cd.answer_mode] ?? cd.answer_mode}</Badge>}
      </div>
      {item.situation && (
        <p className="mt-2 text-xs"><span className="font-semibold text-ink-500">{copy.situationLabel}:</span> {copy.situation(item.situation.role, item.situation.audience, item.situation.purpose, item.situation.product)}</p>
      )}
      {(item.materials_used?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs"><span className="font-semibold text-ink-500">{copy.materialsLabel}:</span> {item.materials_used!.map(copy.materialRef).join(', ')}</p>
      )}

      <p className="mt-2 whitespace-pre-wrap font-semibold">{item.stem}</p>
      <ItemMaterials item={item} materials={materials} />

      <div className="mt-2 rounded-lg bg-ink-100/40 p-2 text-xs">
        <SubHeading>{copy.conditionsHeading}</SubHeading>
        {conds.length > 0 ? (
          <ol className="mt-1 space-y-0.5">
            {conds.map((x) => (
              <li key={x.no}>
                <span className="font-semibold">{copy.conditionNo(x.no)}</span> {x.text}
                {x.category && <> <Badge tone="gray">{x.category}</Badge></>}
                {x.points != null && <> <Badge tone="gray">{copy.pointsLabel(x.points)}</Badge></>}
              </li>
            ))}
          </ol>
        ) : <p className="mt-1 text-ink-500">{copy.noConditions(item.kind)}</p>}
        {(cd?.length || cd?.format || cd?.overflow_rule) && (
          <p className="mt-1 text-ink-500">
            {[cd.length && `${copy.lengthLabel}: ${cd.length}`, cd.format && `${copy.formatLabel}: ${cd.format}`, cd.overflow_rule && `${copy.overflowLabel}: ${cd.overflow_rule}`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {criteria.length > 0 && (
        <div className="mt-3 space-y-2">
          <SubHeading>{copy.rubricHeading}</SubHeading>
          <RubricTable criteria={criteria} />
          {item.rubric?.holistic && (
            <div className="text-xs">
              <SubHeading>{copy.holisticHeading}</SubHeading>
              <ul className="mt-1 space-y-0.5">
                {LEVELS.map((lv) => <li key={lv}><span className="font-semibold">{copy.levels[lv]}</span> {item.rubric!.holistic![lv]}</li>)}
              </ul>
            </div>
          )}
          {(item.rubric?.notes?.length ?? 0) > 0 && (
            <div className="text-xs">
              <SubHeading>{copy.notesHeading}</SubHeading>
              <ul className="mt-1 list-disc pl-5">{item.rubric!.notes!.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {exemplars.length > 0 && (
        <details className="mt-3 rounded-lg bg-lemon-100/40 p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-ink-500">{copy.exemplarCount(no, exemplars.length)}</summary>
          <div className="mt-2 space-y-2">
            {exemplars.map((e, i) => (
              <div key={i} className="rounded-lg bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="mint">{copy.exemplarLabel(e.level ?? null, e.points)}</Badge>
                  {(e.scores?.length ?? 0) > 0 && <span className="text-ink-500">{copy.exemplarScores(e.scores!)}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{e.text}</p>
                {e.rationale && <p className="mt-1 text-ink-500">{copy.rationaleLabel}: {e.rationale}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {(item.level_map?.length ?? 0) > 0 && (
        <p className="mt-2 text-xs"><span className="font-semibold text-ink-500">{copy.levelMapHeading}:</span> {item.level_map!.map((l) => `${l.level} ${l.min}~${l.max}`).join(' / ')}</p>
      )}
      {(item.references?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs text-ink-500"><span className="font-semibold">{copy.referencesHeading}:</span> {item.references!.map((r) => `${r.id} — ${r.source}`).join(', ')}</p>
      )}
    </div>
  )
}

/** 두 문항 공통: 등급표(7행, level_ref) + 피드백 틀 — 문항 카드와 떨어진 칸(오너 요청: 모든 과목 공통). */
function CommonCriteria({ o }: { o: Stage5Output }) {
  const rows = o.grade_boundaries ?? []
  const fb = o.feedback_templates
  if (rows.length === 0 && !fb) return null
  const cols = copy.boundaryColumns
  return (
    <div data-stage5-common className="rounded-xl border-2 border-lavender-100 bg-lavender-100/30 p-3 text-sm">
      <p className="font-semibold">{copy.commonHeading}</p>
      <p className="mt-0.5 text-xs text-ink-500">{copy.commonNote}</p>
      {rows.length > 0 && (
        <div className="mt-2">
          <SubHeading>{copy.boundariesHeading}</SubHeading>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full min-w-[360px] text-left text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-ink-500">
                  <th className="py-1 pr-3">{cols.grade}</th><th className="py-1 pr-3">{cols.range}</th><th className="py-1 pr-3">{cols.band}</th><th className="py-1 pr-3">{cols.levelRef}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.grade} className="border-b border-ink-50">
                    <td className="py-1 pr-3">{b.grade}</td><td className="py-1 pr-3">{copy.boundaryRange(b.min, b.max)}</td><td className="py-1 pr-3">{b.band}</td><td className="py-1 pr-3">{b.level_ref ?? copy.noStep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {fb && (
        <div className="mt-2 text-xs">
          <SubHeading>{copy.feedbackHeading}</SubHeading>
          <ul className="mt-1 space-y-0.5">
            {LEVELS.map((lv) => <li key={lv}><span className="font-semibold">{copy.levels[lv]}</span> {fb[lv]}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/** materials = 4단계 세트 자료 + 이 세트가 가리키는 대주제 공유 자료(StageOutput 이 4단계 탭과 같은 규칙으로 고른다). */
export function Stage5Summary({ output, materials = [] }: { output: unknown; materials?: MaterialLike[] }) {
  const o = output as Stage5Output
  return (
    <div className="mt-3 space-y-4">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink-500">{copy.itemsHeading}</p>
        {o.items?.map((it, i) => <ItemCard key={i} item={it} no={i + 1} materials={materials} />)}
      </div>
      <CommonCriteria o={o} />
    </div>
  )
}
