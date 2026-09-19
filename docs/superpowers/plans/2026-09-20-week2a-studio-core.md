# 2주차-A · 문항 제작소 핵심(백엔드) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제작소의 데이터 구조, 단계별 출력 형식(zod), Claude 호출 계층(가짜 응답 모드 포함), 단계별 프롬프트와 재구성 원문 이탈 검사, 단계 실행 API, 성취기준 검증 화면, 역사 과목 분리를 만든다. 화면(마법사 UI·원장 미리보기·그래프·첨부)은 2주차-B 계획.

**Architecture:** 세트(`item_sets`)는 단계별 jsonb 열을 가지며 각 단계는 `lib/studio/stages/<n>.ts`가 "프롬프트 → Claude 구조화 출력 → 검토 호출 → 저장"을 수행한다. Claude 호출은 `lib/ai/claude.ts` 하나를 통해서만 나가고, `ANTHROPIC_API_KEY`가 없거나 `AI_MOCK=1`이면 `data/studio-fixtures/*.json`을 돌려준다(키가 오기 전에도 전체 흐름을 테스트). 한 HTTP 요청 = Claude 호출 1회(생성 또는 검토)로 제한해 Vercel 함수 시간 제한을 피한다.

**Tech Stack:** Next.js 16.3, Supabase(0001~0005 적용됨), `@anthropic-ai/sdk` 0.126 (`client.messages.parse` + `zodOutputFormat`), zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-item-studio-design.md` (§1 패키지, §2 단계, §3 AI, §4 데이터). 정답 예시: `docs/samples/2026-09-20-중1-일회용품-샘플세트.md`.

## Global Constraints

- 모델: 생성·검토 `claude-opus-5`, `thinking: { type: "adaptive" }`, `output_config.effort` 기본 `"high"`(5단계 `"xhigh"`). 모델 ID에 날짜 접미사 금지. 채점(3주차) `claude-sonnet-5`.
- 구조화 출력만 사용: `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`. `parsed_output`이 null이면 1회 재시도 후 실패 저장.
- 프롬프트의 고정 규칙 블록은 `system` 배열의 첫 요소에 두고 `cache_control: { type: "ephemeral" }`.
- 재구성 규칙: **원문 성취기준에 없는 동사·대상·개념 금지**. 순수 TS 검사(`checkReconstructionFidelity`) + 검토 AI 둘 다 통과해야 확정.
- 세트는 소단원 하나(성취기준 2~6개), 같은 대주제의 세트는 같은 학년. 학년은 교육과정 학년 하나만(선행 전제 없음).
- 과목 enum에 `세계사` 추가. 성취기준은 `verified_at`이 있는 것만 게시에 사용.
- `.env.local`·키 값은 절대 출력·커밋하지 않는다. `git add`는 명시 경로만. `npx tsx` 스크립트는 top-level await 금지.
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- DB 마이그레이션은 파일만 작성; `supabase db push`는 대표님 터미널에서(컨트롤러가 요청).

---

## 파일 구조

```
supabase/migrations/20260920000006_studio.sql
lib/studio/schemas.ts              단계별 zod 스키마 + 타입 (단일 출처)
lib/studio/fidelity.ts             재구성 원문 이탈 검사 (순수)
lib/studio/prompts/rules.ts        고정 규칙 블록(캐시) — 공통양식·EBS·핵심질문 패턴
lib/studio/prompts/stages.ts       단계별 생성/검토 프롬프트 빌더
lib/studio/stages.ts               단계 실행기: load → prompt → AI → save (stage_status)
lib/ai/claude.ts                   Claude 클라이언트 래퍼(구조화 출력, 캐시, 로그, mock)
lib/ai/mock.ts                     fixture 로더
data/studio-fixtures/*.json        단계별 가짜 응답(수학 샘플에서 변환)
app/api/studio/item-sets/[id]/stages/[stage]/route.ts   POST 실행 / GET 상태
app/admin/standards/page.tsx, actions.ts                성취기준 검증 화면
scripts/reclassify-history.ts                           한국사/세계사 재분류
tests/studio-schemas.test.ts, fidelity.test.ts, claude-mock.test.ts, stages.test.ts, history-reclass.test.ts
```

---

### Task 1: 마이그레이션 0006 — 과목·검증·단계 열·버전·생성 로그

**Files:**
- Create: `supabase/migrations/20260920000006_studio.sql`

**Interfaces:**
- Produces: `subject` enum에 `'세계사'`; `standards.verified_at timestamptz`, `verified_by uuid`, `source_page int`; `item_sets` 열 `learning_goals jsonb, key_question text, lessons jsonb, materials jsonb, assessment jsonb, teacher_guide jsonb, stage_status jsonb not null default '{}'`; 표 `item_set_versions`, `generation_log`; RLS.

- [ ] **Step 1: SQL 작성**

```sql
alter type subject add value if not exists '세계사';

alter table standards
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references profiles(id),
  add column if not exists source_page int;

alter table item_sets
  add column if not exists learning_goals jsonb,
  add column if not exists key_question text,
  add column if not exists lessons jsonb,
  add column if not exists materials jsonb,
  add column if not exists assessment jsonb,
  add column if not exists teacher_guide jsonb,
  add column if not exists stage_status jsonb not null default '{}'::jsonb;

create table if not exists item_set_versions (
  item_set_id uuid references item_sets(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references profiles(id),
  primary key (item_set_id, version)
);

create table if not exists generation_log (
  id uuid primary key default gen_random_uuid(),
  item_set_id uuid references item_sets(id) on delete cascade,
  theme_id uuid references themes(id) on delete cascade,
  stage int not null,
  role text not null check (role in ('generate','review')),
  attempt int not null default 1,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  ok boolean not null,
  issues jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index on generation_log(item_set_id, stage);

alter table item_set_versions enable row level security;
alter table generation_log enable row level security;

create policy admin_all_item_set_versions on item_set_versions for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy auth_read_published_versions on item_set_versions for select
  using (auth.uid() is not null and exists (select 1 from item_sets s where s.id = item_set_id and s.status = 'published'));
create policy admin_all_generation_log on generation_log for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
```

주의: `alter type … add value`는 트랜잭션 안에서 뒤따르는 문장이 새 값을 쓰면 실패하므로 이 마이그레이션에서는 `'세계사'` 값을 **사용하지 않는다**(재분류는 Task 7 스크립트에서).

- [ ] **Step 2: 정적 점검 + 커밋**

`grep -c "create policy" supabase/migrations/20260920000006_studio.sql` → 3. 컬럼·표 이름이 §4와 일치하는지 확인.
```bash
git add supabase/migrations/20260920000006_studio.sql
git commit -m "feat: 제작소 스키마 — 세계사·검증·단계 열·버전·생성 로그

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(적용은 대표님이 `supabase db push`.)

---

### Task 2: 단계별 zod 스키마

**Files:**
- Create: `lib/studio/schemas.ts`
- Test: `tests/studio-schemas.test.ts`

**Interfaces:**
- Produces: `ThemeIntro`, `StandardsRecommendation`, `Reconstruction`, `Lessons`, `Materials`, `Assessment`, `TeacherGuide`, `Review` 스키마와 `z.infer` 타입. `STAGE_SCHEMAS: Record<0|1|2|3|4|5|6, ZodType>`. 상수 `SUBJECTS = ['국어','영어','수학','과학','사회','한국사','세계사'] as const`.

- [ ] **Step 1: 테스트 먼저**

`tests/studio-schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Reconstruction, Lessons, Assessment, Review, STAGE_SCHEMAS } from '@/lib/studio/schemas'

describe('studio schemas', () => {
  it('accepts a valid reconstruction and rejects wrong goal count', () => {
    const ok = Reconstruction.safeParse({
      reconstruction: '자료를 도수분포표로 나타내고 해석할 수 있다.',
      learning_goals: ['a', 'b', 'c'],
      key_question_candidates: ['q1', 'q2'],
    })
    expect(ok.success).toBe(true)
    expect(Reconstruction.safeParse({ reconstruction: 'x', learning_goals: ['a'], key_question_candidates: ['q'] }).success).toBe(false)
  })
  it('requires exactly 3 quiz items per lesson', () => {
    const lesson = { no: 1, standards: ['[9수04-02]'], key_question: 'q', goal: 'g',
      flow: { intro: 'i', main: 'm', wrapup: 'w' }, materials: ['A'],
      quiz: [{ q: '?', type: 'choice', choices: ['a','b'], answer: 'a', explanation: 'e' }], assessment: null, mergeable_with: null }
    expect(Lessons.safeParse({ lessons: [lesson] }).success).toBe(false)
    lesson.quiz = [lesson.quiz[0], lesson.quiz[0], lesson.quiz[0]]
    expect(Lessons.safeParse({ lessons: [lesson] }).success).toBe(true)
  })
  it('assessment: extended item needs 4 criteria with 5 bands', () => {
    const r = Assessment.safeParse({
      items: [{ kind: '논술형', lesson_no: 5, stem: 's', conditions: { length: '300자', required: ['수치 2개'], format: '~다' }, points: 16,
        rubric: { criteria: [{ name: 'c1', bands: { '4': 'a', '3': 'b', '2': 'c', '1': 'd', '0': 'e' } }] } }],
      grade_boundaries: [{ grade: 7, min: 21, max: 22, band: '상' }],
      exemplars: [{ level: '상', text: 't', scores: [4,4,4,3], total: 15, grade: 7 }],
      feedback_templates: { 상: 'a', 중: 'b', 하: 'c' },
    })
    expect(r.success).toBe(false)  // criteria must be 4
  })
  it('review shape', () => {
    expect(Review.parse({ pass: false, issues: [{ kind: 'fidelity', detail: 'x' }] }).issues).toHaveLength(1)
    expect(Object.keys(STAGE_SCHEMAS)).toEqual(['0','1','2','3','4','5','6'])
  })
})
```
Run: `npm test` → FAIL.

- [ ] **Step 2: 스키마 구현**

`lib/studio/schemas.ts`:
```ts
import { z } from 'zod'

export const SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '한국사', '세계사'] as const
export type Subject = (typeof SUBJECTS)[number]

export const ThemeIntro = z.object({
  intro: z.string().min(20),
  subject_ideas: z.array(z.object({ subject: z.enum(SUBJECTS), idea: z.string().min(5) })).min(1),
})

export const StandardsRecommendation = z.object({
  recommended: z.array(z.object({ code: z.string(), reason: z.string() })).min(1).max(6),
})

export const Reconstruction = z.object({
  reconstruction: z.string().min(10),
  learning_goals: z.array(z.string().min(5)).min(3).max(4),
  key_question_candidates: z.array(z.string().min(5)).min(2).max(3),
})

export const QuizItem = z.object({
  q: z.string().min(3),
  type: z.enum(['choice', 'short']),
  choices: z.array(z.string()).min(2).max(5).nullable(),
  answer: z.string().min(1),
  explanation: z.string().min(3),
})

export const Lesson = z.object({
  no: z.number().int().min(1).max(8),
  standards: z.array(z.string()).min(1).max(2),
  key_question: z.string().min(5),
  goal: z.string().min(5),
  flow: z.object({ intro: z.string(), main: z.string(), wrapup: z.string() }),
  materials: z.array(z.string()),
  quiz: z.array(QuizItem).length(3),
  assessment: z.enum(['서술형1', '서술형2', '논술형']).nullable(),
  mergeable_with: z.number().int().nullable(),
})
export const Lessons = z.object({ lessons: z.array(Lesson).min(4).max(6) })

export const Material = z.object({
  id: z.string().regex(/^[A-Z]$/),
  title: z.string(),
  kind: z.enum(['table', 'text', 'chart']),
  body: z.string().nullable(),
  table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }).nullable(),
  source: z.literal('자작'),
})
export const Materials = z.object({ materials: z.array(Material).min(1).max(6) })

export const ShortRubric = z.object({
  levels: z.array(z.object({ points: z.number().int().min(0), expectation: z.string(), example: z.string().nullable() })).min(2).max(4),
})
export const ExtendedRubric = z.object({
  criteria: z.array(z.object({
    name: z.string(),
    bands: z.object({ '4': z.string(), '3': z.string(), '2': z.string(), '1': z.string(), '0': z.string() }),
  })).length(4),
})
export const AssessmentItem = z.object({
  kind: z.enum(['서술형', '논술형']),
  lesson_no: z.number().int(),
  stem: z.string().min(10),
  conditions: z.object({ length: z.string(), required: z.array(z.string()), format: z.string() }),
  points: z.number().int().positive(),
  rubric: z.union([ShortRubric, ExtendedRubric]),
})
export const Assessment = z.object({
  items: z.array(AssessmentItem).min(2).max(4),
  grade_boundaries: z.array(z.object({ grade: z.number().int().min(1).max(7), min: z.number().int(), max: z.number().int(), band: z.enum(['상', '중', '하']) })).length(7),
  exemplars: z.array(z.object({ level: z.enum(['상', '중', '하']), text: z.string().min(30), scores: z.array(z.number().int()), total: z.number().int(), grade: z.number().int() })).length(3),
  feedback_templates: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
}).superRefine((a, ctx) => {
  const ext = a.items.filter(i => i.kind === '논술형')
  if (ext.length !== 1) ctx.addIssue({ code: 'custom', message: '논술형은 정확히 1개' })
  for (const i of ext) if (!('criteria' in i.rubric)) ctx.addIssue({ code: 'custom', message: '논술형은 4요소 루브릭' })
  const total = a.items.reduce((s, i) => s + i.points, 0)
  const top = Math.max(...a.grade_boundaries.map(b => b.max))
  if (top !== total) ctx.addIssue({ code: 'custom', message: `등급표 최댓값(${top}) ≠ 총점(${total})` })
})

export const TeacherGuide = z.object({
  general: z.object({ materials: z.array(z.string()), schedule_note: z.string(), purpose: z.string() }),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })),
  per_lesson: z.array(z.object({ no: z.number().int(), notes: z.array(z.string()).min(1) })).min(4),
})

export const Review = z.object({
  pass: z.boolean(),
  issues: z.array(z.object({ kind: z.enum(['fidelity', 'grade_level', 'coverage', 'quiz', 'rubric', 'other']), detail: z.string() })),
})

export const STAGE_SCHEMAS = {
  0: ThemeIntro, 1: StandardsRecommendation, 2: Reconstruction, 3: Lessons, 4: Materials, 5: Assessment, 6: TeacherGuide,
} as const
export type Stage = keyof typeof STAGE_SCHEMAS
export type ReviewT = z.infer<typeof Review>
```
테스트의 "criteria must be 4" 케이스는 `ExtendedRubric.length(4)`로 실패하지만 union이 `ShortRubric`으로도 시도한다 — `criteria` 키가 있으면 ShortRubric도 실패하므로 전체 실패. Run: `npm test` → PASS.

- [ ] **Step 3: 커밋**
```bash
git add lib/studio/schemas.ts tests/studio-schemas.test.ts
git commit -m "feat: 제작소 단계별 출력 스키마

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Claude 호출 계층 + 가짜 응답 모드 + 생성 로그

**Files:**
- Create: `lib/ai/claude.ts`, `lib/ai/mock.ts`, `data/studio-fixtures/README.md`
- Modify: `.env.example` (`ANTHROPIC_API_KEY=`, `AI_MOCK=`)
- Test: `tests/claude-mock.test.ts`

**Interfaces:**
- Produces: `callStructured<T>({ stage, role, schema, system, user, effort, fixtureKey, log })` → `{ data: T, usage: { input, output, cacheRead }, model }`. `isMock()`. Fixture 파일명 `data/studio-fixtures/<fixtureKey>.json`.

- [ ] **Step 1: 설치**
```bash
npm i @anthropic-ai/sdk
```

- [ ] **Step 2: 테스트**

`tests/claude-mock.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'
import { callStructured, isMock } from '@/lib/ai/claude'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

describe('callStructured (mock)', () => {
  it('is in mock mode without a key', () => { expect(isMock()).toBe(true) })
  it('returns the fixture parsed by the schema', async () => {
    const schema = z.object({ hello: z.string() })
    const r = await callStructured({ stage: 0, role: 'generate', schema, system: 's', user: 'u', fixtureKey: 'test-hello' })
    expect(r.data.hello).toBe('world')
    expect(r.model).toBe('mock')
  })
  it('throws a clear error when the fixture is missing', async () => {
    const schema = z.object({ x: z.string() })
    await expect(callStructured({ stage: 0, role: 'generate', schema, system: 's', user: 'u', fixtureKey: 'nope' })).rejects.toThrow(/fixture/)
  })
})
```
`data/studio-fixtures/test-hello.json`: `{ "hello": "world" }`. Run → FAIL(모듈 없음).

- [ ] **Step 3: 구현**

`lib/ai/mock.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function loadFixture(key: string): unknown {
  const p = join(process.cwd(), 'data', 'studio-fixtures', `${key}.json`)
  if (!existsSync(p)) throw new Error(`AI mock fixture not found: ${p}`)
  return JSON.parse(readFileSync(p, 'utf8'))
}
```

`lib/ai/claude.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'
import { loadFixture } from './mock'

export const MODELS = { generate: 'claude-opus-5', review: 'claude-opus-5', grade: 'claude-sonnet-5' } as const
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export function isMock(): boolean {
  return process.env.AI_MOCK === '1' || !process.env.ANTHROPIC_API_KEY
}

export type CallInput<T> = {
  stage: number
  role: 'generate' | 'review'
  schema: ZodType<T>
  system: string            // 고정 규칙 블록 (캐시 대상)
  user: string              // 이번 호출의 가변 입력
  effort?: Effort
  fixtureKey: string
  log?: (entry: { model: string; input: number; output: number; cacheRead: number; ok: boolean; error?: string }) => Promise<void>
}
export type CallResult<T> = { data: T; usage: { input: number; output: number; cacheRead: number }; model: string }

let client: Anthropic | null = null
function getClient() { return (client ??= new Anthropic()) }

export async function callStructured<T>(inp: CallInput<T>): Promise<CallResult<T>> {
  if (isMock()) {
    const data = inp.schema.parse(loadFixture(inp.fixtureKey))
    await inp.log?.({ model: 'mock', input: 0, output: 0, cacheRead: 0, ok: true })
    return { data, usage: { input: 0, output: 0, cacheRead: 0 }, model: 'mock' }
  }
  const model = MODELS[inp.role]
  const request = {
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: inp.effort ?? 'high', format: zodOutputFormat(inp.schema) },
    system: [{ type: 'text' as const, text: inp.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: inp.user }],
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await getClient().messages.parse(request)
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0 }
    if (res.stop_reason === 'refusal') {
      await inp.log?.({ model, ...usage, ok: false, error: 'refusal' })
      throw new Error('AI refused the request')
    }
    if (res.parsed_output) {
      await inp.log?.({ model, ...usage, ok: true })
      return { data: res.parsed_output as T, usage, model }
    }
    await inp.log?.({ model, ...usage, ok: false, error: `unparsable (attempt ${attempt})` })
  }
  throw new Error('AI output could not be parsed after 2 attempts')
}
```
`.env.example`에 `ANTHROPIC_API_KEY=`와 `AI_MOCK=1` 추가(주석: 키 없으면 자동 mock). Run: `npm test` → PASS. `npm run build` 성공(SDK 타입 오류가 나면 `zodOutputFormat` import 경로와 `parse` 시그니처를 `node_modules/@anthropic-ai/sdk/helpers/zod` 및 `resources/messages` 타입 정의에서 확인해 맞춘다 — 추측 금지).

- [ ] **Step 4: 커밋**
```bash
git add lib/ai data/studio-fixtures tests/claude-mock.test.ts .env.example package.json package-lock.json
git commit -m "feat: Claude 구조화 호출 계층 + 가짜 응답 모드

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 재구성 원문 이탈 검사 (순수)

**Files:**
- Create: `lib/studio/fidelity.ts`
- Test: `tests/fidelity.test.ts`

**Interfaces:**
- Produces: `checkReconstructionFidelity(reconstruction: string, standards: string[]): { ok: boolean; unknownTokens: string[] }`. 규칙: 재구성의 내용어 토큰(2자 이상, 조사·접속 불용어 제외)은 어간 기준(길이-2 이상의 접두)으로 원문 연결 문자열에 포함되어야 한다.

- [ ] **Step 1: 테스트**

`tests/fidelity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { checkReconstructionFidelity } from '@/lib/studio/fidelity'

const STD = [
  '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.',
  '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.',
  '통계적 탐구 문제를 설정하고, 공학 도구를 이용하여 자료를 수집하여 분석하고, 그 결과를 해석할 수 있다.',
]

describe('checkReconstructionFidelity', () => {
  it('passes a faithful merge (inflection allowed)', () => {
    const r = checkReconstructionFidelity('통계적 탐구 문제를 설정하고, 자료를 도수분포표·히스토그램으로 나타내며, 상대도수의 분포를 표나 그래프로 나타내고, 그 결과를 해석할 수 있다.', STD)
    expect(r.ok).toBe(true)
    expect(r.unknownTokens).toEqual([])
  })
  it('fails when context words are injected', () => {
    const r = checkReconstructionFidelity('학생은 축제 일회용품 자료를 도수분포표로 정리하고 감축 방안을 제안할 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toEqual(expect.arrayContaining(['축제', '일회용품', '감축', '제안할']))
  })
  it('ignores connectors and particles', () => {
    expect(checkReconstructionFidelity('자료를 나타내고 그리고 해석할 수 있다.', STD).ok).toBe(true)
  })
})
```
Run → FAIL.

- [ ] **Step 2: 구현**

`lib/studio/fidelity.ts`:
```ts
const STOP = new Set(['그리고', '또한', '및', '또는', '이를', '그', '수', '있다', '있다.', '한다', '한다.', '하며', '하고', '학생은', '학생이', '통해', '바탕으로', '따라', '위해', '위한', '대해', '관해', '등', '각', '그리고,'])

function tokens(s: string): string[] {
  return s.replace(/[.,·⋅、()\[\]"'“”‘’]/g, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOP.has(t))
}

function stemMatches(token: string, source: string): boolean {
  // 어미·조사 변화를 허용: 토큰의 접두(길이-2 이상, 최소 2)가 원문에 있으면 통과
  const minLen = Math.max(2, token.length - 2)
  for (let len = token.length; len >= minLen; len--) {
    if (source.includes(token.slice(0, len))) return true
  }
  return false
}

export function checkReconstructionFidelity(reconstruction: string, standards: string[]) {
  const source = standards.join(' ').replace(/[·⋅、]/g, ' ')
  const unknownTokens = tokens(reconstruction).filter(t => !stemMatches(t, source))
  return { ok: unknownTokens.length === 0, unknownTokens }
}
```
Run → PASS. ("제안할"은 원문에 "제안" 없음 → 미지 토큰; "정리하고"도 미지.) 테스트 3에서 "나타내고"는 접두 "나타내"가 원문에 있어 통과.

- [ ] **Step 3: 커밋**
```bash
git add lib/studio/fidelity.ts tests/fidelity.test.ts
git commit -m "feat: 재구성 원문 이탈 검사

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 프롬프트 — 고정 규칙 블록 + 단계별 생성/검토 프롬프트

**Files:**
- Create: `lib/studio/prompts/rules.ts`, `lib/studio/prompts/stages.ts`
- Test: `tests/prompts.test.ts`

**Interfaces:**
- Produces: `RULES: string` (규칙 블록, 스키마 설명 포함, 매 호출 동일), `buildPrompt(stage, ctx): { system: string; user: string; fixtureKey: string }`, `buildReviewPrompt(stage, ctx, output): { system; user; fixtureKey }`. `ctx = { theme: { title, level, grade, subjects }, subject, standards: {code,text}[], prior: { reconstruction?, learning_goals?, key_question?, lessons?, materials?, assessment? } }`.

- [ ] **Step 1: 규칙 블록**

`lib/studio/prompts/rules.ts` — 아래 내용을 문자열 상수로 (연구 문서에서 발췌·요약, 한국어):
```ts
export const RULES = `당신은 다빈치스쿨 본사의 서·논술형 문항 설계자다. 아래 규칙을 항상 지킨다.

[성취기준 재구성]
- 관련 성취기준 여러 개를 원문 어휘를 보존하며 한 문장으로 통합한다(EBS 방식). 원문에 없는 동사·대상·개념을 절대 추가하지 않는다. 축제·일회용품 같은 맥락은 재구성에 넣지 않고 자료와 문항에서 다룬다.
- 학습 목표는 3~4개, 각각 한 문장 "~할 수 있다"로 끝난다.

[핵심질문]
- 세트 핵심질문은 1개. 사실 확인형(무엇인가/뜻은) 금지. 자료를 근거로 판단해야 답할 수 있는 형태. 기능어별 패턴: 설명한다→"어떻게/왜 ~인가", 비교한다→"~과 ~은 무엇이 다르고 그 차이는 무엇을 뜻하는가", 추론한다→"~로 보아 ~라고 할 수 있는가", 주장한다→"~해야 하는가, 그 근거는", 파악한다→"자료는 ~에 대해 무엇을 말하는가".
- 차시 핵심질문은 그 차시가 담당하는 성취기준 1~2개에서 도출하며 마무리 퀴즈가 이를 점검한다.

[차시]
- 4~6차시, 1차시 60분(도입 10·전개 40·정리 10). 차시마다 담당 성취기준, 차시 핵심질문, 활동 흐름, 자료, 마무리 퀴즈 3문항(객관식 또는 단답, 정답·해설).
- 서술형 1·2는 해당 차시 정리 시간에, 논술형은 마지막 차시 전체(35분)에 배치. 앞 차시가 쉬우면 병합 가능 차시를 표시.

[자료]
- 모든 자료는 본사가 만든 가상 자료이며 출처는 "자작". 수치 자료는 합계·비율이 맞아야 한다. 같은 대주제의 과목들은 같은 자료를 공유한다. 자료는 사고의 출발점이지 답을 대신하지 않는다.

[평가 문항]
- 서술형 2개(각 3점) + 논술형 1개(16점) = 22점. 문두 = 조건 + 평가요소 + 기능 + 배점. 응답 조건 = 분량/필수 요소/형식.
- 서술형 채점표: 점수 수준 2~4단계, 각 수준에 기대 수행과 예시답안. 논술형 채점표: 평가요소 4개 × 0~4점, 각 점수마다 관찰 가능한 행동으로 서술("우수/미흡" 같은 형용사만 쓰지 않는다).
- 등급 경계표: 총점 22 → 7등급(21~22, 18~20, 15~17, 11~14, 8~10, 5~7, 0~4), 상=6~7, 중=3~5, 하=1~2.
- 논술형 예시답안 상/중/하는 채점표로 실제 채점했을 때 그 등급이 나와야 한다. 요소별 점수와 총점, 등급을 함께 적는다.
- 피드백 문구 틀은 상/중/하 각각 1~2문장, 학생에게 말하듯 존댓말.

[교사용 지침서]
- 비전공 원장님이 그대로 따라 할 수 있게: 세트 전체 준비물·일정(2시간 등원 = 2차시), 용어 정리(헷갈리기 쉬운 것), 차시별 진행 메모(발문·흔한 오개념·퀴즈 해설).

[수준·문체]
- 어휘·자료·문항은 교육과정 학년(예: 중1) 수준. 학생 제시문은 "~다"로 끝나는 평서문. 지침서는 "~합니다/~하세요".
- 출력은 요청된 JSON 형식만.`
```

- [ ] **Step 2: 단계 프롬프트 빌더 + 테스트**

`tests/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { RULES } from '@/lib/studio/prompts/rules'

const ctx = { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학',
  standards: [{ code: '[9수04-02]', text: '자료를 … 해석할 수 있다.' }], prior: {} }

describe('prompts', () => {
  it('system is the rules block (stable for caching) and user carries the context', () => {
    const p = buildPrompt(2, ctx)
    expect(p.system).toBe(RULES)
    expect(p.user).toContain('[9수04-02]')
    expect(p.user).toContain('중학교 1학년')
    expect(p.fixtureKey).toBe('stage2-generate')
  })
  it('review prompt includes the output and the source standards', () => {
    const r = buildReviewPrompt(2, ctx, { reconstruction: 'X', learning_goals: [], key_question_candidates: [] })
    expect(r.user).toContain('"reconstruction": "X"')
    expect(r.user).toContain('[9수04-02]')
    expect(r.fixtureKey).toBe('stage2-review')
  })
})
```

`lib/studio/prompts/stages.ts`:
```ts
import { RULES } from './rules'
import type { Stage } from '@/lib/studio/schemas'

export type Ctx = {
  theme: { title: string; level: string; grade: number; subjects: string[] }
  subject: string
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
}

const LEVEL_NAME: Record<string, string> = { '초': '초등학교', '중': '중학교', '고': '고등학교' }

function header(ctx: Ctx) {
  return [
    `대주제: ${ctx.theme.title}`,
    `학교급·학년: ${LEVEL_NAME[ctx.theme.level] ?? ctx.theme.level} ${ctx.theme.grade}학년 (모든 내용은 이 학년 수준)`,
    `과목: ${ctx.subject}`,
    `성취기준(원문, 절대 변형 금지):`,
    ...ctx.standards.map(s => `${s.code} ${s.text}`),
  ].join('\n')
}

const TASKS: Record<Stage, string> = {
  0: '대주제 소개문(3~4문장)과 참여 과목별로 이 대주제와 연결할 수 있는 수업 아이디어를 한 줄씩 제안하라.',
  1: '이 대주제와 학년에 맞는 성취기준을 아래 후보 중에서 골라 추천하고 이유를 적어라. 해당 학년 교과서에서 다루는 내용만 고른다.',
  2: '성취기준을 원문 어휘를 보존하며 한 문장으로 재구성하고, 학습 목표 3~4개, 세트 핵심질문 후보 2~3개를 만들어라.',
  3: '재구성·학습 목표·핵심질문을 바탕으로 4~6차시 수업을 설계하라. 각 차시에 담당 성취기준, 차시 핵심질문, 60분 흐름, 필요한 자료(아이디만, A~F), 마무리 퀴즈 3문항, 평가 배치(서술형1·서술형2·논술형 중 하나 또는 null), 병합 가능 차시를 적어라.',
  4: '차시와 문항에 필요한 가상 자료를 만들어라. 표는 열·행으로, 설명글은 본문으로. 수치는 합계와 비율이 맞아야 한다. 공유 자료가 주어지면 그 수치를 그대로 쓴다.',
  5: '서술형 2개(각 3점)와 논술형 1개(16점)를 만들어라. 문두는 조건+평가요소+기능+배점. 각 문항의 채점표, 등급 경계표(총 22점, 7등급), 논술형 예시답안 상/중/하(요소별 점수·총점·등급 포함), 피드백 문구 틀을 만들어라.',
  6: '비전공 원장님이 그대로 진행할 수 있는 교사용 지침서를 만들어라: 세트 전체(준비물·일정·목적), 용어 정리, 차시별 진행 메모.',
}

export function buildPrompt(stage: Stage, ctx: Ctx) {
  const prior = Object.keys(ctx.prior).length ? `\n\n지금까지 확정된 내용:\n${JSON.stringify(ctx.prior, null, 1)}` : ''
  return { system: RULES, user: `${header(ctx)}\n\n과제: ${TASKS[stage]}${prior}`, fixtureKey: `stage${stage}-generate` }
}

const REVIEW_FOCUS: Record<Stage, string> = {
  0: '소개문이 학년 수준인지, 과목별 아이디어가 그 과목 성취기준으로 이어질 수 있는지.',
  1: '추천한 성취기준이 해당 학년 교과서 범위인지(다른 학년 내용이면 grade_level 이슈).',
  2: '재구성에 원문에 없는 동사·대상·개념이 있는지(fidelity). 핵심질문 후보가 사실 확인형인지. 학습 목표가 성취기준을 벗어나는지.',
  3: '모든 성취기준이 어느 차시엔가 배정됐는지(coverage). 퀴즈가 차시 핵심질문을 점검하는지, 정답이 맞는지(quiz). 서술형1·2·논술형이 각 1회 배치됐는지.',
  4: '수치 자료의 합계·비율이 맞는지. 자료가 답을 대신하지 않는지. 학년 어휘 수준.',
  5: '채점표로 예시답안 상/중/하를 실제로 채점했을 때 적힌 점수·등급이 나오는지(rubric). 배점 합계 22, 등급표 일치. 문두가 조건+평가요소+기능+배점인지. 성취기준 이탈 여부.',
  6: '비전공자가 따라 할 수 있는 구체성. 차시 수와 per_lesson 수 일치.',
}

export function buildReviewPrompt(stage: Stage, ctx: Ctx, output: unknown) {
  const system = `${RULES}\n\n당신은 이제 검토자다. 생성 결과가 규칙을 지켰는지 검사하고 pass/issues로만 답한다. 문제가 없으면 pass=true, issues=[].`
  const user = `${header(ctx)}\n\n검토 초점: ${REVIEW_FOCUS[stage]}\n\n생성 결과:\n${JSON.stringify(output, null, 1)}`
  return { system, user, fixtureKey: `stage${stage}-review` }
}
```
Run: `npm test` → PASS.

- [ ] **Step 3: 커밋**
```bash
git add lib/studio/prompts tests/prompts.test.ts
git commit -m "feat: 제작소 프롬프트 — 규칙 블록과 단계별 생성/검토

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 가짜 응답 fixture — 수학 샘플을 스키마 JSON으로

**Files:**
- Create: `data/studio-fixtures/stage0-generate.json` … `stage6-generate.json`, `stage0-review.json` … `stage6-review.json` (검토 fixture는 모두 `{ "pass": true, "issues": [] }`)
- Test: `tests/studio-fixtures.test.ts`

**Interfaces:**
- Produces: 각 fixture는 `STAGE_SCHEMAS[n]`을 통과해야 한다. 내용은 `docs/samples/2026-09-20-중1-일회용품-샘플세트.md` §1(수학)을 **그대로** 옮긴다(요약·창작 금지).

- [ ] **Step 1: 테스트**
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { STAGE_SCHEMAS, Review } from '@/lib/studio/schemas'
import { checkReconstructionFidelity } from '@/lib/studio/fidelity'

describe('studio fixtures', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6] as const) {
    it(`stage${n} fixtures validate`, () => {
      const gen = JSON.parse(readFileSync(`data/studio-fixtures/stage${n}-generate.json`, 'utf8'))
      expect(STAGE_SCHEMAS[n].safeParse(gen).success).toBe(true)
      const rev = JSON.parse(readFileSync(`data/studio-fixtures/stage${n}-review.json`, 'utf8'))
      expect(Review.safeParse(rev).success).toBe(true)
    })
  }
  it('stage2 fixture is faithful to the math standards', () => {
    const gen = JSON.parse(readFileSync('data/studio-fixtures/stage2-generate.json', 'utf8'))
    const std = JSON.parse(readFileSync('data/studio-fixtures/standards-math.json', 'utf8')).map((s: { text: string }) => s.text)
    expect(checkReconstructionFidelity(gen.reconstruction, std).ok).toBe(true)
  })
})
```
`data/studio-fixtures/standards-math.json`: `[{"code":"[9수04-02]","text":"…"},…]` (DB 원문 그대로).

- [ ] **Step 2: fixture 작성** — 샘플 §1의 자료 A·B(표), 5차시(퀴즈 15문항 전부), 서술형 2·논술형 채점표(4요소×5구간), 등급표, 예시답안 3, 피드백 틀, 지침서를 스키마 필드에 대응시켜 입력. `npm test` → PASS.

- [ ] **Step 3: 커밋**
```bash
git add data/studio-fixtures tests/studio-fixtures.test.ts
git commit -m "feat: 제작소 가짜 응답 fixture (중1 수학 샘플)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 단계 실행기 + API 라우트

**Files:**
- Create: `lib/studio/stages.ts`, `app/api/studio/item-sets/[id]/stages/[stage]/route.ts`
- Test: `tests/stages.test.ts` (Supabase를 가짜 저장소로 대체)

**Interfaces:**
- Produces: `runStage({ itemSetId, stage, action: 'generate'|'review'|'accept', repo })` → `{ status: StageStatus }`. `StageStatus = { state: 'idle'|'generated'|'reviewed'|'accepted'|'failed'; attempt: number; output?: unknown; review?: ReviewT; error?: string; updated_at: string }`. `repo` 인터페이스: `loadContext(itemSetId)`, `saveOutput(itemSetId, stage, output)`, `saveStatus(itemSetId, stage, status)`, `log(entry)`.
- 한 요청 = 한 호출: `generate`(생성 1회 → state generated) / `review`(검토 1회 → reviewed; fail이면 attempt+1, 5단계는 3회까지 자동 재생성 유도) / `accept`(관리자 확정 → accepted, 다음 단계 ctx.prior에 포함).
- 2단계 `review`는 AI 검토 전에 `checkReconstructionFidelity`를 먼저 돌려 실패하면 AI 호출 없이 `issues=[{kind:'fidelity', detail: unknownTokens}]`.

- [ ] **Step 1: 테스트 (가짜 repo, AI_MOCK)**
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { runStage, type Repo } from '@/lib/studio/stages'
import { readFileSync } from 'node:fs'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

function fakeRepo(): Repo & { outputs: Record<number, unknown>; statuses: Record<number, unknown> } {
  const std = JSON.parse(readFileSync('data/studio-fixtures/standards-math.json', 'utf8'))
  const outputs: Record<number, unknown> = {}, statuses: Record<number, unknown> = {}
  return {
    outputs, statuses,
    async loadContext() { return { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards: std, prior: {}, outputs } },
    async saveOutput(_id, stage, out) { outputs[stage] = out },
    async saveStatus(_id, stage, st) { statuses[stage] = st },
    async log() {},
  }
}

describe('runStage', () => {
  it('generate → review → accept for stage 2', async () => {
    const repo = fakeRepo()
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    expect(g.status.state).toBe('generated')
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.state).toBe('reviewed'); expect(r.status.review?.pass).toBe(true)
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })
    expect(a.status.state).toBe('accepted')
  })
  it('stage 2 review fails locally on unfaithful reconstruction without calling AI', async () => {
    const repo = fakeRepo()
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    ;(repo.outputs[2] as { reconstruction: string }).reconstruction = '학생은 축제 일회용품 감축 방안을 제안할 수 있다.'
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.review?.pass).toBe(false)
    expect(r.status.review?.issues[0].kind).toBe('fidelity')
  })
  it('refuses to accept before review passes', async () => {
    const repo = fakeRepo()
    await runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo })
    await expect(runStage({ itemSetId: 'x', stage: 3, action: 'accept', repo })).rejects.toThrow(/review/)
  })
})
```

- [ ] **Step 2: 구현**

`lib/studio/stages.ts`:
```ts
import { STAGE_SCHEMAS, Review, type Stage, type ReviewT } from './schemas'
import { buildPrompt, buildReviewPrompt, type Ctx } from './prompts/stages'
import { checkReconstructionFidelity } from './fidelity'
import { callStructured } from '@/lib/ai/claude'

export type StageStatus = { state: 'idle' | 'generated' | 'reviewed' | 'accepted' | 'failed'; attempt: number; output?: unknown; review?: ReviewT; error?: string; updated_at: string }
export type Repo = {
  loadContext(itemSetId: string): Promise<Ctx & { outputs: Record<number, unknown>; statuses?: Record<number, StageStatus> }>
  saveOutput(itemSetId: string, stage: Stage, output: unknown): Promise<void>
  saveStatus(itemSetId: string, stage: Stage, status: StageStatus): Promise<void>
  log(entry: { itemSetId: string; stage: Stage; role: 'generate' | 'review'; attempt: number; model: string; input: number; output: number; cacheRead: number; ok: boolean; issues?: unknown; error?: string }): Promise<void>
}
const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 5: 3 }

export async function runStage({ itemSetId, stage, action, repo }: { itemSetId: string; stage: Stage; action: 'generate' | 'review' | 'accept'; repo: Repo }) {
  const ctx = await repo.loadContext(itemSetId)
  const prev = ctx.statuses?.[stage] ?? { state: 'idle', attempt: 0, updated_at: '' }
  // 이전 단계의 확정 출력만 prior로 넘긴다
  for (let s = 0; s < stage; s++) if (ctx.outputs[s] !== undefined) ctx.prior[`stage${s}`] = ctx.outputs[s]
  const now = () => new Date().toISOString()

  if (action === 'generate') {
    const attempt = prev.attempt + 1
    const p = buildPrompt(stage, ctx)
    try {
      const r = await callStructured({ stage, role: 'generate', schema: STAGE_SCHEMAS[stage], system: p.system, user: p.user,
        effort: stage === 5 ? 'xhigh' : 'high', fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'generate', attempt, ...e }) })
      await repo.saveOutput(itemSetId, stage, r.data)
      const status: StageStatus = { state: 'generated', attempt, output: r.data, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    } catch (e) {
      const status: StageStatus = { state: 'failed', attempt, error: (e as Error).message, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    }
  }

  const output = ctx.outputs[stage]
  if (output === undefined) throw new Error('nothing to review: generate first')

  if (action === 'review') {
    let review: ReviewT | null = null
    if (stage === 2) {
      const f = checkReconstructionFidelity((output as { reconstruction: string }).reconstruction, ctx.standards.map(s => s.text))
      if (!f.ok) review = { pass: false, issues: [{ kind: 'fidelity', detail: `원문에 없는 표현: ${f.unknownTokens.join(', ')}` }] }
    }
    if (!review) {
      const p = buildReviewPrompt(stage, ctx, output)
      const r = await callStructured({ stage, role: 'review', schema: Review, system: p.system, user: p.user, fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'review', attempt: prev.attempt, ...e }) })
      review = r.data
    }
    const exhausted = !review.pass && prev.attempt >= (MAX_ATTEMPTS[stage] ?? 1)
    const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(), ...(exhausted ? { error: '검토 반복 한도 도달 — 관리자가 직접 수정' } : {}) }
    await repo.saveStatus(itemSetId, stage, status); return { status }
  }

  // accept
  if (prev.state !== 'reviewed' || !prev.review?.pass) throw new Error('accept requires a passing review')
  const status: StageStatus = { ...prev, state: 'accepted', updated_at: now() }
  await repo.saveStatus(itemSetId, stage, status); return { status }
}
```
Run: `npm test` → PASS.

- [ ] **Step 3: Supabase repo + 라우트**

`lib/studio/repo.ts` — `createSupabaseRepo(supabase)`: `loadContext`는 `item_sets` + `themes` + `item_set_standards`→`standards(code,text)`를 읽어 Ctx를 만들고, `outputs`는 열 매핑 `{0: themes.intro…, 2: {reconstruction, learning_goals, key_question_candidates}, 3: lessons, 4: materials, 5: assessment, 6: teacher_guide}`; `saveOutput`은 같은 매핑으로 `update`; `saveStatus`는 `stage_status` jsonb의 키 `stage<n>` 갱신; `log`는 `generation_log` insert. (2단계 저장 시 `reconstruction`→`item_sets.reconstruction`, `learning_goals`→`learning_goals`, 확정된 핵심질문은 accept 후 관리자가 선택해 `key_question`에 저장 — 2주차-B UI.)

`app/api/studio/item-sets/[id]/stages/[stage]/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { runStage } from '@/lib/studio/stages'
import { createSupabaseRepo } from '@/lib/studio/repo'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id, stage } = await params
  const { action } = await req.json() as { action: 'generate' | 'review' | 'accept' }
  const n = Number(stage)
  if (![0,1,2,3,4,5,6].includes(n) || !['generate','review','accept'].includes(action)) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const supabase = await createClient()
  const result = await runStage({ itemSetId: id, stage: n as 0|1|2|3|4|5|6, action, repo: createSupabaseRepo(supabase) })
  return NextResponse.json(result)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id, stage } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('item_sets').select('stage_status').eq('id', id).single()
  return NextResponse.json({ status: data?.stage_status?.[`stage${stage}`] ?? { state: 'idle', attempt: 0 } })
}
```
`npm run build` 성공. 라우트 수동 확인(관리자 로그인 후 `curl -X POST … -d '{"action":"generate"}'`은 2주차-B UI에서 대신 확인; 여기서는 build만).

- [ ] **Step 4: 커밋**
```bash
git add lib/studio/stages.ts lib/studio/repo.ts app/api/studio tests/stages.test.ts
git commit -m "feat: 제작소 단계 실행기와 API 라우트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 성취기준 검증 화면

**Files:**
- Create: `app/admin/standards/page.tsx`, `app/admin/standards/actions.ts`, `app/admin/standards/VerifyButton.tsx`
- Modify: `content/site.ts` (`app.nav.admin`에 `{ href: '/admin/standards', label: '성취기준' }`, `app.adminStandards` 문구), `tests/site-content.test.ts`

**Interfaces:**
- Produces: `/admin/standards?level=중&subject=수학&q=도수` 목록(코드·원문·검증 배지·쪽수), 행별 [원문 확인] 버튼 → `verifyStandard(id)`가 `verified_at=now(), verified_by=관리자` 저장, [해제]. 검증률 요약(과목별 n/N).

- [ ] Step 1: `actions.ts` — `verifyStandard(id: string, verified: boolean)`: `getSessionProfile()` admin 확인 → `update standards set verified_at, verified_by` → `revalidatePath('/admin/standards')`.
- [ ] Step 2: `page.tsx` — `searchParams`(Promise) 읽기, 필터 폼(GET), 표(코드/원문/쪽/상태), 페이지당 100행, 과목별 검증률. 문구는 `app.adminStandards`.
- [ ] Step 3: 문구 테스트 확장, `npm test`, `npm run build`. 커밋 `feat: 성취기준 검증 화면`.

---

### Task 9: 역사 성취기준 한국사/세계사 재분류

**Files:**
- Create: `scripts/reclassify-history.ts`, `data/standards/README.md`(갱신)
- Test: `tests/history-reclass.test.ts`

**Interfaces:**
- Produces: `classifyHistory(code: string, domainOrText: string): '한국사'|'세계사'` (순수). 규칙: 코드 라벨이 `한사`/`한국사`면 한국사; `역` 라벨은 중학교 역사(2022)에서 `[9역01~06]` 세계사, `[9역07~12]` 한국사 — **이 경계는 별책7의 영역 제목으로 확인해 상수로 둔다**(추측 금지: `[별책7] 사회과 교육과정.pdf`에서 "역사" 내용 체계의 영역 목록을 읽어 코드 범위를 정하고, README에 근거 쪽수를 적는다). 고등 `세계사` 과목 코드는 세계사.
- 스크립트는 `data/standards/한국사.json`을 두 파일 `한국사.json`/`세계사.json`으로 나누고(합 92 유지), DB는 `update standards set subject='세계사' where code in (...)`로 갱신(top-level await 금지).

- [ ] Step 1: 별책7에서 역사 영역 구성 확인(코드 범위 표) → 테스트에 실제 코드 3~4개로 기대값 작성 → 구현 → `npm test`.
- [ ] Step 2: 스크립트 실행은 컨트롤러가 `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/reclassify-history.ts` (마이그레이션 0006 적용 후). `tests/standards-data.test.ts`의 파일 목록에 `세계사.json` 추가. 커밋.

---

## 자체 점검

- 스펙 §2 단계 0~6 → Task 5(프롬프트)·7(실행기) ✅; 단계 7 게시(버전 스냅샷) → 2주차-B(UI와 함께).
- §3 AI 설계(Opus 5, adaptive, 구조화 출력, 캐시, 검토 별도 호출, 비용 로그, refusal 처리, 요청당 1호출) → Task 3·7 ✅.
- §4 데이터(세계사·검증·jsonb·버전·로그) → Task 1·8·9 ✅.
- 재구성 이탈 검사 → Task 4 + 7(2단계 review 선검사) ✅.
- 타입 일관성: `Stage` 0~6, `StageStatus.state` 5종, `Repo` 4메서드, `callStructured` 시그니처를 Task 3·7이 동일하게 사용. fixtureKey 규칙 `stage<n>-generate|review` Task 5·6·7 일치.
- 플레이스홀더: Task 8·9는 코드 대신 명세만 있으나 단순 CRUD/데이터 작업이라 인터페이스로 충분 — 구현자가 Task 7·9(1주차)의 기존 패턴(`app/admin/inquiries`, `scripts/import-standards.ts`)을 따른다.
