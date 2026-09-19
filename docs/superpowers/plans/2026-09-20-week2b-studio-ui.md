# 2주차-B · 문항 제작소 화면·게시·미리보기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 화면에서 대주제를 만들고, 과목별 세트의 성취기준을 고르고, 2~6단계를 생성→검토→확정하고, 게시(버전 스냅샷)하면, 원장님이 "문항 찾기"에서 패키지 전체(자료 표·자동 그래프·차시·퀴즈·지침서·문항·채점표·등급표·예시답안)를 미리보기로 열 수 있다. API 키가 없어도 가짜 응답 모드로 전 과정이 동작한다.

**Architecture:** 2A의 단계 실행 API(`POST /api/studio/item-sets/:id/stages/:n`)를 클라이언트 훅 `useStageRunner`가 호출하고 결과를 화면에 그린다. 대주제 단위 데이터(참여 과목·소개·공유 자료)는 `themes` 열로 추가하고, 세트 실행 컨텍스트에 공유 자료를 `prior.shared_materials`로 넣는다. 패키지 렌더러 `PackageView`는 관리자 미리보기와 원장 미리보기가 공유한다. 그래프는 자료 표의 숫자에서 SVG로 자동 생성한다. 게시는 서버 액션이 `item_set_versions`에 스냅샷을 쓰고 `item_sets.status='published'`로 바꾼다.

**Tech Stack:** Next.js 16.3 App Router, React 19 (`useActionState`, `useTransition`), Supabase (Storage 포함), zod 4, Vitest. 2A 산출물: `lib/studio/*`, `lib/ai/claude.ts`, `data/studio-fixtures/*`.

**Spec:** `docs/superpowers/specs/2026-09-20-item-studio-design.md` (§1 패키지, §2 단계, §4 데이터, §6 완료 기준). 참고: `.superpowers`에 있던 final-review 권고는 `docs/STATUS.md`의 2B 항목에 요약됨.

## Global Constraints

- 문구는 `content/site.ts`(`app.studio`, `app.teacherItems` 등)에서만. tsx에 한글 리터럴 금지(도메인 값 `SUBJECTS`/`LEVELS`는 예외).
- 승인 게이트는 API가 강제(2A: n-1 확정 전 n 생성 불가). UI는 그 규칙을 보여 줄 뿐 우회하지 않는다.
- 게시 조건: 2~6단계 모두 `accepted` + 연결된 성취기준 전부 `verified_at` 존재 + `key_question` 선택됨. 게시 = `item_set_versions` 스냅샷 + `status='published'` + `version+1`. 게시 후 재게시는 새 버전.
- 원장님은 `status='published'`인 세트만, 그것도 최신 버전 스냅샷만 본다(RLS가 이미 보장).
- 요청당 AI 호출 1회. "기본값으로 진행"은 클라이언트가 generate→review→accept를 순서대로 호출.
- 가짜 응답(`model: 'mock'`)은 화면에 배지로 표시.
- 그래프는 데이터에서만 그린다(사람이 그린 그림 금지). 이미지 첨부는 삽화·도식 용도.
- 학년 규칙: 세트는 대주제의 학년을 물려받는다. 세트 과목은 대주제 `subjects` 안에서만.
- `.env.local`·키 출력 금지, `git add` 명시 경로, 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 마이그레이션은 파일만(적용은 대표님 터미널).

---

## 파일 구조

```
supabase/migrations/20260921000008_studio_ui.sql   themes.subjects/intro_ideas/materials, storage bucket, 정책
lib/studio/themes.ts            대주제 스키마·검증(순수) + 세트 생성 규칙
lib/studio/publish.ts           게시 가능 여부 판정(순수) + 스냅샷 조립
lib/studio/charts.ts            히스토그램 계급/상대도수 계산(순수)
lib/studio/repo.ts              (수정) loadContext에 shared_materials·theme.subjects, ctx.outputs에 stage0/1
lib/studio/stages.ts            (수정) 0단계는 theme 단위 실행 함수 runThemeIntro
app/api/studio/themes/[id]/intro/route.ts   0단계 실행 (POST)
app/admin/items/page.tsx, new/page.tsx, actions.ts                 대주제 목록·생성
app/admin/items/[themeId]/page.tsx, actions.ts                     대주제 상세: 소개 생성/확정, 공유 자료, 세트 목록·생성
app/admin/items/[themeId]/StandardsPicker.tsx                      1단계: 소단원/성취기준 선택(검증 배지)
app/admin/items/[themeId]/sets/[setId]/page.tsx, actions.ts        세트 마법사(2~6) + 게시
app/admin/items/[themeId]/sets/[setId]/StageWizard.tsx             클라이언트: 단계 패널, 생성/검토/확정, 기본값 진행, JSON 편집
app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts
app/admin/items/[themeId]/sets/[setId]/Attachments.tsx             이미지 업로드(스토리지)
components/studio/PackageView.tsx                                  패키지 렌더러(공용)
components/studio/Histogram.tsx, RelativeFreqBars.tsx              SVG 그래프
app/teacher/items/page.tsx, [setId]/page.tsx                       원장 문항 찾기·미리보기
content/site.ts                 app.studio, app.teacherItems 문구
tests/themes.test.ts, publish.test.ts, charts.test.ts, stage-runner.test.ts, site-content.test.ts(확장)
```

---

### Task 1: 마이그레이션 0008 — 대주제 열·스토리지

**Files:** Create `supabase/migrations/20260921000008_studio_ui.sql`

**Interfaces:** `themes.subjects text[] not null default '{}'`, `themes.intro_ideas jsonb`, `themes.materials jsonb`, `themes.updated_at`; storage bucket `materials`(public read); `item_sets` unique `(theme_id, subject)`.

- [ ] SQL:
```sql
alter table themes
  add column if not exists subjects text[] not null default '{}',
  add column if not exists intro_ideas jsonb,
  add column if not exists materials jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists item_sets_theme_subject_uniq on item_sets(theme_id, subject);

insert into storage.buckets (id, name, public) values ('materials', 'materials', true)
  on conflict (id) do nothing;

create policy materials_admin_write on storage.objects for insert
  with check (bucket_id = 'materials' and current_user_role() = 'admin');
create policy materials_admin_update on storage.objects for update
  using (bucket_id = 'materials' and current_user_role() = 'admin');
create policy materials_admin_delete on storage.objects for delete
  using (bucket_id = 'materials' and current_user_role() = 'admin');
create policy materials_public_read on storage.objects for select
  using (bucket_id = 'materials');
```
- [ ] 정적 점검(참조 이름 존재), 커밋 `feat: 제작소 UI 스키마 — 대주제 과목·소개·공유 자료, 스토리지`.

---

### Task 2: 대주제·세트 생성 규칙(순수) + 서버 액션

**Files:** Create `lib/studio/themes.ts`, `tests/themes.test.ts`, `app/admin/items/actions.ts`, `app/admin/items/[themeId]/actions.ts`

**Interfaces:**
- `parseTheme(formData)` → `{ ok, data: { title, level: '초'|'중'|'고', grade: number, subjects: Subject[] } | error }` — 학년 범위 초 1~6, 중 1~3, 고 1~3; 과목 1개 이상, `SUBJECTS` 안.
- `canCreateSet(theme, subject, existingSubjects)` → `{ ok, reason? }` — 과목이 theme.subjects에 있고 중복 아님.
- `validateStandardSelection(standards: {code, level, subject, verified}[], theme)` → `{ ok, issues[] }` — 2~6개, 모두 theme.level·subject 일치. (검증 여부는 게시 때 검사, 여기서는 경고만 `warnings[]`.)
- 액션: `createTheme`, `createItemSet(themeId, subject, standardIds[])`(item_sets insert + item_set_standards insert + `stage_status.stage1 = {state:'accepted', output:{selected: codes}}`), `acceptThemeIntro(themeId, intro, ideas)`, `saveSharedMaterials(themeId, materialsJson)`(zod `Materials`로 검증).

- [ ] 테스트 먼저(학년 범위, 과목 중복, 선택 2~6·학년/과목 불일치) → 구현 → `npm test`.
- [ ] 액션은 `getSessionProfile()` admin 확인 후 DB. 커밋 `feat: 대주제·세트 생성 규칙과 액션`.

---

### Task 3: 0단계(대주제 소개) 실행 + 공유 자료 컨텍스트

**Files:** Modify `lib/studio/stages.ts`(추가 `runThemeIntro`), `lib/studio/repo.ts`, Create `app/api/studio/themes/[id]/intro/route.ts`, Test `tests/stage-runner.test.ts`(확장)

**Interfaces:**
- `runThemeIntro({ themeId, action:'generate'|'review'|'accept', repo })` — `buildPrompt(0, ctx)`에 `ctx.theme.subjects`(실제 열) 사용; 결과는 `themes.intro_ideas`(생성/검토 상태 포함)와 확정 시 `themes.intro`.
- `repo.loadContext(itemSetId)`: `theme.subjects` = `themes.subjects`; `prior.shared_materials = themes.materials`(있을 때); `outputs[0] = themes.intro_ideas?.output`, `outputs[1] = stage_status.stage1.output`.
- 라우트: 관리자 401/403, `{action}` 검증, `maxDuration = 300`.

- [ ] fake repo에 `themes` 저장소를 추가해 generate→accept를 테스트, `shared_materials`가 4단계 prior에 포함되는지 테스트 → 구현 → build. 커밋 `feat: 대주제 소개 단계와 공유 자료 컨텍스트`.

---

### Task 4: 관리자 화면 — 대주제 목록/생성/상세 + 성취기준 선택(1단계)

**Files:** Create `app/admin/items/page.tsx`, `app/admin/items/new/page.tsx`(+`ThemeForm.tsx`), `app/admin/items/[themeId]/page.tsx`, `app/admin/items/[themeId]/StandardsPicker.tsx`, `app/admin/items/[themeId]/ThemeIntroPanel.tsx`, Modify `content/site.ts`(`app.studio.*`), `tests/site-content.test.ts`

**Interfaces / 화면:**
- `/admin/items`: 대주제 표(제목·학교급/학년·과목·세트 수·게시 수) + [새 대주제]. (기존 준비 중 페이지 대체.)
- `/admin/items/new`: 제목, 학교급, 학년, 과목 체크박스(`SUBJECTS`) → `createTheme`.
- `/admin/items/[themeId]`: ① 소개(`ThemeIntroPanel` — [생성][검토][확정], 결과 텍스트 편집 가능, mock 배지) ② 공유 자료(JSON 텍스트영역 + `Materials` 검증 오류 표시; 2A 스키마 그대로) ③ 세트 목록(과목별: 상태·단계 진행 바 `2/6 확정`·[열기]) ④ 세트 만들기: 과목 선택 → `StandardsPicker`(서버에서 `standards` 해당 level·subject를 domain별로 묶어 전달; 검색; 체크 2~6개; 검증 배지; 미검증 선택 시 경고 문구) → `createItemSet`.
- 문구 키: `app.studio.{themes,newTheme,theme,intro,materials,sets,picker}` 아래에 정의.

- [ ] 구현 → `npm run build` 라우트 3개 확인 → 문구 테스트 → 커밋 `feat: 제작소 대주제 화면과 성취기준 선택`.

---

### Task 5: 세트 마법사(2~6단계) — 훅·패널·기본값 진행·JSON 편집

**Files:** Create `app/admin/items/[themeId]/sets/[setId]/page.tsx`, `StageWizard.tsx`, `useStageRunner.ts`, `actions.ts`(`saveStageEdit(setId, stage, json)`, `chooseKeyQuestion(setId, q)`), Test `tests/stage-runner.test.ts`(훅의 순수 부분: 다음 행동 계산)

**Interfaces:**
- `nextAction(status: StageStatus|undefined): 'generate'|'review'|'accept'|'done'|'edit'` (순수): idle/failed→generate, generated→review, reviewed&pass→accept, reviewed&!pass→(attempt<max? generate : edit), accepted→done.
- `useStageRunner(setId)`: 상태 맵 로드(GET), `run(stage, action)`, `runDefaults(fromStage)`(2→6까지 nextAction을 따라 순차 호출, 실패 시 중단), `busy`, `error`.
- `StageWizard`: 단계 탭(2 재구성·목표·핵심질문 / 3 차시 / 4 자료 / 5 평가 / 6 지침서), 각 패널: 상태 배지(idle/생성됨/검토됨 ✓|✗/확정/실패, mock 배지, attempt), 출력 렌더(각 단계 전용 간단 렌더 — 표·목록), [JSON 편집] 토글(textarea → `saveStageEdit`가 zod로 검증 후 저장하고 상태를 `generated`로 되돌림), 검토 이슈 목록, 버튼 [생성][검토][확정], 상단 [기본값으로 진행].
- 2단계 확정 후: 핵심질문 후보 라디오 → `chooseKeyQuestion`(`item_sets.key_question`).
- 4단계 패널에 Task 7의 `Attachments` 자리.

- [ ] `nextAction` 테스트 → 훅/컴포넌트 구현 → build → 커밋 `feat: 세트 마법사(2~6단계)`.

---

### Task 6: 그래프 자동 생성

**Files:** Create `lib/studio/charts.ts`, `components/studio/Histogram.tsx`, `components/studio/RelativeFreqBars.tsx`, Test `tests/charts.test.ts`

**Interfaces (순수):**
```ts
export function histogramBins(values: number[], binSize: number, start?: number): { from: number; to: number; count: number }[]
export function relativeFrequencies(rows: { label: string; counts: number[] }[]): { label: string; rel: number[] }[] // 열별 합으로 나눔, 소수 둘째 자리
export function detectChart(material: Material): { kind: 'histogram'; values: number[]; binSize: number } | { kind: 'relbars'; ... } | null
```
`detectChart` 규칙: 표에 숫자 열이 하나이고 행이 10개 이상이면 histogram(계급 크기 10); 첫 열이 문자열, 숫자 열 2개 이상이면 relbars. 아니면 null.
- 테스트: 샘플 자료 A(20값) → 계급 6개 도수 1/3/6/5/4/1; 자료 B → 플라스틱컵 0.24/0.30.
- SVG 컴포넌트: 서버 컴포넌트(클라이언트 JS 없음), 축 눈금·라벨, 폭 600 높이 320, 접근성 `<title>`.
- [ ] TDD → 커밋 `feat: 자료 표에서 히스토그램·상대도수 그래프 자동 생성`.

---

### Task 7: 이미지 첨부(스토리지)

**Files:** Create `app/admin/items/[themeId]/sets/[setId]/Attachments.tsx`, `app/api/studio/upload/route.ts`, Modify `lib/studio/schemas.ts`(`Material.images: z.array(z.string().url()).default([])`, `Lesson.images` 동일) — 기본값이 있어 기존 fixture/테스트 유지

**Interfaces:** `POST /api/studio/upload` (multipart: file, setId, target `material:A`|`lesson:3`) → 관리자만, 5MB·png/jpg/webp 제한, 경로 `sets/<setId>/<target>/<uuid>.<ext>` → public URL 반환; 서버 액션 `attachImage(setId, target, url)`가 해당 jsonb 배열에 추가(스키마 재검증), `detachImage`.
- [ ] 스키마 테스트(기본값) → 구현 → build → 커밋 `feat: 자료·차시 이미지 첨부`.

---

### Task 8: 게시(버전 스냅샷) + 패키지 렌더러 + 원장 미리보기

**Files:** Create `lib/studio/publish.ts`, `tests/publish.test.ts`, `components/studio/PackageView.tsx`, `app/teacher/items/page.tsx`, `app/teacher/items/[setId]/page.tsx`, Modify `app/admin/items/[themeId]/sets/[setId]/actions.ts`(`publishItemSet`), `content/site.ts`(`app.teacherItems`, `app.studio.publish`)

**Interfaces:**
- `canPublish({ statuses, standards: {verified: boolean}[], keyQuestion })` → `{ ok, blockers: string[] }`(순수; 문구 키 반환).
- `buildSnapshot(theme, itemSet, standards)` → `{ cover, standards, reconstruction, learning_goals, key_question, lessons, materials (theme.materials + set materials 병합, id 충돌 시 세트 우선), assessment, teacher_guide, generated_with: {models} }`.
- `publishItemSet(setId)`: admin → canPublish → `version = item_sets.version + 1` → `item_set_versions` insert → `item_sets` update `{status:'published', version, published_at}` → revalidate.
- `PackageView({ snapshot, mode: 'admin'|'teacher', showAnswers })`: 스펙 §1 순서로 섹션 렌더; 자료 표 + `detectChart`로 그래프; 차시 퀴즈 정답·해설은 토글; 채점표·등급표 표; 예시답안; 피드백 틀; 지침서. 원장 모드는 `generated_with` 숨김.
- `/teacher/items`: 게시 세트 목록(대주제/학교급·학년/과목 필터, 카드) — RLS로 published만. `/teacher/items/[setId]`: 최신 버전 스냅샷 → `PackageView`.
- 관리자 세트 페이지에 [미리보기] 탭(현재 초안으로 `buildSnapshot`) + [게시] 버튼(차단 사유 표시).
- [ ] `canPublish`·`buildSnapshot` 테스트 → 구현 → build 라우트 확인 → 커밋 `feat: 게시·버전 스냅샷과 원장 미리보기`.

---

### Task 9: 마무리 — 오류 매핑·문서

**Files:** Modify `app/api/studio/item-sets/[id]/stages/[stage]/route.ts`(runStage 오류를 400 JSON `{error}`로), `README.md`, `docs/STATUS.md`

- [ ] 라우트 try/catch: 알려진 메시지(`must be accepted`, `성취기준이 2개`, `nothing to review`, `accept requires`)는 400, 그 외 500 로그. STATUS.md에 2B 완료 상태·시연 절차(대주제 생성 → 세트 → 기본값 진행 → 게시 → 원장 로그인 확인). 커밋 `docs: 2주차-B 상태·시연 절차`.

---

## 자체 점검
- 스펙 §2 단계 0~7: 0(T3), 1(T4 수동 선택), 2~6(T5), 7 게시(T8) ✅. "기본값으로 진행" T5 ✅.
- §1 자료: 공유 자료(T2·T3·T8 병합), 자동 그래프(T6), 이미지 슬롯(T7) ✅. 검증된 성취기준만 게시(T8 canPublish) ✅. key_question 선택(T5) ✅.
- §6 완료 기준 1~5: 제작소에서 게시(T4·T5·T8), 원문 이탈(2A), 원장 화면(T8), 검증·세계사(2A+T8), 4과목 기본값 진행(T5) ✅.
- 타입: `StageStatus`(2A) 그대로 사용; `Material`/`Lesson`에 `images` 기본값 추가만(T7). `nextAction` 규칙은 2A의 `MAX_ATTEMPTS`(5단계 3회)와 일치하도록 `max` 인자로 전달.
