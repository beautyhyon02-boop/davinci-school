# PRD: RED 자료실 (관리자 검수·게시 + 원장 다운로드)

작성일: 2026-10-16 / 작성: 다빈치스쿨 본사 / 대상 시스템: 다빈치스쿨 홈페이지 (Supabase 백엔드)

## 1. 배경과 목표

다빈치스쿨은 가맹 원장님께 세 종류의 탐구보고서 교재를 제공한다 — **RED**: R(Reading, 독서연계보고서), E(Essay, 소논문), D(Debate, 디베이트). 각 교재는 **교사용 완성보고서 1부 + 학생용 작성양식 1부**(.docx)로 구성되며, 수준은 **Basic(초등) / Advanced(중·고등)** 두 단계다. 현재 E세트는 매일 새벽 자동 생성되어 노트북 폴더에 쌓이고 있고, 홈페이지에 올리는 기능이 없다.

목표:
1. 관리자가 홈페이지 **관리자 화면에서만** 교재를 올리고, 검수한 뒤 **게시** 버튼으로 공개한다. (업로드 권한은 관리자 전용)
2. 원장님(가맹 회원)은 **BASIC / ADVANCED** 메뉴에서 게시된 교재를 종류(R/E/D)·과목·날짜로 찾아 다운로드한다.
3. 나중에 자동 생성 파이프라인이 "검수대기" 상태로 올릴 수 있도록 **상태 필드와 API를 처음부터 둔다.** (이번 범위에서는 UI 업로드만 구현)

## 2. 사용자와 권한

| 역할 | 할 수 있는 것 |
|---|---|
| 관리자(본사) | 업로드, 수정, 상태 변경(검수대기→게시/보류), 삭제, 전체 목록 조회 |
| 원장(가맹 회원, 로그인) | 게시된 교재 목록 조회·다운로드 |
| 비로그인 | 아무것도 볼 수 없음 (교재 목록 자체가 비공개) |

기존 사이트의 관리자 세션(`dvl_admin_session`)과 회원 세션 체계를 그대로 쓴다. 새 인증 체계를 만들지 않는다.

## 3. 데이터 모델 (Supabase)

### 테이블 `red_reports`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| kind | text | `R` / `E` / `D` |
| level | text | `basic` / `advanced` |
| subject | text | 과목·영역 (예: 물리, 생명과학, 인문사회, 독서) |
| series | text | 시리즈명 (예: 사물놀이 물리, 과학뉴스, 인문사회뉴스) |
| title | text | 보고서 제목 |
| summary | text | 요약 2~3줄 (목록 카드에 표시) |
| teacher_file_path | text | 스토리지 경로 (교사용 .docx) |
| student_file_path | text | 스토리지 경로 (학생용 .docx) |
| source_links | jsonb | 참고자료 링크 배열 `[{label, url}]` (선택) |
| status | text | `pending`(검수대기) / `published`(게시) / `hold`(보류) — 기본 `pending` |
| hold_note | text | 보류 사유 메모 |
| created_by | text | 관리자 id 또는 `auto` |
| created_at / published_at | timestamptz | |

인덱스: `(status, level, kind, created_at desc)`.

### 스토리지 버킷 `red-reports` (비공개)
- 경로 규칙: `{level}/{kind}/{yyyy-mm}/{id}_teacher.docx`, `{id}_student.docx`
- 다운로드는 **서명 URL**(유효 10분)로만 제공. 공개 URL 금지.

### RLS
- `red_reports`: 관리자 role만 insert/update/delete. 로그인 회원은 `status='published'` 행만 select.
- 버킷: 서버(서비스 키)만 쓰기. 읽기는 서명 URL.

## 4. 화면

### 4-1. 관리자 — `/admin/red`
- 상단 탭: **검수대기 / 게시됨 / 보류** (건수 표시)
- 목록: 종류 배지(R/E/D), 수준 배지(Basic/Advanced), 제목, 과목, 등록일, 교사용·학생용 미리보기(다운로드) 버튼
- **업로드 버튼** → 모달: 종류, 수준, 과목, 시리즈, 제목, 요약, 교사용 파일, 학생용 파일 (둘 다 .docx 필수), 참고링크(선택). 저장하면 `pending`.
- 행 액션: **게시**(→published, published_at 기록), **보류**(메모 입력 → hold), **수정**, **삭제**(확인창)
- 파일명에서 메타데이터 자동 추출: `RED E Advanced_과학뉴스 생명과학_제목 교사용 완성보고서.docx` 형식이면 kind/level/series/title을 폼에 미리 채움.

### 4-2. 원장 — `/basic`, `/advanced`
- 상단 필터: 종류(R/E/D) 칩, 과목 드롭다운, 검색(제목)
- 카드 목록: 종류·과목 배지, 제목, 요약, 게시일, **교사용 받기 / 학생용 받기** 버튼
- 정렬: 최신순. 페이지당 20개, 더 보기.
- 비로그인 접근 시 로그인 페이지로.

### 4-3. 공통
- 모바일(390px)에서 깨지지 않을 것. 기존 사이트 테마(그린/민트) 사용.

## 5. API (서버 경유, 서비스 키는 서버에만)

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/red?status=&level=&kind=&subject=&q=&page=` | 관리자: 전체 / 회원: published만 | 목록 |
| POST | `/api/red` (multipart) | 관리자 | 메타 + 파일 2개 업로드 → pending |
| PATCH | `/api/red/:id` | 관리자 | 메타 수정 |
| POST | `/api/red/:id/publish` · `/hold` · `/unpublish` | 관리자 | 상태 변경 |
| DELETE | `/api/red/:id` | 관리자 | 행 + 파일 삭제 |
| GET | `/api/red/:id/download?which=teacher\|student` | 관리자 또는 회원(published만) | 서명 URL 발급 후 리다이렉트 |
| POST | `/api/red/intake` | **API 키 헤더** (`X-RED-INTAKE-KEY`) | 자동 생성기용: 메타+파일 → pending. 이번 범위에서는 엔드포인트와 키 검증만 구현, 호출은 추후 |

## 6. 사용자 스토리 (우선순위 순 — Ralph prd.json 변환용)

1. **US-001 테이블·버킷·RLS** — 마이그레이션 SQL로 `red_reports`와 `red-reports` 버킷, RLS 정책 생성. 인수조건: 마이그레이션 적용 후 관리자 키로 insert 성공, 회원 키로 pending 행 select 시 0건.
2. **US-002 관리자 업로드** — `/admin/red` 업로드 모달로 .docx 2개 + 메타 저장 → pending. 인수조건: 저장 후 검수대기 탭에 표시, 파일이 규칙 경로에 존재, docx 외 파일은 거부.
3. **US-003 파일명 자동 파싱** — 규칙에 맞는 파일명이면 kind/level/series/title 자동 채움, 아니면 빈 폼. 단위 테스트 5개 이상.
4. **US-004 검수 탭과 상태 변경** — 검수대기/게시됨/보류 탭, 게시·보류(메모)·게시취소. 인수조건: 상태 변경 즉시 탭 이동, published_at 기록.
5. **US-005 원장 목록·다운로드** — `/basic`, `/advanced` 카드 목록 + 필터 + 서명 URL 다운로드. 인수조건: 비로그인 리다이렉트, pending 항목 절대 노출 안 됨, 서명 URL 10분 후 만료.
6. **US-006 수정·삭제** — 관리자 메타 수정, 파일 교체, 삭제(스토리지 파일 함께). 
7. **US-007 intake API** — `X-RED-INTAKE-KEY` 검증 후 pending 생성. 키는 환경변수. 인수조건: 키 없음/틀림 → 401, 맞으면 201 + id.
8. **US-008 모바일·테마 점검** — 390px 스크린샷 확인, 기존 테마 변수 사용.

## 7. 범위 밖
- 자동 생성기에서 intake API를 실제로 호출하는 작업 (네트워크 허용 후 별도)
- docx → PDF 변환, 본문 미리보기, 댓글, 다운로드 통계
- R/D 교재 생성 (교재 내용은 별도 작업)

## 8. 열린 질문 (구현 전에 확인)
- 기존 사이트의 관리자 role 판별 함수·회원 테이블 이름 (RLS 정책을 거기에 맞춤)
- 메뉴 이름을 BASIC/ADVANCED 로 할지 "초등/중고등"을 병기할지
- 한 교재에 파일이 2개 이상(예: 부록 PDF)일 수 있는지 → 있으면 `files` jsonb로 확장
