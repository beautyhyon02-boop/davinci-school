# 다빈치스쿨 웹 플랫폼

탐구보고서 교육과 서논술형 수업을 위한 통합 플랫폼. 가맹원 관리, 원장/교사 대시보드, 학생 학습 기록 시스템.

## 기술 스택

- **프론트엔드:** Next.js 16, React 19, Tailwind CSS 4
- **백엔드:** Supabase (PostgreSQL + Auth)
- **이메일:** Resend
- **테스트:** Vitest, pytest

## 라우트 개요

- `/` — 공개 홈페이지
- `/login` — 사용자 로그인 (역할별: 관리자/원장/교사/학생)
- `/admin/*` — 관리자 (가맹원·계정 관리, 가맹문의 수신 등)
- `/teacher/*` — 원장/교사 대시보드
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

`<your-project-ref>`는 `supabase/config.toml`의 `project_id = "davinci-school"`를 호스팅 프로젝트에 연결한 후 얻습니다.  
마이그레이션 3개가 적용되며, `supabase/migrations/` 폴더에서 확인하세요.

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

## 홈페이지 문구 수정

모든 공개 페이지의 텍스트는 `content/site.ts` 한 파일에서 관리됩니다.  
섹션별 제목, 설명, 통계, 프로그램 정보 등을 이곳에서 수정하세요.

## 배포 (Vercel)

### 전제 조건

- GitHub 비공개 저장소 준비 (이 프로젝트를 push)
- Vercel 계정

### 배포 절차

1. **GitHub 저장소 연결** (대표님)
   ```bash
   git remote add origin https://github.com/<계정>/davinci-school.git
   git push -u origin main
   ```

2. **Vercel 프로젝트 생성** (대표님)
   - Vercel → Add New Project → GitHub 저장소 선택
   - Environment Variables에 `.env.example`의 5개 키 입력 (값은 대표님이 직접)
   - Deploy 버튼 클릭

3. **Supabase 인증 URL 등록** (대표님)
   - Supabase 대시보드 → Authentication → URL Configuration
   - Site URL: `https://<your-vercel-url>.vercel.app`
   - Redirect URLs에 추가: `https://<your-vercel-url>.vercel.app/**`

이후 main 브랜치에 push하면 Vercel에서 자동 배포됩니다.

## 문서

- **설계 명세:** `docs/superpowers/specs/2026-09-18-davinci-school-website-design.md`
- **구현 계획:** `docs/superpowers/plans/`

## 주의사항

- `package.json`에 `"type": "module"`이 없으므로, TypeScript 스크립트(`*.ts`)에서 top-level `await`를 사용할 수 없습니다. 대신 `async` 함수로 감싸세요.
- 성취기준 파서는 별책8(수학)이 누락되어 있습니다. 원본 PDF가 필요하면 대표님께 요청하세요.

## 필요한 도움이 있으신가요?

개발 관련 문의는 개발자에게, 서비스 운영 관련 문의는 대표님께 연락하세요.
