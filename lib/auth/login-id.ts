export const ID_EMAIL_DOMAIN = 'id.davinci-lab.kr'

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function toLoginEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase()
  return isEmail(id) ? id : `${id}@${ID_EMAIL_DOMAIN}`
}
