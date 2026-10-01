// 제본용 교재 시험용 스냅숏(tests/book-*.test.ts 가 같이 쓴다): 수학·과학 mock fixture 로 조립한 v2 판과 옛 v1 판(문항 3개, 논술형 차시).
import { readFileSync } from 'node:fs'
import { buildSnapshot, upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'

const fx = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/${k}.json`, 'utf8'))
const v1 = (k: string) => JSON.parse(readFileSync(`tests/fixtures/v1/${k}.json`, 'utf8'))
export function snapshotFor(subject: '수학' | '과학'): Snapshot {
  const sfx = subject === '과학' ? '-과학' : ''
  const s2 = fx(`stage2-generate${sfx}`); const s3 = fx(`stage3-generate${sfx}`)
  return buildSnapshot({
    theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, intro: '대주제 소개 문장', materials: null },
    itemSet: {
      subject, level: '중', grade: 1, reconstruction: s2.reconstruction, reconstruction_detail: s2.standards, learning_goals: s2.learning_goals,
      key_question: s2.key_question_candidates[0], unit_plan: s3.unit_plan, lessons: s3.lessons, materials: fx(`stage4-generate${sfx}`).materials,
      assessment: fx(`stage5-generate${sfx}`), teacher_guide: fx(`stage6-generate${sfx}`), notice_plan: fx(`stage7-generate${sfx}`),
      // 세트 범위 메모(L-16)는 stage_status.stage2.output 에서 판으로 간다(publish.ts buildSnapshot)
      stage_status: { stage2: { state: 'accepted', attempt: 1, model: 'mock', output: s2, updated_at: '' }, stage5: { state: 'accepted', attempt: 1, model: 'mock', updated_at: '' } },
    },
    standards: s2.standards.map((s: { code: string; original_text: string }) => ({ code: s.code, text: s.original_text })),
    version: 1,
  })
}

export function v1Snapshot(): Snapshot {
  return upgradeSnapshot({
    cover: { title: 'v1 판', subject: '수학', level: '중', grade: 1, version: 1, published_at: '2026-09-20T00:00:00.000Z' },
    standards: fx('standards-math'), intro: '', reconstruction: v1('stage2-generate').reconstruction, learning_goals: v1('stage2-generate').learning_goals,
    key_question: '자료는 무엇을 말하는가?', lessons: v1('stage3-generate').lessons, materials: v1('stage4-generate').materials,
    assessment: v1('stage5-generate'), teacher_guide: v1('stage6-generate'), generated_with: { models: ['mock'] },
  })
}

