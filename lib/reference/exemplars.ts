import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type ExemplarRecord = {
  id: string; subject: string; school_level: '초' | '중' | '고'; grade: number | null; unit: string | null; standard_codes: string[]
  kind: '서술형' | '논술형' | '수행' | '서·논술형'; points: number | null; context: string | null; materials: { type: string; summary: string }[]
  stem: string; conditions: string[]; answer_format: string | null
  rubric: { type: string; criteria: { name: string; levels: { points: number | null; desc: string }[] }[]; notes?: string | null; min_competency?: string | null }
  exemplar_answers: { level: string; text: string }[]; feedback: string | null; cognitive: string[]; source: { file: string; pages: number[] }
  strand?: string; evaluation_elements?: string[]; requires_drawing?: boolean
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

export function selectExemplars(q: ExemplarQuery, n = 4, source: ExemplarRecord[] = loadExemplarBank()): ExemplarRecord[] {
  const folders = FOLDER_FOR[q.subject] ?? [q.subject]
  const bySubject = source.filter((r) => r.subject === subjectKey(q.subject) || folders.includes(r.subject))
  const rank = (list: ExemplarRecord[]) => [...list].sort((a, b) => scoreExemplar(b, q) - scoreExemplar(a, q) || a.id.localeCompare(b.id))
  let pool = bySubject.filter((r) => r.school_level === q.school_level)
  if (pool.length < 3) pool = bySubject
  let ranked = rank(pool.filter((r) => sameKind(r.kind, q.kind)))
  if (ranked.length < 3) ranked = rank(pool)
  return ranked.slice(0, n)
}

const cut = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n)
const CARD_MAX = 900
export function exemplarCard(r: ExemplarRecord): string {
  const pages = r.source.pages.length ? ` p.${r.source.pages[0]}${r.source.pages.length > 1 ? `-${r.source.pages[r.source.pages.length - 1]}` : ''}` : ''
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
