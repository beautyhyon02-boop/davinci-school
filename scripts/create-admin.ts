import { createClient } from '@supabase/supabase-js'
const [email, password, name] = process.argv.slice(2)
if (!email || !password) { console.error('usage: npx tsx scripts/create-admin.ts <email> <password> [name]'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data, error } = await sb.auth.admin.createUser({
  email, password, email_confirm: true,
  user_metadata: { role: 'admin', name: name ?? '관리자', academy_id: '', login_id: '' },
})
if (error) { console.error(error.message); process.exit(1) }
console.log('created admin', data.user.id)
