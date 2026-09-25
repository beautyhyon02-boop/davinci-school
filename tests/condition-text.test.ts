import { describe, it, expect } from 'vitest'
import { conditionDisplayText } from '@/lib/studio/condition-text'

describe('conditionDisplayText — 조건 끝 "(N점)"은 points 배지가 있을 때 한 번만', () => {
  it('points가 있으면 꼬리의 (N점)을 떼고, 없으면 그대로', () => {
    expect(conditionDisplayText('자료 I나 자료 F에서 가져온 사실적 정보를 한 가지 이상 넣어 쓸 것 (4점)', 4)).toBe('자료 I나 자료 F에서 가져온 사실적 정보를 한 가지 이상 넣어 쓸 것')
    expect(conditionDisplayText('근거를 두 가지 이상 든다(2점)', 2)).toBe('근거를 두 가지 이상 든다')
    expect(conditionDisplayText('근거를 두 가지 이상 든다 (2점)', null)).toBe('근거를 두 가지 이상 든다 (2점)')
    expect(conditionDisplayText('찬성·반대 중 한 입장을 정한다', 3)).toBe('찬성·반대 중 한 입장을 정한다')
    expect(conditionDisplayText('(2점)을 먼저 정한 뒤 쓴다', 2)).toBe('(2점)을 먼저 정한 뒤 쓴다')
  })
})
