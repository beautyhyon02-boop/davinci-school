// S-영-09(대표 2026-09-29 "영어 세트의 표는 영어로"): 영어 세트는 한국어 공동 자료를 학생에게 주지 않는다 — 필요한 공동 자료는
// 같은 수치의 영어판을 세트 자료(E, F…)로 만들고(english_version_of = 원본 공동 자료 ID), 차시·퀴즈·문항은 세트 자료만 가리킨다.
// 아무것도 막지 않는다([TS] 참고 메모만). 다른 과목은 지금처럼 공동 자료를 그대로 가리킨다(프롬프트 글자 그대로).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { buildPrompt, buildReviewPrompt, type Ctx } from '@/lib/studio/prompts/stages'
import { rulesFor } from '@/lib/studio/prompts/rules/index'
import { ENGLISH_RULES } from '@/lib/studio/prompts/rules/subjects/영어'
import { staticIssues, KOREAN_SHARED_CITED, TRANSLATION_MISSING } from '@/lib/studio/checks'
import { Material, Materials, STAGE_SCHEMAS } from '@/lib/studio/schemas'
import { mentionedMaterialIds, stageMaterialsView, usedMaterialIds } from '@/lib/studio/materials'
import { buildSnapshot, upgradeSnapshot } from '@/lib/studio/publish'
import { withMaterialDefaults } from '@/lib/studio/draft-defaults'
import { jsonSchemaText } from '@/lib/ai/claude'
import { PackageView } from '@/components/studio/PackageView'
import { MaterialsFull, MaterialsSection, ItemMaterials } from '@/components/studio/parts/MaterialsFull'
import { StageOutput } from '@/app/admin/items/[themeId]/sets/[setId]/StageOutput'
import { app } from '@/content/site'
import { englishGuide } from './fixtures/english-guide'
import { sharedB, sharedC, sharedMaterials, englishVersionE, noticeF, englishSetMaterials, englishLessons, englishUnitPlan, englishAssessment } from './fixtures/english-shared'

const standards = [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }, { code: '[9영02-06]', text: '친숙한 주제에 관해 자신의 의견을 주장한다.' }]
const theme = { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: null, subjects: ['수학', '영어'] }
const ctxOf = (subject: string, prior: Record<string, unknown>): Ctx => ({ theme, subject, standards, prior, themeMaterialIds: ['A', 'B', 'C', 'D'] })
const task = (u: string) => u.split('\n\n과제: ')[1]
const focus = (u: string) => u.split('\n\n검토 초점: ')[1].split('\n\n생성 결과:')[0]
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
const label = app.packageView.materials.englishVersionBadge

describe('규칙 S-영-09', () => {
  it('is a 대표 rule (P+S) in the 영어 rule block only, and the spec appendix row is the same sentence', () => {
    const r = ENGLISH_RULES.find((x) => x.id === 'S-영-09')!
    expect(r.nature).toBe('PS'); expect(r.tags).toEqual(['대표'])
    for (const s of ['학생에게 한국어 공동 자료를 주지 않는다', '영어판을 세트 자료로', 'english_version_of', '수치·행과 열의 순서·합계는 원본과 같게', '세트 자료만 가리킨다']) expect(r.text, s).toContain(s)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    expect(spec.split('\n').find((l) => l.startsWith('| S-영-09 |'))).toBe(`| S-영-09 | ${r.text} | [대표] |`)
    expect(rulesFor('영어')).toMatch(/^S-영-09 /m)
    for (const s of ['수학', '과학', '국어', '사회']) expect(rulesFor(s)).not.toContain('S-영-09')
  })
})

describe('스키마 Material.english_version_of (선택)', () => {
  it('accepts a shared material ID, null, or nothing; rejects anything that is not one capital letter', () => {
    expect(Material.parse(englishVersionE).english_version_of).toBe('B')
    expect(Material.parse({ ...englishVersionE, english_version_of: null }).english_version_of).toBeNull()
    expect('english_version_of' in Material.parse(noticeF)).toBe(false)
    expect(Material.safeParse({ ...englishVersionE, english_version_of: '공동 B' }).success).toBe(false)
    expect(Materials.safeParse({ materials: englishSetMaterials }).success).toBe(true)
  })
  it('old materials and the demo fixtures parse exactly as before (no field added)', () => {
    for (const f of ['stage4-generate', 'stage4-generate-과학']) {
      const raw = JSON.parse(readFileSync(`data/studio-fixtures/${f}.json`, 'utf8'))
      const parsed = Materials.parse(raw)
      expect(parsed).toEqual(raw)
      for (const m of parsed.materials) expect('english_version_of' in m).toBe(false)
    }
  })
  it('the stage-4 output schema still compiles for structured output and JSON mode, with the field optional', () => {
    const format = JSON.parse(JSON.stringify(zodOutputFormat(STAGE_SCHEMAS[4] as never))) as { schema: { $defs: Record<string, { properties?: Record<string, unknown>; required?: string[] }> } }
    const item = Object.values(format.schema.$defs).find((d) => d.properties && 'english_version_of' in d.properties)!
    expect(item.properties).toHaveProperty('source'); expect(item.required).toContain('id'); expect(item.required).not.toContain('english_version_of')
    expect(jsonSchemaText(STAGE_SCHEMAS[4] as never)).toContain('english_version_of')
    const required = JSON.parse(jsonSchemaText(STAGE_SCHEMAS[4] as never)).properties.materials.items.required as string[]
    expect(required).not.toContain('english_version_of')
  })
  it('withMaterialDefaults and the published snapshot keep the marker', () => {
    expect(withMaterialDefaults(englishVersionE).english_version_of).toBe('B')
    expect(withMaterialDefaults(sharedB).english_version_of).toBeUndefined()
  })
})

describe('프롬프트: 영어 세트 + 체크한 공동 자료 (3·4·5단계)', () => {
  const prior = { shared_materials: sharedMaterials, stage3: { unit_plan: englishUnitPlan, lessons: englishLessons }, stage4: { materials: englishSetMaterials } }
  const en = ctxOf('영어', prior)

  it('stage 3: lessons name set materials only; needed shared tables get an English version with IDs from E', () => {
    const t = task(buildPrompt(3, en).user)
    expect(t).toContain('영어 세트는 학생에게 한국어 자료를 주지 않는다(S-영-09)')
    expect(t).toContain('대주제 공유 자료 B, C는 원본(한국어, 학생에게 주지 않음)')
    expect(t).toContain('그 ID를 차시 materials_used에 적지 않고')
    expect(t).toContain('같은 수치의 영어판을 세트 자료로 만든다')
    expect(t).toContain('E부터 차례로 미리 정해 materials_used에 적고')
    expect(t).toContain('"자료 E(공동 자료 B의 영어판)"')
    expect(t).toContain('필요하지 않은 공유 자료는 영어판을 만들지 않는다')
    expect(t).not.toContain('대주제 공유 자료는 이 과목 활동에 필요한 것만(보통 0~2개) 고르고')
  })
  it('stage 4: same numbers, same row/column order, same totals; only the words are English; marker + footnote style; lettering from E', () => {
    const u = buildPrompt(4, en).user
    const t = task(u)
    for (const s of ['영어 세트는 학생에게 한국어 공유 자료를 주지 않는다(S-영-09)', 'english_version_of에 원본 공유 자료 ID를 적는다', '수치·행과 열의 순서·합계는 원본과 똑같이 두고 제목·열 이름·항목 이름·본문만 영어로 옮긴다',
      '종이컵 420 → "Paper cups 420"', '"* word 뜻" 각주', '필요하지 않은 공유 자료는 영어판을 만들지 않는다', '영어판이 아닌 자료의 english_version_of는 null', '공유 자료가 주어지면 그 수치를 그대로 쓴다']) expect(t, s).toContain(s)
    expect(t).toContain('대주제 공유 자료 ID: B, C — 원본(한국어, 학생에게 주지 않음)이다. 이 글자로는 자료를 만들지 말고, 영어판과 새로 만드는 세트 자료의 ID는 E부터 이어서 붙여라')
    expect(t).toContain('대주제 공유 자료 A, D는 이 세트에서 쓰지 않으므로 영어판도 만들지 않고')
    expect(t).not.toContain('이 자료들은 다시 만들지 말고')
    expect(t).not.toContain('공유 자료는 이 과목 문항이 인용할 것만 materials_used에 넣고 나머지는 쓰지 않는다.')
  })
  it('stage 5: items cite set materials only', () => {
    const t = task(buildPrompt(5, en).user)
    expect(t).toContain('영어 세트는 세트 자료만 넣는다(S-영-09) — 대주제 공유 자료(한국어 원본, 학생에게 주지 않음)의 ID는 넣지 않고 그 영어판인 세트 자료(4단계 english_version_of)를 쓴다, 2~4개')
    expect(t).not.toContain('공유 자료는 이 문항이 실제로 인용하는 것만 넣는다')
  })
  it('stages 3·4·5 (generate and review) present the shared materials as the Korean originals that students do not get', () => {
    const key = '"shared_materials — 원본(한국어, 학생에게 주지 않음) — 필요한 것은 영어판을 세트 자료로 만든다"'
    for (const stage of [3, 4, 5] as const) {
      for (const u of [buildPrompt(stage, en).user, buildReviewPrompt(stage, en, {}).user]) {
        expect(u, String(stage)).toContain(key)
        expect(u).not.toContain('"shared_materials"')
        expect(u).toContain('"종이컵"')   // 원본 표는 그대로 보여 준다(수치를 옮기려면 봐야 한다)
      }
    }
    // 6단계는 공동 자료를 받지 않는다 — 영어판은 세트 자료(stage4)로 들어가 번역된다
    const u6 = buildPrompt(6, en).user
    expect(u6).not.toContain('원본(한국어'); expect(u6).toContain('"english_version_of": "B"'); expect(u6).toContain('Paper cups')
  })
  it('review focus 3·4·5 add the S-영-09 checks', () => {
    expect(focus(buildReviewPrompt(3, en, {}).user)).toContain('영어 세트(S-영-09): 차시 materials_used·활동지·발문·퀴즈가 대주제 공유 자료(한국어 원본, 학생에게 주지 않음)의 ID를 직접 가리키면 other')
    const f4 = focus(buildReviewPrompt(4, en, {}).user)
    for (const s of ['영어 세트(S-영-09): 공유 자료의 영어판(english_version_of)이 원본과 수치·행과 열의 순서·합계가 같은지', '한국어가 남았으면 other', '어려운 낱말에 각주가 있는지', '한국어 원본을 그대로 세트 자료로 옮겨 적었으면 other']) expect(f4, s).toContain(s)
    expect(focus(buildReviewPrompt(5, en, { items: [] }).user)).toContain('영어 세트(S-영-09): 문항 materials_used가 대주제 공유 자료(한국어 원본)의 ID를 가리키면 other')
  })
  it('stage prompts stay under the 45k guard for an English set with shared B·C', () => {
    for (const stage of [3, 4, 5, 6] as const) {
      expect(buildPrompt(stage, en).user.length, `generate ${stage}`).toBeLessThan(45_000)
      expect(buildReviewPrompt(stage, en, {}).user.length, `review ${stage}`).toBeLessThan(45_000)
    }
  })
})

describe('프롬프트: 다른 과목·공동 자료 없는 영어 세트는 그대로', () => {
  const prior = { shared_materials: sharedMaterials }
  it('non-영어 subjects keep the shared-material sentences and the plain "shared_materials" key', () => {
    for (const subject of ['수학', '과학', '국어', '사회']) {
      const c = ctxOf(subject, prior)
      expect(task(buildPrompt(3, c).user)).toContain('대주제 공유 자료는 이 과목 활동에 필요한 것만(보통 0~2개) 고르고, 그 밖의 자료는 4단계에서 이 과목 전용으로 만들 자료 ID(공유 자료 다음 글자부터)를 미리 정해 적는다.')
      expect(task(buildPrompt(4, c).user)).toContain('공유 자료는 이 과목 문항이 인용할 것만 materials_used에 넣고 나머지는 쓰지 않는다.')
      expect(task(buildPrompt(4, c).user)).toContain('대주제 공유 자료 ID: B, C — 이 자료들은 다시 만들지 말고, 새로 만드는 세트 자료의 ID는 E부터 이어서 붙여라')
      expect(task(buildPrompt(5, c).user)).toContain('공유 자료는 이 문항이 실제로 인용하는 것만 넣는다 — 세트 자료와 합쳐 2~4개')
      for (const stage of [3, 4, 5] as const) {
        for (const u of [buildPrompt(stage, c).user, buildReviewPrompt(stage, c, {}).user]) {
          expect(u).toContain('"shared_materials"')
          for (const s of ['S-영-09', '영어판', '원본(한국어', 'english_version_of']) expect(u, `${subject} ${stage} ${s}`).not.toContain(s)
        }
      }
    }
  })
  it('the task and review-focus sentences do not depend on the subject: 수학 and 과학 get the same text', () => {
    for (const stage of [2, 3, 4, 5, 6, 7] as const) {
      // 과제 뒤의 prior 블록은 같고(같은 prior), 과제 앞의 성취수준·예시 블록만 과목에 따라 다르다
      expect(task(buildPrompt(stage, ctxOf('수학', prior)).user)).toBe(task(buildPrompt(stage, ctxOf('과학', prior)).user))
      expect(focus(buildReviewPrompt(stage, ctxOf('수학', prior), {}).user)).toBe(focus(buildReviewPrompt(stage, ctxOf('과학', prior), {}).user))
    }
  })
  it('an 영어 set with no shared material ticked gets the same task text as any other subject', () => {
    for (const stage of [3, 4, 5] as const) {
      expect(task(buildPrompt(stage, ctxOf('영어', {})).user)).toBe(task(buildPrompt(stage, ctxOf('수학', {})).user))
      expect(focus(buildReviewPrompt(stage, ctxOf('영어', {}), {}).user)).toBe(focus(buildReviewPrompt(stage, ctxOf('수학', {}), {}).user))
    }
  })
})

describe('[TS] 참고 메모 (S-영-09, 막지 않음 — kind other)', () => {
  const design = (lessons: unknown[]) => ({ unit_plan: englishUnitPlan, lessons })
  const notes = (stage: 3 | 4 | 5, output: unknown, prior: Record<string, unknown>, subject = '영어', sharedMaterialIds = ['B', 'C']) =>
    staticIssues(stage, output, { standards, prior, subject, sharedMaterialIds }).filter((i) => /S-영-09|영어판/.test(i.detail))

  it('stage 3: a lesson that uses set materials only has nothing to say; "자료 E(공동 자료 B의 영어판)" is not a mention of B', () => {
    expect(notes(3, design(englishLessons), { shared_materials: sharedMaterials })).toEqual([])
    expect(mentionedMaterialIds('자료 E(공동 자료 B의 영어판)')).toEqual(['E'])
    expect(mentionedMaterialIds('공동 자료 B·C의 영어판')).toEqual([])
    expect(mentionedMaterialIds('자료 B 영어판과 자료 F')).toEqual(['F'])
    expect(mentionedMaterialIds('자료 B의 수치')).toEqual(['B'])
  })
  it('stage 3: materials_used, a quiz, or a worksheet/script sentence pointing at a Korean shared ID is named with the lesson and the ID', () => {
    const l2 = { ...englishLessons[1], materials_used: ['B', 'C'] }
    const l3 = { ...englishLessons[2], formative_check: { quiz: englishLessons[2].formative_check.quiz.map((q, i) => (i === 1 ? { ...q, q: '자료 C에서 가장 많이 고른 품목을 영어로 쓰시오.' } : q)) },
      worksheet: { ...englishLessons[2].worksheet, tasks: englishLessons[2].worksheet.tasks.map((t, i) => (i === 0 ? { ...t, prompt: '자료 B의 종이컵 수를 영어 문장으로 쓰시오.' } : t)) } }
    const out = notes(3, design([englishLessons[0], l2, l3, englishLessons[3]]), { shared_materials: sharedMaterials })
    expect(out).toEqual([
      { kind: 'other', detail: `2차시: 한국어 공동 자료 B를 직접 가리킴(materials_used) — ${KOREAN_SHARED_CITED}` },
      { kind: 'other', detail: `2차시: 한국어 공동 자료 C를 직접 가리킴(materials_used) — ${KOREAN_SHARED_CITED}` },
      { kind: 'other', detail: `3차시 퀴즈 2: 한국어 공동 자료 C를 직접 가리킴 — ${KOREAN_SHARED_CITED}` },
      { kind: 'other', detail: `3차시 활동지·발문: 한국어 공동 자료 B를 직접 가리킴 — ${KOREAN_SHARED_CITED}` },
    ])
    expect(KOREAN_SHARED_CITED).toBe('영어 세트는 영어판(세트 자료)을 쓴다(S-영-09)')
  })
  it('stage 5: an item whose materials_used holds a Korean shared ID is named', () => {
    const prior = { shared_materials: sharedMaterials, stage3: design(englishLessons), stage4: { materials: englishSetMaterials } }
    expect(notes(5, englishAssessment, prior)).toEqual([])
    const bad = { ...englishAssessment, items: englishAssessment.items.map((it, i) => (i === 1 ? { ...it, materials_used: ['B', 'E'] } : it)) }
    expect(notes(5, bad, prior)).toEqual([{ kind: 'other', detail: `문항 2: 한국어 공동 자료 B를 직접 가리킴(materials_used) — ${KOREAN_SHARED_CITED}` }])
  })
  it('other subjects (and sets without a subject in the context) never get these notes', () => {
    const l2 = { ...englishLessons[1], materials_used: ['B', 'C'] }
    const out = design([englishLessons[0], l2, englishLessons[2], englishLessons[3]])
    for (const subject of ['수학', '과학', '국어']) expect(notes(3, out, { shared_materials: sharedMaterials }, subject)).toEqual([])
    expect(staticIssues(3, out, { standards, prior: {}, sharedMaterialIds: ['B', 'C'] }).filter((i) => /S-영-09/.test(i.detail))).toEqual([])
    const bad = { ...englishAssessment, items: englishAssessment.items.map((it) => ({ ...it, materials_used: ['B', 'E'] })) }
    expect(notes(5, bad, { shared_materials: sharedMaterials, stage4: { materials: englishSetMaterials } }, '수학')).toEqual([])
  })
  it('stage 4: an English version with the same numbers (1,065 = 1065) and the same table shape has nothing to say', () => {
    expect(notes(4, { materials: englishSetMaterials }, { shared_materials: sharedMaterials, stage3: design(englishLessons) })).toEqual([])
  })
  it('stage 4: numbers of the original that are missing from the English version are listed in one note', () => {
    const e = { ...englishVersionE, body: 'This table shows the number of disposable items by type.', table: { ...englishVersionE.table, rows: [['Paper cups', 380, 402], ['Plastic cups', 290, 405], ['Disposable plates', 210, 240], ['Total', 880, 1047]] } }
    expect(notes(4, { materials: [e, noticeF] }, { shared_materials: sharedMaterials })).toEqual([
      { kind: 'other', detail: '자료 E(공동 자료 B의 영어판): 원본 수치 420, 1,065이 빠짐 — 영어판은 원본과 수치가 같아야 한다(S-영-09)' },
    ])
  })
  it('stage 4: a different number of rows or columns, or a missing table, is noted', () => {
    const fewer = { ...englishVersionE, table: { ...englishVersionE.table, rows: englishVersionE.table.rows.filter((r) => r[0] !== 'Disposable plates') } }
    const out = notes(4, { materials: [fewer, noticeF] }, { shared_materials: sharedMaterials }).map((i) => i.detail)
    expect(out).toContain('자료 E(공동 자료 B의 영어판): 표의 행·열 수가 원본과 다름(원본 4행 3열, 영어판 3행 3열)')
    expect(out.some((d) => d.includes('원본 수치 210, 240이 빠짐'))).toBe(true)
    const noTable = { ...englishVersionE, kind: 'text', table: null, body: 'Paper cups 380 420, plastic cups 290 405, plates 210 240, total 880 1,065 (16 booths, 20 booths).' }
    expect(notes(4, { materials: [noTable, noticeF] }, { shared_materials: sharedMaterials }).map((i) => i.detail)).toEqual(['자료 E(공동 자료 B의 영어판): 원본은 표인데 영어판에 표가 없음'])
  })
  it('stage 4: an English version that points at a shared ID this set did not tick (or that does not exist) is noted', () => {
    const ofA = { ...englishVersionE, english_version_of: 'A' }
    expect(notes(4, { materials: [ofA, noticeF] }, { shared_materials: sharedMaterials })).toEqual([
      { kind: 'other', detail: '자료 E: 영어판의 원본으로 적은 공동 자료 A가 이 세트에서 체크한 공동 자료가 아님(english_version_of)' },
    ])
    expect(notes(4, { materials: [ofA, noticeF] }, {}).map((i) => i.detail)).toEqual(['자료 E: 영어판의 원본으로 적은 공동 자료 A가 이 세트에서 체크한 공동 자료가 아님(english_version_of)'])
  })
  it('stage 6: the English version is a set material, so its Korean translation is asked for like any English material (S-영-08)', () => {
    const prior = { stage3: design(englishLessons), stage4: { materials: englishSetMaterials } }
    const bare = { ...englishGuide(), translations: null }
    const missing = staticIssues(6, bare, { standards, prior, subject: '영어' }).map((i) => i.detail)
    expect(missing).toContain(`자료 E: ${TRANSLATION_MISSING}`)
    expect(missing).toContain(`자료 F: ${TRANSLATION_MISSING}`)
    const translated = { ...englishGuide(), translations: { exemplar_answers: [], materials: [
      { material_id: 'E', title_ko: '품목별 일회용품: 작년과 올해', body_ko: '작년(부스 16개)과 올해(부스 20개)의 품목별 일회용품 개수를 보여 주는 표.', table_ko: sharedB.table },
      { material_id: 'F', title_ko: '친환경 부스 안내', body_ko: '그린 축제에 오신 것을 환영합니다! 3번 부스에 자기 컵을 가져오면 음료마다 할인해 줍니다.', table_ko: null },
    ] } }
    expect(staticIssues(6, translated, { standards, prior, subject: '영어' }).filter((i) => /번역/.test(i.detail))).toEqual([])
  })
})

// 게시 판: 영어판은 세트 자료로 실리고, 아무도 가리키지 않는 한국어 공동 자료는 기존 "쓰는 자료만" 규칙으로 빠진다.
describe('게시 판(buildSnapshot) — 영어 세트, 공동 자료 B·C 체크', () => {
  const themeMaterials = [{ id: 'A', title: '부스 조사', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: '자작' }, sharedB, sharedC, { id: 'D', title: '설명글', kind: 'text', body: '설명', table: null, source: '자작' }]
  const build = (over: Record<string, unknown> = {}) => buildSnapshot({
    theme: { title: theme.title, level: '중', grade: null, intro: '', materials: themeMaterials as never },
    itemSet: {
      subject: '영어', level: '중', grade: null, reconstruction: '', reconstruction_detail: [], learning_goals: [], key_question: 'q?',
      unit_plan: englishUnitPlan as never, lessons: englishLessons as never, materials: englishSetMaterials as never, assessment: englishAssessment as never,
      teacher_guide: null, notice_plan: null, stage_status: {}, shared_material_ids: ['B', 'C'], ...over,
    },
    standards, version: 1,
  })

  it('carries E (with its marker) and F; the Korean originals B·C drop out because nothing references them', () => {
    const snap = build()
    expect(snap.materials.map((m) => m.id)).toEqual(['E', 'F'])
    expect(snap.materials[0].english_version_of).toBe('B')
    expect(snap.materials_omitted).toEqual(['B', 'C'])
    expect(snap.shared_material_ids).toEqual([])
    expect(JSON.stringify(snap.materials)).not.toMatch(/종이컵|품목/)
    expect(snap.lessons.flatMap((l) => l.materials_used).every((id) => ['E', 'F'].includes(id))).toBe(true)
    // 게시 판을 다시 읽어도 표시는 남는다
    expect(upgradeSnapshot(JSON.parse(JSON.stringify(snap))).materials[0].english_version_of).toBe('B')
  })
  it('the lesson note "자료 E(공동 자료 B의 영어판)" and a teacher guide with translations do not pull B back in', () => {
    expect(englishLessons[0].materials_needed).toEqual(['자료 E(공동 자료 B의 영어판)'])
    const guide = { ...englishGuide(), glossary: [{ term: '영어판', meaning: '자료 E는 공동 자료 B의 영어판이다.' }], merge_guide: [], per_lesson: [], grading_guide: { common_errors: [], review_tips: ['자료 E의 수치를 확인한다'], retry_guidance: '다시 쓴다' }, general: { preparation: ['자료 E 인쇄'], schedule: '2차시씩', purpose: '수치를 영어로 설명한다' } }
    const used = usedMaterialIds({ lessons: englishLessons, items: englishAssessment.items, texts: [guide] })
    expect([...used].sort()).toEqual(['E', 'F'])
  })
  it('a lesson that still points at B keeps B in the snapshot (nothing is removed that is referenced) — the [TS] note is what flags it', () => {
    const lessons = englishLessons.map((l) => (l.no === 2 ? { ...l, materials_used: ['B', 'E'] } : l))
    const snap = build({ lessons })
    expect(snap.materials.map((m) => m.id)).toEqual(['B', 'E', 'F'])
    expect(snap.shared_material_ids).toEqual(['B'])
  })
  it('the stage-4 tab view shows the set materials only when no lesson or item references the shared originals', () => {
    const used = usedMaterialIds({ lessons: englishLessons, items: englishAssessment.items })
    const view = stageMaterialsView(englishSetMaterials, sharedMaterials as never, used)
    expect(view.materials.map((m) => m.id)).toEqual(['E', 'F']); expect(view.sharedIds).toEqual([])
  })
})

describe('화면: 「공동 자료 B의 영어판」 표시는 교사용', () => {
  it('copy lives in content/site.ts', () => {
    expect(label('B')).toBe('공동 자료 B의 영어판')
  })
  it('제작소 4단계 탭 shows the label on the English version only', () => {
    const html = renderToStaticMarkup(createElement(StageOutput, { stage: 4, outputs: { 3: { lessons: englishLessons }, 4: { materials: englishSetMaterials } }, sharedMaterials: sharedMaterials as never }))
    expect(html.split(`>${label('B')}<`).length - 1).toBe(1)
    const cardE = html.slice(html.indexOf('data-material-id="E"'), html.indexOf('data-material-id="F"'))
    expect(cardE).toContain(`>${label('B')}<`); expect(cardE).toContain('Paper cups')
    expect(text(html)).not.toContain('종이컵')
  })
  it('원장 패키지 화면(admin·teacher) shows it in the 자료 card, wrapped so the 문제지 print omits it', () => {
    const snap = buildSnapshot({
      theme: { title: theme.title, level: '중', grade: null, intro: '', materials: sharedMaterials as never },
      itemSet: { subject: '영어', level: '중', grade: null, reconstruction: '', reconstruction_detail: [], learning_goals: [], key_question: 'q?', unit_plan: englishUnitPlan as never, lessons: englishLessons as never,
        materials: englishSetMaterials as never, assessment: englishAssessment as never, teacher_guide: null, notice_plan: null, stage_status: {}, shared_material_ids: ['B', 'C'] },
      standards, version: 1,
    })
    for (const mode of ['admin', 'teacher'] as const) {
      const html = renderToStaticMarkup(createElement(PackageView, { snapshot: snap, mode, showAnswers: true }))
      expect(html.split(`>${label('B')}<`).length - 1, mode).toBe(1)
      expect(html).toContain(`<span data-print="omit" data-english-version-of="B">`)
      expect(text(html)).not.toContain('종이컵')
    }
  })
  it('the parts default to no label (학생 화면이 쓰는 기본값): MaterialsFull·MaterialsSection without teacherLabels, and item material boxes', () => {
    const plain = [
      renderToStaticMarkup(createElement(MaterialsFull, { materials: englishSetMaterials })),
      renderToStaticMarkup(createElement(MaterialsSection, { materials: englishSetMaterials })),
      renderToStaticMarkup(createElement(ItemMaterials, { item: { materials_used: ['E', 'F'] }, materials: englishSetMaterials })),
    ]
    for (const html of plain) { expect(html).not.toContain('영어판'); expect(html).not.toContain('공동'); expect(html).toContain('Paper cups') }
    expect(renderToStaticMarkup(createElement(MaterialsFull, { materials: englishSetMaterials, teacherLabels: true }))).toContain(`>${label('B')}<`)
  })
  it('the student pages never ask for the teacher label', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []))
    const sources = files('app/student')
    expect(sources.length).toBeGreaterThan(3)
    for (const f of sources) for (const needle of ['teacherLabels', 'english_version_of', 'englishVersionBadge']) expect(readFileSync(f, 'utf8'), `${f} ↔ ${needle}`).not.toContain(needle)
  })
})
