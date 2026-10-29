// 홈페이지 「서논술형」 수업 페이지의 단추(대표 2026-10-29): 비로그인·학생은 가맹 문의, 다빈치올 원장은 원장 화면, 베이직 원장은 안내+본사 문의, 본사는 제작소. 서버 렌더로 확인한다.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EssayCta } from '@/components/site/EssayCta'
import { ProgramPage } from '@/components/site/ProgramPage'
import { pages } from '@/content/site'

const copy = pages.program.essayCta
const render = (role: 'admin' | 'teacher' | 'student' | null, plan: 'davinci' | 'davinci_basic' | null) =>
  renderToStaticMarkup(createElement(EssayCta, { role, plan }))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1])

describe('EssayCta', () => {
  it('logged-out visitor: the franchise inquiry button only', () => {
    const html = render(null, null)
    expect(html).toContain(pages.program.cta)
    expect(hrefs(html)).toEqual(['/franchise'])
  })

  it('student: the franchise inquiry button only', () => {
    const html = render('student', null)
    expect(html).toContain(pages.program.cta)
    expect(hrefs(html)).toEqual(['/franchise'])
  })

  it('teacher on davinci: opens the teacher screen', () => {
    const html = render('teacher', 'davinci')
    expect(html).toContain(copy.open)
    expect(hrefs(html)).toEqual(['/teacher/items'])
    expect(html).not.toContain(pages.program.cta)
    expect(html).not.toContain(copy.locked.heading)
  })

  it('teacher on davinci_basic: locked notice with a headquarters inquiry button, no teacher link', () => {
    const html = render('teacher', 'davinci_basic')
    expect(html).toContain(copy.locked.heading)
    expect(html).toContain(copy.locked.body)
    expect(html).toContain(copy.locked.button)
    expect(hrefs(html)).toEqual(['/franchise'])
    expect(html).not.toContain('/teacher/items')
    expect(html).not.toContain(copy.open)
  })

  it('admin: opens the item studio', () => {
    const html = render('admin', null)
    expect(html).toContain(copy.admin)
    expect(hrefs(html)).toEqual(['/admin/items'])
    expect(html).not.toContain(pages.program.cta)
  })
})

describe('ProgramPage cta prop', () => {
  it('with cta given, the default franchise button text is not rendered', () => {
    const html = renderToStaticMarkup(createElement(ProgramPage, { slug: 'essay', cta: createElement('span', null, 'CUSTOM-CTA') }))
    expect(html).toContain('CUSTOM-CTA')
    expect(html).not.toContain(pages.program.cta)
  })

  it('without cta, the default franchise button is rendered', () => {
    const html = renderToStaticMarkup(createElement(ProgramPage, { slug: 'essay' }))
    expect(html).toContain(pages.program.cta)
  })
})
