import { app } from '@/content/site'

export default function AdminItemsPage() {
  const copy = app.adminItems
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-6 rounded-2xl bg-lavender-50 p-8">
        <p className="text-sm font-semibold text-lavender-600">COMING SOON</p>
        <p className="mt-2 text-ink-700">{copy.body}</p>
      </div>
    </>
  )
}
