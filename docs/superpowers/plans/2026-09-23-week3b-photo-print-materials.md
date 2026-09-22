# 3주차-B 구현 계획 (사진 읽기 · 교재 인쇄 · 공유 자료 AI 생성)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 종이로 수업하는 반도 같은 흐름을 타게 한다 — 원장이 학생용·교사용 교재를 인쇄하고, 걷은 답안지 사진을 올리면 AI가 글자로 읽어 원장이 확인한 뒤 채점으로 넘어간다. 본사는 대주제 공유 자료를 JSON 대신 [생성]→[검토]→[확정]과 표 편집으로 만든다.

**Architecture:** 3A 위에 얹는다. (1) `callStructured`에 이미지 입력을 더해 사진 읽기 호출(`role: 'read'`, sonnet)을 같은 래퍼로 처리하고, 읽은 결과는 원장이 확인한 뒤에야 3A의 `quiz_responses`/`answers`/`gradings` 경로로 들어간다(`source='photo'`). (2) 사진은 비공개 버킷 `answer-photos`에 원별 경로로 저장. (3) 교재는 게시 스냅샷을 순수 함수로 "쪽 구조"로 바꾼 뒤(`lib/print/booklet.ts`, 시험 가능) 인쇄 전용 라우트(`/print/[setId]/student|teacher`, AppShell 없음, `@media print` CSS)가 그린다. (4) 공유 자료 생성은 대주제 소개(0단계)와 같은 생성·검토·확정 실행기(`runThemeMaterials`)를 `themes.materials_status`에 두고, 확정 시 `themes.materials`에 쓴다.

**Tech Stack:** Next.js 16.3 App Router, React 19, Tailwind 4(`@media print`), Supabase Storage(비공개 버킷·정책), `@anthropic-ai/sdk` 이미지 블록, zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-week3-classroom-design.md` §3.6(사진 저장소), §4.6(사진 올리기), §6.2(사진 읽기), §7(교재·인쇄), §8(공유 자료 AI 생성). 3A 계획 `docs/superpowers/plans/2026-09-21-week3a-classroom-core.md`의 인터페이스를 그대로 쓴다.

## Global Constraints

- 문구는 `content/site.ts`(`app.classroom.photo`, `app.print`, `app.studio.materials` 확장)에서만. tsx 한글 리터럴 금지(주석·도메인 값 예외).
- 사진: JPG/PNG/WebP만(Claude 이미지 입력 형식), 장당 10MB, 한 번에 6장까지. 버킷 `answer-photos`는 **비공개**; 경로 `<academy_id>/<assignment_id>/<lesson_no>-<uuid>.<ext>`; 읽기·쓰기 정책은 경로 첫 조각 = `current_academy_id()`인 원장과 admin만.
- 사진 읽기 결과는 DB에 바로 저장하지 않는다. 원장이 [저장·채점]을 눌러야 `quiz_responses(source='photo')`·`answers(source='photo', photo_path, entered_by=원장, submitted_at=now)`·`gradings(pending)`가 생기고 `runGrading`이 돈다. 같은 학생·차시에 이미 앱 입력(퀴즈 또는 제출 답안)이 있으면 덮어쓰지 않고 오류 문구.
- 요청당 AI 호출 1회. 읽기 모델 `MODELS.read = 'claude-sonnet-5'`; fixture 키 `photo-read`(mock이면 이미지 무시하고 fixture 반환).
- 교재는 게시 판 스냅샷(`item_set_versions`)에서만. 표지에 판 표시. 인쇄 라우트는 AppShell 밖(`app/print/...`), `proxy.ts`가 보호하지 않으므로 페이지가 직접 `getSessionProfile`로 teacher/admin만 허용.
- 공유 자료 생성: 확정된 소개(`themes.intro`·`intro_ideas.output`)가 있어야 생성 가능(없으면 `StageError` PREV_NOT_ACCEPTED). 검토는 표 합계·비율 일관성과 학년 어휘를 본다. 확정 시 `themes.materials`(배열)에 저장 — 3A/2B의 읽기 코드(`buildSnapshot`, `loadContext`)는 그대로.
- `.env.local`·키 출력 금지. `git add` 명시 경로. 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 마이그레이션은 파일만.

---

## 파일 구조

```
supabase/migrations/20260924000010_photos_materials.sql   answer-photos 버킷·정책, themes.materials_status (T1)
lib/ai/claude.ts                  (수정) images 입력 → content 블록; MODELS.read (T2)
lib/classroom/photo-rules.ts      사진 업로드 검증(순수) (T3)
lib/classroom/photo-schema.ts     PhotoRead zod (T3)
lib/classroom/photo-prompt.ts     읽기 프롬프트(양식 설명) (T3)
lib/classroom/photo-read.ts       runPhotoRead — 저장소에서 이미지 → callStructured (T3)
data/studio-fixtures/photo-read.json (T3)
app/api/classroom/photos/route.ts     POST 업로드+읽기 (T3)
app/teacher/assignments/[setId]/PhotoIntake.tsx   사진 올리기 → 확인 → 저장·채점 (T4)
app/teacher/assignments/[setId]/actions.ts        (추가) savePhotoIntake (T4)
lib/print/booklet.ts              스냅샷 → 쪽 구조(순수) (T5)
components/print/{Booklet,PrintStyles}.tsx        쪽 렌더러, 인쇄 CSS (T5)
app/print/[setId]/{student,teacher}/page.tsx, app/print/layout.tsx (T5)
app/teacher/items/[setId]/page.tsx, app/admin/items/[themeId]/sets/[setId]/page.tsx  (수정) 인쇄 버튼 (T5)
lib/studio/prompts/theme-materials.ts   생성·검토 프롬프트 (T6)
lib/studio/theme-materials.ts           runThemeMaterials (T6)
lib/studio/repo.ts                      (수정) ThemeRepo.saveThemeMaterials/loadTheme materials_status (T6)
app/api/studio/themes/[id]/materials/route.ts (T6)
app/admin/items/[themeId]/SharedMaterialsPanel.tsx  (재작성) 생성/검토/확정 + 표 편집 + 고급 JSON (T6)
data/studio-fixtures/theme-materials-{generate,review}.json (T6)
content/site.ts, docs/STATUS.md, README.md (각 Task, T7)
tests/photo-rules.test.ts, photo-schema.test.ts, photo-prompt.test.ts, claude-images.test.ts, booklet.test.ts, theme-materials.test.ts
```

---

### Task 1: 마이그레이션 0010 — answer-photos 버킷·정책, themes.materials_status

**Files:**
- Create: `supabase/migrations/20260924000010_photos_materials.sql`
- Modify: `docs/STATUS.md` (대표님 할 일에 0010 적용 한 줄)

**Interfaces:**
- Produces: 버킷 `answer-photos`(비공개), `themes.materials_status jsonb`.

- [ ] **Step 1: SQL**

```sql
-- 3주차-B: 답안 사진(비공개) 버킷과 대주제 공유 자료 생성 상태 (스펙 §3.6, §8)

insert into storage.buckets (id, name, public) values ('answer-photos', 'answer-photos', false)
on conflict (id) do nothing;

-- 경로 규칙: <academy_id>/<assignment_id>/<lesson_no>-<uuid>.<ext>
-- 원장은 자기 원 폴더만, admin 은 전부. 학생은 접근 없음(스펙 §3.6).
create policy answer_photos_teacher_insert on storage.objects for insert
  with check (bucket_id = 'answer-photos' and current_user_role() = 'teacher'
              and (storage.foldername(name))[1] = current_academy_id()::text);
create policy answer_photos_teacher_read on storage.objects for select
  using (bucket_id = 'answer-photos' and current_user_role() = 'teacher'
         and (storage.foldername(name))[1] = current_academy_id()::text);
create policy answer_photos_admin_all on storage.objects for all
  using (bucket_id = 'answer-photos' and current_user_role() = 'admin')
  with check (bucket_id = 'answer-photos' and current_user_role() = 'admin');

-- 공유 자료 생성 상태(소개의 intro_ideas 와 같은 StageStatus 모양). 확정본은 기존 themes.materials(배열)에.
alter table themes add column if not exists materials_status jsonb;
```

- [ ] **Step 2: 정적 점검** — `grep -c "create policy" supabase/migrations/20260924000010_photos_materials.sql` → `3`.

- [ ] **Step 3: STATUS.md** — "3주차-A 완료" 절의 "대표님이 하실 일"에 `- 마이그레이션 0010(답안 사진 버킷·공유 자료 상태) 적용: \`supabase db push\`` 추가.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260924000010_photos_materials.sql docs/STATUS.md
git commit -m "feat: 답안 사진 비공개 버킷·정책과 공유 자료 생성 상태 열 (0010)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: AI 래퍼 이미지 입력 (`callStructured` `images`)

**Files:**
- Modify: `lib/ai/claude.ts`
- Test: `tests/claude-images.test.ts`

**Interfaces:**
- Produces: `MODELS.read = 'claude-sonnet-5'`; `CallInput.images?: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }[]` — 있으면 user 메시지 content가 `[...image blocks, { type: 'text', text: user }]`; mock 모드에서는 무시.

- [ ] **Step 1: 실패 테스트**

```ts
// tests/claude-images.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { callStructured, setClientForTests, MODELS } from '@/lib/ai/claude'

function fakeClient(capture: { params?: unknown }) {
  return {
    messages: {
      stream(params: unknown) {
        capture.params = params
        return {
          on() {},
          async finalMessage() {
            return { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, parsed_output: { text: 'ok' } }
          },
        }
      },
    },
  }
}

describe('callStructured images', () => {
  const prev = { key: process.env.ANTHROPIC_API_KEY, mock: process.env.AI_MOCK }
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key'; process.env.AI_MOCK = '' })
  afterEach(() => { process.env.ANTHROPIC_API_KEY = prev.key; process.env.AI_MOCK = prev.mock; setClientForTests(null) })

  it('puts image blocks before the text in the user message and uses the read model', async () => {
    const cap: { params?: unknown } = {}
    setClientForTests(fakeClient(cap) as never)
    await callStructured({ stage: 9, role: 'read', schema: z.object({ text: z.string() }), system: 'rules', user: 'read this',
      fixtureKey: 'photo-read', images: [{ mediaType: 'image/jpeg', base64: 'AAAA' }] })
    const p = cap.params as { model: string; messages: { content: unknown }[] }
    expect(p.model).toBe(MODELS.read)
    const content = p.messages[0].content as { type: string; source?: { media_type: string; data: string } ; text?: string }[]
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(content[1]).toEqual({ type: 'text', text: 'read this' })
  })

  it('keeps a plain string content when no images are given', async () => {
    const cap: { params?: unknown } = {}
    setClientForTests(fakeClient(cap) as never)
    await callStructured({ stage: 9, role: 'read', schema: z.object({ text: z.string() }), system: 'rules', user: 'hi', fixtureKey: 'photo-read' })
    expect((cap.params as { messages: { content: unknown }[] }).messages[0].content).toBe('hi')
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/claude-images.test.ts` → FAIL (`images` 미지원, `MODELS.read` 없음)

- [ ] **Step 3: 구현** — `lib/ai/claude.ts`:

```ts
export const MODELS = { generate: 'claude-opus-5', review: 'claude-opus-5', grade: 'claude-sonnet-5', read: 'claude-sonnet-5' } as const

export type ImageInput = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }
// CallInput 에 추가:
//   images?: ImageInput[]   // 있으면 user 메시지가 [image..., text] 블록 배열이 된다(사진 읽기). mock 모드에서는 무시.

// request 조립부의 messages 를 다음으로 교체:
const userContent = inp.images?.length
  ? [
      ...inp.images.map(img => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 } })),
      { type: 'text' as const, text: inp.user },
    ]
  : inp.user
// messages: [{ role: 'user' as const, content: userContent }],
```

- [ ] **Step 4: 통과 확인** — `npx vitest run tests/claude-images.test.ts tests/claude-mock.test.ts tests/claude-retry.test.ts` → PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/claude.ts tests/claude-images.test.ts
git commit -m "feat: AI 래퍼 이미지 입력(사진 읽기용)과 read 모델

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 사진 읽기 — 규칙·스키마·프롬프트·실행기·업로드+읽기 라우트

**Files:**
- Create: `lib/classroom/photo-rules.ts`, `lib/classroom/photo-schema.ts`, `lib/classroom/photo-prompt.ts`, `lib/classroom/photo-read.ts`, `data/studio-fixtures/photo-read.json`, `app/api/classroom/photos/route.ts`
- Test: `tests/photo-rules.test.ts`, `tests/photo-schema.test.ts`, `tests/photo-prompt.test.ts`

**Interfaces:**
- Consumes: `callStructured` images(T2), 버킷 `answer-photos`(T1), `Snapshot`, `assessmentItemNoForLesson`(3A).
- Produces: `validatePhoto({ size, type, name })`, `photoPath(academyId, assignmentId, lessonNo, ext)`, `PhotoReadSchema` `{ quiz: string[]; answer: string | null; uncertain: string[] }`, `buildPhotoPrompt({ snapshot, lessonNo })`, `runPhotoRead({ db, snapshot, lessonNo, paths }) → PhotoRead`, 라우트 `POST /api/classroom/photos` (multipart `assignmentId`, `lessonNo`, `file[]`) → `{ paths: string[]; read: PhotoRead }`.

- [ ] **Step 1: 규칙 실패 테스트**

```ts
// tests/photo-rules.test.ts
import { describe, it, expect } from 'vitest'
import { validatePhoto, photoPath, MAX_PHOTOS } from '@/lib/classroom/photo-rules'

describe('validatePhoto', () => {
  it('accepts jpg/png/webp under 10MB and returns ext + mediaType', () => {
    expect(validatePhoto({ size: 1000, type: 'image/jpeg', name: 'a.JPG' })).toEqual({ ok: true, ext: 'jpg', mediaType: 'image/jpeg' })
    expect(validatePhoto({ size: 1000, type: 'image/webp', name: 'a.webp' })).toEqual({ ok: true, ext: 'webp', mediaType: 'image/webp' })
  })
  it('rejects heic, oversize, mismatched ext', () => {
    expect(validatePhoto({ size: 1000, type: 'image/heic', name: 'a.heic' })).toEqual({ ok: false, error: 'invalid_type' })
    expect(validatePhoto({ size: 11 * 1024 * 1024, type: 'image/png', name: 'a.png' })).toEqual({ ok: false, error: 'file_too_large' })
    expect(validatePhoto({ size: 10, type: 'image/png', name: 'a.jpg' })).toEqual({ ok: false, error: 'invalid_type' })
  })
})

describe('photoPath', () => {
  it('builds <academy>/<assignment>/<lesson>-<uuid>.<ext>', () => {
    const p = photoPath('acad', 'asg', 3, 'jpg', 'uuid-1')
    expect(p).toBe('acad/asg/3-uuid-1.jpg')
  })
  it('exposes the batch cap', () => { expect(MAX_PHOTOS).toBe(6) })
})
```

- [ ] **Step 2: 규칙 구현**

```ts
// lib/classroom/photo-rules.ts
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export const MAX_PHOTOS = 6
const EXT_BY_MIME = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] } as const
export type PhotoMediaType = keyof typeof EXT_BY_MIME
export type PhotoRuleError = 'invalid_type' | 'file_too_large'

export function validatePhoto({ size, type, name }: { size: number; type: string; name: string }):
  { ok: true; ext: string; mediaType: PhotoMediaType } | { ok: false; error: PhotoRuleError } {
  const allowed = (EXT_BY_MIME as Record<string, readonly string[]>)[type]
  if (!allowed) return { ok: false, error: 'invalid_type' }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PHOTO_BYTES) return { ok: false, error: 'file_too_large' }
  const raw = name.toLowerCase().split('.').pop() ?? ''
  if (!allowed.includes(raw)) return { ok: false, error: 'invalid_type' }
  return { ok: true, ext: raw === 'jpeg' ? 'jpg' : raw, mediaType: type as PhotoMediaType }
}

export function photoPath(academyId: string, assignmentId: string, lessonNo: number, ext: string, uuid: string): string {
  return `${academyId}/${assignmentId}/${lessonNo}-${uuid}.${ext}`
}
```

- [ ] **Step 3: 스키마·프롬프트 테스트**

```ts
// tests/photo-schema.test.ts
import { describe, it, expect } from 'vitest'
import { PhotoReadSchema } from '@/lib/classroom/photo-schema'
describe('PhotoReadSchema', () => {
  it('accepts quiz answers (0 or 3), nullable answer, uncertain list', () => {
    expect(PhotoReadSchema.safeParse({ quiz: ['③', '상대도수', '①'], answer: null, uncertain: [] }).success).toBe(true)
    expect(PhotoReadSchema.safeParse({ quiz: [], answer: '긴 답안…', uncertain: ['2번 답 흐림'] }).success).toBe(true)
  })
  it('rejects 2 quiz answers', () => {
    expect(PhotoReadSchema.safeParse({ quiz: ['a', 'b'], answer: null, uncertain: [] }).success).toBe(false)
  })
})
```

```ts
// tests/photo-prompt.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildPhotoPrompt, PHOTO_RULES } from '@/lib/classroom/photo-prompt'
import type { Snapshot } from '@/lib/studio/publish'

const lessons = JSON.parse(readFileSync('data/studio-fixtures/stage3-generate.json', 'utf8')).lessons
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons, assessment,
  standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', materials: [], teacher_guide: null, generated_with: { models: [] } } as unknown as Snapshot

describe('buildPhotoPrompt', () => {
  it('describes the lesson form: quiz count/types and whether an answer box exists', () => {
    const p = buildPhotoPrompt({ snapshot, lessonNo: 1 })
    expect(p.system[0]).toBe(PHOTO_RULES)
    expect(p.user).toContain(lessons[0].quiz[0].q)
    expect(p.fixtureKey).toBe('photo-read')
  })
  it('mentions the assessment item stem for a lesson that hosts one', () => {
    const hosted = lessons.find((l: { assessment: string | null }) => l.assessment)
    const p = buildPhotoPrompt({ snapshot, lessonNo: hosted.no })
    expect(p.user).toContain('답안')
  })
})
```

- [ ] **Step 4: 스키마·프롬프트·fixture 구현**

```ts
// lib/classroom/photo-schema.ts
import { z } from 'zod'
export const PhotoReadSchema = z.object({
  quiz: z.array(z.string()).refine((a) => a.length === 0 || a.length === 3, { message: 'quiz must have 0 or 3 answers' }),
  answer: z.string().nullable(),
  uncertain: z.array(z.string()),
})
export type PhotoRead = z.infer<typeof PhotoReadSchema>
```

```ts
// lib/classroom/photo-prompt.ts
import type { Snapshot } from '@/lib/studio/publish'
import { assessmentItemNoForLesson } from './lessons'

/** 고정 규칙(첫 system 블록). 채점하지 않고 글자로만 옮긴다(스펙 §6.2). */
export const PHOTO_RULES = [
  '당신은 학생 답안지 사진을 글자로 옮기는 필사자다. 채점·평가·요약을 하지 않는다. 보이는 그대로 옮긴다.',
  '답안지 양식: 위쪽 머리띠에 "문항 번호 · 이름", 그 아래 마무리 퀴즈 3칸(선택형은 ①②③④ 중 동그라미, 단답형은 밑줄 칸), 그 아래 (있으면) 서술형/논술형 답안 칸.',
  'quiz: 퀴즈 답 3개를 순서대로. 선택형은 동그라미 친 기호(①~④) 하나만, 단답형은 쓴 글자. 퀴즈 칸이 없는 양식이면 빈 배열.',
  'answer: 답안 칸의 글 전체. 줄바꿈은 유지한다. 답안 칸이 없으면 null.',
  'uncertain: 읽기 자신 없는 부분을 "어디 - 왜"로 짧게 나열(예: "퀴즈 2번 - 글씨 흐림"). 없으면 빈 배열.',
  '사진이 흐리거나 답안지가 아니면 quiz는 빈 배열, answer는 null, uncertain에 "다시 찍어 주세요 - 이유"를 넣는다.',
].join('\n')

export function buildPhotoPrompt({ snapshot, lessonNo }: { snapshot: Snapshot; lessonNo: number }) {
  const lesson = snapshot.lessons.find((l) => l.no === lessonNo)
  if (!lesson) throw new Error(`lesson ${lessonNo} not found`)
  const quiz = lesson.quiz.map((q, i) => `${i + 1}. [${q.type === 'choice' ? '선택형' : '단답형'}] ${q.q}${q.choices ? ` (${q.choices.join(' / ')})` : ''}`)
  const itemNo = assessmentItemNoForLesson(snapshot, lessonNo)
  const item = itemNo ? snapshot.assessment?.items[itemNo - 1] : null
  const user = [
    `${snapshot.cover.title} · ${snapshot.cover.subject} · ${lessonNo}차시 답안지`,
    quiz.length ? `이 차시의 퀴즈 3문항:\n${quiz.join('\n')}` : '이 차시에는 퀴즈 칸이 없다(quiz는 빈 배열).',
    item ? `이 차시의 답안 칸(${item.kind}): ${item.stem}` : '이 차시에는 답안 칸이 없다(answer는 null).',
    '사진을 보고 JSON으로 옮겨라.',
  ].join('\n\n')
  return { system: [PHOTO_RULES], user, fixtureKey: 'photo-read' }
}
```

`data/studio-fixtures/photo-read.json`
```json
{ "quiz": ["③", "상대도수", "②"], "answer": "올해 플라스틱컵이 405개로 작년 290개보다 115개 늘었다. 그래서 플라스틱컵을 가장 먼저 줄여야 한다.", "uncertain": ["퀴즈 2번 - 받침 흐림"] }
```

- [ ] **Step 5: 실행기**

```ts
// lib/classroom/photo-read.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { callStructured, type ImageInput } from '@/lib/ai/claude'
import { PhotoReadSchema, type PhotoRead } from './photo-schema'
import { buildPhotoPrompt } from './photo-prompt'
import type { PhotoMediaType } from './photo-rules'
import type { Snapshot } from '@/lib/studio/publish'

const MEDIA_BY_EXT: Record<string, PhotoMediaType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** 저장된 사진들을 내려받아 AI에게 읽힌다. db 는 service role(비공개 버킷). 결과는 저장하지 않는다. */
export async function runPhotoRead({ db, snapshot, lessonNo, paths }: { db: SupabaseClient; snapshot: Snapshot; lessonNo: number; paths: string[] }): Promise<PhotoRead> {
  const images: ImageInput[] = []
  for (const path of paths) {
    const { data, error } = await db.storage.from('answer-photos').download(path)
    if (error || !data) throw new Error(`photo download failed: ${path}`)
    const ext = path.split('.').pop() ?? ''
    const mediaType = MEDIA_BY_EXT[ext]
    if (!mediaType) throw new Error(`unsupported photo ext: ${ext}`)
    images.push({ mediaType, base64: Buffer.from(await data.arrayBuffer()).toString('base64') })
  }
  const p = buildPhotoPrompt({ snapshot, lessonNo })
  const r = await callStructured({ stage: 9, role: 'read', schema: PhotoReadSchema, system: p.system, user: p.user, effort: 'low', fixtureKey: p.fixtureKey, images })
  return r.data
}
```

- [ ] **Step 6: 라우트 (업로드 + 읽기)**

```ts
// app/api/classroom/photos/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { validatePhoto, photoPath, MAX_PHOTOS, MAX_PHOTO_BYTES } from '@/lib/classroom/photo-rules'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { runPhotoRead } from '@/lib/classroom/photo-read'

export const maxDuration = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** multipart: assignmentId, lessonNo, file (여러 개). 원장(자기 원)만. 업로드는 사용자 클라이언트(RLS 경로 검사), 읽기는 service role. */
export async function POST(req: NextRequest) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'teacher' || !s.academyId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_PHOTOS * MAX_PHOTO_BYTES + 1024 * 1024) return NextResponse.json({ error: 'file_too_large' }, { status: 413 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  const assignmentId = String(form.get('assignmentId') ?? '')
  const lessonNo = Number.parseInt(String(form.get('lessonNo') ?? ''), 10)
  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (!UUID_RE.test(assignmentId) || !Number.isInteger(lessonNo) || lessonNo < 1 || files.length === 0) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  if (files.length > MAX_PHOTOS) return NextResponse.json({ error: 'too_many' }, { status: 400 })

  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('id, academy_id, item_set_id, item_set_version').eq('id', assignmentId).maybeSingle()
  if (!a || a.academy_id !== s.academyId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const paths: string[] = []
  for (const f of files) {
    const v = validatePhoto({ size: f.size, type: f.type, name: f.name })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.error === 'file_too_large' ? 413 : 415 })
    const path = photoPath(s.academyId, assignmentId, lessonNo, v.ext, randomUUID())
    const { error } = await supabase.storage.from('answer-photos').upload(path, f, { contentType: f.type, upsert: false })
    if (error) return NextResponse.json({ error: 'upload_failed' }, { status: 400 })
    paths.push(path)
  }
  try {
    const read = await runPhotoRead({ db: createAdminClient(), snapshot, lessonNo, paths })
    return NextResponse.json({ paths, read })
  } catch (e) {
    console.error('[photo read]', e)
    return NextResponse.json({ error: 'internal', paths }, { status: 500 })
  }
}
```

- [ ] **Step 7: 시험** — 세 테스트 파일 PASS; `npx vitest run`; `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add lib/classroom/photo-rules.ts lib/classroom/photo-schema.ts lib/classroom/photo-prompt.ts lib/classroom/photo-read.ts data/studio-fixtures/photo-read.json app/api/classroom/photos/route.ts tests/photo-rules.test.ts tests/photo-schema.test.ts tests/photo-prompt.test.ts
git commit -m "feat: 답안 사진 업로드·AI 읽기 — 규칙·스키마·프롬프트·실행기·라우트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 원장 화면 — 사진 올리기 → 확인·수정 → 저장·채점

**Files:**
- Create: `app/teacher/assignments/[setId]/PhotoIntake.tsx`
- Modify: `app/teacher/assignments/[setId]/actions.ts` (`savePhotoIntake`), `app/teacher/assignments/[setId]/page.tsx` (패널 삽입), `content/site.ts` (`app.classroom.photo`)

**Interfaces:**
- Consumes: 라우트 `POST /api/classroom/photos`(T3), `judgeQuiz`, `assessmentItemNoForLesson`, `runGrading`, `loadAssignmentSnapshot`(3A).
- Produces: `savePhotoIntake(assignmentId, lessonNo, input: { quiz: string[]; answer: string | null; photoPaths: string[] })` → `ActionResult`.

- [ ] **Step 1: 문구** (`app.classroom` 안)

```ts
    photo: {
      heading: '사진으로 올리기',
      hint: '종이 답안지를 찍어 올리면 AI가 글자로 읽어 줍니다. 읽은 내용을 확인·수정한 뒤 [저장·채점]을 누르세요.',
      student: '학생', lesson: '차시', files: '사진(최대 6장, JPG·PNG·WebP, 장당 10MB)',
      upload: '올려서 읽기', uploading: '읽는 중…',
      readHeading: '읽은 내용', quizLabel: (n: number) => `퀴즈 ${n}번`, answerLabel: '답안',
      uncertain: '자신 없는 부분', retake: '흐리거나 답안지가 아니면 다시 찍어 주세요.',
      save: '저장·채점', saving: '저장 중…', saved: '저장했습니다. 채점이 시작됩니다.',
      errors: {
        upload: '사진을 올리지 못했습니다. 크기·형식을 확인하세요.',
        read: '읽지 못했습니다. 다시 찍어 올려 주세요.',
        conflict: '이 학생·차시에는 이미 앱에서 입력한 답이 있습니다. 덮어쓰지 않았습니다.',
        saveFailed: '저장하지 못했습니다.',
      },
    },
```

- [ ] **Step 2: 액션** (`[setId]/actions.ts` 끝에 추가)

```ts
import { judgeQuiz } from '@/lib/classroom/quiz'
import { assessmentItemNoForLesson } from '@/lib/classroom/lessons'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
const photoErrors = app.classroom.photo.errors

export type PhotoIntakeInput = { quiz: string[]; answer: string | null; photoPaths: string[] }

/** 원장이 확인한 읽기 결과를 3A 경로로 넣는다: quiz_responses(source='photo'), answers(source='photo', submitted_at=now), gradings(pending) → runGrading. */
export async function savePhotoIntake(assignmentId: string, lessonNo: number, input: PhotoIntakeInput): Promise<ActionResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('id, academy_id, item_set_id, item_set_version, closed').eq('id', assignmentId).maybeSingle()
  if (!a || a.academy_id !== s.academyId || a.closed) return { ok: false, error: photoErrors.saveFailed }
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  const lesson = snapshot?.lessons.find((l) => l.no === lessonNo)
  if (!snapshot || !lesson) return { ok: false, error: photoErrors.saveFailed }

  // 1) 퀴즈: 이미 응답이 있으면 충돌
  if (lesson.quiz.length > 0 && input.quiz.length === 3) {
    const { count } = await supabase.from('quiz_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', assignmentId).eq('lesson_no', lessonNo)
    if ((count ?? 0) > 0) return { ok: false, error: photoErrors.conflict }
    const rows = lesson.quiz.map((q, i) => ({ assignment_id: assignmentId, lesson_no: lessonNo, quiz_no: i + 1, response: input.quiz[i] ?? '', correct: judgeQuiz(q, input.quiz[i] ?? ''), source: 'photo' as const }))
    const { error } = await supabase.from('quiz_responses').insert(rows)
    if (error) return { ok: false, error: photoErrors.saveFailed }
  }

  // 2) 답안: 그 차시에 문항이 있고 읽은 답안이 있으면 1회차로 제출
  const itemNo = assessmentItemNoForLesson(snapshot, lessonNo)
  if (itemNo && input.answer && input.answer.trim().length > 0) {
    const { data: existing } = await supabase.from('answers').select('id, submitted_at').eq('assignment_id', assignmentId).eq('item_no', itemNo).eq('attempt', 1).maybeSingle()
    if (existing?.submitted_at) return { ok: false, error: photoErrors.conflict }
    const now = new Date().toISOString()
    const { data: ans, error } = await supabase.from('answers').upsert(
      { assignment_id: assignmentId, item_no: itemNo, attempt: 1, body: input.answer, source: 'photo', photo_path: input.photoPaths[0] ?? null, entered_by: s.userId, saved_at: now, submitted_at: now },
      { onConflict: 'assignment_id,item_no,attempt' },
    ).select('id').single()
    if (error || !ans) return { ok: false, error: photoErrors.saveFailed }
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { runGrading } = await import('@/lib/classroom/grade')
    const admin = createAdminClient()
    const { data: g } = await admin.from('gradings').upsert({ answer_id: ans.id, academy_id: a.academy_id, status: 'pending' }, { onConflict: 'answer_id', ignoreDuplicates: true }).select('id').maybeSingle()
    const gradingId = g?.id ?? (await admin.from('gradings').select('id').eq('answer_id', ans.id).single()).data?.id
    if (gradingId) await runGrading({ gradingId, db: admin })
  }
  revalidatePath(`/teacher/assignments/${a.item_set_id}`)
  return { ok: true }
}
```

- [ ] **Step 3: 패널(클라이언트)**

```tsx
// app/teacher/assignments/[setId]/PhotoIntake.tsx
'use client'
import { useState, useTransition } from 'react'
import { savePhotoIntake } from './actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import type { PhotoRead } from '@/lib/classroom/photo-schema'

const copy = app.classroom.photo
type Student = { assignmentId: string; name: string }

export function PhotoIntake({ students, lessons }: { students: Student[]; lessons: { no: number; quizCount: number; hasAnswer: boolean }[] }) {
  const [assignmentId, setAssignmentId] = useState(students[0]?.assignmentId ?? '')
  const [lessonNo, setLessonNo] = useState(lessons[0]?.no ?? 1)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [read, setRead] = useState<PhotoRead | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const lesson = lessons.find((l) => l.no === lessonNo)

  async function upload() {
    setBusy(true); setMsg(null); setRead(null)
    try {
      const fd = new FormData()
      fd.set('assignmentId', assignmentId); fd.set('lessonNo', String(lessonNo))
      for (const f of files) fd.append('file', f)
      const res = await fetch('/api/classroom/photos', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setMsg(res.status === 500 ? copy.errors.read : copy.errors.upload); return }
      setPaths(data.paths); setRead(data.read)
    } catch { setMsg(copy.errors.upload) } finally { setBusy(false) }
  }

  function save() {
    if (!read) return
    start(async () => {
      const r = await savePhotoIntake(assignmentId, lessonNo, { quiz: read.quiz, answer: read.answer, photoPaths: paths })
      setMsg(r.ok ? copy.saved : r.error)
      if (r.ok) { setRead(null); setFiles([]) }
    })
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.hint}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{copy.student}
          <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} className="rounded-xl border border-ink-300 px-3 py-2 font-normal">
            {students.map((s) => <option key={s.assignmentId} value={s.assignmentId}>{s.name}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm font-semibold">{copy.lesson}
          <select value={lessonNo} onChange={(e) => setLessonNo(Number(e.target.value))} className="rounded-xl border border-ink-300 px-3 py-2 font-normal">
            {lessons.map((l) => <option key={l.no} value={l.no}>{app.classroom.student.lessonTab(l.no)}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm font-semibold">{copy.files}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} className="text-sm font-normal" /></label>
      </div>
      <div className="mt-3"><Button type="button" disabled={busy || !files.length || !assignmentId} onClick={upload}>{busy ? copy.uploading : copy.upload}</Button></div>

      {read && lesson && (
        <div className="mt-4 rounded-xl bg-ink-100/50 p-4">
          <p className="font-semibold">{copy.readHeading}</p>
          {lesson.quizCount > 0 && (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <label key={i} className="grid gap-1 text-sm">{copy.quizLabel(i + 1)}
                  <input value={read.quiz[i] ?? ''} onChange={(e) => setRead({ ...read, quiz: Object.assign([...(read.quiz.length === 3 ? read.quiz : ['', '', ''])], { [i]: e.target.value }) })}
                    className={`rounded-lg border px-2 py-1 ${read.uncertain.some((u) => u.includes(String(i + 1))) ? 'border-lemon-400 bg-lemon-50' : 'border-ink-300'}`} />
                </label>
              ))}
            </div>
          )}
          {lesson.hasAnswer && (
            <label className="mt-3 grid gap-1 text-sm">{copy.answerLabel}
              <textarea value={read.answer ?? ''} rows={8} onChange={(e) => setRead({ ...read, answer: e.target.value })}
                className={`rounded-lg border p-2 ${read.uncertain.some((u) => u.includes(copy.answerLabel)) ? 'border-lemon-400 bg-lemon-50' : 'border-ink-300'}`} />
            </label>
          )}
          {read.uncertain.length > 0 && (
            <div className="mt-2 text-sm"><span className="font-semibold">{copy.uncertain}:</span> {read.uncertain.join(' · ')} <span className="text-ink-500">{copy.retake}</span></div>
          )}
          <div className="mt-3"><Button type="button" disabled={pending} onClick={save}>{pending ? copy.saving : copy.save}</Button></div>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-ink-700">{msg}</p>}
    </Card>
  )
}
```

- [ ] **Step 4: 페이지 삽입** — `[setId]/page.tsx`의 `QuizMatrix` 위에:

```tsx
      <div className="mt-6"><PhotoIntake students={students} lessons={snapshot.lessons.map((l) => ({ no: l.no, quizCount: l.quiz.length, hasAnswer: assessmentItemNoForLesson(snapshot, l.no) !== null }))} /></div>
```
(import `PhotoIntake`, `assessmentItemNoForLesson`)

- [ ] **Step 5: 시험** — `npx tsc --noEmit`, `npx vitest run`, 한글 스캔(app/teacher/assignments).

- [ ] **Step 6: Commit**

```bash
git add app/teacher/assignments content/site.ts
git commit -m "feat: 원장 사진 올리기 — AI 읽기 확인 후 퀴즈·답안 저장·채점

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 교재 인쇄 — 쪽 구조(순수) + 인쇄 라우트 + 버튼

**Files:**
- Create: `lib/print/booklet.ts`, `components/print/Booklet.tsx`, `components/print/PrintStyles.tsx`, `app/print/layout.tsx`, `app/print/[setId]/student/page.tsx`, `app/print/[setId]/teacher/page.tsx`
- Modify: `app/teacher/items/[setId]/page.tsx`, `app/admin/items/[themeId]/sets/[setId]/page.tsx` (버튼), `content/site.ts` (`app.print`)
- Test: `tests/booklet.test.ts`

**Interfaces:**
- Produces: `buildBooklet(snapshot, kind: 'student' | 'teacher'): Page[]` where `Page = { key: string; kind: 'cover'|'intro'|'materials'|'lesson'|'assessment'|'guide'|'glossary'; title: string; lessonNo?: number; blocks: Block[] }`, `Block` union (`{ type: 'text'; text }`, `{ type: 'list'; items }`, `{ type: 'table'; columns; rows }`, `{ type: 'chart'; material }`, `{ type: 'quiz'; items; showAnswers }`, `{ type: 'answer-box'; label; lines; itemNo }`, `{ type: 'name-strip'; itemNo? }`, `{ type: 'rubric'; item }`).

- [ ] **Step 1: 문구**

```ts
  print: {
    studentButton: '학생용 교재 인쇄', teacherButton: '교사용 교재 인쇄',
    printNow: '인쇄', back: '← 돌아가기',
    cover: { student: '학생용 교재', teacher: '교사용 교재', name: '이름', klass: '반', date: '날짜', version: (v: number) => `${v}판` },
    sections: { intro: '대주제 소개', keyQuestion: '이 단원의 질문', materials: '자료', lesson: (n: number) => `${n}차시`, quiz: '마무리 퀴즈', answerBox: (label: string, pts: number) => `${label} (${pts}점)`, assessment: '평가', guide: '교사용 지침', glossary: '용어 풀이', rubric: '채점표', boundaries: '등급표', exemplars: '예시 답안', feedback: '피드백 틀', standards: '성취기준', reconstruction: '재구성', goals: '학습 목표' },
    nameStrip: (itemNo: number | null) => (itemNo ? `문항 ${itemNo} · 이름: ______________` : '이름: ______________'),
    lines: { short: 6, extended: 22 },
    answerKey: '정답', explanation: '해설', mergeable: (n: number) => `${n}차시와 병합 가능`,
  },
```

- [ ] **Step 2: 실패 테스트**

```ts
// tests/booklet.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildBooklet } from '@/lib/print/booklet'
import type { Snapshot } from '@/lib/studio/publish'

const lessons = JSON.parse(readFileSync('data/studio-fixtures/stage3-generate.json', 'utf8')).lessons
const materials = JSON.parse(readFileSync('data/studio-fixtures/stage4-generate.json', 'utf8')).materials
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const guide = JSON.parse(readFileSync('data/studio-fixtures/stage6-generate.json', 'utf8'))
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 2, published_at: '' }, standards: [{ code: 'c', text: 't' }], intro: 'i', reconstruction: 'r',
  learning_goals: ['g'], key_question: 'k', lessons, materials, assessment, teacher_guide: guide, generated_with: { models: [] } } as unknown as Snapshot

describe('buildBooklet student', () => {
  const pages = buildBooklet(snapshot, 'student')
  it('starts with cover, intro, materials, then one page per lesson, then assessment', () => {
    expect(pages.map((p) => p.kind).slice(0, 3)).toEqual(['cover', 'intro', 'materials'])
    expect(pages.filter((p) => p.kind === 'lesson').map((p) => p.lessonNo)).toEqual(lessons.map((l: { no: number }) => l.no))
    expect(pages.at(-1)?.kind).toBe('assessment')
  })
  it('quiz blocks hide answers; answer boxes carry a name strip with the item number', () => {
    const lesson = pages.find((p) => p.kind === 'lesson')!
    const quiz = lesson.blocks.find((b) => b.type === 'quiz')
    expect(quiz && quiz.type === 'quiz' && quiz.showAnswers).toBe(false)
    const assess = pages.at(-1)!
    const boxes = assess.blocks.filter((b) => b.type === 'answer-box')
    expect(boxes).toHaveLength(assessment.items.length)
    expect(assess.blocks.some((b) => b.type === 'name-strip')).toBe(true)
  })
  it('does not include rubric or guide pages', () => {
    expect(pages.some((p) => p.kind === 'guide' || p.kind === 'glossary')).toBe(false)
    expect(pages.flatMap((p) => p.blocks).some((b) => b.type === 'rubric')).toBe(false)
  })
})

describe('buildBooklet teacher', () => {
  const pages = buildBooklet(snapshot, 'teacher')
  it('shows quiz answers, rubric blocks, guide and glossary', () => {
    const quiz = pages.find((p) => p.kind === 'lesson')!.blocks.find((b) => b.type === 'quiz')
    expect(quiz && quiz.type === 'quiz' && quiz.showAnswers).toBe(true)
    expect(pages.flatMap((p) => p.blocks).filter((b) => b.type === 'rubric')).toHaveLength(assessment.items.length)
    expect(pages.some((p) => p.kind === 'guide')).toBe(true)
    expect(pages.some((p) => p.kind === 'glossary')).toBe(true)
  })
})
```

- [ ] **Step 3: 구현**

```ts
// lib/print/booklet.ts
import type { Snapshot } from '@/lib/studio/publish'
import { assessmentItemNoForLesson, ASSESSMENT_LABELS } from '@/lib/classroom/lessons'
import { app } from '@/content/site'

type Material = Snapshot['materials'][number]
type QuizItem = Snapshot['lessons'][number]['quiz'][number]
type AssessmentItem = NonNullable<Snapshot['assessment']>['items'][number]

export type Block =
  | { type: 'text'; text: string; heading?: string }
  | { type: 'list'; items: string[]; heading?: string }
  | { type: 'table'; columns: string[]; rows: (string | number)[][]; heading?: string }
  | { type: 'chart'; material: Material }
  | { type: 'quiz'; items: QuizItem[]; showAnswers: boolean }
  | { type: 'answer-box'; label: string; lines: number; itemNo: number; stem: string; conditions: string[] }
  | { type: 'name-strip'; itemNo: number | null }
  | { type: 'rubric'; item: AssessmentItem; itemNo: number }
export type Page = { key: string; kind: 'cover' | 'intro' | 'materials' | 'lesson' | 'assessment' | 'guide' | 'glossary'; title: string; lessonNo?: number; blocks: Block[] }

const c = app.print

function materialBlocks(m: Material): Block[] {
  const out: Block[] = [{ type: 'text', heading: `${c.sections.materials} ${m.id}. ${m.title}`, text: m.body ?? '' }]
  if (m.table) { out.push({ type: 'table', columns: m.table.columns, rows: m.table.rows }); out.push({ type: 'chart', material: m }) }
  return out
}

/** 게시 스냅샷을 인쇄용 쪽 구조로 바꾼다(순수). student = 답 칸·퀴즈(정답 없음), teacher = 정답·채점표·지침. */
export function buildBooklet(snapshot: Snapshot, kind: 'student' | 'teacher'): Page[] {
  const teacher = kind === 'teacher'
  const pages: Page[] = []
  pages.push({ key: 'cover', kind: 'cover', title: snapshot.cover.title, blocks: [
    { type: 'text', text: `${snapshot.cover.subject} · ${snapshot.cover.level} ${snapshot.cover.grade}학년 · ${c.cover.version(snapshot.cover.version)}` },
    ...(teacher ? [{ type: 'list' as const, heading: c.sections.standards, items: snapshot.standards.map((s) => `${s.code} ${s.text}`) },
                   { type: 'text' as const, heading: c.sections.reconstruction, text: snapshot.reconstruction },
                   { type: 'list' as const, heading: c.sections.goals, items: snapshot.learning_goals }] : [{ type: 'name-strip' as const, itemNo: null }]),
  ] })
  pages.push({ key: 'intro', kind: 'intro', title: c.sections.intro, blocks: [{ type: 'text', text: snapshot.intro }, { type: 'text', heading: c.sections.keyQuestion, text: snapshot.key_question }] })
  pages.push({ key: 'materials', kind: 'materials', title: c.sections.materials, blocks: snapshot.materials.flatMap(materialBlocks) })
  for (const l of snapshot.lessons) {
    const blocks: Block[] = [
      { type: 'text', heading: c.sections.keyQuestion, text: l.key_question },
      { type: 'text', text: l.goal },
      ...(teacher ? [{ type: 'list' as const, items: [l.flow.intro, l.flow.main, l.flow.wrapup] }] : []),
      ...(teacher && l.mergeable_with ? [{ type: 'text' as const, text: c.mergeable(l.mergeable_with) }] : []),
    ]
    if (l.quiz.length) blocks.push({ type: 'quiz', items: l.quiz, showAnswers: teacher })
    pages.push({ key: `lesson-${l.no}`, kind: 'lesson', title: c.sections.lesson(l.no), lessonNo: l.no, blocks })
  }
  const a = snapshot.assessment
  if (a) {
    const blocks: Block[] = []
    a.items.forEach((item, i) => {
      const itemNo = i + 1
      const label = ASSESSMENT_LABELS[i] ?? `${item.kind}${itemNo}`
      if (!teacher) blocks.push({ type: 'name-strip', itemNo })
      blocks.push({ type: 'answer-box', label: c.sections.answerBox(label, item.points), lines: item.kind === '논술형' ? c.lines.extended : c.lines.short, itemNo, stem: item.stem,
        conditions: [item.conditions.length, ...item.conditions.required, item.conditions.format] })
      if (teacher) blocks.push({ type: 'rubric', item, itemNo })
    })
    if (teacher) {
      blocks.push({ type: 'table', heading: c.sections.boundaries, columns: ['등급', '점수', '상/중/하'], rows: a.grade_boundaries.map((b) => [b.grade, `${b.min}~${b.max}`, b.band]) })
      blocks.push({ type: 'list', heading: c.sections.exemplars, items: a.exemplars.map((e) => `[${e.level}] ${e.total}점 · ${e.grade}등급\n${e.text}`) })
      blocks.push({ type: 'list', heading: c.sections.feedback, items: [a.feedback_templates.상, a.feedback_templates.중, a.feedback_templates.하] })
    }
    pages.push({ key: 'assessment', kind: 'assessment', title: c.sections.assessment, blocks })
  }
  if (teacher && snapshot.teacher_guide) {
    const g = snapshot.teacher_guide
    pages.push({ key: 'guide', kind: 'guide', title: c.sections.guide, blocks: [
      { type: 'text', text: g.general.purpose }, { type: 'list', items: g.general.materials }, { type: 'text', text: g.general.schedule_note },
      ...g.per_lesson.map((pl) => ({ type: 'list' as const, heading: c.sections.lesson(pl.no), items: pl.notes })),
    ] })
    pages.push({ key: 'glossary', kind: 'glossary', title: c.sections.glossary, blocks: [{ type: 'list', items: g.glossary.map((t) => `${t.term}: ${t.explanation}`) }] })
  }
  void assessmentItemNoForLesson
  return pages
}
```

(마지막 `void assessmentItemNoForLesson`는 지우고 import도 지운다 — 위 코드는 차시 쪽에 답 칸을 두지 않고 평가 쪽에 모은다. 스펙 §7 "평가 문항지" 구조와 일치.)

- [ ] **Step 4: 렌더러와 인쇄 CSS**

```tsx
// components/print/PrintStyles.tsx
export function PrintStyles() {
  return (
    <style>{`
      @page { size: A4; margin: 16mm 14mm; }
      .print-page { page-break-after: always; break-after: page; }
      .print-page:last-child { page-break-after: auto; }
      .print-avoid { break-inside: avoid; page-break-inside: avoid; }
      @media print { .no-print { display: none !important; } body { background: white; } }
      .answer-lines { background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #999 27px, #999 28px); }
      table.print-table { border-collapse: collapse; width: 100%; font-size: 12pt; }
      table.print-table th, table.print-table td { border: 1px solid #333; padding: 4px 8px; }
    `}</style>
  )
}
```

```tsx
// components/print/Booklet.tsx
import type { Page, Block } from '@/lib/print/booklet'
import { Histogram } from '@/components/studio/Histogram'
import { RelativeFreqBars } from '@/components/studio/RelativeFreqBars'
import { app } from '@/content/site'

const c = app.print

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case 'text': return <div className="print-avoid mt-3">{b.heading && <h3 className="font-bold">{b.heading}</h3>}<p className="whitespace-pre-wrap">{b.text}</p></div>
    case 'list': return <div className="print-avoid mt-3">{b.heading && <h3 className="font-bold">{b.heading}</h3>}<ul className="list-disc pl-6">{b.items.map((x, i) => <li key={i} className="whitespace-pre-wrap">{x}</li>)}</ul></div>
    case 'table': return <div className="print-avoid mt-3">{b.heading && <h3 className="font-bold">{b.heading}</h3>}<table className="print-table"><thead><tr>{b.columns.map((col) => <th key={col}>{col}</th>)}</tr></thead><tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === 'number' ? 'text-right' : ''}>{v}</td>)}</tr>)}</tbody></table></div>
    case 'chart': return <div className="print-avoid mt-2">{/* 화면과 같은 자동 그래프. 표 데이터 종류에 따라 Histogram/RelativeFreqBars 를 고르는 로직은 components/studio/PackageView.tsx 의 MaterialChart 와 같아야 한다 — 그 함수를 export 해서 재사용한다. */}</div>
    case 'quiz': return (
      <div className="print-avoid mt-4"><h3 className="font-bold">{c.sections.quiz}</h3>
        <ol className="list-decimal pl-6">{b.items.map((q, i) => (
          <li key={i} className="mt-2"><p>{q.q}</p>
            {q.type === 'choice' ? <p className="mt-1">{(q.choices ?? []).join('   ')}</p> : <p className="mt-1 border-b border-ink-700 pb-4" />}
            {b.showAnswers && <p className="mt-1 text-sm">{c.answerKey}: {q.answer} · {c.explanation}: {q.explanation}</p>}
          </li>))}</ol>
      </div>)
    case 'answer-box': return (
      <div className="print-avoid mt-4"><h3 className="font-bold">{b.label}</h3><p className="mt-1 whitespace-pre-wrap">{b.stem}</p>
        <ul className="list-disc pl-6 text-sm">{b.conditions.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <div className="answer-lines mt-2" style={{ height: `${b.lines * 28}px` }} />
      </div>)
    case 'name-strip': return <div className="mt-2 border-b-2 border-ink-900 pb-1 font-semibold">{c.nameStrip(b.itemNo)}</div>
    case 'rubric': return (
      <div className="print-avoid mt-3"><h3 className="font-bold">{c.sections.rubric}</h3>
        {'criteria' in b.item.rubric
          ? <table className="print-table"><thead><tr><th>요소</th><th>4</th><th>3</th><th>2</th><th>1</th><th>0</th></tr></thead><tbody>{b.item.rubric.criteria.map((cr) => <tr key={cr.name}><td>{cr.name}</td><td>{cr.bands['4']}</td><td>{cr.bands['3']}</td><td>{cr.bands['2']}</td><td>{cr.bands['1']}</td><td>{cr.bands['0']}</td></tr>)}</tbody></table>
          : <ul className="list-disc pl-6">{b.item.rubric.levels.map((l) => <li key={l.points}>{l.points}점 — {l.expectation}{l.example ? ` (예: ${l.example})` : ''}</li>)}</ul>}
      </div>)
  }
}

export function Booklet({ pages, kindLabel }: { pages: Page[]; kindLabel: string }) {
  return (
    <div className="mx-auto max-w-[180mm] text-[12pt] leading-relaxed text-ink-900">
      {pages.map((p, i) => (
        <section key={p.key} className="print-page pt-2">
          {p.kind === 'cover' ? (
            <div className="mt-24 text-center"><p className="text-sm">{kindLabel}</p><h1 className="mt-4 text-3xl font-extrabold">{p.title}</h1>{p.blocks.map((b, j) => <BlockView key={j} b={b} />)}</div>
          ) : (
            <><h2 className="text-xl font-bold">{p.title}</h2>{p.blocks.map((b, j) => <BlockView key={j} b={b} />)}</>
          )}
          <p className="mt-6 text-center text-xs text-ink-500">{i + 1} / {pages.length}</p>
        </section>
      ))}
    </div>
  )
}
```

The 'rubric' table header cells above contain Korean literals ('요소') — replace with `c.sections.rubric` sub-keys: add `rubricColumns: { criterion: '요소' }` to `app.print` and use it. The '예:' prefix likewise → add `example: (s: string) => `(예: ${s})`` to `app.print`.

For the `chart` block: export `MaterialChart` from `components/studio/PackageView.tsx` (add `export` to the existing function) and render `<MaterialChart material={b.material} />`.

- [ ] **Step 5: 인쇄 라우트(AppShell 밖)**

```tsx
// app/print/layout.tsx
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { PrintStyles } from '@/components/print/PrintStyles'

// proxy.ts 는 /print 를 보호하지 않으므로 여기서 직접 막는다: 원장·본사만.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' && s.role !== 'admin') redirect('/login')
  return <div className="bg-white p-6 print:p-0"><PrintStyles />{children}</div>
}
```

```tsx
// app/print/[setId]/student/page.tsx  (teacher/page.tsx 는 kind 만 'teacher' 이고 showAnswers 라벨이 다름)
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildBooklet } from '@/lib/print/booklet'
import { Booklet } from '@/components/print/Booklet'
import { PrintToolbar } from '@/components/print/PrintToolbar'
import type { Snapshot } from '@/lib/studio/publish'
import { app } from '@/content/site'

export default async function StudentBookletPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('item_set_versions').select('snapshot').eq('item_set_id', setId).order('version', { ascending: false }).limit(1).maybeSingle()
  if (!data) notFound()
  const snapshot = data.snapshot as Snapshot
  return (<><PrintToolbar /><Booklet pages={buildBooklet(snapshot, 'student')} kindLabel={app.print.cover.student} /></>)
}
```

```tsx
// components/print/PrintToolbar.tsx
'use client'
import { app } from '@/content/site'
export function PrintToolbar() {
  return (
    <div className="no-print mb-4 flex gap-2">
      <button type="button" onClick={() => window.print()} className="rounded-full bg-mint-500 px-4 py-2 text-sm font-semibold text-white">{app.print.printNow}</button>
      <button type="button" onClick={() => window.history.back()} className="rounded-full bg-ink-100 px-4 py-2 text-sm">{app.print.back}</button>
    </div>
  )
}
```

- [ ] **Step 6: 버튼** — `app/teacher/items/[setId]/page.tsx`의 배정하기 버튼 옆에 `<Button href={`/print/${setId}/student`} variant="ghost">{app.print.studentButton}</Button>` 와 teacher 버튼(둘 다 `target="_blank"`는 `Button`이 Link를 쓰므로 `Link` 직접 사용 가능). `app/admin/items/[themeId]/sets/[setId]/page.tsx`의 미리보기 탭 `PublishPanel` 위에도 같은 두 버튼(게시된 판이 없으면 숨김: `lastVersion` 존재 시).

- [ ] **Step 7: 시험** — `npx vitest run tests/booklet.test.ts` PASS; 전체 suite; `npx tsc --noEmit`; 한글 스캔(`components/print app/print`).

- [ ] **Step 8: Commit**

```bash
git add lib/print/booklet.ts components/print components/studio/PackageView.tsx app/print "app/teacher/items/[setId]/page.tsx" "app/admin/items/[themeId]/sets/[setId]/page.tsx" content/site.ts tests/booklet.test.ts
git commit -m "feat: 학생용·교사용 교재 인쇄 — 쪽 구조·인쇄 라우트·버튼

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 공유 자료 AI 생성 — 실행기·라우트·패널(생성/검토/확정 + 표 편집)

**Files:**
- Create: `lib/studio/prompts/theme-materials.ts`, `lib/studio/theme-materials.ts`, `app/api/studio/themes/[id]/materials/route.ts`, `data/studio-fixtures/theme-materials-generate.json`, `data/studio-fixtures/theme-materials-review.json`
- Modify: `lib/studio/stages.ts` (`ThemeRepo`에 `materials_status` 로드·`saveThemeMaterials`), `lib/studio/repo.ts`, `app/admin/items/[themeId]/SharedMaterialsPanel.tsx`(재작성), `app/admin/items/[themeId]/page.tsx`(props), `content/site.ts` (`app.studio.materials` 확장)
- Test: `tests/theme-materials.test.ts`

**Interfaces:**
- Consumes: `callStructured`, `Materials`·`Review` 스키마, `StageStatus`, `MAX_ATTEMPTS`, `StageError`/`STAGE_ERRORS`(2A/2B), `parseSharedMaterialsInput`(2B).
- Produces: `runThemeMaterials({ themeId, action, repo })` → `{ status: StageStatus }`; `ThemeRepo.loadTheme` returns also `intro: string | null`, `materials_status: StageStatus | null`; `ThemeRepo.saveThemeMaterials(themeId, status, accepted?: Material[])`; 라우트 `POST /api/studio/themes/[id]/materials` `{ action }`.

- [ ] **Step 1: 프롬프트**

```ts
// lib/studio/prompts/theme-materials.ts
import { RULES } from './rules'
import { Review } from '@/lib/studio/schemas'

export type ThemeCtx = { title: string; level: string; grade: number; subjects: string[]; intro: string; subjectIdeas: { subject: string; idea: string }[] }
const LEVEL_NAME: Record<string, string> = { '초': '초등학교', '중': '중학교', '고': '고등학교' }

function header(t: ThemeCtx) {
  return [`대주제: ${t.title}`, `학교급·학년: ${LEVEL_NAME[t.level] ?? t.level} ${t.grade}학년`, `참여 과목: ${t.subjects.join(', ')}`, `확정된 소개: ${t.intro}`,
    '과목별 아이디어:', ...t.subjectIdeas.map((s) => `- ${s.subject}: ${s.idea}`)].join('\n')
}

export function buildThemeMaterialsPrompt(t: ThemeCtx) {
  const user = `${header(t)}\n\n과제: 참여 과목 전체가 함께 쓸 공유 자료 A~D를 만들어라. 표 2~3개(열·행, 합계 행 포함, 합계·비율이 맞아야 함)와 설명글 1~2개(300자 안팎, 학년 어휘). 모든 수치는 가상이며 source는 '자작'. id는 A부터 순서대로. 과목별 아이디어가 이 자료로 실제로 실행될 수 있어야 한다.`
  return { system: RULES, user, fixtureKey: 'theme-materials-generate' }
}

export function buildThemeMaterialsReviewPrompt(t: ThemeCtx, output: unknown) {
  const reviewer = '당신은 검토자다. 표마다 합계 행이 열 값의 합과 맞는지, 비율이 있으면 100%(또는 1.00)가 되는지, 설명글이 학년 어휘인지, 과목별 아이디어를 실행하기에 충분한지 본다. 문제가 없으면 pass=true, 있으면 kind(fidelity|grade_level|coverage|other)와 detail로 나열.'
  const user = `${header(t)}\n\n검토 대상:\n${JSON.stringify(output, null, 1)}`
  return { system: [RULES, reviewer], user, fixtureKey: 'theme-materials-review', schema: Review }
}
```

- [ ] **Step 2: 실행기 + Repo 확장**

`lib/studio/stages.ts`의 `ThemeRepo`를 확장:
```ts
export type ThemeRepo = {
  loadTheme(themeId: string): Promise<{ title: string; level: string; grade: number; subjects: string[]; intro: string | null; intro_ideas: StageStatus | null; materials_status: StageStatus | null }>
  saveThemeIntro(...): Promise<void>  // 기존
  saveThemeMaterials(themeId: string, status: StageStatus, accepted?: unknown[]): Promise<void>
  log(...): Promise<void>            // 기존
}
```
`lib/studio/repo.ts` `createSupabaseThemeRepo`: select에 `intro, materials_status` 추가, `saveThemeMaterials`는 `{ materials_status: status, ...(accepted ? { materials: accepted } : {}) }` update.

```ts
// lib/studio/theme-materials.ts
import type { ZodType } from 'zod'
import { callStructured } from '@/lib/ai/claude'
import { Materials, Review } from './schemas'
import { STAGE_ERRORS, StageError, type StageStatus, type ThemeRepo } from './stages'
import { buildThemeMaterialsPrompt, buildThemeMaterialsReviewPrompt } from './prompts/theme-materials'

const MAX_MATERIALS_ATTEMPTS = 3

/** 대주제 공유 자료: 소개(0단계) 확정 뒤에만 생성. 상태는 themes.materials_status, 확정본은 themes.materials. */
export async function runThemeMaterials({ themeId, action, repo }: { themeId: string; action: 'generate' | 'review' | 'accept'; repo: ThemeRepo }) {
  const theme = await repo.loadTheme(themeId)
  const introOut = theme.intro_ideas?.state === 'accepted' ? (theme.intro_ideas.output as { intro: string; subject_ideas: { subject: string; idea: string }[] } | undefined) : undefined
  if (!introOut) throw new StageError(STAGE_ERRORS.PREV_NOT_ACCEPTED, '대주제 소개를 먼저 확정하세요')
  const ctx = { title: theme.title, level: theme.level, grade: theme.grade, subjects: theme.subjects, intro: introOut.intro, subjectIdeas: introOut.subject_ideas }
  const prev = theme.materials_status ?? { state: 'idle' as const, attempt: 0, updated_at: '' }
  const now = () => new Date().toISOString()

  if (action === 'generate') {
    const attempt = prev.attempt + 1
    const p = buildThemeMaterialsPrompt(ctx)
    try {
      const r = await callStructured({ stage: 7, role: 'generate', schema: Materials as ZodType<unknown>, system: p.system, user: p.user, effort: 'high', fixtureKey: p.fixtureKey,
        log: (e) => repo.log({ themeId, stage: 7, role: 'generate', attempt, ...e }) })
      const status: StageStatus = { state: 'generated', attempt, output: r.data, model: r.model, updated_at: now() }
      await repo.saveThemeMaterials(themeId, status); return { status }
    } catch (e) {
      const status: StageStatus = { state: 'failed', attempt, error: (e as Error).message, updated_at: now() }
      await repo.saveThemeMaterials(themeId, status); return { status }
    }
  }
  const output = prev.output
  if (output === undefined) throw new StageError(STAGE_ERRORS.NOTHING_TO_REVIEW, 'nothing to review: generate first')
  if (action === 'review') {
    const p = buildThemeMaterialsReviewPrompt(ctx, output)
    const r = await callStructured({ stage: 7, role: 'review', schema: Review, system: p.system, user: p.user, fixtureKey: p.fixtureKey,
      log: (e) => repo.log({ themeId, stage: 7, role: 'review', attempt: prev.attempt, ...e }) })
    const exhausted = !r.data.pass && prev.attempt >= MAX_MATERIALS_ATTEMPTS
    const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review: r.data, updated_at: now(), ...(prev.model ? { model: prev.model } : {}), ...(exhausted ? { error: '검토 반복 한도 도달 — 관리자가 직접 수정' } : {}) }
    await repo.saveThemeMaterials(themeId, status); return { status }
  }
  if (prev.state !== 'reviewed' || !prev.review?.pass) throw new StageError(STAGE_ERRORS.ACCEPT_REQUIRES_REVIEW, 'accept requires a passing review')
  const status: StageStatus = { ...prev, state: 'accepted', updated_at: now() }
  await repo.saveThemeMaterials(themeId, status, (output as { materials: unknown[] }).materials)
  return { status }
}
```
(`stage: 7`은 `generation_log.stage`에 기록되는 번호일 뿐이다 — `generation_log.stage`에 check 제약이 있으면 마이그레이션 0010에 `stage between 0 and 9`로 넓히는 문장을 추가한다: 구현자는 `supabase/migrations/20260920000006_studio.sql`에서 확인하고 필요하면 0010에 `alter table generation_log drop constraint …; add constraint …` 추가 후 보고.)

- [ ] **Step 3: fixture** — `theme-materials-generate.json` = `docs/samples/2026-09-20-중1-일회용품-공유자료.json` 내용 그대로(자료 A~D). `theme-materials-review.json` = `{ "pass": true, "issues": [] }` (기존 `stage0-review.json` 모양 확인).

- [ ] **Step 4: 시험**

```ts
// tests/theme-materials.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runThemeMaterials } from '@/lib/studio/theme-materials'
import type { ThemeRepo } from '@/lib/studio/stages'

function fakeRepo(introAccepted: boolean) {
  const saved: unknown[] = []
  const repo: ThemeRepo & { saved: unknown[] } = {
    saved,
    async loadTheme() {
      return { title: 'T', level: '중', grade: 1, subjects: ['수학', '과학'], intro: 'i',
        intro_ideas: introAccepted ? { state: 'accepted', attempt: 1, output: { intro: 'i', subject_ideas: [{ subject: '수학', idea: 'x' }] }, updated_at: '' } : null,
        materials_status: (saved.at(-1) as { status?: never } | undefined) ? (saved.at(-1) as never) : null }
    },
    async saveThemeIntro() {},
    async saveThemeMaterials(_id, status, accepted) { saved.push({ status, accepted }) },
    async log() {},
  }
  return repo
}

describe('runThemeMaterials (mock)', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1' }); afterEach(() => { process.env.AI_MOCK = prev })
  it('refuses when the intro is not accepted', async () => {
    await expect(runThemeMaterials({ themeId: 't', action: 'generate', repo: fakeRepo(false) })).rejects.toMatchObject({ code: 'stage-prev-not-accepted' })
  })
  it('generate → review → accept saves materials array A~D', async () => {
    const repo = fakeRepo(true)
    let r = await runThemeMaterials({ themeId: 't', action: 'generate', repo }); expect(r.status.state).toBe('generated')
    r = await runThemeMaterials({ themeId: 't', action: 'review', repo }); expect(r.status.state).toBe('reviewed')
    r = await runThemeMaterials({ themeId: 't', action: 'accept', repo }); expect(r.status.state).toBe('accepted')
    const last = repo.saved.at(-1) as { accepted: { id: string }[] }
    expect(last.accepted.map((m) => m.id)).toEqual(['A', 'B', 'C', 'D'])
  })
})
```
(The fake repo must return the last saved status from `loadTheme` — implement it by keeping a `current` variable updated in `saveThemeMaterials`; adjust the snippet accordingly.)

- [ ] **Step 5: 라우트** — `app/api/studio/themes/[id]/materials/route.ts`: `app/api/studio/themes/[id]/intro/route.ts`를 복제하되 `runThemeMaterials`를 부르고 GET은 `materials_status`를 돌려준다.

- [ ] **Step 6: 패널 재작성** — `SharedMaterialsPanel.tsx`: 위에 `ThemeIntroPanel`과 같은 상태 배지·[생성][검토][확정] 버튼(라우트 `/api/studio/themes/${themeId}/materials`), 가운데에 **자료별 편집 폼**(현재 표시 대상 = `status.output?.materials ?? initialMaterials`): 제목 input, 종류 select(table/text/chart), 본문 textarea, 표가 있으면 열 이름 input 행 + 셀 input 격자(행 추가/삭제), 이미지 목록은 읽기 전용. [저장]은 기존 `saveSharedMaterials(themeId, JSON.stringify({ materials }))`를 그대로 호출(폼 → JSON 직렬화). 아래에 `<details>`로 "고급: JSON 직접 편집" textarea(기존 동작). 문구 키는 `app.studio.materials`에 추가: `generate/review/accept/busy/stateLabel/mockBadge/editHeading/addRow/removeRow/columns/advanced/needIntro`. 페이지는 `initialMaterials`(배열)와 `initialStatus`(`materials_status`)를 넘긴다.

- [ ] **Step 7: 시험** — `npx vitest run`; `npx tsc --noEmit`; 한글 스캔(`app/admin/items/[themeId]`).

- [ ] **Step 8: Commit**

```bash
git add lib/studio/prompts/theme-materials.ts lib/studio/theme-materials.ts lib/studio/stages.ts lib/studio/repo.ts app/api/studio/themes "app/admin/items/[themeId]/SharedMaterialsPanel.tsx" "app/admin/items/[themeId]/page.tsx" content/site.ts data/studio-fixtures/theme-materials-generate.json data/studio-fixtures/theme-materials-review.json tests/theme-materials.test.ts
git commit -m "feat: 대주제 공유 자료 AI 생성·검토·확정과 표 편집 폼

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 문서·마무리 점검

**Files:**
- Modify: `docs/STATUS.md`, `README.md`

- [ ] **Step 1: STATUS.md** — "3주차-B 완료" 절(3주차-A 절 아래): 새 화면·라우트(`/print/[setId]/student|teacher`, `/api/classroom/photos`, `/api/studio/themes/[id]/materials`), 시연 절차(교재 인쇄 → 종이로 풀기 → 사진 올리기 → 확인 → 저장·채점 → 검수; 본사: 공유 자료 [생성]), 대표님 할 일(0010 `supabase db push`, `git push`), 알려진 한계(사진 6장·10MB·JPG/PNG/WebP, HEIC는 아이폰 설정에서 "호환성 우선"으로; 손글씨 읽기 정확도는 확인 단계로 보완; 교재 디자인판은 발표 뒤). 3주차 손질 목록에서 끝난 항목 제거.
- [ ] **Step 2: README.md** — "종이 수업 시연 절차" 추가.
- [ ] **Step 3: 전체 점검** — `npx vitest run`(개수), `npx tsc --noEmit`, 한글 스캔(app components lib --include tsx).
- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md README.md
git commit -m "docs: 3주차-B 완료 — 사진 읽기·교재·공유 자료 생성 시연 절차

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 실행 뒤 대표님 확인 절차
1. `supabase db push`(0010), `git push`.
2. 본사: 대주제 화면 → 공유 자료 [생성] → [검토] → [확정] → 표 한 칸 고쳐 [저장].
3. 원장: 문항 찾기 → [학생용 교재 인쇄] → PDF 저장 또는 출력 → 3차시 쪽에 손으로 답 쓰기(퀴즈 3개 + 서술형 1).
4. 원장: 배정 현황 → [사진으로 올리기] → 학생·3차시 → 사진 → 읽은 내용 확인 → [저장·채점] → 검수 카드에 "사진" 입력 경로 표시 확인.
5. 실제 키로 손글씨 사진 3장(깨끗함/보통/흐림)을 읽혀 정확도 감 잡기.
