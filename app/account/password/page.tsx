import { PasswordForm } from './PasswordForm'
import { auth } from '@/content/site'

export default function PasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">{auth.password.title}</h1>
      <PasswordForm />
    </div>
  )
}
