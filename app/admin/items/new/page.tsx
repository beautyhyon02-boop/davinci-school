import { ThemeForm } from './ThemeForm'
import { app } from '@/content/site'

export default function NewThemePage() {
  return (
    <>
      <h1 className="text-2xl font-bold">{app.studio.newTheme.title}</h1>
      <div className="mt-6">
        <ThemeForm />
      </div>
    </>
  )
}
