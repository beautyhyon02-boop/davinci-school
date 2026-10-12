/**
 * 학생 계정의 고정 비밀번호(대표 2026-10-12): 새 계정 발급과 「비밀번호 초기화」 모두 이 값으로 — 무작위 8자는 학생이 외우기 어려웠다.
 * Supabase Auth 가 6자 미만을 거부하므로(supabase/config.toml minimum_password_length = 6, 그 아래로 못 내림) "1111"은 쓸 수 없어 여섯 자리로 정했다.
 * 원장 계정(app/admin/academies)은 그대로 무작위(lib/auth/passwords.ts).
 * 클라이언트 컴포넌트(ResetPasswordButton)도 읽으므로 node 모듈을 들이지 않는다.
 */
export const STUDENT_DEFAULT_PASSWORD = '123456'
