import { app } from '@/content/site'

export default function AdminHome() {
  return (
    <>
      <h1 className="text-2xl font-bold">{app.dashboard.admin.title}</h1>
      <p className="mt-2 text-ink-500">{app.dashboard.admin.body}</p>
    </>
  )
}
