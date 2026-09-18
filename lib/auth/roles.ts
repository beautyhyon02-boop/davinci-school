export type Role = 'admin' | 'teacher' | 'student'

export function homePathFor(role: Role): string {
  return `/${role}`
}

export function requiredRoleFor(pathname: string): Role | null {
  const m = pathname.match(/^\/(admin|teacher|student)(\/|$)/)
  return m ? (m[1] as Role) : null
}
