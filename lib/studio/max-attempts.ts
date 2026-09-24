import type { Stage } from './schemas'

// stage별 검토 반복 한도(도달하면 UI가 [JSON 편집]으로 유도). 별도 파일로 두는 이유:
// lib/studio/stages.ts는 lib/ai/claude(→ node:fs 사용하는 fixture 로더)를 가져오므로,
// 클라이언트 컴포넌트가 이 값만 필요할 때도 stages.ts를 값으로 import하면 서버 전용 코드가 브라우저 번들에 끼어든다.
// v2: 모든 단계 3회(결정 2026-09-25) — [TS] 정적 검사가 넓어져 첫 시도에 걸리기 쉬우므로, 비개발자 관리자가
// JSON 편집 전에 다시 생성해 볼 수 있어야 한다.
export const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 }
