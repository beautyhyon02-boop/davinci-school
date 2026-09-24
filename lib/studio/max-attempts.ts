import type { Stage } from './schemas'

// stage별 검토 반복 한도(도달하면 UI가 안내를 띄우고 [JSON 편집]을 권한다 — [생성]은 계속 누를 수 있다). 별도 파일로 두는 이유:
// lib/studio/stages.ts는 lib/ai/claude(→ node:fs 사용하는 fixture 로더)를 가져오므로,
// 클라이언트 컴포넌트가 이 값만 필요할 때도 stages.ts를 값으로 import하면 서버 전용 코드가 브라우저 번들에 끼어든다.
// v2: 모든 단계 3회(결정 2026-09-25) — [TS] 정적 검사가 넓어져 첫 시도에 걸리기 쉬우므로, 비개발자 관리자가
// JSON 편집 전에 다시 생성해 볼 수 있어야 한다.
export const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 }

/**
 * 한도에 닿은 검토 결과가 status.error 에 남기는 표지. 잠금이 아니라 안내다 — [생성]을 다시 누르면 새 판이 만들어지며 지워지고,
 * 대주제 소개 화면과 세트 마법사는 이 값을 보면 빨간 오류 대신 안내 문구(content/site.ts)를 보여 준다.
 */
export const EXHAUSTED_ERROR = '검토 반복 한도 도달 — 관리자가 직접 수정'
