import { describe, it, expect } from 'vitest'
import { safeNextPath } from '@/lib/auth/safe-next'

describe('safeNextPath — 로그인 뒤 돌아갈 경로는 같은 사이트 경로만', () => {
  it('사이트 안 경로는 그대로', () => {
    expect(safeNextPath('/programs/inquiry')).toBe('/programs/inquiry')
    expect(safeNextPath('/teacher/items?x=1')).toBe('/teacher/items?x=1')
  })
  it('바깥 주소·프로토콜 상대 주소·빈 값·로그인 페이지는 버린다', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', '  ', 'programs', '/login', '/login?next=/x', '/a b', null, undefined, 3])
      expect(safeNextPath(bad), String(bad)).toBeNull()
  })
})
