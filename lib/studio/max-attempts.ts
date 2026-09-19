import type { Stage } from './schemas'

// stage별 검토 반복 한도(도달하면 UI가 [JSON 편집]으로 유도). 별도 파일로 두는 이유:
// lib/studio/stages.ts는 lib/ai/claude(→ node:fs 사용하는 fixture 로더)를 가져오므로,
// 클라이언트 컴포넌트가 이 값만 필요할 때도 stages.ts를 값으로 import하면 서버 전용 코드가 브라우저 번들에 끼어든다.
export const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 5: 3 }
