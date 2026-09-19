# 프로젝트 현재 상태 (인수인계용)

다른 컴퓨터에서 새 Claude 대화를 열 때 이 파일을 먼저 읽으면 이어서 작업할 수 있다.
갱신: 2026-09-20

## 무엇을 만드는가
다빈치스쿨(탐구보고서 수업 본사, 가맹원 약 40곳) 메인 홈페이지 + 서논술형 AI 플랫폼.
- 홈페이지 설계 스펙(권위): `docs/superpowers/specs/2026-09-18-davinci-school-website-design.md`
- 문항 제작소 설계 스펙(권위): `docs/superpowers/specs/2026-09-20-item-studio-design.md`
- 1주차 계획(완료): `docs/superpowers/plans/2026-09-18-week1-foundation.md`
- 2주차-A 계획(완료, 백엔드): `docs/superpowers/plans/2026-09-20-week2a-studio-core.md`
- 발표 목표일: 2026-10-18 (원장님 대상 시연)

## 1주차 완료 · 배포됨
- 공개 홈페이지(메인·사업 4페이지·가맹문의) — 모든 문구는 `content/site.ts` 한 파일
- 로그인/로그아웃, 역할별 화면 뼈대(/admin, /teacher, /student), 가맹문의 접수함, 가맹원 등록, 원장 계정 발급
- 관리자 계정 1개 존재 (davincischooloffice@gmail.com)
- GitHub `beautyhyon02-boop/davinci-school`(main) → Vercel 스테이징 https://davinci-school-peach.vercel.app (push하면 자동 배포). 남은 것: Supabase Auth URL Configuration에 이 주소 등록, davinci-lab.kr 도메인 연결, "Allow new users to sign up" OFF 확인
- README.md 에 실행·배포·운영 체크리스트

## 2주차-A 완료 (브랜치 `week2a-studio`, 백엔드만)
화면(마법사 UI·원장 미리보기·그래프·첨부)은 아직 없다. 존재하는 것:
- **DB**: 마이그레이션 0001~0007 호스팅 DB에 적용됨. 0006 = `subject` enum에 `세계사`, `standards.verified_at/verified_by/source_page`, `item_sets` 단계별 열(`learning_goals`·`key_question`·`lessons`·`materials`·`assessment`·`teacher_guide`·`stage_status`), `item_set_versions`, `generation_log`. 0007 = `teacher_guide` jsonb, `set_stage_status()` 원자적 병합 함수.
- **성취기준 1,814건** DB 투입(국·영·수·과·사·한국사·세계사). 수학 435는 별책8 정본. 역사는 한국사 46 / 세계사 59로 분리(`data/standards/README.md` "역사 분리"). 파일은 갱신됐지만 DB의 `subject` 갱신은 `scripts/reclassify-history.ts`(update-db 모드) 한 번 더 실행해야 한다(59행).
- **성취기준 검증 화면** `/admin/standards`: 과목·학교급 필터, 원문 확인 체크(`verified_at`), PDF 쪽 입력은 2B에서.
- **제작소 파이프라인(백엔드)**:
  - `lib/studio/schemas.ts` 단계 0~6 zod 스키마(단일 출처), `lib/studio/prompts/{rules,stages}.ts` 프롬프트(규칙 블록은 캐시), `lib/studio/fidelity.ts` 재구성 원문 이탈 검사, `lib/studio/stages.ts` 단계 실행기(generate → review → accept), `lib/studio/repo.ts` Supabase 저장소.
  - API `POST/GET /api/studio/item-sets/[id]/stages/[stage]` (`{action:'generate'|'review'|'accept'}`; 관리자만, 비로그인 401). 한 요청 = Claude 호출 1회.
  - 확정 게이트: n단계 생성은 n-1단계가 `accepted`여야 하고(0단계 예외), prior 에는 accepted 출력만 들어간다. 2단계부터는 성취기준 2개 이상 연결 필수. 2단계 검토는 순수 TS 원문 이탈 검사가 먼저 걸러내고(모델 호출 없음), 검토 결과 `{pass, issues}`는 `generation_log.issues`에 남는다.
  - `lib/ai/claude.ts`: `claude-opus-5`(생성·검토), adaptive thinking, 구조화 출력(`zodOutputFormat`), 스트리밍(`messages.stream().finalMessage()`, max_tokens 48000), 파싱 실패 시 1회 재시도, refusal/max_tokens 는 즉시 실패. 채점용 `claude-sonnet-5`는 3주차.
- **가짜 응답(mock) 모드**: `ANTHROPIC_API_KEY`가 없으면(개발·테스트) `data/studio-fixtures/*.json`(중1 수학 샘플)을 돌려주고 `stage_status.stageN.model === 'mock'`·`generation_log.model = 'mock'`으로 표시된다. **실제 호출로 바꾸려면** `.env.local`과 Vercel 환경변수에 `ANTHROPIC_API_KEY`를 넣고 `AI_MOCK`은 비워 둔다(`AI_MOCK=1`이면 키가 있어도 fixture). production에서 키가 없으면 mock 으로 빠지지 않고 에러가 난다.
- **샘플(정답 예시)**: `docs/samples/2026-09-20-중1-일회용품-*.md` (수학 완전판 + 국·영·과·사, 공유 자료 C·D 정본).
- 테스트: `npm test` 20파일 / 108 테스트, Python `tests/extract_standards_test.py`·`tests/extract_math_test.py`.

## 대표님이 결정한 것 (스펙에 반영됨)
- 논술형 채점표는 MYP 방식: 평가요소 4개 × 0~4점, 총점 22(서술형 3+3, 논술형 16), 7등급 경계표. 예시답안 상/중/하는 채점표로 실제 채점해 등급이 맞아야 한다.
- 세트 = 소단원 하나(성취기준 2~6개), 같은 대주제의 세트는 같은 학년. 학년은 교육과정 학년 하나만(선행 전제 없음).
- 핵심질문은 두 층: 세트 핵심질문 1개 + 차시 핵심질문(마무리 퀴즈가 점검).
- 역사 통합 영역(`9역01`~`02`)은 세계사로 둔다(2026-09-20 확정).
- 같은 대주제의 과목들은 같은 자료(A~D)를 공유한다(자료는 대주제 수준). 모든 자료는 자작.

## 다음: 2주차-B 계획 (아직 안 씀)
새 계획을 쓰기 전에 최종 검토 `.superpowers/sdd/2026-09-20-week2a-studio-core/final-review.md`의 "Recommendations" 절을 읽을 것. 담을 것:
- 마법사 UI(단계별 생성 → 검토 → [다음]=accept, 3초 polling, "기본값으로 진행"은 클라이언트 루프), `model`/토큰 배지(mock 여부)
- 1단계 성취기준 선택 UI(소단원의 후보를 관리자가 고른다 — 모델은 적합성만 판단, 후보 로딩은 UI 몫), `key_question` 선택 저장
- 대주제 수준 자료·참여 과목(`themes.subjects`, `themes.materials`) — 지금은 `Ctx.theme.subjects = [itemSet.subject]`로 가짜
- 원장 미리보기, 게시/버전(`item_set_versions`, 검증된 성취기준만 게시), 수치 자료 자동 그래프, 이미지 첨부 슬롯
- 성취기준 검증 게이트(`verified_at` 없으면 게시 불가), `/admin/standards` PDF 쪽 입력
- API 오류를 400/404 JSON 으로 매핑(지금은 500), GET stage 범위 검증

## 3~4주차 메모
- 3주차 첫 작업: 원장의 채점 결과 수정 금지 트리거, 답안 제출 후 불변 RLS, 학생 `seq` 할당 SQL 함수(`원코드-번호`). 채점은 `claude-sonnet-5`.
- 4주차: 모바일 메뉴/사이드바, 로그인 오류 문구 구분(이메일 제공자 꺼짐 vs 비밀번호 오류), 한글 리터럴 스캔 테스트, 홈페이지 실제 문구·사진.

## 기술 메모 (함정)
- 역할은 `auth.users.app_metadata.role` (user_metadata 아님 — 사용자가 못 고침). 프로필 트리거는 insert **or update** of raw_app_meta_data (GoTrue admin createUser 가 app_metadata 를 insert 후 update 로 넣기 때문).
- `package.json` 에 `"type":"module"` 없음 → `npx tsx` 스크립트는 top-level await 금지.
- 로컬 Docker 없음 → `supabase db push` 는 `supabase login` 한 터미널에서만 (토큰이 그 세션에만 저장됨). 0007의 `alter column … type jsonb using nullif(...)`는 두 번 실행하면 실패하니 수동 재적용 금지.
- Next.js 16: `proxy.ts`(middleware 아님), `params` 는 Promise. `AGENTS.md` 참고. API 라우트(`/api/*`)는 proxy가 안 막으므로 핸들러 안에서 역할 검사(`getSessionProfileOrNull` → 401/403).
- `.env.local` 은 커밋 금지. 키 형식 오류(접두어 중복, `URL=` 누락)가 실제로 있었음 — 값 말고 키 이름만 확인할 것.
- 로컬 서버(`npm run dev`, localhost:3000)는 그 컴퓨터에서만 보임. 다른 사람에게 보여 주려면 Vercel 배포.
- `@anthropic-ai/sdk` 0.127: `messages.parse`/`stream().finalMessage()`는 JSON·zod 검증 실패 시 `parsed_output: null`이 아니라 **`AnthropicError`를 throw** 한다(`lib/parser.js`). `APIError`도 `AnthropicError`의 하위 클래스이므로 `instanceof APIError`로 먼저 걸러야 한다. zod의 `.length(n)`·`superRefine` 같은 제약은 JSON Schema로 못 넘어가 모델이 어길 수 있다 → 프롬프트에 같은 규칙을 글로 적어 둔다(`rules.ts` [차시]·[평가 문항] JSON 규칙).
- adaptive thinking 토큰은 `max_tokens`에 포함된다 → 스트리밍 + 48000. `stop_reason==='max_tokens'`는 스트림 스냅샷으로 구분한다(잘린 JSON은 파싱 실패로 먼저 reject 되므로).
- `AI_MOCK`: `1`이면 강제 fixture. 비워 두면 키 유무로 판정. `.env.example`을 복사해 `.env.local`을 만들면 `AI_MOCK=`(빈 값)이므로 키만 넣으면 실제 호출된다.
- 재구성 원문 이탈 검사는 어미·조사(`함으로써`, `었으며` 등)를 뗀 뒤 접두 일치로 판정한다. `통계청`처럼 원문 어휘의 접두를 공유하는 새 개념은 못 잡는다 — 검토 AI가 두 번째 관문.

## 유용한 명령
```
npm run dev                      # 로컬 서버
npm test                         # Vitest
npx tsc --noEmit && npm run build
python -m pytest tests/extract_standards_test.py tests/extract_math_test.py -q
npx dotenv -e .env.local -- npx tsx scripts/create-admin.ts <이메일> <비밀번호> [이름]
npx dotenv -e .env.local -- npx tsx scripts/reset-password.ts <이메일> <새비밀번호>
npx dotenv -e .env.local -- npx tsx scripts/import-standards.ts        # JSON → DB upsert
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/reclassify-history.ts   # 세계사 59행 DB 갱신
```
