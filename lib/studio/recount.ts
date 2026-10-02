// 도수 다시 세기(2026-10-02 수학 세트 실제 사례): 3단계가 공동 자료 A(부스 20곳의 개수 표)를 잘못 세어 활동지 기대 답에
// "20~30 2, … 60~70 2"(실제 3·1), "50 이상 부스는 6곳"(실제 5)이라고 적었다 — 원장이 그대로 채점하면 맞은 학생이 틀린다.
// 여기서는 자료 표의 값으로 "이상/미만" 구간의 개수를 다시 세어 글에 적힌 개수와 견준다. 순수 함수만 둔다(checks.ts 가 참고 메모로 싣는다 — 막지 않음).
// 확실할 때만 짚는다: 표가 값 열 하나짜리이고(번호·이름 열 하나까지), 문장이 그 자료를 가리키는 것이 분명하고, 적힌 것이 개수(곳·개·명·도수, 쉼표 목록의 맨수)일 때.
// 다루지 않는 것(건너뜀): 상대도수·비율("0.30", "405÷1350"), 값이 여러 열에 펼쳐진 표, 본문에만 적힌 원자료, "6으로 가장 크다"처럼 단위 없는 문장 속 수,
// 개수가 구간 앞에 오는 문장("6곳이 30 이상 40 미만"), "없다"(0개), 붙임표 범위("20-30").
import { mentionedMaterialIds } from './materials'

/** 다시 셀 수 있는 표: 값 열 하나(+ 번호·이름 열 하나까지), 합계 행을 뺀 행이 이 수 이상. */
export const RECOUNT_MIN_ROWS = 8
export type CountTable = { id: string; values: number[]; columns: string[] }
type MaterialLike = { id: string; table?: { columns?: string[] | null; rows?: (string | number)[][] | null } | null }

const TOTAL_LABEL = /^(합계|총계|총합|합|계|전체|total|sum)$/i
/** 칸 하나의 수: 숫자, 또는 "18"·"1,350"·"18개"처럼 수 뒤에 짧은 단위만 붙은 글자. "약 5 g"·"1~2회"는 수가 아니다. */
function cellNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const m = /^(-?\d+(?:\.\d+)?)\s*[^\d\s.,~-]{0,3}$/.exec(v.trim().replace(/(?<=\d),(?=\d{3}(?!\d))/g, ''))
  return m ? Number(m[1]) : null
}

/**
 * 자료가 "값 열 하나짜리 표"이면 그 값들을 돌려준다(아니면 null). 합계 행은 뺀다. 수 열 가운데 1(또는 0)부터 차례로 커지는 열은
 * 번호 열로 보고 값 열에서 뺀다(자료 A의 "부스" 1~20). 값 열이 정확히 하나이고 열이 둘 이하여야 한다.
 */
export function countTableOf(m: MaterialLike): CountTable | null {
  const columns = m.table?.columns; const all = m.table?.rows
  if (!Array.isArray(columns) || !Array.isArray(all)) return null
  const rows = all.filter((r) => Array.isArray(r) && !r.some((c) => typeof c === 'string' && TOTAL_LABEL.test(c.trim())))
  const width = columns.length
  if (rows.length < RECOUNT_MIN_ROWS || width < 1 || width > 2 || rows.some((r) => r.length !== width)) return null
  const cols = Array.from({ length: width }, (_, j) => rows.map((r) => cellNumber(r[j])))
  const numeric = cols.map((c, j) => (c.every((v) => v !== null) ? j : -1)).filter((j) => j >= 0)
  const isIndex = (j: number) => { const c = cols[j] as number[]; return (c[0] === 0 || c[0] === 1) && c.every((v, i) => v === c[0] + i) }
  let data = numeric.filter((j) => !isIndex(j))
  if (data.length === 0 && numeric.length === 1) data = numeric
  if (data.length !== 1) return null
  return { id: m.id, values: cols[data[0]] as number[], columns }
}

// ── 글에서 "구간 + 개수" 찾기 ─────────────────────────────────────────────────────────────────────────
/** 소수("0.15")와 천 단위 쉼표 수("1,350")를 같은 길이의 #로 가린다 — 그 안의 숫자를 정수로 읽지 않게(자리는 그대로). */
const mask = (s: string) => s.replace(/\d+\.\d+|\d{1,3}(?:,\d{3})+(?!\d)/g, (m) => '#'.repeat(m.length))
const UNIT = '(?:\\s?(?:개|곳|명|회|점|분|초|시간|세|살|권|kg|g|cm|mm|km|mL|m|L|℃|도|%|원|쪽|장))?'
const NUM = '(?<![\\d#.A-Za-z])(\\d+)'
/** 구간: ① "10 이상 20 미만"(단위·"이고" 허용) ② "20~30" ③ 한쪽만 "50 이상"·"20개 미만". */
const RANGE = new RegExp(
  `${NUM}${UNIT}\\s*(이상|초과)(?:이고|이며|이면서)?,?\\s*(\\d+)${UNIT}\\s*(미만|이하)` +
  `|${NUM}${UNIT}\\s*[~∼～]\\s*(\\d+)${UNIT}` +
  `|${NUM}${UNIT}\\s*(이상|초과|미만|이하)`, 'g')
/** "2~4차시"·"3~5문장"처럼 물결표가 구간이 아닌 것. */
const NOT_A_CLASS = /^\s*(차시|번|쪽|문장|자|글자|단어|줄|단계|학년|교시|월|일|문단|문항|칸|가지)/
/** 구간과 개수 사이에 이런 말이 끼면 그 개수는 이 구간의 도수가 아니다(비교·비율·부정·합산). */
const GAP_SKIP = /보다|상대|비율|퍼센트|%|평균|차이|아니|아닌|않|없|제외|빼|뺀|더하|합치|합계|총합/
/** 개수 바로 뒤가 이러면 인용·오답 설명·비교다("6곳이라고 했지만", "2곳으로 센", "6곳이 아니라", "3곳 더"). */
const AFTER_SKIP = /^\s*(?:이?라고|이?라는|(?:으)?로\s*(?:센|세었|셌|적|쓴|썼|답|잘못)|[이가]?\s*아니|씩|더\s|많|적[다게은어]|차이|늘|줄)/
/** 구간 앞(같은 문장)에 이런 말이 있으면 틀린 답을 설명하는 문장으로 보고 건너뛴다. */
const WRONG_ANSWER_TALK = /오답|틀린|틀리게|잘못|실수|착각/

type Lower = '이상' | '초과'; type Upper = '미만' | '이하'
/** 글에 적힌 "구간 + 개수" 하나. lo/hi 가 null 이면 한쪽이 열린 구간("50 이상"·"20 미만"). at = 구간이 시작하는 글자 자리. */
export type CountClaim = { lo: number | null; hi: number | null; lower: Lower; upper: Upper; tilde: boolean; n: number; at: number; form: 'bare' | 'unit' | 'freq'; gapNumbers: number[] }
type RangeHit = { lo: number | null; hi: number | null; lower: Lower; upper: Upper; tilde: boolean; start: number; end: number }

/** 가린 글(mask)에서 구간을 모두 찾는다. */
function findRanges(masked: string): RangeHit[] {
  const out: RangeHit[] = []
  for (const m of masked.matchAll(RANGE)) {
    const start = m.index; const end = start + m[0].length
    if (m[1] !== undefined) out.push({ lo: Number(m[1]), hi: Number(m[3]), lower: m[2] as Lower, upper: m[4] as Upper, tilde: false, start, end })
    else if (m[5] !== undefined) { if (!NOT_A_CLASS.test(masked.slice(end))) out.push({ lo: Number(m[5]), hi: Number(m[6]), lower: '이상', upper: '미만', tilde: true, start, end }) }
    else if (m[8] === '이상' || m[8] === '초과') out.push({ lo: Number(m[7]), hi: null, lower: m[8], upper: '미만', tilde: false, start, end })
    else out.push({ lo: null, hi: Number(m[7]), lower: '이상', upper: m[8] as Upper, tilde: false, start, end })
  }
  return out
}

/** 구간과 개수 사이 글이 깨끗한가 — 깨끗하면 그 사이에 늘어놓은 수(값을 하나하나 적은 것: "51, 52, 55로")를, 아니면 null. */
function gapNumbers(gap: string, unit: string | null): number[] | null {
  if (gap.length > 40 || GAP_SKIP.test(gap)) return null
  if (unit === '개' && gap.includes('계급')) return null   // "50 이상인 계급은 2개" — 계급을 센 것
  if (/[,#]/.test(gap.replace(/\d+(?:\s*[,·]\s*\d+)*/g, ''))) return null   // 값 나열 밖의 쉼표·가린 수 = 다른 절
  return (gap.match(/\d+/g) ?? []).map(Number)
}

const BARE = /^\s*(?:[:：=→]\s*)?(\d+)(?![\d#])\s*(?=[,;)·/]|$)/
const WITH_UNIT = /(?<![\d#.])(\d+)\s*(곳|개|명)(?![월국]|\s*(?:이상|미만|이하|초과|계급))/
const FREQ = /(?<!상대)(?<!누적)도수(?:는|가|:)?\s*(?:모두\s*)?(\d+)(?![\d#]|\s*%)/
/** 구간 뒤 글(다음 구간·문장 끝까지)에서 개수를 찾는다: 맨수("20~30 2,") → "…6곳/개/명" 또는 "도수 6" 가운데 먼저 나오는 것. */
function countAfter(rest: string): { n: number; form: CountClaim['form']; gapNumbers: number[]; end: number } | null {
  const bare = BARE.exec(rest)
  if (bare) return { n: Number(bare[1]), form: 'bare', gapNumbers: [], end: bare[0].length }
  const unit = WITH_UNIT.exec(rest); const freq = FREQ.exec(rest)
  const pick = unit && (!freq || unit.index <= freq.index) ? unit : freq
  if (!pick) return null
  const nums = gapNumbers(rest.slice(0, pick.index), pick === unit ? unit[2] : null)
  const end = pick.index + pick[0].length
  if (!nums || AFTER_SKIP.test(rest.slice(end))) return null
  return { n: Number(pick[1]), form: pick === unit ? 'unit' : 'freq', gapNumbers: nums, end }
}

const SUM = /^[\s,·/]*(?:도수의\s*)?(?:합계|총합|합|계)\s*(?:은|는|이|가|:|=)?\s*(\d+)(?![\d#])/
/**
 * 글 하나에서 "구간 + 개수"와, 구간 목록 끝의 합("…, 합 20")을 찾는다. 문장(. ! ? ; 줄바꿈) 단위로 보고, 개수는 그 구간 뒤 ~ 다음 구간 앞에서만 찾는다.
 * 단위 없는 맨수는 쉼표 목록("10이상20미만 1, 20~30 2, …")일 때만 — 글 전체에서 찾은 것이 둘 이상일 때만 남긴다.
 */
export function parseCountClaims(text: string): { claims: CountClaim[]; sum: { n: number; at: number } | null } {
  const masked = mask(text)
  const ranges = findRanges(masked)
  const claims: CountClaim[] = []
  let lastEnd = -1
  for (const [i, r] of ranges.entries()) {
    const sentenceStart = Math.max(...['.', '!', '?', ';', '\n'].map((c) => masked.lastIndexOf(c, r.start - 1))) + 1
    if (WRONG_ANSWER_TALK.test(masked.slice(sentenceStart, r.start))) continue
    const stop = /[.!?;\n]/.exec(masked.slice(r.end))
    const limit = Math.min(ranges[i + 1]?.start ?? masked.length, stop ? r.end + stop.index : masked.length)
    const found = countAfter(masked.slice(r.end, limit))
    if (!found) continue
    claims.push({ lo: r.lo, hi: r.hi, lower: r.lower, upper: r.upper, tilde: r.tilde, n: found.n, at: r.start, form: found.form, gapNumbers: found.gapNumbers })
    lastEnd = r.end + found.end
  }
  const kept = claims.length >= 2 ? claims : claims.filter((c) => c.form !== 'bare')
  const classes = kept.filter((c) => c.lo !== null && c.hi !== null)
  const sum = classes.length >= 2 && lastEnd >= 0 ? SUM.exec(masked.slice(lastEnd)) : null
  return { claims: kept, sum: sum ? { n: Number(sum[1]), at: lastEnd } : null }
}

/** 개수를 묻는 말: "몇 곳/개/명", "도수는?"·"도수를 구하시오"(상대도수·누적도수는 아니다). */
const ASKS_COUNT = /몇\s*(?:곳|개|명)|(?<!상대)(?<!누적)도수(?:는|를|가)?\s*(?:\?|얼마|몇|무엇|구하|쓰|적)/
const BARE_ANSWER = /^(\d+)\s*(?:곳|개|명)?$/
/**
 * 물음 + 답 한 쌍("30 이상 40 미만인 부스는 몇 곳인가?" → "6", "계급 30~40의 도수는?" → "6 / 6곳"). 물음에 구간이 정확히 하나이고
 * 그 뒤에서 개수를 물으며, 답 표기(" / "로 나눈 것)가 모두 같은 정수일 때만.
 */
export function pairClaim(question: string, answer: string): CountClaim | null {
  const masked = mask(question)
  const ranges = findRanges(masked)
  if (ranges.length !== 1) return null
  const r = ranges[0]
  // 구간과 같은 문장에서 물어야 한다(다음 문장의 "몇 개"는 다른 것을 묻는다)
  const after = masked.slice(r.end).split(/[.;\n]/)[0]
  const asks = ASKS_COUNT.exec(after)
  if (!asks || GAP_SKIP.test(after.slice(0, asks.index)) || /계급[은는이가]?\s*(?:모두\s*)?몇\s*개/.test(after)) return null
  const keys = answer.split('/').map((k) => BARE_ANSWER.exec(k.trim())?.[1])
  if (keys.length === 0 || keys.some((k) => k === undefined || k !== keys[0])) return null
  return { lo: r.lo, hi: r.hi, lower: r.lower, upper: r.upper, tilde: r.tilde, n: Number(keys[0]), at: r.start, form: 'unit', gapNumbers: [] }
}

// ── 표의 값으로 다시 세기 ─────────────────────────────────────────────────────────────────────────────
const within = (v: number, c: Pick<CountClaim, 'lo' | 'hi' | 'lower' | 'upper'>, closed = false) =>
  (c.lo === null || (c.lower === '초과' ? v > c.lo : v >= c.lo)) && (c.hi === null || (c.upper === '이하' || closed ? v <= c.hi : v < c.hi))
/** 구간 이름표: "20 이상 30 미만", "50 이상", "20 미만"(물결표 구간도 이상/미만으로 읽는다). */
export const rangeLabel = (c: Pick<CountClaim, 'lo' | 'hi' | 'lower' | 'upper'>) => [c.lo !== null ? `${c.lo} ${c.lower}` : '', c.hi !== null ? `${c.hi} ${c.upper}` : ''].filter(Boolean).join(' ')
/**
 * 이 주장을 이 표로 견줄 수 있으면 실제 개수를, 견줄 수 없으면(구간이 자료 범위 밖, 개수가 행 수보다 큼, 사이에 적은 값이 표에 없음) null.
 * 맞게 센 것이면 ok. 물결표 구간("20~30")은 끝값을 넣어 센 것([20, 30])과 같아도 맞은 것으로 본다(이상/미만인지 글만으로는 알 수 없다).
 */
export function recount(table: CountTable, c: CountClaim): { truth: number; ok: boolean } | null {
  const min = Math.min(...table.values); const max = Math.max(...table.values)
  if (c.n > table.values.length || c.gapNumbers.some((g) => !table.values.includes(g))) return null
  if (c.lo !== null && c.hi !== null) { if (!(c.lo < c.hi && c.hi > min && c.lo <= max)) return null }
  else { const bound = (c.lo ?? c.hi) as number; if (bound < min || bound > max) return null }
  const truth = table.values.filter((v) => within(v, c)).length
  const ok = c.n === truth || (c.tilde && c.n === table.values.filter((v) => within(v, c, true)).length)
  return { truth, ok }
}

// ── 차시 글 훑기 ─────────────────────────────────────────────────────────────────────────────────────
type RecountLesson = {
  no: number; kind?: string; materials_used?: string[] | null
  flow?: { main?: { activities?: string[] | null }[] | null } | null
  teacher_script?: { questions?: { prompt?: string; expected_answer?: string }[] | null } | null
  worksheet?: { tasks?: { no?: number; prompt?: string; expected?: string; flaw_check?: boolean }[] | null } | null
  formative_check?: { quiz?: { q?: string; answer?: string; explanation?: string }[] | null } | null
}
/** 수업 자료가 아니라 지어낸 사례를 말하는 글("어느 반 25명", "다른 학교", "도수의 총합이 36인") — 자료 이름이 없으면 견주지 않는다. */
const MADE_UP = /어느\s*(반|학교|학급|모둠|동아리|가게|마을|도시|회사)|다른\s*(반|학교|학급|모둠|자료|축제|표|집단)|가상|새로운\s*(자료|표)|도수의\s*총합이\s*[\d#]+/
/** 물음·과제 문장이 제 수치를 따로 준다(구간·"계급의 크기 10"·"3차시" 말고 숫자가 남는다) — 자료 이름이 없으면 견주지 않는다. */
const hasOwnNumbers = (context: string) => /[\d#]/.test(mask(context).replace(RANGE, ' ').replace(/계급의\s*크기[를는가은]?\s*\d+|\d+\s*차시/g, ' '))
const MENTION_AT = /자료\s*[A-Z](?![A-Za-z])/g
const josaEun = (label: string) => (/(이하|초과)$/.test(label) ? '는' : '은')
const josaRo = (n: number) => ([0, 3, 6].includes(n % 10) ? '으로' : '로')
/** 메모 문구(원장·관리자가 읽는다). */
export const recountNote = (where: string, id: string, label: string, truth: number, n: number) => `${where}: 자료 ${id}에서 ${label}${josaEun(label)} ${truth}개인데 ${n}${josaRo(n)} 적힘(다시 세어 보세요)`
export const recountSumNote = (where: string, id: string, rows: number, n: number) => `${where}: 자료 ${id}의 자료는 모두 ${rows}개인데 합이 ${n}${josaRo(n)} 적힘(다시 세어 보세요)`

/**
 * 교수 차시의 활동지 기대 답·발문 예상 답·퀴즈 정답과 해설·전개 문장에 적힌 "구간 + 개수"를 그 차시가 쓰는 표 자료로 다시 세어, 다른 것만 메모로 돌려준다.
 * 어느 자료인지: ① 그 글에서 주장 바로 앞의 "자료 X" ② 그 글의 "자료 X"(하나뿐일 때) ③ 과제·물음 문장의 "자료 X"(하나뿐일 때) ④ 이름이 없으면
 * 차시 materials_used 에 다시 셀 수 있는 표가 정확히 하나일 때 그 표 — 이때 지어낸 사례를 말하는 글·제 수치를 따로 준 물음은 건너뛰고, 차시가 아직
 * 만들지 않은 자료(4단계 전의 세트 자료 ID)도 쓰면 글에 그 표의 열 이름이 있거나 구간 목록이 표의 값 전체를 덮을 때만 견준다.
 * 결함 찾기(flaw_check) 과제의 과제 문장은 일부러 틀린 글이라 어디서도 읽지 않는다(기대 답은 읽는다). 단원 평가 차시는 보지 않는다.
 */
export function recountNotes(lessons: RecountLesson[], materials: MaterialLike[]): string[] {
  const known = new Set(materials.map((m) => m.id))
  const tables = new Map<string, CountTable>()
  for (const m of materials) { const t = countTableOf(m); if (t) tables.set(m.id, t); else tables.delete(m.id) }
  if (tables.size === 0) return []
  const notes: string[] = []
  const push = (note: string) => { if (!notes.includes(note)) notes.push(note) }
  const one = (ids: string[]) => { const u = [...new Set(ids)]; return u.length === 1 ? tables.get(u[0]) ?? null : null }

  for (const l of lessons) {
    if (l.kind === 'assessment') continue
    const used = l.materials_used ?? []
    const eligible = used.filter((id) => tables.has(id))
    const hasUnknown = used.some((id) => !known.has(id))
    const tableFor = (text: string, at: number, context: string, claims: CountClaim[]): CountTable | null => {
      const before = text.slice(0, at)
      let last = -1
      for (const m of before.matchAll(MENTION_AT)) last = m.index
      if (last >= 0) return one(mentionedMaterialIds(before.slice(last)))
      for (const src of [text, context]) { const ids = mentionedMaterialIds(src); if (ids.length) return one(ids) }
      if (eligible.length !== 1 || MADE_UP.test(mask(`${text} ${context}`)) || hasOwnNumbers(context)) return null
      const table = tables.get(eligible[0]) as CountTable
      if (!hasUnknown) return table
      const named = table.columns.map((c) => c.replace(/\(.*?\)/g, '').trim()).some((c) => c.length >= 2 && !/^\d/.test(c) && `${text} ${context}`.includes(c))
      const classes = claims.filter((c) => c.lo !== null && c.hi !== null)
      const covers = classes.length >= 3 && Math.min(...classes.map((c) => c.lo as number)) <= Math.min(...table.values) && Math.max(...classes.map((c) => c.hi as number)) > Math.max(...table.values)
      return named || covers ? table : null
    }
    const check = (where: string, text: string, context: string) => {
      if (!text) return
      const { claims, sum } = parseCountClaims(text)
      let lastTable: CountTable | null = null
      for (const c of claims) {
        const table = tableFor(text, c.at, context, claims)
        lastTable = table
        const r = table && recount(table, c)
        if (table && r && !r.ok) push(recountNote(where, table.id, rangeLabel(c), r.truth, c.n))
      }
      // 합: 구간 목록이 표의 값 전체를 덮을 때만 행 수와 견준다
      const classes = claims.filter((c) => c.lo !== null && c.hi !== null)
      if (sum && lastTable && Math.min(...classes.map((c) => c.lo as number)) <= Math.min(...lastTable.values) && Math.max(...classes.map((c) => c.hi as number)) > Math.max(...lastTable.values) && sum.n !== lastTable.values.length) {
        push(recountSumNote(where, lastTable.id, lastTable.values.length, sum.n))
      }
    }
    const checkPair = (where: string, question: string, answer: string) => {
      const c = pairClaim(question, answer)
      // 물음이 제 수치를 따로 주면(자료 이름 없이) tableFor 가 건너뛴다 — 물음 자체를 과제 문장으로도 넘긴다
      const table = c && tableFor(question, c.at, mentionedMaterialIds(question).length ? '' : question, [c])
      const r = c && table && recount(table, c)
      if (c && table && r && !r.ok) push(recountNote(where, table.id, rangeLabel(c), r.truth, c.n))
    }
    for (const [k, step] of (l.flow?.main ?? []).entries()) for (const a of step.activities ?? []) check(`${l.no}차시 전개 ${k + 1}단계`, a, '')
    for (const [k, q] of (l.teacher_script?.questions ?? []).entries()) {
      check(`${l.no}차시 발문 ${k + 1} 예상 답`, q.expected_answer ?? '', q.prompt ?? '')
      checkPair(`${l.no}차시 발문 ${k + 1} 예상 답`, q.prompt ?? '', q.expected_answer ?? '')
    }
    for (const [k, t] of (l.worksheet?.tasks ?? []).entries()) {
      const where = `${l.no}차시 활동지 ${t.no ?? k + 1} 기대 답`
      // 결함 찾기 과제 문장은 일부러 틀린 글 — 자료 이름을 찾는 데만 쓰고(지어낸 수치 판정에서는 뺀다) 물음 + 답 쌍으로는 읽지 않는다
      check(where, t.expected ?? '', t.flaw_check ? mentionedMaterialIds(t.prompt ?? '').map((id) => `자료 ${id}`).join(' ') : t.prompt ?? '')
      if (!t.flaw_check) checkPair(where, t.prompt ?? '', t.expected ?? '')
    }
    for (const [k, q] of (l.formative_check?.quiz ?? []).entries()) {
      checkPair(`${l.no}차시 퀴즈 ${k + 1} 정답`, q.q ?? '', q.answer ?? '')
      check(`${l.no}차시 퀴즈 ${k + 1} 해설`, q.explanation ?? '', q.q ?? '')
    }
  }
  return notes
}
