import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type ExemplarRecord = {
  id: string; subject: string; school_level: '초' | '중' | '고'; grade: number | null; unit: string | null; standard_codes: string[]
  kind: '서술형' | '논술형' | '수행' | '서·논술형'; points: number | null; context: string | null; materials: { type: string; summary: string }[]
  stem: string; conditions: string[]; answer_format: string | null
  rubric: { type: string; criteria: { name: string; levels: { points: number | null; desc: string }[] }[]; notes?: string | null; min_competency?: string | null }
  exemplar_answers: { level: string; text: string }[]; feedback: string | null; cognitive: string[]; source: { file: string; pages: number[] }
  strand?: string; evaluation_elements?: string[]; requires_drawing?: boolean
  /** 일부 은행(경기논술형 등)에만 있다 — 총체적 채점 기준(모양이 은행마다 다르다: 배열·객체·문자열·null). */
  holistic?: unknown
}
export type ExemplarQuery = { subject: string; school_level: '초' | '중' | '고'; grade?: number | null; codes: string[]; unit: string | null; kind: '서술형' | '논술형' | '수행' | 'any'; answerMode?: 'screen' | 'paper' }

const ROOT = ['data', 'reference', 'exemplars']
const FOLDER_FOR: Record<string, string[]> = { '국어': ['국어'], '수학': ['수학'], '영어': ['영어'], '과학': ['과학', '2025'], '사회': ['사회', '2025'], '한국사': ['역사', '2025'], '세계사': ['역사', '2025'], '역사': ['역사', '2025'] }

let bank: ExemplarRecord[] | null = null
export function loadExemplarBank(): ExemplarRecord[] {
  if (bank) return bank
  const out: ExemplarRecord[] = []
  const root = join(process.cwd(), ...ROOT)
  for (const folder of readdirSync(root)) {
    const dir = join(root, folder)
    if (!statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_') || f.startsWith('README')) continue
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown
      const recs = Array.isArray(data) ? data : (Object.values(data as Record<string, unknown>).find((v) => Array.isArray(v)) as unknown[] | undefined) ?? []
      for (const r of recs as ExemplarRecord[]) if (r && typeof r.stem === 'string') out.push({ ...r, subject: r.subject === '역사' || r.subject === '한국사' ? '역사' : r.subject })
    }
  }
  bank = out
  return out
}

const prefix = (code: string) => code.replace(/^\[(\d+[가-힣]+(?:\([가-힣]+\))?\d{2}).*$/u, '$1')
const sameKind = (r: ExemplarRecord['kind'], k: ExemplarQuery['kind']) => k === 'any' || r === k || (k === '논술형' && r === '서·논술형')

export function scoreExemplar(r: ExemplarRecord, q: ExemplarQuery): number {
  let s = 0
  if (r.standard_codes.some((c) => q.codes.includes(c))) s += 4
  if (r.standard_codes.some((c) => q.codes.some((qc) => prefix(qc) === prefix(c)))) s += 3
  if (q.unit && r.unit && r.unit === q.unit) s += 2
  // 학년을 정하지 않은 대주제(grade null/없음, 대표 2026-09-26)는 학년 가점 없이 코드·단원·종류로만 고른다
  if (q.grade != null && r.grade === q.grade) s += 2
  if (sameKind(r.kind, q.kind)) s += 3
  if (r.rubric?.criteria?.length) s += 1
  if (r.exemplar_answers?.length) s += 1
  if (r.id.startsWith('k25-')) s += 1
  if (r.requires_drawing && q.answerMode === 'screen') s -= 2
  return s
}

const subjectKey = (subject: string) => (subject === '한국사' || subject === '세계사' ? '역사' : subject)

/** 과목(과 그 과목을 담는 폴더 이름)이 같은 레코드. 새 하위 폴더(예: 경기논술형)의 레코드도 subject 로 여기에 들어온다. */
function subjectPool(q: Pick<ExemplarQuery, 'subject'>, source: ExemplarRecord[]): ExemplarRecord[] {
  const folders = FOLDER_FOR[q.subject] ?? [q.subject]
  return source.filter((r) => r.subject === subjectKey(q.subject) || folders.includes(r.subject))
}
const rankBy = (q: ExemplarQuery) => (list: ExemplarRecord[]) => [...list].sort((a, b) => scoreExemplar(b, q) - scoreExemplar(a, q) || a.id.localeCompare(b.id))

export function selectExemplars(q: ExemplarQuery, n = 4, source: ExemplarRecord[] = loadExemplarBank()): ExemplarRecord[] {
  const bySubject = subjectPool(q, source)
  const rank = rankBy(q)
  let pool = bySubject.filter((r) => r.school_level === q.school_level)
  if (pool.length < 3) pool = bySubject
  let ranked = rank(pool.filter((r) => sameKind(r.kind, q.kind)))
  if (ranked.length < 3) ranked = rank(pool)
  return ranked.slice(0, n)
}

const cut = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n)
const CARD_MAX = 900
const pagesOf = (r: ExemplarRecord) => (r.source.pages.length ? ` p.${r.source.pages[0]}${r.source.pages.length > 1 ? `-${r.source.pages[r.source.pages.length - 1]}` : ''}` : '')
export function exemplarCard(r: ExemplarRecord): string {
  const pages = pagesOf(r)
  const crit = r.rubric?.criteria?.map((c) => `${c.name}(${c.levels.map((l) => l.points ?? '-').join('/')})`).join(', ') ?? ''
  // The source line (출처) must always survive intact — 공공누리 attribution is mandatory (design §1.2).
  // So it is computed first and reserved space is carved out of the 900-char budget before the
  // rest of the card is truncated, instead of truncating the whole joined string from the end.
  const source = `출처: ${r.source.file}${pages}`
  const lines = [
    `[예시 ${r.id}] ${r.subject} ${r.school_level}${r.grade ?? ''} ${r.kind} ${r.points ?? '-'}점 · ${cut(r.unit, 30)} · ${r.standard_codes.join(' ')}`,
    `자료: ${cut(r.context, 120)}`,
    `문두: ${cut(r.stem, 220)}`,
    r.conditions.length ? `조건: ${cut(r.conditions.join(' / '), 200)}` : '',
    crit ? `채점 요소: ${cut(crit, 150)}` : '',
    r.rubric?.notes ? `유의점: ${cut(r.rubric.notes, 100)}` : '',
    r.exemplar_answers[0] ? `예시답안(${r.exemplar_answers[0].level}): ${cut(r.exemplar_answers[0].text, 200)}` : '',
  ].filter(Boolean)
  const body = lines.join('\n')
  const budget = CARD_MAX - source.length - 1 // -1 for the newline joining body and source
  const fitted = body.length <= budget ? body : budget > 0 ? `${body.slice(0, Math.max(0, budget - 1))}…` : ''
  return fitted ? `${fitted}\n${source}` : source
}

const BLOCK_HEAD = '참고 예시(공개 자료, 형식·조건·채점표의 패턴만 참고하고 문장·수치를 그대로 옮기지 않는다. 참고한 id를 references에 남긴다):'

export function exemplarsBlock(q: ExemplarQuery, n = 4, source?: ExemplarRecord[]): string {
  const picked = selectExemplars(q, n, source)
  if (!picked.length) return ''
  return [BLOCK_HEAD, ...picked.map(exemplarCard)].join('\n')
}

/**
 * 종류별 개수를 정해 뽑는 참고 예시 블록(5단계: 서술형 2 + 논술형 3 — 평가원·교육청 공개 예시 문항 수준·형식을 맞춘다).
 * 종류마다 selectExemplars 를 따로 부르고(그 종류가 모자라면 selectExemplars 가 다른 종류로 채운다) 같은 id 는 한 번만 싣는다.
 */
export function exemplarsBlockMixed(q: Omit<ExemplarQuery, 'kind'>, counts: Partial<Record<'서술형' | '논술형', number>>, source?: ExemplarRecord[]): string {
  const seen = new Set<string>()
  const picked: ExemplarRecord[] = []
  for (const [kind, n] of Object.entries(counts) as ['서술형' | '논술형', number][]) {
    let added = 0
    for (const r of selectExemplars({ ...q, kind }, n + seen.size, source)) {
      if (added >= n) break
      if (seen.has(r.id)) continue
      seen.add(r.id); picked.push(r); added++
    }
  }
  if (!picked.length) return ''
  return [BLOCK_HEAD, ...picked.map(exemplarCard)].join('\n')
}

// ── 예시 문항 통째(5단계, 대표 2026-09-26) ─────────────────────────────────────────────
// 카드(≤900자)는 채점 기준표·예시답안이 잘려 모델이 자료집 문항의 "모양과 밀도"를 보지 못한다. 그래서 5단계에는
// 서술형 1 + 논술형 1건을 통째로(채점 기준표의 모든 요소 × 모든 척도, 유의점, 예시답안 전부, 출처) 싣는다.
// 길이 상한 FULL_MAX 는 자료(맥락·자료 요약) 글을 먼저 줄여 맞춘다 — 채점 기준표·예시답안·출처는 자르지 않는다.
export const FULL_MAX = 3500
/** 통째 예시로 고를 때 자료 칸에 최소한 남길 글자 수(이보다 작게 남으면 그 레코드는 통째 예시로 고르지 않는다). */
const FULL_MIN_MATERIAL = 150

const flat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
/** 문두는 소문항 줄바꿈을 살린다(줄마다 공백만 정리). */
const lines = (s: string | null | undefined) => (s ?? '').split(/\r?\n/).map(flat).filter(Boolean).join('\n')
const headLine = (r: ExemplarRecord) => `[예시 ${r.id}] ${r.subject} ${r.school_level}${r.grade ?? ''} ${r.kind} ${r.points ?? '-'}점 · ${flat(r.unit)} · ${r.standard_codes.join(' ')}`

function holisticText(h: unknown): string {
  if (h == null) return ''
  if (typeof h === 'string') return flat(h)
  if (Array.isArray(h)) {
    return h.map((x) => {
      if (typeof x === 'string') return flat(x)
      const o = (x ?? {}) as Record<string, unknown>
      const label = [o.level, o.grade, o.name].find((v) => typeof v === 'string' || typeof v === 'number')
      const pts = typeof o.points === 'number' ? `(${o.points}점)` : ''
      const desc = [o.desc, o.description, o.text].find((v) => typeof v === 'string') as string | undefined
      return `${label ?? ''}${pts} ${flat(desc)}`.trim()
    }).filter(Boolean).join(' / ')
  }
  if (typeof h === 'object') return Object.entries(h as Record<string, unknown>).map(([k, v]) => `${k}: ${typeof v === 'string' ? flat(v) : JSON.stringify(v)}`).join(' / ')
  return ''
}

/** 자료·맥락 칸(통째 예시에서 길이가 넘치면 가장 먼저 줄인다). */
function materialSection(r: ExemplarRecord): string {
  const mats = (r.materials ?? []).map((m) => {
    const x = m as { type?: string; summary?: string; label?: string; data?: string | null; text?: string | null }
    const body = [flat(x.summary), flat(x.data), flat(x.text)].filter(Boolean).join(' — ')
    return `  - ${x.label ? `${x.label} ` : ''}${x.type ?? '자료'}: ${body}`
  })
  const context = flat(typeof r.context === 'string' ? r.context : null)
  if (!context && !mats.length) return ''
  return [`자료·맥락: ${context || '(아래 자료)'}`, ...mats].join('\n')
}

/** 자료를 뺀 나머지(머리·평가 요소 / 문두·조건·채점 기준표·유의점·예시답안·출처) — 이것은 자르지 않는다. */
function fixedSections(r: ExemplarRecord): { head: string[]; tail: string[] } {
  const head = [headLine(r)]
  if (r.evaluation_elements?.length) head.push(`평가 요소: ${r.evaluation_elements.map(flat).join(' · ')}`)
  const tail: string[] = [`문두: ${lines(r.stem)}`]
  if (r.conditions.length) tail.push(['조건:', ...r.conditions.map((c, i) => `  (${i + 1}) ${flat(c)}`)].join('\n'))
  if (r.answer_format) tail.push(`답안 형식: ${flat(r.answer_format)}`)
  const crit = r.rubric?.criteria ?? []
  if (crit.length) {
    const rows = crit.map((c) => {
      // 척도는 0점부터 오름차순으로 보인다(이 세트 규칙과 같은 방향 — 원문 순서만 바꾸고 내용은 그대로)
      const lv = [...c.levels].sort((a, b) => (a.points ?? Infinity) - (b.points ?? Infinity))
      const max = Math.max(0, ...lv.map((l) => l.points ?? 0))
      return `  · ${flat(c.name)} (만점 ${max}): ${lv.map((l) => `${l.points ?? '-'}점 ${flat(typeof l.desc === 'string' ? l.desc : '')}`).join(' | ')}`
    })
    tail.push([`채점 기준표(${flat(r.rubric.type) || '분석적'}; 요소 × 척도 — 점수와 수행 특성):`, ...rows].join('\n'))
  }
  const holistic = holisticText(r.holistic)
  if (holistic) tail.push(`총체적 채점 기준: ${holistic}`)
  if (r.rubric?.min_competency) tail.push(`최소 성취 수준: ${flat(r.rubric.min_competency)}`)
  const notes = [r.rubric?.notes, (r.rubric as { type_note?: string | null } | undefined)?.type_note].map(flat).filter(Boolean)
  if (notes.length) tail.push(`채점 시 유의점: ${notes.join(' / ')}`)
  if (r.exemplar_answers.length) tail.push(['예시답안:', ...r.exemplar_answers.map((a) => `  (${flat(a.level)}) ${flat(a.text)}`)].join('\n'))
  tail.push(`출처: ${r.source.file}${pagesOf(r)}`)
  return { head, tail }
}

const fixedLength = (r: ExemplarRecord) => { const { head, tail } = fixedSections(r); return [...head, ...tail].join('\n').length }

/**
 * 레코드 한 건을 통째로 그린다(머리 → 평가 요소 → 자료·맥락 → 문두 → 조건 → 채점 기준표(요소마다 모든 척도) → 총체적 →
 * 유의점 → 예시답안 전부 → 출처). FULL_MAX(3,500자)를 넘으면 자료·맥락 칸만 줄인다 — 채점 기준표·예시답안·출처는 그대로다
 * (그것들만으로 상한을 넘는 레코드는 상한을 넘긴 채 돌려준다; 5단계 선택은 그런 레코드를 통째 예시로 고르지 않는다).
 */
export function exemplarFull(r: ExemplarRecord): string {
  const { head, tail } = fixedSections(r)
  const mat = materialSection(r)
  const whole = [...head, ...(mat ? [mat] : []), ...tail].join('\n')
  if (whole.length <= FULL_MAX || !mat) return whole
  const budget = FULL_MAX - [...head, ...tail].join('\n').length - 1 // -1: 자료 칸을 잇는 줄바꿈
  const cutMat = budget >= 40 ? `${mat.slice(0, budget - 1)}…` : '자료·맥락: (길이 때문에 생략 — 출처 원문 참고)'
  return [...head, cutMat, ...tail].join('\n')
}

const FULL_KINDS = ['서술형', '논술형'] as const
/** 통째 예시 후보: 채점 기준표·예시답안이 있고, 자료를 줄이면 상한 안에 든다. */
const usableFull = (r: ExemplarRecord) => (r.rubric?.criteria?.length ?? 0) > 0 && r.exemplar_answers.length > 0 && fixedLength(r) <= FULL_MAX - FULL_MIN_MATERIAL
const FULL_HEAD = '예시 문항 전체(형식·밀도 기준 — 자료집 문항 한 건씩을 통째로 실었다. 문두 길이, 조건 말투, 척도 단계마다의 수행 특성 서술, 예시답안 길이를 본다):'
const CARDS_HEAD = '짧은 예시 카드(패턴 참고):'

/**
 * 5단계 참고 예시 블록: 종류(서술형·논술형)마다 통째 예시 opts.full 건 + 짧은 카드 opts.cards 건(서술형·논술형 번갈아).
 * 통째 예시는 usableFull 레코드만, 가까운 순서 = 과목 → 학교급 → 성취기준·단원(scoreExemplar)으로 고른다: 이 학교급의 같은 종류 →
 * 다른 학교급의 같은 종류 → 이 학교급의 다른 종류 → 나머지. 같은 id 는 한 번만 싣는다. 선택은 결정적이다(점수 → id).
 * 은행 폴더는 loadExemplarBank 가 모두 읽으므로 새 하위 폴더(예: 경기논술형)도 자동으로 후보가 된다.
 */
export function exemplarsBlockFull(q: Omit<ExemplarQuery, 'kind'>, opts: { full: number; cards: number } = { full: 1, cards: 2 }, source: ExemplarRecord[] = loadExemplarBank()): string {
  const seen = new Set<string>()
  const fulls: ExemplarRecord[] = []
  const pool = subjectPool(q, source).filter(usableFull)
  for (const kind of FULL_KINDS) {
    const rank = rankBy({ ...q, kind })
    const level = pool.filter((r) => r.school_level === q.school_level)
    const tiers = [level.filter((r) => sameKind(r.kind, kind)), pool.filter((r) => sameKind(r.kind, kind)), level, pool]
    let added = 0
    for (const tier of tiers) {
      for (const r of rank(tier)) {
        if (added >= opts.full) break
        if (seen.has(r.id)) continue
        seen.add(r.id); fulls.push(r); added++
      }
      if (added >= opts.full) break
    }
  }
  const cards: ExemplarRecord[] = []
  for (let i = 0; cards.length < opts.cards && i < opts.cards * FULL_KINDS.length; i++) {
    const kind = FULL_KINDS[i % FULL_KINDS.length]
    const next = selectExemplars({ ...q, kind }, source.length, source).find((r) => !seen.has(r.id))
    if (next) { seen.add(next.id); cards.push(next) }
  }
  if (!fulls.length && !cards.length) return ''
  return [
    BLOCK_HEAD,
    ...(fulls.length ? [FULL_HEAD, ...fulls.map((r) => `${exemplarFull(r)}\n`)] : []),
    ...(cards.length ? [CARDS_HEAD, ...cards.map(exemplarCard)] : []),
  ].join('\n').trimEnd()
}
