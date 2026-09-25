/**
 * 세트 평가 구조 — 한 곳에서만 정한다(스키마·[TS] 검사·프롬프트·채점·fixture 가 모두 여기서 읽는다).
 *
 * 대표님 결정(2026-09-26): 매 차시 끝 = 이해 점검 퀴즈(그대로), 세트(챕터) 끝 = 서술형 1문항 + 논술형 1문항, 정확히 2문항.
 * 두 문항 모두 분석적 루브릭(요소별) + 총체적 루브릭(상/중/하)을 갖춘다(C-15). 조건은 논술형에만 2~4개(C-32).
 *
 * 배점은 본사 가정이다(대표님이 바꿀 수 있음): 서술형 6점(요소 2~3개, max 합 6) + 논술형 16점(4요소 × 4) = 22점.
 * 총점이 22점이라 7등급표(21~22 … 0~4, level-map.ts GRADE_TABLE_22)와 level_ref 대응이 그대로 맞는다.
 * 배점을 바꾸려면 SET_ITEMS 의 숫자만 고친다 — 총점이 22가 아니게 되면 등급표도 함께 고쳐야 한다(tests/assessment-structure.test.ts 가 잡는다).
 */
export const SET_ITEMS = { 서술형: { count: 1, points: 6 }, 논술형: { count: 1, points: 16 } } as const
export type ItemKind = keyof typeof SET_ITEMS
/** 문항 순서(= 문항 번호 1, 2). 둘 다 마지막 교수 차시 뒤 단원 평가 차시에서 서술형 → 논술형 순으로 본다(L-09). */
export const SET_ORDER = ['서술형', '논술형'] as const satisfies readonly ItemKind[]

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
export const SET_ITEM_COUNT = sum(SET_ORDER.map((k) => SET_ITEMS[k].count))
export const SET_TOTAL = sum(SET_ORDER.map((k) => SET_ITEMS[k].count * SET_ITEMS[k].points))
export const SHORT_POINTS = SET_ITEMS.서술형.points
export const ESSAY_POINTS = SET_ITEMS.논술형.points
/**
 * 서술형 점수 합(세트 안 서술형 전부). 논술형 예시답안의 assumed_short_points(그 예시가 전제하는 서술형 점수, 0..이 값)의 상한이자
 * 값이 비었을 때의 기본값 — 옛 구조(서술형 3점 × 2)도 합이 6이라 같은 범위를 쓴다.
 */
export const SHORT_TOTAL = SET_ITEMS.서술형.count * SET_ITEMS.서술형.points
/** 채점 요소 하나의 최댓값 상한(스키마 Criterion.max). 서술형 6점은 요소가 2개 이상이어야 채워진다. */
export const CRITERION_MAX = 4
/** 서술형 채점 요소 수(max 합 = 서술형 배점, 요소마다 max ≤ CRITERION_MAX). */
export const SHORT_CRITERIA = { min: Math.max(1, Math.ceil(SHORT_POINTS / CRITERION_MAX)), max: 3 } as const
/** 논술형 채점표: 정확히 4요소 × 0~4점(대표님 확정). */
export const ESSAY_CRITERIA = { count: 4, max: 4 } as const

/**
 * 2026-09-26 이전에 게시된 판(v1 판과 그 뒤 v2 초기 판): 서술형 2 × 3점 + 논술형 16점 = 22점. 읽기 전용이다 —
 * 학생 답안·채점이 문항 번호(1~3)와 3점 만점으로 이미 묶여 있으므로 판을 고쳐 쓰지 않고 그대로 보여 주고 채점한다.
 * 새로 만드는 세트(5단계 생성·검토)는 언제나 SET_ITEMS 구조다.
 */
export const LEGACY_SET_ITEMS = { 서술형: { count: 2, points: 3 }, 논술형: { count: 1, points: 16 } } as const
export const LEGACY_ITEM_COUNT = LEGACY_SET_ITEMS.서술형.count + LEGACY_SET_ITEMS.논술형.count

export type Structure = 'current' | 'legacy'
type KindPoints = { kind: string; points: number }

const expand = (spec: Record<ItemKind, { count: number; points: number }>) => SET_ORDER.flatMap((k) => Array.from({ length: spec[k].count }, () => `${k}:${spec[k].points}`))
const CURRENT_SHAPE = expand(SET_ITEMS).join(',')
const LEGACY_SHAPE = expand(LEGACY_SET_ITEMS).join(',')

/** 문항 목록이 지금 구조인지, 옛 구조인지, 둘 다 아닌지(null). 종류·배점·순서를 모두 본다. */
export function structureOf(items: KindPoints[]): Structure | null {
  const shape = items.map((i) => `${i.kind}:${i.points}`).join(',')
  if (shape === CURRENT_SHAPE) return 'current'
  if (shape === LEGACY_SHAPE) return 'legacy'
  return null
}

/** 지금 구조(서술형 1 → 논술형 1, 6점 + 16점)에서 벗어난 점. 빈 배열이면 맞다. zod(schemas.ts)와 [TS] 문구가 같다. */
export function structureIssues(items: KindPoints[]): string[] {
  const out: string[] = []
  if (items.length !== SET_ITEM_COUNT) out.push(`문항 ${SET_ITEM_COUNT}개(${SET_ORDER.map((k) => `${k} ${SET_ITEMS[k].count}`).join(' + ')})여야 함 — 지금 ${items.length}개`)
  else if (items.map((i) => i.kind).join(',') !== SET_ORDER.join(',')) out.push(`문항 순서는 ${SET_ORDER.join(' → ')}`)
  for (const k of SET_ORDER) {
    const want = SET_ITEMS[k].points
    if (items.some((i) => i.kind === k && i.points !== want)) out.push(`${k}은 ${want}점`)
  }
  return out
}

/** 차시 평가 라벨이 서술형인지(옛 판의 '서술형1'·'서술형2' 포함). */
export const isShortKind = (kind: string) => kind.startsWith('서술형')
/** 차시 평가 라벨 → 문항 종류('서술형1'·'서술형2' → '서술형'). */
export const kindFamily = (kind: string): ItemKind => (isShortKind(kind) ? '서술형' : '논술형')

/** 문항 라벨(화면 표시). 같은 종류가 둘 이상인 옛 판만 번호를 붙인다(서술형1·서술형2). */
export function itemLabels(items: { kind: string }[]): string[] {
  const total = (k: string) => items.filter((i) => i.kind === k).length
  const seen = new Map<string, number>()
  return items.map((i) => {
    const n = (seen.get(i.kind) ?? 0) + 1
    seen.set(i.kind, n)
    return total(i.kind) > 1 ? `${i.kind}${n}` : i.kind
  })
}

// ── 단원 평가 차시(대표 2026-09-26 보완) ────────────────────────────────────
/**
 * 세트 = 단원 = 교수 차시 1~5개. 매 교수 차시 끝에 이해 점검 퀴즈 3문항(마지막 교수 차시 포함).
 * 서술형 1 + 논술형 1은 마지막 교수 차시 뒤에 붙는 **단원 평가 차시**(lessons 의 마지막, kind 'assessment', 60분)에서 함께 본다.
 * 평가 차시는 도입 5(평가 안내) · 전개 50(서술형 작성 15 + 논술형 작성 35) · 정리 5 — 논술형 35분 이상 규칙을 지킨다.
 * 평가 차시는 가르치는 차시가 아니므로 퀴즈·활동지·발문을 두지 않아도 된다(schemas.ts Lesson, checks.ts lessonIssues 가 kind 로 가른다).
 */
export const LESSON_KINDS = ['teaching', 'assessment'] as const
export type LessonKind = (typeof LESSON_KINDS)[number]
/** 교수 차시 수(단원 평가 차시를 뺀 수). lessons 는 교수 차시 + 평가 차시 1 = 4~6. */
export const TEACHING_LESSONS = { min: 3, max: 5 } as const
export const ASSESSMENT_SESSION = {
  topic: '단원 평가',
  time_budget: { intro_min: 5, main_min: 50, wrapup_min: 5 },
  steps: [{ step_label: '서술형 작성', minutes: 15 }, { step_label: '논술형 작성', minutes: 35 }],
} as const
/** 논술형 작성 소단계의 최소 분(스펙 §2.3). */
export const ESSAY_MIN_MINUTES = 35

type LessonLike = { no: number; kind?: string; assessment?: unknown }
/** 차시에 배치된 평가 종류 목록. 옛 모양(문자열 '서술형1'·null)도 읽는다. */
export function lessonAssessments(l: { assessment?: unknown }): string[] {
  const a = l.assessment
  if (Array.isArray(a)) return a.filter((x): x is string => typeof x === 'string')
  return typeof a === 'string' ? [a] : []
}
export const isAssessmentSession = (l: { kind?: string }) => l.kind === 'assessment'
/**
 * 지금 구조의 단원 평가 차시(서술형 → 논술형을 함께 담은 평가 차시). 옛 판의 논술형 차시(kind 'assessment', ['논술형'])와 가른다 —
 * 화면의 "단원 평가" 탭 이름·안내 문구·레몬 카드는 이것에만 붙인다.
 */
export const isUnitAssessmentSession = (l: { kind?: string; assessment?: unknown }) => isAssessmentSession(l) && lessonAssessments(l).join(',') === SET_ORDER.join(',')

/**
 * 지금 구조의 배치(zod LessonDesign 과 [TS] lessonIssues 가 같이 쓴다): 단원 평가 차시가 정확히 1개이고 마지막 번호이며
 * 서술형 → 논술형을 함께 담고, 교수 차시에는 서·논술형이 없으며, 교수 차시는 3~5개.
 */
export function sessionPlacementIssues(lessons: LessonLike[]): string[] {
  const out: string[] = []
  const sessions = lessons.filter(isAssessmentSession)
  const lastNo = Math.max(...lessons.map((l) => l.no))
  if (sessions.length !== 1) out.push(`단원 평가 차시(kind "assessment")는 정확히 1개 — 지금 ${sessions.length}개`)
  const s = sessions[0]
  if (s && s.no !== lastNo) out.push(`단원 평가 차시는 마지막 교수 차시 뒤(${lastNo}차시)에 둔다 — 지금 ${s.no}차시`)
  if (s && lessonAssessments(s).join(',') !== SET_ORDER.join(',')) out.push(`단원 평가 차시에 ${SET_ORDER.join(' → ')}을 함께 배치 — 지금 ${lessonAssessments(s).join(',') || '없음'}`)
  for (const l of lessons) if (!isAssessmentSession(l) && lessonAssessments(l).length) out.push(`${l.no}차시: 교수 차시에는 서·논술형을 두지 않는다(단원 평가 차시에서 함께)`)
  const teaching = lessons.length - sessions.length
  if (teaching < TEACHING_LESSONS.min || teaching > TEACHING_LESSONS.max) out.push(`교수 차시는 ${TEACHING_LESSONS.min}~${TEACHING_LESSONS.max}개 — 지금 ${teaching}개`)
  return out
}

type SyncableLesson = { no: number; kind?: string; assessment?: unknown; materials_used?: string[] | null }
type SyncableItem = { kind: string; points: number; materials_used?: string[] | null }

/**
 * 단원 평가 차시(오너 규칙 2026-09-26 보완): materials_used = 5단계 문항들이 실제로 쓰는 자료의 합집합(오름차순).
 * 4단계보다 먼저 생성돼 대주제 공유 자료를 통째로 적어 둔 초안(예: 영어 세트가 수학 표 A~D를 그대로 실은 문제)이
 * 있어도, 문항이 실제로 정한 자료로 항상 덮어써 맞춘다 — 순수 함수라 buildSnapshot/upgradeDraftColumns(스냅샷 시점)와
 * 5단계 저장(repo.saveOutput·saveStageEdit) 양쪽에서 같은 규칙으로 쓴다.
 * 지금 구조(서술형 1 + 논술형 1, structureOf === 'current')일 때만 손댄다 — 옛 판(legacy, 여러 평가 차시로 나뉨)은
 * 단원 평가 차시가 하나가 아니라 이 함수가 가리키는 "그 차시"가 없거나 의미가 달라 건드리지 않는다.
 * 바뀔 게 없으면(합집합이 이미 같으면) lessons 를 그대로(같은 참조) 돌려준다 — upgradeDraftColumns 의
 * "v2 조각은 같은 객체 그대로" 규칙(draft-defaults.test.ts)과 같은 결로 맞춘 것이다.
 */
export function syncAssessmentSessionMaterials<L extends SyncableLesson>(lessons: L[], items: SyncableItem[] | null | undefined): L[] {
  if (!Array.isArray(items) || items.length === 0) return lessons
  if (structureOf(items) !== 'current') return lessons
  const session = lessons.find(isUnitAssessmentSession)
  if (!session) return lessons
  const union = Array.from(new Set(items.flatMap((it) => it.materials_used ?? []))).sort()
  if (JSON.stringify(session.materials_used ?? []) === JSON.stringify(union)) return lessons
  return lessons.map((l) => (l === session ? { ...l, materials_used: union } : l))
}
