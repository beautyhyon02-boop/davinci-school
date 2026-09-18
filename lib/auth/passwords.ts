import { randomInt } from 'node:crypto'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generatePassword(length = 10): string {
  let s = ''
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return s
}
