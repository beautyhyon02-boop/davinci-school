import { describe, it, expect } from 'vitest'
import { validateUpload, sanitizeTarget, isMaterialsPublicUrl } from '@/lib/studio/upload-rules'

describe('validateUpload', () => {
  it('accepts a png under 5MB for a material target', () => {
    const r = validateUpload({ size: 1024, type: 'image/png', name: 'chart.png', target: 'material:A' })
    expect(r).toEqual({ ok: true, ext: 'png' })
  })
  it('accepts a jpeg for a lesson target and normalizes the extension to jpg', () => {
    const r = validateUpload({ size: 1024, type: 'image/jpeg', name: 'photo.JPEG', target: 'lesson:3' })
    expect(r).toEqual({ ok: true, ext: 'jpg' })
  })
  it('accepts webp', () => {
    const r = validateUpload({ size: 1024, type: 'image/webp', name: 'a.webp', target: 'material:B' })
    expect(r).toEqual({ ok: true, ext: 'webp' })
  })
  it('rejects files over 5MB', () => {
    const r = validateUpload({ size: 5 * 1024 * 1024 + 1, type: 'image/png', name: 'a.png', target: 'material:A' })
    expect(r).toEqual({ ok: false, error: 'file_too_large' })
  })
  it('rejects a zero-byte file', () => {
    const r = validateUpload({ size: 0, type: 'image/png', name: 'a.png', target: 'material:A' })
    expect(r).toEqual({ ok: false, error: 'file_too_large' })
  })
  it('rejects disallowed mime types', () => {
    const r = validateUpload({ size: 1024, type: 'application/pdf', name: 'a.pdf', target: 'material:A' })
    expect(r).toEqual({ ok: false, error: 'invalid_type' })
  })
  it('rejects when the extension does not match the declared mime type', () => {
    const r = validateUpload({ size: 1024, type: 'image/png', name: 'a.webp', target: 'material:A' })
    expect(r).toEqual({ ok: false, error: 'invalid_type' })
  })
  it('rejects invalid target formats', () => {
    expect(validateUpload({ size: 1024, type: 'image/png', name: 'a.png', target: 'material:1' }).ok).toBe(false)
    expect(validateUpload({ size: 1024, type: 'image/png', name: 'a.png', target: 'lesson:A' }).ok).toBe(false)
    expect(validateUpload({ size: 1024, type: 'image/png', name: 'a.png', target: 'material:AB' }).ok).toBe(false)
    expect(validateUpload({ size: 1024, type: 'image/png', name: 'a.png', target: 'foo' }).ok).toBe(false)
  })
})

describe('sanitizeTarget', () => {
  it('replaces the colon so the value is safe to use as a storage path segment', () => {
    expect(sanitizeTarget('material:A')).toBe('material_A')
    expect(sanitizeTarget('lesson:3')).toBe('lesson_3')
  })
})

describe('isMaterialsPublicUrl', () => {
  const supabaseUrl = 'https://project.supabase.co'

  it('accepts a materials bucket public url under our supabase url', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/materials/sets/x/material_A/a.png'
    expect(isMaterialsPublicUrl(url, supabaseUrl)).toBe(true)
  })
  it('accepts when supabaseUrl has a trailing slash', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/materials/a.png'
    expect(isMaterialsPublicUrl(url, 'https://project.supabase.co/')).toBe(true)
  })
  it('rejects a different host (not our supabase project)', () => {
    const url = 'https://evil.example.com/storage/v1/object/public/materials/a.png'
    expect(isMaterialsPublicUrl(url, supabaseUrl)).toBe(false)
  })
  it('rejects a different bucket', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/avatars/a.png'
    expect(isMaterialsPublicUrl(url, supabaseUrl)).toBe(false)
  })
  it('rejects a non-public (signed/private) materials path', () => {
    const url = 'https://project.supabase.co/storage/v1/object/sign/materials/a.png'
    expect(isMaterialsPublicUrl(url, supabaseUrl)).toBe(false)
  })
})
