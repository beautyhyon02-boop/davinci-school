import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { session: { role: string; plan: string | null } } = { session: { role: 'teacher', plan: 'davinci' } }
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) })
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))

import { requireEssayPage } from '@/lib/auth/essay-access.server'

describe('requireEssayPage', () => {
  beforeEach(() => { redirect.mockClear(); state.session = { role: 'teacher', plan: 'davinci' } })
  it('다빈치올 원장·관리자는 세션을 그대로 돌려받는다', async () => {
    await expect(requireEssayPage()).resolves.toMatchObject({ role: 'teacher' })
    state.session = { role: 'admin', plan: null }
    await expect(requireEssayPage()).resolves.toMatchObject({ role: 'admin' })
    expect(redirect).not.toHaveBeenCalled()
  })
  it('다빈치 베이직 원장은 /teacher/locked 로 보낸다', async () => {
    state.session = { role: 'teacher', plan: 'davinci_basic' }
    await expect(requireEssayPage()).rejects.toThrow('REDIRECT:/teacher/locked')
    expect(redirect).toHaveBeenCalledWith('/teacher/locked')
  })
})
