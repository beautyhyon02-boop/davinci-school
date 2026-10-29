import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.essayLock

/** 다빈치 베이직 원장이 서논술 주소로 들어오면 여기로 온다. 메뉴에는 없다. */
export default function TeacherLockedPage() {
  return (
    <Card>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="mt-2 text-ink-700">{copy.body}</p>
      <div className="mt-4"><Button href="/teacher">{copy.home}</Button></div>
    </Card>
  )
}
