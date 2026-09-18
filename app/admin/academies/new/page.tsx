import { AcademyForm } from './AcademyForm'
import { app } from '@/content/site'

export default function NewAcademyPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">{app.adminAcademies.newButton}</h1>
      <div className="mt-6">
        <AcademyForm />
      </div>
    </>
  )
}
