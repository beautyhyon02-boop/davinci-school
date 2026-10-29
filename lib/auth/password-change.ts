import { auth } from '@/content/site'

export const MIN_PASSWORD_LENGTH = 8

export type PasswordCheck = { ok: true } | { ok: false; error: string }

/** 비밀번호 바꾸기 입력 검사(순수). 현재 비밀번호가 맞는지는 서버 동작이 Supabase 로 따로 확인한다. */
export function validateNewPassword(current: string, next: string, confirm: string): PasswordCheck {
  const e = auth.password.errors
  if (!current || !next || !confirm) return { ok: false, error: e.missing }
  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: e.tooShort }
  if (next !== confirm) return { ok: false, error: e.mismatch }
  if (next === current) return { ok: false, error: e.same }
  return { ok: true }
}
