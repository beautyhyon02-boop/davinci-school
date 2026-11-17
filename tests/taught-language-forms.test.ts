// 다른 영어 세트에서 이미 가르치는 목표 언어 형식과 겹치지 않는 후보(S-영-11 덧붙임 — 2026-11-17).
// 도서관 영어 2단계를 다시 생성하니 후보 넷 가운데 셋이 일회용품 영어에서 이미 고른 문법이었다 → 2단계 생성·검토에 "이미 가르치는 형식"을 알려 주고,
// 「목표 문법 고르기」 화면에도 한 줄로 보여 준다. 설계: docs/superpowers/specs/2026-11-14-english-language-forms-design.md §9
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { taughtLanguageForms, taughtFormNames } from '@/lib/studio/language-forms'
import { loadTaughtLanguageForms } from '@/lib/studio/taught-forms'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { SUBJECT_RULES } from '@/lib/studio/prompts/rules/index'
import { app } from '@/content/site'

vi.mock('@/app/admin/items/[themeId]/sets/[setId]/actions', () => ({ chooseLanguageForms: vi.fn() }))
const { LanguageFormPicker } = await import('@/app/admin/items/[themeId]/sets/[setId]/LanguageFormPicker')

const cand = (name: string) => ({ name, form: '꼴', example: 'Example.', use: '하는 일', basis: '근거' })
const CANDS = ['비교급', '이유를 나타내는 because 절', '요청하는 명령문', '목적의 to부정사'].map(cand)
const st2 = (state: string, output: unknown) => ({ state, attempt: 1, output, updated_at: '' })
const picked = { language_form_candidates: CANDS, language_forms: ['비교급', '이유를 나타내는 because 절', '요청하는 명령문'] }

describe('taughtLanguageForms — 다른 영어 세트에서 본사가 정한 형식', () => {
  it('2단계가 [확인]된 다른 세트의 고른 형식만, 대주제 이름과 함께(자기 세트는 뺀다)', () => {
    const rows = [
      { id: 'self', theme: '도서관', stage2: st2('accepted', picked) },
      { id: 'a', theme: '학교 축제, 일회용품을 줄이자', stage2: st2('accepted', picked) },
    ]
    expect(taughtLanguageForms(rows, 'self')).toEqual([{ theme: '학교 축제, 일회용품을 줄이자', names: ['비교급', '이유를 나타내는 because 절', '요청하는 명령문'] }])
  })
  it('고르지 않고 [확인]한 세트는 앞의 두 개(그 세트가 실제로 가르치는 것)', () => {
    const rows = [{ id: 'a', theme: '가', stage2: st2('accepted', { language_form_candidates: CANDS }) }]
    expect(taughtLanguageForms(rows, 'self')).toEqual([{ theme: '가', names: ['비교급', '이유를 나타내는 because 절'] }])
  })
  it('아직 [확인]하지 않은 세트·후보가 없는 옛 세트·모양이 다른 값은 세지 않는다', () => {
    const rows = [
      { id: 'a', theme: '가', stage2: st2('generated', picked) },
      { id: 'b', theme: '나', stage2: st2('accepted', { reconstruction: '옛 세트' }) },
      { id: 'c', theme: '다', stage2: null },
      { id: 'd', theme: '라', stage2: undefined },
    ]
    expect(taughtLanguageForms(rows, 'self')).toEqual([])
  })
  it('대주제 이름 순으로 놓는다(프롬프트가 결정적이도록); taughtFormNames 는 겹친 이름을 하나로', () => {
    const rows = [
      { id: 'b', theme: '하늘', stage2: st2('accepted', { language_form_candidates: CANDS, language_forms: ['비교급', '목적의 to부정사'] }) },
      { id: 'a', theme: '가을', stage2: st2('accepted', picked) },
    ]
    const taught = taughtLanguageForms(rows, 'self')
    expect(taught.map((t) => t.theme)).toEqual(['가을', '하늘'])
    expect(taughtFormNames(taught)).toEqual(['비교급', '이유를 나타내는 because 절', '요청하는 명령문', '목적의 to부정사'])
    expect(taughtFormNames([])).toEqual([])
  })
})

describe('loadTaughtLanguageForms — 같은 학교급의 다른 영어 세트를 읽는다', () => {
  type Row = Record<string, unknown>
  function fake(tables: Record<string, Row[]>, log: { table: string; select: string; filters: [string, string, unknown][] }[] = [], fail = false) {
    return {
      from(table: string) {
        const entry = { table, select: '', filters: [] as [string, string, unknown][] }
        log.push(entry)
        const rows = () => (tables[table] ?? []).filter((r) => entry.filters.every(([op, c, v]) => (op === 'eq' ? r[c] === v : (v as unknown[]).includes(r[c]))))
        const b = {
          select(cols: string) { entry.select = cols; return b },
          eq(c: string, v: unknown) { entry.filters.push(['eq', c, v]); return b },
          in(c: string, v: unknown[]) { entry.filters.push(['in', c, v]); return b },
          then(res: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) { return Promise.resolve(fail ? { data: null, error: { message: 'boom' } } : { data: rows(), error: null }).then(res) },
        }
        return b
      },
    }
  }
  const tables = {
    item_sets: [
      { id: 'self', theme_id: 't2', subject: '영어', level: '중', status: 'published', stage2: st2('accepted', picked) },
      { id: 'a', theme_id: 't1', subject: '영어', level: '중', status: 'published', stage2: st2('accepted', picked) },
      { id: 'b', theme_id: 't3', subject: '영어', level: '초', status: 'published', stage2: st2('accepted', picked) },   // 다른 학교급
      { id: 'c', theme_id: 't1', subject: '국어', level: '중', status: 'published', stage2: st2('accepted', picked) },   // 다른 과목
      { id: 'd', theme_id: 't4', subject: '영어', level: '중', status: 'retired', stage2: st2('accepted', picked) },     // 내린 세트
    ],
    themes: [{ id: 't1', title: '학교 축제, 일회용품을 줄이자' }, { id: 't2', title: '도서관' }, { id: 't3', title: '초등' }, { id: 't4', title: '내린 대주제' }],
  }
  it('같은 학교급·영어·내리지 않은 다른 세트만 — stage_status 는 2단계만 골라 읽는다', async () => {
    const log: { table: string; select: string; filters: [string, string, unknown][] }[] = []
    const taught = await loadTaughtLanguageForms(fake(tables, log) as never, { setId: 'self', level: '중' })
    expect(taught).toEqual([{ theme: '학교 축제, 일회용품을 줄이자', names: ['비교급', '이유를 나타내는 because 절', '요청하는 명령문'] }])
    expect(log[0].select).toContain('stage2:stage_status->stage2')
    expect(log[0].select).not.toMatch(/(^|[ ,])stage_status($|[ ,])/)   // 세트의 단계 출력 전체를 읽지 않는다
  })
  it('다른 세트가 없으면 빈 배열(대주제를 읽지 않는다), 읽기에 실패해도 빈 배열 — 생성을 막지 않는다', async () => {
    const log: { table: string; select: string; filters: [string, string, unknown][] }[] = []
    expect(await loadTaughtLanguageForms(fake({ item_sets: [tables.item_sets[0]], themes: tables.themes }, log) as never, { setId: 'self', level: '중' })).toEqual([])
    expect(log.map((l) => l.table)).toEqual(['item_sets'])
    expect(await loadTaughtLanguageForms(fake(tables, [], true) as never, { setId: 'self', level: '중' })).toEqual([])
  })
  it('읽기가 던져도(네트워크·클라이언트 오류) 빈 배열 — loadContext 와 세트 화면이 멈추지 않는다(독립 검토 2026-11-17)', async () => {
    const throwing = { from() { throw new Error('boom') } }
    expect(await loadTaughtLanguageForms(throwing as never, { setId: 'self', level: '중' })).toEqual([])
  })
  it('대주제 이름을 못 읽어도 형식의 이름은 넘긴다(프롬프트는 이름만 쓴다) — 대주제 이름은 빈 글자', async () => {
    const taught = await loadTaughtLanguageForms(fake({ item_sets: tables.item_sets, themes: [] }) as never, { setId: 'self', level: '중' })
    expect(taught).toEqual([{ theme: '', names: ['비교급', '이유를 나타내는 because 절', '요청하는 명령문'] }])
  })
})

const pctx = (subject: string, extra: Record<string, unknown> = {}) => ({ theme: { title: '우리 학교 도서관', level: '중', grade: 2, subjects: [subject] }, subject, standards: [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }], prior: {}, ...extra }) as never
const TAUGHT = [{ theme: '학교 축제, 일회용품을 줄이자', names: ['비교급', '이유를 나타내는 because 절', '요청하는 명령문'] }]

describe('2단계 프롬프트', () => {
  it('생성: 이미 가르치는 형식을 이름으로 알려 주고 후보로 내지 말라고 한다', () => {
    const t = buildPrompt(2, pctx('영어', { taughtLanguageForms: TAUGHT })).user
    expect(t).toContain('같은 학교급의 다른 영어 세트에서 이미 가르치는 형식(비교급, 이유를 나타내는 because 절, 요청하는 명령문)은 후보로 내지 않는다')
    expect(t).toContain('이름이 달라도 같은 문법이면 겹친 것으로 본다')
  })
  it('검토: 겹친 후보는 other 로 짚는다', () => {
    const r = buildReviewPrompt(2, pctx('영어', { taughtLanguageForms: TAUGHT }), {}).user
    expect(r).toContain('이미 가르치는 형식(비교급, 이유를 나타내는 because 절, 요청하는 명령문)과 겹치면 other(S-영-11)')
  })
  it('이미 가르치는 형식이 없으면 프롬프트는 글자 그대로다(빈 배열·칸 없음이 같다)', () => {
    expect(buildPrompt(2, pctx('영어', { taughtLanguageForms: [] })).user).toBe(buildPrompt(2, pctx('영어')).user)
    expect(buildReviewPrompt(2, pctx('영어', { taughtLanguageForms: [] }), {}).user).toBe(buildReviewPrompt(2, pctx('영어'), {}).user)
    expect(buildPrompt(2, pctx('영어')).user).not.toContain('후보로 내지 않는다')
  })
  it('다른 과목과 2단계 밖의 단계에는 붙지 않는다', () => {
    expect(buildPrompt(2, pctx('수학', { taughtLanguageForms: TAUGHT })).user).toBe(buildPrompt(2, pctx('수학')).user)
    for (const st of [3, 4, 5, 6, 7] as const) expect(buildPrompt(st, pctx('영어', { taughtLanguageForms: TAUGHT })).user, `${st}단계`).toBe(buildPrompt(st, pctx('영어')).user)
  })
})

describe('규칙 S-영-11', () => {
  it('겹치지 않는 후보를 말하고, 스펙 부록 행과 글자가 같다', () => {
    const rule = SUBJECT_RULES['영어'].find((r) => r.id === 'S-영-11')!
    // 규칙은 모든 영어 단계의 시스템 프롬프트에 실린다 — 목록이 주어질 때만 적용되게 말한다(목록이 없는 첫 세트가 보이지 않는 형식을 피하려 들지 않게, 독립 검토 2026-11-17)
    expect(rule.text).toContain('2단계 입력이 같은 학교급의 다른 영어 세트에서 이미 가르치는 형식을 알려 주면 그 형식은 후보로 내지 않는다(이름이 달라도 같은 문법이면 겹친 것으로 본다)')
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    expect(spec).toContain(`| S-영-11 | ${rule.text} |`)
  })
})

describe('「목표 문법 고르기」 화면', () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
  const copy = app.studio.wizard.languageForms
  it('다른 영어 세트에서 이미 가르치는 문법을 대주제 이름과 함께 한 줄에 하나씩 보여 준다', () => {
    const html = renderToStaticMarkup(createElement(LanguageFormPicker, { setId: 's', candidates: CANDS, selected: [], hasLater: false, taught: TAUGHT }))
    const t = text(html)
    expect(t).toContain(copy.taughtLabel)
    expect(t).toContain('학교 축제, 일회용품을 줄이자')
    expect(t).toContain(copy.taughtHint)
    expect((html.match(/data-taught-form/g) ?? []).length).toBe(3)   // 형식 하나에 한 줄
  })
  it('대주제 이름이 같거나 비어 있어도 묶음마다 그린다(키가 겹치지 않는다); 빈 이름은 이름 줄을 두지 않는다', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const taught = [{ theme: '같은 이름', names: ['비교급'] }, { theme: '같은 이름', names: ['수동태'] }, { theme: '', names: ['현재완료'] }]
    const html = renderToStaticMarkup(createElement(LanguageFormPicker, { setId: 's', candidates: CANDS, selected: [], hasLater: false, taught }))
    expect((html.match(/data-taught-form/g) ?? []).length).toBe(3)
    expect((html.match(/data-taught-theme/g) ?? []).length).toBe(2)
    expect(err.mock.calls.filter((c) => String(c[0]).includes('same key'))).toEqual([])
    err.mockRestore()
  })
  it('세트 화면이 같은 목록을 읽어 마법사 → 고르기 칸으로 넘긴다', () => {
    const page = readFileSync('app/admin/items/[themeId]/sets/[setId]/page.tsx', 'utf8')
    expect(page).toContain("itemSet.subject === '영어' ? await loadTaughtLanguageForms(supabase, { setId, level: itemSet.level }) : []")
    expect(page).toContain('taughtForms={taughtForms}')
    const wizard = readFileSync('app/admin/items/[themeId]/sets/[setId]/StageWizard.tsx', 'utf8')
    expect(wizard).toContain('taught={taughtForms}')
  })
  it('없으면 그 줄을 두지 않는다', () => {
    for (const props of [{ taught: [] }, {}]) {
      const t = text(renderToStaticMarkup(createElement(LanguageFormPicker, { setId: 's', candidates: CANDS, selected: [], hasLater: false, ...props })))
      expect(t).not.toContain(copy.taughtLabel)
    }
  })
  it('안내 문구는 ~니다 말투(화면 문구의 종결과 같게)', () => {
    expect(copy.taughtHint).toMatch(/니다\.$/)
  })
})
