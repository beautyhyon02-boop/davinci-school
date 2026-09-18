import { app } from '@/content/site'

export default function StudentHome() {
  return (
    <>
      <h1 className="text-2xl font-bold">{app.dashboard.student.title}</h1>
      <p className="mt-2 text-ink-500">{app.dashboard.student.body}</p>
    </>
  )
}
