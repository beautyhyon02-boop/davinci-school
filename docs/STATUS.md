# 프로젝트 현재 상태 (인수인계용)

다른 컴퓨터에서 새 Claude 대화를 열 때 이 파일을 먼저 읽으면 이어서 작업할 수 있다.
갱신: 2026-09-19

## 무엇을 만드는가
다빈치스쿨(탐구보고서 수업 본사, 가맹원 약 40곳) 메인 홈페이지 + 서논술형 AI 플랫폼.
- 설계 스펙(권위): `docs/superpowers/specs/2026-09-18-davinci-school-website-design.md`
- 1주차 계획(완료): `docs/superpowers/plans/2026-09-18-week1-foundation.md`
- 발표 목표일: 2026-10-18 (원장님 대상 시연)

## 1주차 완료 (master 에 병합됨)
- 공개 홈페이지(메인·사업 4페이지·가맹문의) — 모든 문구는 `content/site.ts` 한 파일
- Supabase DB 15테이블 + RLS, 마이그레이션 0001~0005 호스팅 DB에 적용 완료
- 성취기준 1,379개 DB 투입 (국·영·과·사·한국사; 수학 별책 PDF 없음)
- 로그인/로그아웃, 역할별 화면 뼈대(/admin, /teacher, /student)
- 가맹문의 접수 → 관리자 접수함
- 관리자: 가맹원 등록, 원장 계정 발급
- 관리자 계정 1개 존재 (davincischooloffice@gmail.com)
- README.md 에 실행·배포·운영 체크리스트

## 아직 안 된 것 (사람이 해야 함)
- GitHub 비공개 저장소 만들기 → Vercel 연결 → 환경변수 5개 → 배포 (README "배포" 절)
- Supabase Authentication → "Allow new users to sign up" OFF 확인 (Email provider 는 ON 유지)
- 홈페이지 실제 문구·사진 (스펙 3.1은 "살아 있는 절")
- 수학과 교육과정 별책 PDF 확보 → `python scripts/extract_standards.py` 로 추출

## 다음 주 계획에 반영할 결정 (최종 검토에서 나온 것)
- 2주차(문항 제작소): `item_set_versions` 스냅샷 표를 만들어 게시 버전 고정. 파이프라인 5단계(문항·루브릭·예시답안)는 Opus, 나머지는 Sonnet.
- 3주차 첫 작업: 원장의 채점 결과 수정 금지 트리거, 답안 제출 후 불변 RLS, 학생 `seq` 할당 SQL 함수(`원코드-번호`).
- 4주차: 모바일 메뉴/사이드바, 로그인 오류 문구 구분(이메일 제공자 꺼짐 vs 비밀번호 오류), 한글 리터럴 스캔 테스트.

## 기술 메모 (함정)
- 역할은 `auth.users.app_metadata.role` (user_metadata 아님 — 사용자가 못 고침). 프로필 트리거는 insert **or update** of raw_app_meta_data (GoTrue admin createUser 가 app_metadata 를 insert 후 update 로 넣기 때문).
- `package.json` 에 `"type":"module"` 없음 → `npx tsx` 스크립트는 top-level await 금지.
- 로컬 Docker 없음 → `supabase db push` 는 `supabase login` 한 터미널에서만 (토큰이 그 세션에만 저장됨).
- Next.js 16: `proxy.ts`(middleware 아님), `params` 는 Promise. `AGENTS.md` 참고.
- `.env.local` 은 커밋 금지. 키 형식 오류(접두어 중복, `URL=` 누락)가 실제로 있었음 — 값 말고 키 이름만 확인할 것.
- 로컬 서버(`npm run dev`, localhost:3000)는 그 컴퓨터에서만 보임. 다른 사람에게 보여 주려면 Vercel 배포.

## 유용한 명령
```
npm run dev                      # 로컬 서버
npm test                         # Vitest
python -m pytest tests/extract_standards_test.py -q
npx dotenv -e .env.local -- npx tsx scripts/create-admin.ts <이메일> <비밀번호> [이름]
npx dotenv -e .env.local -- npx tsx scripts/reset-password.ts <이메일> <새비밀번호>
npx dotenv -e .env.local -- npx tsx scripts/import-standards.ts
```
