/**
 * 마법사가 다루는 단계(2~6)의 목록. 서버 컴포넌트(page.tsx)와 클라이언트(useStageRunner/StageWizard)가 함께 쓰므로
 * 'use client' 모듈 밖에 둔다 — 클라이언트 모듈에서 값을 import 하면 서버 쪽에는 배열이 아니라 클라이언트 참조가 와서
 * `for (const s of WIZARD_STAGES)` 가 "not iterable" 로 터진다.
 */
export const WIZARD_STAGES = [2, 3, 4, 5, 6] as const
export type WizardStage = (typeof WIZARD_STAGES)[number]
