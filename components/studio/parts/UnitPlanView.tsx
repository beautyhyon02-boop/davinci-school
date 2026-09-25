import { app } from '@/content/site'
import { KV, LabeledLines, arr } from './common'

// 평가 계획(3단계 unit_plan) 보기(카드 틀 없이) — 차시 구성·형성평가·서·논술형 배치·종합 도달 모습.
// 원장 패키지 화면(PackageView)과 제작소 3단계 탭이 같은 모양을 쓴다. 저장된 출력을 그대로 받으므로 느슨하게 읽는다.
// 대표님 지적(2026-09-26): 한 줄로 늘어놓으니 눈에 안 들어온다 → 차시 구성·배치·도달 모습 모두 한 줄에 하나씩.

export type UnitPlanLike = {
  lesson_map?: { lesson_no: number; topic: string }[]
  assessment_plan?: {
    formative?: string
    summative_placement?: { lesson_no: number; kind: string }[]
    rubric_note?: { 상?: string; 중?: string; 하?: string } | null
  } | null
}

const copy = app.packageView
const c = copy.unitPlan

export function UnitPlanView({ plan }: { plan: UnitPlanLike }) {
  const p = plan.assessment_plan
  return (
    <div className="mt-2 space-y-3 text-sm">
      <LabeledLines label={c.lessonMapLabel} items={arr(plan.lesson_map).map((l) => c.lessonMapItem(l.lesson_no, l.topic))} />
      {p && (
        <>
          <KV stacked label={c.formativeLabel}>{p.formative}</KV>
          <LabeledLines label={c.placementLabel} items={arr(p.summative_placement).map((x) => c.placement(x.kind, x.lesson_no))} />
          {p.rubric_note && (
            <LabeledLines
              label={c.rubricNoteLabel}
              items={(['상', '중', '하'] as const).map((lv) => <><span className="font-semibold">{copy.feedbackLevels[lv]}</span> {p.rubric_note?.[lv]}</>)}
            />
          )}
        </>
      )}
    </div>
  )
}
