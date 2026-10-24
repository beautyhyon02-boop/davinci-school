import { describe, it, expect } from 'vitest'
import { normalizeWebsite } from '@/lib/academies/website'

// 설계 2026-10-25 §5 — 홈페이지 주소: 비었거나 http(s) 주소. 스킴이 없으면 https:// 를 붙인다.
describe('normalizeWebsite', () => {
  it('빈 입력은 빈 글자(홈페이지 없음)', () => {
    expect(normalizeWebsite('')).toBe('')
    expect(normalizeWebsite('   ')).toBe('')
  })
  it('스킴 없는 주소에 https:// 를 붙이고 앞뒤 공백을 지운다', () => {
    expect(normalizeWebsite(' www.davinci-lab.co.kr ')).toBe('https://www.davinci-lab.co.kr/')
    expect(normalizeWebsite('example.com/about')).toBe('https://example.com/about')
  })
  it('http·https 는 그대로(호스트는 소문자로)', () => {
    expect(normalizeWebsite('http://Example.com/A')).toBe('http://example.com/A')
    expect(normalizeWebsite('https://blog.naver.com/abc')).toBe('https://blog.naver.com/abc')
  })
  it('틀린 주소는 null', () => {
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull()
    expect(normalizeWebsite('ftp://example.com')).toBeNull()
    expect(normalizeWebsite('localhost')).toBeNull()          // 점 없는 호스트
    expect(normalizeWebsite('not a url')).toBeNull()
  })
})
