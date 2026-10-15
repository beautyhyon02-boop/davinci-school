import { describe, it, expect } from 'vitest'
import { validateRedUpload, RED_MAX_SIZE_BYTES } from '@/lib/red/upload-rules'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const good = 'RED Basic 사물놀이 물리_01 줄로 떠 있는 구조물(텐세그리티) 학생용 작성양식(초등).docx'

describe('validateRedUpload — RED 보고서 docx 올리기 검증', () => {
  it('생성기 이름의 docx 를 받아 칸을 읽어 준다(MIME 이 비어 있거나 octet-stream 이어도)', () => {
    for (const type of [DOCX, 'application/octet-stream', '']) {
      const r = validateRedUpload({ name: good, size: 120_000, type })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.parsed).toMatchObject({ category: 'BASIC', kind: 'student', series: '사물놀이', subject: '물리' })
    }
  })
  it('10MB 를 넘거나 0바이트면 file_too_large', () => {
    expect(validateRedUpload({ name: good, size: RED_MAX_SIZE_BYTES + 1, type: DOCX })).toEqual({ ok: false, error: 'file_too_large' })
    expect(validateRedUpload({ name: good, size: 0, type: DOCX })).toEqual({ ok: false, error: 'file_too_large' })
  })
  it('docx 가 아니면 invalid_type', () => {
    expect(validateRedUpload({ name: good.replace('.docx', '.pdf'), size: 1000, type: 'application/pdf' })).toEqual({ ok: false, error: 'invalid_type' })
    expect(validateRedUpload({ name: good, size: 1000, type: 'image/png' })).toEqual({ ok: false, error: 'invalid_type' })
  })
  it('생성기 틀이 아닌 이름은 bad_name — 본사가 이름을 고쳐 다시 올린다', () => {
    expect(validateRedUpload({ name: '보고서 최종.docx', size: 1000, type: DOCX })).toEqual({ ok: false, error: 'bad_name' })
  })
})
