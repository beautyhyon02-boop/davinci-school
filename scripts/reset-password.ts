/**
 * 계정 비밀번호를 새로 설정한다 (관리자용, 서비스 롤 키 필요).
 * 사용: npx dotenv -e .env.local -- npx tsx scripts/reset-password.ts <이메일 또는 아이디> <새비밀번호>
 */
import { createClient } from '@supabase/supabase-js'
import { toLoginEmail } from '../lib/auth/login-id'

async function main() {
  const [loginId, password] = process.argv.slice(2)
  if (!loginId || !password) {
    console.error('usage: npx tsx scripts/reset-password.ts <email-or-id> <new-password>')
    process.exit(1)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다 (.env.local).')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('비밀번호는 8자 이상이어야 합니다.')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const email = toLoginEmail(loginId)
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const user = data.users.find((u) => u.email?.toLowerCase() === email)
  if (!user) {
    console.error('해당 계정을 찾을 수 없습니다.')
    process.exit(1)
  }
  const { error } = await sb.auth.admin.updateUserById(user.id, { password })
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log('password updated for', email)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
