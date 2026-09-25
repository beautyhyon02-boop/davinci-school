import { app } from '@/content/site'
import type { WizardStage } from '@/lib/studio/wizard-stages'
import { usedMaterialIds, stageMaterialsView } from '@/lib/studio/materials'
import { SectionTitle, arr } from '@/components/studio/parts/common'
import { LessonCards, type LessonLike } from '@/components/studio/parts/LessonCards'
import { UnitPlanView, type UnitPlanLike } from '@/components/studio/parts/UnitPlanView'
import { MaterialsFull, type MaterialLike } from '@/components/studio/parts/MaterialsFull'
import { TeacherGuideView, type TeacherGuideLike } from '@/components/studio/parts/TeacherGuideView'
import { NoticePlanView, type NoticePlanLike } from '@/components/studio/parts/NoticePlanView'
import { Stage5Summary } from './Stage5Summary'

// 제작소 단계 탭의 결과 보기. 오너 규칙(2026-09-26): 탭은 요약이 아니라 학생·원장이 보는 완성본 그대로 — 원장 패키지 화면(PackageView)과
// 같은 조각(components/studio/parts/)을 쓴다. PackageView 자체는 서버 전용(getLevels 가 node:fs)이라 여기서는 조각만 가져온다.
//   3단계 = 평가 계획 + 차시 카드 전부(교사용 지침 칸에 6단계 지침서의 그 차시 메모가 있으면 함께)
//   4단계 = 자료 전부(표 전체·그래프·이미지) + 이 세트가 가리키는 대주제 공유 자료('공유' 표시)
//   5단계 = Stage5Summary(문항 카드 — 카드 안에 그 문항의 <자료 n> 상자 — ·채점 기준표) · 6단계 = 교사용 지침서 전체 · 7단계 = 안내장 틀 전체
// 다른 단계의 출력(차시 → 지침서 메모·자료 참조 등)은 outputs 로 받는다 — 모두 평범한 데이터(함수 prop 없음).
const copy = app.studio.wizard

// 2단계는 v2 출력(learning_goals 객체)과 v2 이전 출력(문자열 목표)을 둘 다 받는다.
type Stage2Output = { reconstruction: string; learning_goals: (string | { text: string; axis: string })[]; key_question_candidates: string[] }
type Stage3Output = { unit_plan?: UnitPlanLike | null; lessons?: LessonLike[] }

// 칸 제목은 원장 화면 조각과 같은 위계(text-base 굵게 — parts/common.tsx SectionTitle, 오너 요청 2026-09-26).
const Heading = SectionTitle

export function StageOutput({ stage, outputs, sharedMaterials = [] }: {
  stage: WizardStage
  /** 단계별 현재 출력(마법사 상태의 output). 이 단계 것과, 함께 보여 줄 다른 단계 것(3↔6, 4 ← 3·5·6·7)을 읽는다. */
  outputs: Partial<Record<WizardStage, unknown>>
  /** 대주제 공유 자료(서버가 v2 기본값을 입혀 넘긴다) — 4단계 탭에 이 세트가 가리키는 것만 보인다. */
  sharedMaterials?: MaterialLike[]
}) {
  const output = outputs[stage]
  if (output === undefined || output === null) return <p className="mt-3 text-sm text-ink-500">{copy.empty}</p>

  if (stage === 2) {
    const o = output as Stage2Output
    return (
      <div className="mt-3 space-y-3">
        <div>
          <Heading>{copy.stage2.reconstructionLabel}</Heading>
          <p className="mt-1 whitespace-pre-wrap text-sm">{o.reconstruction}</p>
        </div>
        <div>
          <Heading>{copy.stage2.goalsLabel}</Heading>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {o.learning_goals?.map((g, i) => <li key={i}>{typeof g === 'string' ? g : copy.stage2.goal(g.text, g.axis)}</li>)}
          </ul>
        </div>
        <div>
          <Heading>{copy.stage2.candidatesLabel}</Heading>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {o.key_question_candidates?.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  if (stage === 3) {
    const o = output as Stage3Output
    const guide = (outputs[6] as TeacherGuideLike | null | undefined)?.per_lesson ?? null
    return (
      <div className="mt-3 space-y-4">
        {o.unit_plan && (
          <div>
            <Heading>{copy.stage3.unitPlanHeading}</Heading>
            <UnitPlanView plan={o.unit_plan} />
          </div>
        )}
        <div>
          <Heading>{copy.stage3.lessonsHeading}</Heading>
          {!guide && <p className="mt-1 text-xs text-ink-500">{copy.stage3.guidePending}</p>}
          <LessonCards lessons={arr(o.lessons)} showAnswers open guide={guide} />
        </div>
      </div>
    )
  }

  if (stage === 4) {
    const o = output as { materials?: MaterialLike[] }
    const lessons = (outputs[3] as Stage3Output | null | undefined)?.lessons
    const items = (outputs[5] as { items?: { materials_used?: string[] }[] } | null | undefined)?.items
    const used = usedMaterialIds({ lessons, items, texts: [outputs[6], outputs[7]] })
    const view = stageMaterialsView(arr(o.materials), sharedMaterials, used)
    return (
      <div className="mt-3">
        {view.sharedIds.length > 0 && <p className="text-xs text-ink-500">{copy.stage4.sharedNote}</p>}
        {view.overridden.length > 0 && <p className="mt-1 text-xs text-ink-500">{copy.stage4.overriddenNote(view.overridden)}</p>}
        <MaterialsFull materials={view.materials} sharedIds={view.sharedIds} />
      </div>
    )
  }

  if (stage === 5) {
    // 문항 카드 안에 그 문항의 자료를 넣는다 — 4단계 탭과 같은 규칙(세트 자료 전부 + 이 세트가 가리키는 공유 자료)
    const lessons = (outputs[3] as Stage3Output | null | undefined)?.lessons
    const items = (output as { items?: { materials_used?: string[] }[] }).items
    const used = usedMaterialIds({ lessons, items, texts: [outputs[6], outputs[7]] })
    const setMaterials = arr((outputs[4] as { materials?: MaterialLike[] } | null | undefined)?.materials)
    return <Stage5Summary output={output} materials={stageMaterialsView(setMaterials, sharedMaterials, used).materials} />
  }

  if (stage === 6) {
    const lessons = arr((outputs[3] as Stage3Output | null | undefined)?.lessons)
    return <TeacherGuideView guide={output as TeacherGuideLike} lessons={lessons} />
  }

  return <NoticePlanView plan={output as NoticePlanLike} />
}
