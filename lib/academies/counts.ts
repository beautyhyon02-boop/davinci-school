export type AcademyCounts = { teachers: number; students: number }

export function countByAcademy(profiles: { academy_id: string | null; role: string }[]): Record<string, AcademyCounts> {
  const result: Record<string, AcademyCounts> = {}
  for (const p of profiles) {
    if (!p.academy_id) continue
    if (p.role !== 'teacher' && p.role !== 'student') continue
    const entry = (result[p.academy_id] ??= { teachers: 0, students: 0 })
    if (p.role === 'teacher') entry.teachers += 1
    else entry.students += 1
  }
  return result
}
