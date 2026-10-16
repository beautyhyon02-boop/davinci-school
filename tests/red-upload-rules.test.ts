import { describe, it, expect } from 'vitest'
import { validateRedUpload, hasZipSignature, RED_MAX_SIZE_BYTES } from '@/lib/red/upload-rules'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const good = 'RED Basic 사물놀이 물리_01 줄로 떠 있는 구조물(텐세그리티) 학생용 작성양식(초등).docx'

describe('validateRedUpload — RED 보고서 docx 올리기 검증', () => {
  it('생성기 이름의 docx 를 받아 칸을 읽어 준다 — MIME(file.type)은 보지 않는다(본사 2026-10-16: 확장자로만, 브라우저·OS 가 주는 형식은 제각각)', () => {
    for (const type of [DOCX, 'application/octet-stream', '', 'application/zip', 'application/msword', 'image/png']) {
      const r = validateRedUpload({ name: good, size: 120_000, type })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.parsed).toMatchObject({ category: 'BASIC', kind: 'student', series: '사물놀이', subject: '물리' })
    }
  })
  it('10MB 를 넘거나 0바이트면 file_too_large', () => {
    expect(validateRedUpload({ name: good, size: RED_MAX_SIZE_BYTES + 1, type: DOCX })).toEqual({ ok: false, error: 'file_too_large' })
    expect(validateRedUpload({ name: good, size: 0, type: DOCX })).toEqual({ ok: false, error: 'file_too_large' })
  })
  it('확장자가 .docx 가 아니면 invalid_type — 받은 file.type 을 detail 로 같이 돌려준다(빈 값이면 빈 문자열)', () => {
    expect(validateRedUpload({ name: good.replace('.docx', '.pdf'), size: 1000, type: 'application/pdf' })).toEqual({ ok: false, error: 'invalid_type', detail: 'application/pdf' })
    expect(validateRedUpload({ name: good.replace('.docx', '.doc'), size: 1000, type: '' })).toEqual({ ok: false, error: 'invalid_type', detail: '' })
    expect(validateRedUpload({ name: good.replace('.docx', '.DOCX'), size: 1000, type: '' }).ok).toBe(true)   // 대문자 확장자도 된다
  })
  it('hasZipSignature: docx 는 ZIP 이라 앞 4바이트가 50 4B 03 04', () => {
    expect(hasZipSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe(true)
    expect(hasZipSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false)   // %PDF
    expect(hasZipSignature(new Uint8Array([0x50, 0x4b]))).toBe(false)
  })
  it('생성기 틀이 아닌 이름은 bad_name — 본사가 이름을 고쳐 다시 올린다', () => {
    expect(validateRedUpload({ name: '보고서 최종.docx', size: 1000, type: DOCX })).toEqual({ ok: false, error: 'bad_name' })
  })
})
