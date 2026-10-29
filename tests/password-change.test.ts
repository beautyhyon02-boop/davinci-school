import { describe, it, expect } from 'vitest'
import { validateNewPassword } from '@/lib/auth/password-change'
import { auth, app } from '@/content/site'

const e = auth.password.errors

describe('validateNewPassword', () => {
  it('세 칸 중 하나라도 비었으면 missing', () => {
    expect(validateNewPassword('', '', '')).toEqual({ ok: false, error: e.missing })
    expect(validateNewPassword('oldpass1', '', '')).toEqual({ ok: false, error: e.missing })
    expect(validateNewPassword('oldpass1', 'newpass12', '')).toEqual({ ok: false, error: e.missing })
    expect(validateNewPassword('', 'newpass12', 'newpass12')).toEqual({ ok: false, error: e.missing })
  })
  it('새 비밀번호가 8자 미만이면 tooShort', () => {
    expect(validateNewPassword('oldpass1', '1234567', '1234567')).toEqual({ ok: false, error: e.tooShort })
  })
  it('8자는 통과한다', () => {
    expect(validateNewPassword('oldpass1', '12345678', '12345678')).toEqual({ ok: true })
  })
  it('확인이 다르면 mismatch', () => {
    expect(validateNewPassword('oldpass1', 'newpass12', 'newpass13')).toEqual({ ok: false, error: e.mismatch })
  })
  it('현재와 같으면 same', () => {
    expect(validateNewPassword('samepass1', 'samepass1', 'samepass1')).toEqual({ ok: false, error: e.same })
  })
  it('정상이면 ok', () => {
    expect(validateNewPassword('oldpass1', 'newpass12', 'newpass12')).toEqual({ ok: true })
  })
})

describe('비밀번호 바꾸기 문구', () => {
  it('auth.password 와 app.passwordLink 가 정해져 있다', () => {
    expect(auth.password.title).toBe('비밀번호 바꾸기')
    expect(app.passwordLink).toBe('비밀번호 바꾸기')
    for (const v of [auth.password.labels.current, auth.password.labels.next, auth.password.labels.confirm, auth.password.submit, auth.password.submitting, auth.password.done]) {
      expect(v).toBeTruthy()
    }
    expect(Object.keys(e).sort()).toEqual(['currentWrong', 'failed', 'mismatch', 'missing', 'same', 'studentNotAllowed', 'tooShort', 'weak'])
  })
})
