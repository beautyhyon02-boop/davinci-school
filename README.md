# 다빈치스쿨 웹 플랫폼

탐구보고서 교육과 서논술형 수업을 위한 통합 플랫폼. 가맹원 관리, 원장/교사 대시보드, 학생 학습 기록 시스템.

## 기술 스택

- **프론트엔드:** Next.js 16, React 19, Tailwind CSS 4
- **백엔드:** Supabase (PostgreSQL + Auth)
- **이메일:** Resend
- **테스트:** Vitest, pytest

## 라우트 개요

- `/` — 공개 홈페이지
- `/login` — 사용자 로그인 (역할은 세 가지: 관리자/원장/학생)
- `/admin/*` — 관리자 (가맹원·계정 관리, 가맹문의 수신 등)
- `/teacher/*` — 원장 대시보드
- `/student/*` — 학생 화면
- `/franchise` — 가맹문의 양식
- `/programs/*` — 프로그램 상세 페이지

## 로컬 실행

### 1단계: 의존성 설치

```bash
npm install
```

### 2단계: 환경 변수 설정

`.env.example`을 복사하여 `.env.local`을 만들고, 다음 5개 키를 입력하세요:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — 공개 API 키
- `SUPABASE_SERVICE_ROLE_KEY` — 서비스 역할 키 (운영 스크립트)
- `RESEND_API_KEY` — Resend 이메일 API 키
- `INQUIRY_NOTIFY_EMAIL` — 가맹문의 수신 메일 (기본값: davincischooloffice@gmail.com)

**주의:** `.env.local`은 절대 커밋하지 마세요. (`.gitignore`에 등록됨)

### 3단계: 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인하세요.

## 데이터베이스 초기화

로컬 Supabase CLI를 사용하려면:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`<your-project-ref>`는 Supabase 대시보드 → Project Settings → General 의 **Reference ID** 입니다.
(`supabase/config.toml`의 `project_id = "davinci-school"`는 로컬 라벨일 뿐, 프로젝트 ref가 아닙니다.)  
`supabase/migrations/` 폴더의 마이그레이션이 순서대로 적용됩니다. 새 마이그레이션을 추가한 뒤에도 같은 `db push`를 다시 실행하면 됩니다.

주요 마이그레이션(발췌): `20260918000001_schema.sql`(기본 스키마) · `20260919000004_role_in_app_metadata.sql`(역할 저장 위치) · `20260920000006_studio.sql`/`20260920000007_studio_fixes.sql`(제작소 v1) · `20260921000008_studio_ui.sql`(대주제 공유 자료) · `20260922000009_classroom.sql`(수업 운영: 배정·채점·퀴즈) · `20260925000011_studio_v2.sql`(제작소 v2: `item_sets.unit_plan/reconstruction_detail/notice_plan` 열 + 학생별 안내장 표 `lesson_notices`). 다시 실행해도 안전합니다(열·표·정책 모두 "있으면 건너뜀").

> **역할 저장 위치:** 계정의 `role`/`academy_id`/`login_id`는 `auth.users`의 **app_metadata**에 저장됩니다
> (service role 키로만 수정 가능). `user_metadata`에는 이름만 둡니다.
> 마이그레이션 `20260919000004` 이전에 만든 계정은 아래 "운영 체크리스트"의 백필 스크립트로 옮겨야 합니다.

## 성취기준 데이터 투입

### PDF 추출

```bash
python scripts/extract_standards.py "<pdf-path>" <과목> data/standards/<과목>.json
```

예시:
```bash
python scripts/extract_standards.py "C:/path/to/[별책5] 국어과.pdf" 국어 data/standards/국어.json
```

자세한 내용은 `data/standards/README.md`를 참고하세요.

### DB에 저장

```bash
npx dotenv -e .env.local -- npx tsx scripts/import-standards.ts
```

또는 Node.js 20+ 환경에서:
```bash
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/import-standards.ts
```

## 관리자 계정 생성

관리자 계정은 이 스크립트로만 만듭니다(공개 가입은 꺼 둡니다). 역할은 `app_metadata`에 기록됩니다.

```bash
npx dotenv -e .env.local -- npx tsx scripts/create-admin.ts <이메일> <비밀번호> [이름]
```

예시:
```bash
npx dotenv -e .env.local -- npx tsx scripts/create-admin.ts admin@example.com MySecurePass "관리자"
```

## 테스트

### TypeScript/React 테스트 (Vitest)

```bash
npm test
npm run test:watch      # 감시 모드
```

### Python 성취기준 파서 테스트

```bash
python -m pytest tests/extract_standards_test.py -q
```

## 제작소 시연 절차 (v2)

문항 제작소를 시연할 때는 다음 순서로 보여 주세요. 단계는 0~7까지 있고(7 = 차시별 피드백 안내장 틀), **게시하려면 2~7단계가 모두 확정**돼야 합니다. 5과목(국·영·수·과·사) 실제 생성의 자세한 순서는 `docs/runbooks/2026-09-29-five-subjects.md`를 참고하세요.

1. **관리자**로 로그인
2. `/admin/items` → 대주제 생성 → 소개(0단계) 생성 → 검토 → 확정
3. 대주제 화면에서 공유 자료(A~D) 작성
4. `/admin/standards`에서 사용할 성취기준의 원문 확인 체크(검증 안 된 성취기준은 게시가 막힙니다)
5. 성취기준 선택으로 세트 생성
6. 세트 마법사에서 2~7단계를 순서대로 [생성]→[검토]→[다음](=확정). 검토는 항상 정적 검사([TS])가 먼저 돌고 통과해야 AI 검토로 넘어갑니다. 반복 한도는 단계마다 3회이고, 넘으면 [JSON 편집]으로 직접 고칩니다. **단계를 편집하면 그 뒤 단계(7단계까지)가 전부 다시 만들어야 하는 상태로 돌아갑니다.**
7. 핵심질문 선택
8. 미리보기(패키지 화면)로 지도안·문항 카드·안내장 틀을 확인 후 게시

**세트 구조(대표님 2026-09-26)**: 교수 차시 1~5개(차시마다 이해 점검 퀴즈 3문항) + 마지막 교수 차시 뒤 **단원 평가 차시**(서술형 15분 + 논술형 35분, 퀴즈 없음). 세트 끝 평가는 서술형 1문항(6점) + 논술형 1문항(16점) = 22점(배점은 본사 가정), 두 문항 모두 분석적 + 총체적 채점표. 구조의 숫자는 `lib/studio/assessment-structure.ts` 한 곳에 있다(스키마·[TS] 검사·프롬프트·채점·fixture가 모두 여기서 읽는다). 이전 구조(서술형 3점 × 2 + 논술형)로 게시된 판은 그대로 보이고 채점된다.
9. **원장** 계정으로 로그인 → `/teacher/items`에서 문항(세트) 찾기 → 열어서 정답이 접혀 있는지 확인

## 제작소 지식 베이스·규칙·가짜 응답 모드 (v2)

- **성취수준·예시 은행·서식 파일**(파일 기반, DB 적재는 발표 뒤 — 스펙 §6.2):
  - `data/reference/levels/<과목>-<초|중>.json` — 성취기준 코드별 A~E(또는 A~C) 성취수준 문장. `lib/reference/levels.ts`가 코드로 조회한다.
  - `data/reference/exemplars/<교과>/*.json` — 실제 문항·채점기준 예시 은행(539건). `lib/reference/exemplars.ts`가 점수·폴백 규칙으로 골라 압축 카드를 만든다.
  - `data/reference/templates/*.json` — 지도안·안내장 서식.
- **프롬프트 규칙**: `lib/studio/prompts/rules/`(공통 `common.ts`, 차시 `lesson.ts`, 채점 `grading.ts`, 안내장 `notice.ts`, 과목별 `subjects/{국어,영어,수학,과학,사회,역사}.ts`). 규칙 ID(C-/L-/S-/G-/N-)는 스펙 부록 A와 1:1로 대응한다. 규칙을 고치면 이미 확정된 단계에는 반영되지 않으므로 2단계부터 다시 생성해야 한다.
- **가짜 응답(mock) 모드 v2**: `data/studio-fixtures/`는 중1 **수학**(성취기준 9수04-02·03·04)과 **과학**(9과01-01·9과01-03) 세트만 0~7단계 전부 갖추고 있다. 국·영·사·역사는 fixture가 없으므로 실제 키로 생성해야 한다(자세한 규칙은 `data/studio-fixtures/README.md`). fixture는 손으로 고치지 않고 `scripts/upgrade-fixtures-v2.ts`의 `PATCHES`에 이유와 함께 적은 뒤 다시 실행한다(`npx tsx scripts/upgrade-fixtures-v2.ts`) — 재실행 결과가 기존 파일과 바이트 단위로 같아야 한다.

## 수업 운영 시연 절차

학생 배정·채점·검수 흐름(3주차-A)을 시연할 때는 다음 순서로 보여 주세요.
가짜 응답(mock) 수학 세트는 **1~5차시 = 교수 차시(퀴즈 3문항씩)**, **6차시 = 단원 평가(서술형 + 논술형)**입니다.

1. **원장**으로 로그인
2. `/teacher/students` → 학생 2명 추가 (초기 비밀번호 저장)
3. `/teacher/items` → 수학 세트 열기 → [배정하기] → 학생 선택 → "처음 열 차시 수" 2 → "재도전 허용" 체크 → 배정
4. **학생** 계정으로 로그인(첫 번째 학생)
5. `/student` → 배정된 세트 열기 → 1차시 퀴즈 제출 → 즉시 결과 확인 → 2차시 퀴즈 제출
6. **원장** 계정으로 로그인
7. `/teacher/assignments` → 세트 [열기] (`/teacher/assignments/[setId]`) → "차시 열기"에서 "6차시까지 열기" 선택 → [반 전체에 적용]
8. **학생** 계정으로 로그인(첫 번째 학생) → 3~5차시 퀴즈 → "6차시 · 단원 평가" 탭에서 서술형·논술형 답안 60자 이상 제출 → "확인 중" 상태 확인
9. **원장** 계정으로 로그인 → 서술형·논술형 검수 대기 카드 → 점수 확인·수정 → 확정
10. 두 문항이 모두 확정되면 학생 화면·원장 화면에 종합 점수(22점 만점)·등급이 나옵니다
11. 배정 상세의 "안내장 6차시" → 초안 만들기 → 서술형·논술형 결과 칸 확인 → 확정 → 인쇄
12. **학생** 계정으로 로그인(첫 번째 학생) → 결과 확인 → [다시 써 보기] → 2회차 제출
13. **원장** 계정으로 로그인 → 2회차 확정
14. **학생** 계정으로 로그인(첫 번째 학생) → 1회차·2회차 비교 확인

## 홈페이지 문구 수정

모든 공개 페이지의 텍스트는 `content/site.ts` 한 파일에서 관리됩니다.  
섹션별 제목, 설명, 통계, 프로그램 정보 등을 이곳에서 수정하세요.

## 배포 (Vercel)

### 전제 조건

- GitHub 비공개 저장소 준비 (이 프로젝트를 push)
- Vercel 계정

### 배포 절차

0. **Supabase 공개 가입 끄기** (대표님, 가장 먼저)
   - Supabase 대시보드 → Authentication → Sign In / Providers → Email → **Allow new users to sign up** 를 OFF
   - 계정은 관리자 화면(원장)과 `scripts/create-admin.ts`(관리자)로만 만듭니다.

1. **GitHub 저장소 연결** (대표님)
   ```bash
   git branch -M main            # 현재 기본 브랜치가 master 이므로 main 으로 바꿉니다
   git remote add origin https://github.com/<계정>/davinci-school.git
   git push -u origin main
   ```

2. **Vercel 프로젝트 생성** (대표님)
   - Vercel → Add New Project → GitHub 저장소 선택
   - Environment Variables에 `.env.example`의 5개 키 입력 (값은 대표님이 직접)
     — `INQUIRY_NOTIFY_EMAIL`을 빼먹으면 가맹문의 알림 메일이 **조용히** 발송되지 않습니다.
   - Deploy 버튼 클릭

3. **Supabase 인증 URL 등록** (대표님)
   - Supabase 대시보드 → Authentication → URL Configuration
   - Site URL: `https://<your-vercel-url>.vercel.app`
   - Redirect URLs에 추가: `https://<your-vercel-url>.vercel.app/**`

이후 main 브랜치에 push하면 Vercel에서 자동 배포됩니다.

## 운영 체크리스트

배포 전후로 한 번씩 확인하세요.

- [ ] **공개 가입 OFF** — Supabase → Authentication → Sign In / Providers → Email → Allow new users to sign up: OFF.
      (`supabase/config.toml`의 `enable_signup = false`는 로컬 설정이며, 호스팅 프로젝트는 대시보드에서 직접 꺼야 합니다.)
- [ ] **마이그레이션 적용** — `npx supabase db push` 로 `supabase/migrations/` 전부 적용.
- [ ] **기존 계정 백필** — 마이그레이션 `20260919000004` 이전에 만든 계정(관리자, 테스트 원장)의 역할을 `app_metadata`로 옮깁니다:
      ```bash
      npx dotenv -e .env.local -- npx tsx scripts/backfill-app-metadata.ts
      ```
      건수만 출력됩니다. **옮겨진 계정은 로그아웃 후 다시 로그인**해야 새 세션이 역할을 인식합니다.
- [ ] **Resend 도메인 인증** — Resend 대시보드에서 `davinci-lab.kr` 도메인을 인증한 뒤,
      `lib/email/config.ts`의 `INQUIRY_EMAIL_FROM`을 `onboarding@resend.dev`에서 `noreply@davinci-lab.kr`로 교체합니다.
      인증 전에는 `onboarding@resend.dev`로만 발송됩니다.
- [ ] **Vercel 환경 변수** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `RESEND_API_KEY`, `INQUIRY_NOTIFY_EMAIL` 5개 모두 입력.
- [ ] **Supabase Auth URL** — Site URL 과 Redirect URLs 에 Vercel 주소 등록(위 3단계).
- [ ] **서비스 역할 키 관리** — `SUPABASE_SERVICE_ROLE_KEY`는 서버(Vercel 환경 변수)와 운영 스크립트에서만 사용합니다.
      유출이 의심되면 Supabase → Project Settings → API 에서 재발급하고 Vercel 과 `.env.local`을 갱신하세요.
- [ ] **제작소 v2 안내장** — v2로 게시한 세트만 학생별 차시 안내장(초안·확정·인쇄)을 지원합니다. v1 시절에 게시된 판은 화면에서 자동으로 업그레이드해 보여 주지만, 안내장은 만들 수 없습니다(다시 게시해야 함).

## 문서

- **설계 명세:** `docs/superpowers/specs/2026-09-18-davinci-school-website-design.md`(홈페이지), `docs/superpowers/specs/2026-09-25-item-studio-v2-design.md`(제작소 v2)
- **구현 계획:** `docs/superpowers/plans/`
- **현재 상태·인수인계:** `docs/STATUS.md`
- **5과목 생성 실행 순서서:** `docs/runbooks/2026-09-29-five-subjects.md`

## 주의사항

- `package.json`에 `"type": "module"`이 없으므로, TypeScript 스크립트(`*.ts`)에서 top-level `await`를 사용할 수 없습니다. 대신 `async` 함수로 감싸세요.
- 성취기준 파서는 별책8(수학)이 누락되어 있습니다. 원본 PDF가 필요하면 대표님께 요청하세요.

## 필요한 도움이 있으신가요?

개발 관련 문의는 개발자에게, 서비스 운영 관련 문의는 대표님께 연락하세요.
