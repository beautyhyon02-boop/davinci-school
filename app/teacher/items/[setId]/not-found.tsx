import Link from 'next/link'
import { app } from '@/content/site'

const copy = app.teacherItems

export default function TeacherItemNotFound() {
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.detail.notFoundTitle}</h1>
      <Link href="/teacher/items" className="mt-4 inline-block text-sm text-mint-700 underline">{copy.detail.backToList}</Link>
    </>
  )
}
