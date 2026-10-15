import crypto from 'crypto'

export function makeSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function makeVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
