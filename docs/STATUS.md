# 프로젝트 현재 상태 (인수인계용)

다른 컴퓨터에서 새 Claude 대화를 열 때 이 파일을 먼저 읽으면 이어서 작업할 수 있다.
갱신: 2026-09-26 (대주제 학년 선택 — 마이그레이션 0012 적용 대기)

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
- **성취기준 원문 자동 대조(2026-09-26)**: `/admin/standards`의 "원문 자동 대조" 버튼이 평가원 성취수준 원문(`data/reference/levels/*.json`)과 코드 기준으로 대조해(`lib/standards/crosscheck.ts`, 공백은 한 칸으로 접지 않고 전부 제거 — PDF 줄바꿈 공백 아티팩트 대응) 일치하는 행만 자동 검증 처리한다 — 오프라인 집계는 `data/standards/crosscheck-2026-09-26.md`(검증됨 724 / 불일치 6 / 대조 불가 1,084, 합계 1,814, 남은 6건은 전부 실제 표기 차이), 방법은 `data/standards/README.md` "원문 대조 (2026-09-26)" 절.
- **제작소 파이프라인(백엔드)**:
  - `lib/studio/schemas.ts` 단계 0~6 zod 스키마(단일 출처), `lib/studio/prompts/{rules,stages}.ts` 프롬프트(규칙 블록은 캐시), `lib/studio/fidelity.ts` 재구성 원문 이탈 검사, `lib/studio/stages.ts` 단계 실행기(generate → review → accept), `lib/studio/repo.ts` Supabase 저장소.
  - API `POST/GET /api/studio/item-sets/[id]/stages/[stage]` (`{action:'generate'|'review'|'accept'}`; 관리자만, 비로그인 401). 한 요청 = Claude 호출 1회.
  - 확정 게이트: n단계 생성은 n-1단계가 `accepted`여야 하고(0단계 예외), prior 에는 accepted 출력만 들어간다. 2단계부터는 성취기준 2개 이상 연결 필수. 2단계 검토는 순수 TS 원문 이탈 검사가 먼저 걸러내고(모델 호출 없음), 검토 결과 `{pass, issues}`는 `generation_log.issues`에 남는다.
  - `lib/ai/claude.ts`: `claude-opus-5`(생성·검토), adaptive thinking, 구조화 출력(`zodOutputFormat`), 스트리밍(`messages.stream().finalMessage()`, max_tokens 48000), 파싱 실패 시 1회 재시도, refusal/max_tokens 는 즉시 실패. 채점용 `claude-sonnet-5`는 3주차.
- **가짜 응답(mock) 모드**: `ANTHROPIC_API_KEY`가 없으면(개발·테스트) `data/studio-fixtures/*.json`(중1 수학 샘플)을 돌려주고 `stage_status.stageN.model === 'mock'`·`generation_log.model = 'mock'`으로 표시된다. **실제 호출로 바꾸려면** `.env.local`과 Vercel 환경변수에 `ANTHROPIC_API_KEY`를 넣고 `AI_MOCK`은 비워 둔다(`AI_MOCK=1`이면 키가 있어도 fixture). production에서 키가 없으면 mock 으로 빠지지 않고 에러가 난다.
- **샘플(정답 예시)**: `docs/samples/2026-09-20-중1-일회용품-*.md` (수학 완전판 + 국·영·과·사, 공유 자료 C·D 정본).
- 테스트: `npm test` 20파일 / 108 테스트, Python `tests/extract_standards_test.py`·`tests/extract_math_test.py`.

## 대표님이 결정한 것 (스펙에 반영됨)
- 논술형 채점표는 MYP 방식: 평가요소 4개 × 0~4점, 총점 22, 7등급 경계표. 예시답안 상/중/하는 채점표로 실제 채점해 등급이 맞아야 한다. (세트 구성은 2026-09-26 결정으로 바뀌었다 — 아래 줄)
- 세트 = 소단원 하나(성취기준 2~6개), 같은 대주제의 세트는 같은 학년. 학년은 교육과정 학년 하나만(선행 전제 없음). (학년은 2026-09-26 결정으로 선택이 됐다 — 아래 줄)
- 2026-09-26 대표님: **대주제 학년은 선택(학교급만 필수)** — 2022 개정 성취기준은 학년군 단위(중학교 1~3학년군, 초등 3~4·5~6학년군)라 "중1 교과서 범위가 아님"은 약한 기준이었고 검토에서 계속 실패했다. 대주제 만들기의 학년 기본값은 "학년 지정 안 함(학년군 전체)"(`themes.grade = null`), 대주제 화면의 [학년 바꾸기]로 기존 대주제도 바꿀 수 있다(세트 `item_sets.grade`도 함께, 게시 판은 다시 게시해야 표지가 바뀜). 학년이 없으면 프롬프트·화면이 "중학교(1~3학년군)" / "초등학교(3~6학년)"(`lib/studio/level-map.ts` `gradeLabel`, 화면 문구는 `content/site.ts`), 1단계 적합성 검토는 성취기준 코드가 학교급(중 `[9…]`, 초 `[4…]`·`[6…]`)인지와 대주제만 본다(`grade_level` 이슈는 학교급이 실제로 틀린 경우만). 규칙 C-24 "교육과정 학교급(학년군) 수준", S-영-07·S-국-01·S-수-05·S-수-06의 중1 고정 문구도 정리. 학년을 정한 대주제는 지금 문구 그대로("중 1학년"). **마이그레이션 0012(`20260926000012_theme_grade_optional.sql`)는 파일만 있다 — 대표님 `supabase db push` 대기(코드 push 전에).**
- 핵심질문은 두 층: 세트 핵심질문 1개 + 차시 핵심질문(마무리 퀴즈가 점검).
- 역사 통합 영역(`9역01`~`02`)은 세계사로 둔다(2026-09-20 확정).
- 같은 대주제의 과목들은 같은 자료(A~D)를 공유한다(자료는 대주제 수준). 모든 자료는 자작.
- 2026-09-26 대표님(세트 구조): 매 교수 차시 끝 = 이해 점검 퀴즈 3문항(그대로, 마지막 교수 차시 포함). 세트(단원 = 교수 차시 3~5개, 시연 세트 5개) 끝 = **서술형 1문항 + 논술형 1문항, 정확히 2문항**을 5차시 뒤 **6차시 단원 평가**(60분 = 안내 5 · 서술형 15 · 논술형 35 · 정리 5, 퀴즈 없음)에서 함께 본다. 두 문항 모두 분석적 루브릭(요소별) + 총체적 루브릭(상/중/하). **배점 가정(본사, 대표님이 바꿀 수 있음): 서술형 6점(요소 2~3개) + 논술형 16점(4요소 × 4) = 22점** — 7등급표·`level_ref`는 그대로. 바꾸는 순서: ① `lib/studio/assessment-structure.ts`의 숫자(`SET_ITEMS`·`ASSESSMENT_SESSION`, 총점이 22가 아니면 `lib/studio/level-map.ts` `GRADE_TABLE_22`도) → 스키마·[TS]·5단계 프롬프트·검토 초점·화면 문구·규칙 문장(C-14·C-31·L-09·S-수-02, `lib/studio/structure-text.ts`가 만든다)이 따라 바뀐다 ② `npx vitest run tests/rules.test.ts`가 알려 주는 새 문장으로 스펙 부록 A의 C-14·C-31·L-09·S-수-02 행을 고친다 ③ 시연 fixture의 서술형 채점표(`scripts/upgrade-fixtures-v2.ts` PATCHES, 3요소 × 0~2)를 새 배점에 맞게 다시 쓰고 스크립트를 돌린다(배점이 안 맞으면 스크립트가 멈춘다). 평가 문항 수준 목표: 평가원·교육청 공개 예시 문항과 같은 수준·형식(5단계 프롬프트, 참고 카드 서술형 2 + 논술형 3). 옛 구조로 게시된 판(서술형 3+3 + 논술형)은 학생 답안·채점이 묶여 있어 그대로 둔다. 시연 세트: 수학은 상대도수 서술형을, 과학은 재활용이 어려운 이유 서술형을 남겼다(수학의 종이 답안 도수분포표 문항을 빼서 시연 세트에 종이 답안 문항이 없다).
- 2026-09-26 대표님: **퀴즈는 단답형만(객관식 폐지)** — 서논술 과정이라 어디에도 객관식이 없다. 교수 차시 마무리 퀴즈 3문항은 모두 학생이 낱말·수치·짧은 구를 직접 쓰는 단답형(선택지 없음, 정답·한두 줄 해설)이고, 채점은 기존 `lib/classroom/quiz.ts`의 너그러운 비교 그대로다(정답 표기가 여럿이면 " / "로). 새 세트는 zod(`LessonDesign`)와 [TS]("퀴즈는 단답형만(선택지 금지)")가 선택형을 막고(규칙 L-09·L-10), 이미 게시된 옛 판의 선택형 퀴즈는 바꾸지 않고 보기 단추로 그대로 보이고 채점된다(보기에 기대는 발문이 있어 기계 변환하지 않는다). 시연 fixture 20문항(수학 7·과학 13)을 단답형으로 다시 썼다(`scripts/upgrade-fixtures-v2.ts` PATCHES).
- 2026-09-26 대표님: 조건은 지침이지 풀이 힌트가 아니다(계산식·풀이 순서·자료 수치·결론 금지) — 조건은 논술형에만 2~4개, 서술형은 조건 없이 분량·형식만(규칙 C-32, [TS] 검사).
- 2026-09-26 대표님: **세트 자료는 문항·차시가 실제로 쓰는 것만** — 실제 서논술 문항은 자료 2~4개(영어 세트가 대주제 공유 A~D 수학 표까지 싣던 문제). 4단계 과제·검토 초점에 "세트 자료는 문항·차시가 실제로 쓰는 2~4개만, 공유 자료는 이 과목 문항이 인용할 것만"; 게시(`buildSnapshot`)는 문항·차시 `materials_used`와 문장 속 "자료 X" 언급(`lib/studio/materials.ts` `usedMaterialIds`)이 가리키는 자료만 싣고 나머지 ID를 `snapshot.materials_omitted`에 남긴다(관리자 미리보기에 한 줄, 참조가 하나도 없는 초안은 거르지 않음); 4·5단계 자동 검사 메모가 참조 자료 5개 초과·안 쓰는 세트 자료를 짚는다(참고). 런북 C절 7-1.
- 2026-09-26 대표님: **핵심질문 수정 칸** — 2단계 후보를 고르면 수정 칸에 문장이 채워지고, 고쳐 쓴 문장(5~200자)이 세트 핵심질문(`item_sets.key_question`)이 된다(`chooseKeyQuestion` → `normalizeKeyQuestion`). 2단계를 손으로 고쳐도 직접 고쳐 쓴 핵심질문은 남고, 2단계를 다시 생성하면 종전대로 비워진다(`keyQuestionAfterStage2`).
- 2026-09-26 대표님: **문장 고치기(모든 단계, JSON 없이)** — 마법사 각 단계 결과 아래 접힌 「문장 고치기」: 단계별 편집 경로(`lib/studio/editable-fields.ts` `EDITABLE_FIELDS`, 라벨은 `content/site.ts` `fieldEditor`)를 입력 칸으로 펼쳐 고치고, 고친 출력 전체를 기존 `saveStageEdit`(zod → 저장 → 뒤 단계 초기화 → 자동 검사 메모)로 저장한다. 뒤 단계가 준비 전이 아니면 "N~7단계가 초기화됩니다. 계속할까요?" 확인 체크 후에만 저장. 저장한 단계는 다시 [확인]. [JSON 편집]은 구조 변경용 고급 옵션으로 남는다. 런북 C절 6-1.
- 2026-09-24 오너 결정: 대주제 소개(0단계)는 검토 관문이 없다 — 세트 품질을 좌우하는 관문이 아니라 배경 정보이기 때문. `ThemeIntroPanel`은 이제 [AI 초안 받기]·[저장] 두 버튼뿐이고(검토·확정·시도 횟수 표시 삭제), 저장하면 검증만 거쳐 바로 확정 상태(`themes.intro`)로 저장된다(`lib/studio/stages.ts` `runThemeIntro`: `generate`|`save`, `review`/`accept`는 `STAGE_ERRORS.INTRO_ACTION_NOT_SUPPORTED`로 막힌다).
- 2026-09-26 대표님: **검토는 참고, [확인]으로 진행** — 세트 마법사(2~7단계)는 검토 때문에 멈추지 않는다. 각 단계는 [생성] → 관리자가 읽기 → [확인]. 생성 직후 [TS] 정적 검사가 「자동 검사 메모」로 붙고(모델 호출 없음), [AI 검토 의견 보기]는 선택(참고, 통과·불통과 없음). 시도 한도(`MAX_ATTEMPTS`)는 기록일 뿐 잠그지 않는다. [기본값으로 진행]은 생성→확인만 하고 생성 실패에서만 멈춘다. 게시는 구조만 본다(2~7단계 확인·성취기준 검증·핵심질문·단답형 퀴즈). 운영 순서는 런북 `docs/runbooks/2026-09-29-five-subjects.md` C절.

## 2주차-B 완료 (2026-09-21)
브랜치 `week2b-studio-ui`. 제작소 화면과 원장 열람 화면이 모두 붙었다.

**화면·라우트**
- `/admin/items` 대주제 목록 · `/admin/items/new` 대주제 생성
- `/admin/items/[themeId]` 대주제 소개(0단계, `ThemeIntroPanel`) 생성/검토/확정(**2026-09-24 결정으로 검토·확정 관문 삭제 — 위 "대표님이 결정한 것" 절**), 공유 자료 A~D(`SharedMaterialsPanel`), 성취기준 선택(`StandardsPicker`)으로 세트 생성
- `/admin/items/[themeId]/sets/[setId]` 세트 마법사(`StageWizard`/`useStageRunner`, 2~6단계 생성→검토→[다음]=accept, "기본값으로 진행"), 핵심질문 선택, 이미지 첨부(`Attachments`), 게시(`PublishPanel`, `item_set_versions` 스냅샷)
- `/admin/standards` 성취기준 검증(과목·학교급 필터, `verified_at` 체크) — PDF 쪽 입력은 이번 범위 밖
- `/teacher/items` 문항(세트) 목록 · `/teacher/items/[setId]` 게시된 세트 열람(검증된 성취기준·확정 자료만 노출)
- API: `POST/GET /api/studio/item-sets/[id]/stages/[stage]`, `POST/GET /api/studio/themes/[id]/intro`, `POST /api/studio/upload`(첨부) — 알려진 실패는 400 `{error: code, message}`, 그 외는 500 `{error:'internal'}`(로그만 서버에 남김). 오류 코드는 `lib/studio/stages.ts`의 `STAGE_ERRORS`(`stage-prev-not-accepted`/`too-few-standards`/`nothing-to-review`/`accept-requires-review`) — `StageError`로 던지고 라우트가 매핑한다.

**시연 절차**
- 관리자: 대주제 생성 → 소개 생성/확정 → 공유 자료 → 세트 생성(성취기준 선택) → 마법사 2~6 [기본값으로 진행] → 핵심질문 선택 → 미리보기 → 게시
- 원장: 로그인 → 문항 찾기 → 열기

**대표님이 아직 하실 일**
- (2B는 main에 병합·push 완료, 2026-09-20)
- **키가 오기 전 시연용**: Vercel → Settings → Environment Variables에 `AI_MOCK` = `1` 추가(Production·Preview·Development 모두) → Deployments에서 Redeploy. 운영 환경은 키가 없으면 mock으로 넘어가지 않고 "ANTHROPIC_API_KEY is not set" 오류가 난다.
- ~~키가 오면~~ **2026-09-20 완료**: Vercel에 `ANTHROPIC_API_KEY` 등록, `AI_MOCK` 삭제, Redeploy. 스테이징에서 대주제 소개를 실제 AI로 생성 확인(20초). 노트북 `.env.local`에는 아직 키가 없음(로컬은 mock) — 로컬에서 실제 호출이 필요하면 그때 넣는다.

**알려진 한계**
- 로컬(개발)은 `ANTHROPIC_API_KEY` 없으면 mock 모드(가짜 응답, `model:'mock'` 배지). Vercel(운영)은 `AI_MOCK=1`을 넣어야 mock, 아니면 오류
- 가짜 응답(fixture)은 **중1 수학, 성취기준 9수04-02·03·04** 세트와 **중1 과학, 성취기준 9과01-01·9과01-03** 세트를 흉내 낸다. 시연 연습에서 세트를 만들 때 수학이면 그 세 개를, 과학이면 그 두 개를 반드시 고를 것. **그 밖의 과목(국·영·사·한국사·세계사)은 과목 fixture가 없어 수학 fixture로 떨어지므로 2단계 검토가 "원문에 없는 표현"으로 실패한다**(검사기가 정상 작동한 것). 같은 과목이라도 성취기준을 다르게 고르면 마찬가지다. 자세한 규칙은 `data/studio-fixtures/README.md`. 대주제 공유 자료는 `docs/samples/2026-09-20-중1-일회용품-공유자료.json`을 붙여넣는다.
- hwp(한글) 내보내기 없음 — 화면에서 보고 복사/인쇄만 가능
- 첨부 이미지는 `materials` 버킷 공개 읽기이므로 URL을 아는 사람은 누구나 볼 수 있음(비공개 자료는 올리지 말 것)

## 3주차-A 완료 (2026-09-23)
브랜치 `week3a-classroom`. 학생 배정·답안 제출·AI 채점·원장 검수 화면과 로직이 모두 붙었다.

**화면·라우트**
- `/teacher` 원장 홈(대시보드: 검수 대기 수·진행 중 배정 수·학생 수)
- `/teacher/students` 학생 관리(추가/목록/비밀번호 초기화)
- `/teacher/items` 게시된 문항(세트) 목록 · `/teacher/items/[setId]` 세트 열람
- `/teacher/assignments` 배정 현황(목록) · `/teacher/assignments/new?set=[setId]` 배정하기
- `/teacher/assignments/[setId]` 배정 상세 = 차시 열기 조절 + 퀴즈 현황 + 답안 검수(AI 초안 확인·수정·확정, AI 다시 채점)
- `/student` 내 과제(배정된 세트 목록)
- `/student/assignments/[id]` 과제(차시별 퀴즈·답안 제출·결과·재도전)
- API: `POST /api/classroom/gradings/[id]/run`(AI 채점 실행). 확정·재채점·차시 열기·퀴즈 정오 뒤집기는 서버 액션 (`app/teacher/assignments/[setId]/actions.ts`).

**시연 절차** (가짜 응답 수학 세트 기준 — 2026-09-26 구조 변경 전 기록이다. 지금은 1~5차시 = 교수 차시(퀴즈만), 6차시 = 단원 평가(서술형·논술형). 최신 절차는 `docs/runbooks/2026-09-29-five-subjects.md` D절)
1. 원장: 학생 2명 추가(초기 비밀번호 메모)
2. 원장: 문항 찾기 → 수학 세트 열기 → [배정하기] → 학생 선택 · "처음 열 차시 수" 2 · "재도전 허용" 체크 → 배정
3. 학생: 1차시 퀴즈 제출(즉시 결과) → 2차시 퀴즈 → 2차시 서술형1 답안 60자 이상 제출 → "확인 중"
4. 원장: 배정 현황 → 세트 [열기](`/teacher/assignments/[setId]`) → 서술형1 검수 대기 카드 → 점수 그대로 또는 수정 → 확정
5. 원장: 같은 화면 "차시 열기"에서 "5차시까지 열기" → [반 전체에 적용]
6. 학생: 4차시 서술형2, 5차시 논술형 답안 제출 → 원장이 두 카드 확정 → 학생 화면에 종합 점수·등급
7. 학생: 결과 확인 → [다시 써 보기] → 2회차 제출 → 원장 확정 → 1·2회차 비교

**대표님이 아직 하실 일**
- 마이그레이션 0009(수업 운영 표) 적용: 프로젝트 폴더 터미널에서 `supabase db push`
- `git push` 브랜치를 main에 병합 후 또는 직접 push

**알려진 한계**
- 학생은 퀴즈 응답을 직접 쓰지 못한다(정책 없음). 서버가 채점(judgeQuiz)한 뒤 service role 로 넣는다. 답안 정책은 제출 전·50자·재도전 조건을 DB에서도 검사한다
- 채점 "실행 중" 표시는 pending + updated_at(5분 임대)이다. 5분 넘게 pending 이면 원장의 [AI 다시 채점]으로 다시 돌릴 수 있다
- 사진·교재·공유 자료 생성(대시보드·시연 자료)은 3B에서
- 비용 상한(월 채점 건수) 관리·관리자의 재채점 처리는 발표(2026-10-18) 뒤
- 학생 계정 삭제 기능 없음(활동 기록 유지)

## 제작소 v2 핵심 완료 (브랜치 `studio-v2`, 2026-09-25 계획 Task 1~9)
계획 `docs/superpowers/plans/2026-09-25-item-studio-v2-core.md`, 스펙 `docs/superpowers/specs/2026-09-25-item-studio-v2-design.md`. 진행 장부(모든 판단·이탈 기록) `.superpowers/sdd/2026-09-25-item-studio-v2-core/progress.md`, Task별 보고서는 같은 폴더의 `task-N-report.md`.

- 단계는 **0~7**(7 = 차시별 피드백 안내장 틀, 마법사 2~7). 게시하려면 2~7단계가 모두 확인(`accepted`)돼야 한다(`PUBLISH_STAGES`, `lib/studio/publish.ts`).
- ~~검토 반복 한도 3회로 막기~~ → 2026-09-26 대표님 결정으로 바뀌었다: 세트 단계는 [생성] → 읽기 → [확인]. [TS] 정적 검사는 생성 직후 「자동 검사 메모」(`status.notes`, 참고)로 붙고, [AI 검토 의견 보기]는 선택이며 아무것도 막지 않는다. `MAX_ATTEMPTS`(`lib/studio/max-attempts.ts`)는 기록용으로만 남는다(`lib/studio/stages.ts` `runStage`, `lib/studio/next-action.ts`).
- 단계를 편집하면 그 뒤 단계(7단계까지)가 전부 "준비 전"으로 초기화된다(`lib/studio/edit-rules.ts`).
- 게시 스냅샷은 v2(`schema_version: 2`, `unit_plan`·`reconstruction_detail`·`notice_plan`·`references`). v1 시절 게시 판은 그대로 두고 읽을 때 `upgradeSnapshot`(`lib/studio/compat.ts`)으로 올린다 — DB 재작성 없음.
- 마이그레이션 **0011**(`20260925000011_studio_v2.sql`): `item_sets.unit_plan/reconstruction_detail/notice_plan` 열 + 학생별 안내장 표 `lesson_notices`(기존 공지사항 표 `notices`와 이름이 겹쳐 따로 둠).
- 마이그레이션 **0012**(`20260926000012_theme_grade_optional.sql`, 2026-09-26, **적용 대기**): `themes.grade`·`item_sets.grade` null 허용 + "비어 있거나 1~6" 검사(`themes_grade_check`·`item_sets_grade_check`, 지우고 다시 만들어 여러 번 실행해도 안전). 코드 push 전에 `supabase db push` — 없이 배포하면 "학년 지정 안 함" 대주제 만들기·[학년 바꾸기]가 저장 오류.

**브랜치 내용 (Task별)**
| Task | 무엇을 했나 | 핵심 파일 |
|---|---|---|
| 1 | 스키마 v2(0~7단계), 7등급↔수준 대응표, v1→v2 업그레이더, [TS] 정적 검사 | `lib/studio/{schemas,level-map,compat,checks}.ts` |
| 2 | 성취수준 로더·예시 은행 선택기·서버 채움(enrich) | `lib/reference/{levels,exemplars}.ts`, `lib/studio/enrich.ts` |
| 3 | 규칙 부록 A → 코드(ID·출처 태그) 분할, 성취수준·예시 은행 주입 프롬프트 | `lib/studio/prompts/rules/**`, `lib/studio/prompts/stages.ts` |
| 4 | 단계별 검토 초점 v2, [TS] 선행 검토, enrich 출력 저장, 검토 prior 단계별 축소 | `lib/studio/stages.ts`, `lib/studio/prompts/stages.ts` |
| 5 | 마이그레이션 0011, repo 2·3·7단계 열 저장·복원, 스냅샷 v2, 7단계 게시 조건, 마법사 확장, tsc 46→0 | `supabase/migrations/20260925000011_studio_v2.sql`, `lib/studio/{repo,publish}.ts` |
| 6 | fixture v2(수학·과학, 2~7단계), `draftNoticePlan`, 변환 스크립트, C-03 정답 유출 제거 | `scripts/upgrade-fixtures-v2.ts`, `data/studio-fixtures/*`, `lib/studio/notice-draft.ts` |
| 7 | PackageView v2 카드(스펙 §2.9), 학생 화면(종이 답안·번호 조건), 채점 프롬프트 v2, 채점 기준 정합(`alignCriteria`) | `components/studio/PackageView.tsx`, `lib/classroom/grading-prompt.ts` |
| 8 | 학생별 차시 안내장(조립·린트·원장 확정·인쇄) | `lib/classroom/{notice,notice-lint,notice-prompt}.ts`, `app/teacher/assignments/[setId]/notices/**` |
| 9 | 문서(이 절), 실행 순서서, fixture README, 자리 채움 검사 테스트 | `docs/runbooks/2026-09-29-five-subjects.md`, `tests/no-placeholder.test.ts` |

**현재 수치 (HEAD `d8ddad6` 기준, 2026-09-25 재확인)**
- `npx vitest run`: 52 files / **444 tests, 0 skipped, 0 failed** (과제 9의 `tests/no-placeholder.test.ts`를 더하면 53 files / 445 tests).
- `npx tsc --noEmit`: **0 errors**.
- `npm run build`: 성공(전 라우트 컴파일).
- `npx eslint`: 알려진 사전 존재 오류 2건(`useStageRunner.ts` 40:3·50:5, react-hooks) — Task 5 보고서에서 베이스 커밋에도 있었음을 확인. 그 외 파일은 clean.

**실행 순서서**: `docs/runbooks/2026-09-29-five-subjects.md`(준비 → 성취기준 선택 → 과목별 생성 → 시연 흐름 → 대표님 12항목 체크리스트 → 실패 기록 → 알려진 한계).

**대표님이 하실 일 (순서를 지킬 것 — 1번이 2번보다 먼저다)**
1. **먼저** 마이그레이션 0012(대주제·세트의 학년 칸을 비울 수 있게) 적용: `supabase db push`. 0011은 2026-09-26에 이미 적용됐다. 0012는 열을 nullable로 바꾸고 제약을 다시 거는 것뿐이라 다시 실행해도 안전하다. **반대로 하면**(코드를 먼저 배포하면) "학년 지정 안 함"으로 대주제를 만들거나 "학년 바꾸기"를 누를 때 저장 오류가 난다(그 외 화면은 정상). **0010 파일은 없다** — 번호만 비어 있다. 자세한 순서는 `docs/runbooks/2026-09-29-five-subjects.md` A절 1번.
2. **그 다음에** `git push`, Vercel 배포 Ready 확인. 배포 뒤 대주제 페이지에서 "학년 바꾸기 → 학년 지정 안 함(학년군 전체)"으로 바꾸고 세트를 새 흐름([생성]→[확인])으로 만든다.
3. 공유 자료 B(작년·올해 일회용품 개수): `docs/samples/2026-09-20-중1-일회용품-공유자료.json`·fixture는 원자료(개수)로 이미 고쳤고 "두 해는 부스 수와 전체 개수가 다르다" 문장도 뺐다(수학 서술형 이유 요소 유출). 남은 것은 호스팅 DB의 대주제 공유 자료를 같은 원자료(개수) 표·본문으로 패치하는 일이다(순서서 A절 6번).
4. 5일차 생성 전에 실제 3단계·5단계 생성 한 번씩 시간을 재 둔다(API `maxDuration=300`초, Hobby 요금제라 한도 상향 불가). 2026-09-26 실측 3단계 4분·5단계 4분 → 5단계 effort 기본 `high`(`STUDIO_STAGE5_EFFORT=xhigh`로 복귀 가능). 기존 초안 세트는 7단계가 "준비 전"이라 게시가 막히므로 2단계부터 다시 생성한다(순서서 A절 5번).
5. 5일차 검토(순서서 E절, 과목×12항목 체크리스트를 `docs/review/2026-09-29-owner-review.md`에 기록).

**뒤로 미룬 것 (§6.2 필수 아님, 2026-09-25 장부에 기록된 이탈 포함)**
- 스펙 §6.2: `standard_levels`·`exemplars` DB 적재(지금은 파일), 안내장 발송·학생/학부모 열람(지금은 원장 확정·인쇄만), 활동지 수준별 세 장 자동 분화(지금은 한 장에 3층 표시), 초등·고등 학교급 분기, 역사 세트, 2025 국·수·영 예시 파일 반영, 동사 뱅크 파일화, 난이도 실측 루프, 복붙·외부 AI 탐지, 검수 QA 루틴, 3B 교재 인쇄(`lib/print/booklet.ts`)는 v2 `Snapshot` 타입 기준으로 착수.
- `lib/studio/prompts/rules/index.ts`의 `FOLDER_FOR` 죽은 코드, `localeCompare` 동점 처리 미정(Task 2 리뷰 minor).
- 초등 `school_level` 스키마 확장(현재 중·고 기준 — Task 2 리뷰 minor).
- 검토 prompt에 들어가는 3단계 프로젝션 축소(현재 stage 3 전체를 그대로 넣어 5~7단계 검토가 3만자 안팎 — Task 4 fix round 1에서 측정, "slim stage-3 review projection"으로 명명, 발표 뒤 최적화).
- `app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts`의 react-hooks eslint 오류 2건(리스트에 있던 사전 존재 오류, Task 5·7에서 그대로 확인만 함).
- 스펙 부록 A C-24 두 문장 병합(Task 3 review, minor deferred).

**받아들인 부채(accepted debt) — 고칠 수는 있지만 이번 범위에서는 그대로 두기로 함**
- `lib/` 안 검토·린트 진단 문구가 한글 리터럴로 하드코딩됨(다국어 대응 시 손볼 대상). 같은 부류: `lib/studio/checks.ts`·`lib/classroom/notice-lint.ts`(이슈 문구, Task 8 review minor deferred), `lib/studio/stages.ts`(정적 검사 예외 문구, 예: "검토 반복 한도 도달 — 관리자가 직접 수정"), `lib/classroom/grade.ts`(`GradingAlignError` 메시지).
- `app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts`의 react-hooks eslint 오류 2건(위 목록과 중복 기재 — 사전 존재 오류, Task 5·7에서 확인만 함, 고치지 않음).

**진행 중(문서 작성 시점 기준, 병렬 진행)**: 최종 전체 리뷰(main..d8ddad6 범위)에서 나온 지적 I1~I4(Important)·M5·M6(Minor)의 수정 회차가 코드 파일에서 진행 중이다. 이 절의 수치·목록은 그 수정이 반영되기 전 상태이므로, 수정이 들어오면 이 STATUS.md도 다시 확인해야 한다.

**다음**: 위 수정 회차 반영 확인 → main 병합 → 5일차 실제 생성·검토(순서서 절차대로).

**알려진 한계**
- **사진 업로드 경로 없음 — 종이 답안 문항은 앱 안에서 채점이 끝나지 않는다.** 종이 답안 문항(과목 세트마다 최대 1개)은 학생이 직접 답할 수 없고(3B까지), 그 문항 점수와 종합 점수는 완성되지 않으며 단원 평가 안내장에서도 그 결과 칸이 빠진다. 시연 세트(수학·과학)에는 2026-09-26 구조 변경으로 종이 답안 문항이 없다.
- 원장 화면은 A~E 등급을 그대로 보여준다(스펙에 원장 제한 규정 없음).
- 가짜 응답(mock) fixture는 수학·과학만 v2다. 국·영·사는 실제 키로 생성해야 한다(2단계 [TS] 검사가 정상 작동해 다른 과목 성취기준으로는 실패한다).

## 다음: 3주차 계획 (아직 안 씀)

**시연 연습에서 발견한 3주차 손질 목록(2026-09-20)**
- 패키지 표지 `게시일`이 ISO 원문(`2026-09-20T06:14:16.066Z`)으로 보임 → 한국어 날짜로
- 게시 패널 첫 게시 전 문구 "현재 버전 1 → 다음 버전 1"이 어색함(초안 v1 = 첫 게시 v1) → 첫 게시 전에는 "첫 게시(버전 1)"로
- 대주제 공유 자료: JSON 붙여넣기 대신 AI 생성 + 표 폼(작업 칩 등록됨). 원장님 시연 전 필수
- 패키지 표·그래프 디자인: 표 가운데 정렬·숫자 오른쪽 정렬·제목 줄 배경, 그래프 배치, 인쇄용(A4) 화면 — 실제 AI 응답이 들어온 뒤 홈페이지 3.1 디자인과 함께(대표님 요청 2026-09-20)
- 세트 삭제 UI 없음(잘못 만든 세트는 DB에서 지워야 함; 과목당 1세트 제약 때문에 다시 못 만듦)
- 확인된 정상 흐름(스테이징 DB): 대주제 → 소개 생성·확정 → 공유 자료 저장 → 수학 세트(9수04-02·03·04) → 기본값 진행 → 핵심질문 선택 → 성취기준 3개 검증 → 게시 v1. 원장 화면 확인은 원장 계정으로 아직 안 함

학생 배정·답안 제출·AI 채점. 새 계획을 쓰기 전에 이번 문서의 "기술 메모"와 스펙 §6 완료 기준을 다시 확인할 것.

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
- **큰 스키마 단계는 JSON 모드(2026-09-26 운영 장애 수정)**: 3단계 차시 설계 생성이 API 400 `The compiled grammar is too large`로 막혔다(구조화 출력 `output_config.format`의 문법이 너무 큼). 이제 3·5·6·7단계 생성은 `output_config.format` 없이 시스템 끝 블록에 JSON 스키마(`z.toJSONSchema(schema, {io:'input'})`, 3단계 4,808자·5단계 4,666자)를 붙이고 응답 텍스트를 zod로 검증한다(`lib/studio/stages.ts` `STAGE_OUTPUT_MODE`, `lib/ai/claude.ts` `mode`). 0·1·2·4단계·검토·채점·안내문은 structured 그대로이고, structured가 같은 400을 받으면 같은 시도 안에서 JSON 모드로 자동 대체하고 그 스키마는 프로세스가 살아 있는 동안 JSON 모드로 기억한다(로그 `grammar-too-large → json`).
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
# 프로젝트 현재 상태 (인수인계용)

다른 컴퓨터에서 새 Claude 대화를 열 때 이 파일을 먼저 읽으면 이어서 작업할 수 있다.
갱신: 2026-09-26 (대주제 학년 선택 — 마이그레이션 0012 적용 대기)

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
- **성취기준 원문 자동 대조(2026-09-26)**: `/admin/standards`의 "원문 자동 대조" 버튼이 평가원 성취수준 원문(`data/reference/levels/*.json`)과 코드 기준으로 대조해(`lib/standards/crosscheck.ts`, 공백은 한 칸으로 접지 않고 전부 제거 — PDF 줄바꿈 공백 아티팩트 대응) 일치하는 행만 자동 검증 처리한다 — 오프라인 집계는 `data/standards/crosscheck-2026-09-26.md`(검증됨 724 / 불일치 6 / 대조 불가 1,084, 합계 1,814, 남은 6건은 전부 실제 표기 차이), 방법은 `data/standards/README.md` "원문 대조 (2026-09-26)" 절.
- **제작소 파이프라인(백엔드)**:
  - `lib/studio/schemas.ts` 단계 0~6 zod 스키마(단일 출처), `lib/studio/prompts/{rules,stages}.ts` 프롬프트(규칙 블록은 캐시), `lib/studio/fidelity.ts` 재구성 원문 이탈 검사, `lib/studio/stages.ts` 단계 실행기(generate → review → accept), `lib/studio/repo.ts` Supabase 저장소.
  - API `POST/GET /api/studio/item-sets/[id]/stages/[stage]` (`{action:'generate'|'review'|'accept'}`; 관리자만, 비로그인 401). 한 요청 = Claude 호출 1회.
  - 확정 게이트: n단계 생성은 n-1단계가 `accepted`여야 하고(0단계 예외), prior 에는 accepted 출력만 들어간다. 2단계부터는 성취기준 2개 이상 연결 필수. 2단계 검토는 순수 TS 원문 이탈 검사가 먼저 걸러내고(모델 호출 없음), 검토 결과 `{pass, issues}`는 `generation_log.issues`에 남는다.
  - `lib/ai/claude.ts`: `claude-opus-5`(생성·검토), adaptive thinking, 구조화 출력(`zodOutputFormat`), 스트리밍(`messages.stream().finalMessage()`, max_tokens 48000), 파싱 실패 시 1회 재시도, refusal/max_tokens 는 즉시 실패. 채점용 `claude-sonnet-5`는 3주차.
- **가짜 응답(mock) 모드**: `ANTHROPIC_API_KEY`가 없으면(개발·테스트) `data/studio-fixtures/*.json`(중1 수학 샘플)을 돌려주고 `stage_status.stageN.model === 'mock'`·`generation_log.model = 'mock'`으로 표시된다. **실제 호출로 바꾸려면** `.env.local`과 Vercel 환경변수에 `ANTHROPIC_API_KEY`를 넣고 `AI_MOCK`은 비워 둔다(`AI_MOCK=1`이면 키가 있어도 fixture). production에서 키가 없으면 mock 으로 빠지지 않고 에러가 난다.
- **샘플(정답 예시)**: `docs/samples/2026-09-20-중1-일회용품-*.md` (수학 완전판 + 국·영·과·사, 공유 자료 C·D 정본).
- 테스트: `npm test` 20파일 / 108 테스트, Python `tests/extract_standards_test.py`·`tests/extract_math_test.py`.

## 대표님이 결정한 것 (스펙에 반영됨)
- 논술형 채점표는 MYP 방식: 평가요소 4개 × 0~4점, 총점 22, 7등급 경계표. 예시답안 상/중/하는 채점표로 실제 채점해 등급이 맞아야 한다. (세트 구성은 2026-09-26 결정으로 바뀌었다 — 아래 줄)
- 세트 = 소단원 하나(성취기준 2~6개), 같은 대주제의 세트는 같은 학년. 학년은 교육과정 학년 하나만(선행 전제 없음). (학년은 2026-09-26 결정으로 선택이 됐다 — 아래 줄)
- 2026-09-26 대표님: **대주제 학년은 선택(학교급만 필수)** — 2022 개정 성취기준은 학년군 단위(중학교 1~3학년군, 초등 3~4·5~6학년군)라 "중1 교과서 범위가 아님"은 약한 기준이었고 검토에서 계속 실패했다. 대주제 만들기의 학년 기본값은 "학년 지정 안 함(학년군 전체)"(`themes.grade = null`), 대주제 화면의 [학년 바꾸기]로 기존 대주제도 바꿀 수 있다(세트 `item_sets.grade`도 함께, 게시 판은 다시 게시해야 표지가 바뀜). 학년이 없으면 프롬프트·화면이 "중학교(1~3학년군)" / "초등학교(3~6학년)"(`lib/studio/level-map.ts` `gradeLabel`, 화면 문구는 `content/site.ts`), 1단계 적합성 검토는 성취기준 코드가 학교급(중 `[9…]`, 초 `[4…]`·`[6…]`)인지와 대주제만 본다(`grade_level` 이슈는 학교급이 실제로 틀린 경우만). 규칙 C-24 "교육과정 학교급(학년군) 수준", S-영-07·S-국-01·S-수-05·S-수-06의 중1 고정 문구도 정리. 학년을 정한 대주제는 지금 문구 그대로("중 1학년"). **마이그레이션 0012(`20260926000012_theme_grade_optional.sql`)는 파일만 있다 — 대표님 `supabase db push` 대기(코드 push 전에).**
- 핵심질문은 두 층: 세트 핵심질문 1개 + 차시 핵심질문(마무리 퀴즈가 점검).
- 역사 통합 영역(`9역01`~`02`)은 세계사로 둔다(2026-09-20 확정).
- 같은 대주제의 과목들은 같은 자료(A~D)를 공유한다(자료는 대주제 수준). 모든 자료는 자작.
- 2026-09-26 대표님(세트 구조): 매 교수 차시 끝 = 이해 점검 퀴즈 3문항(그대로, 마지막 교수 차시 포함). 세트(단원 = 교수 차시 3~5개, 시연 세트 5개) 끝 = **서술형 1문항 + 논술형 1문항, 정확히 2문항**을 5차시 뒤 **6차시 단원 평가**(60분 = 안내 5 · 서술형 15 · 논술형 35 · 정리 5, 퀴즈 없음)에서 함께 본다. 두 문항 모두 분석적 루브릭(요소별) + 총체적 루브릭(상/중/하). **배점 가정(본사, 대표님이 바꿀 수 있음): 서술형 6점(요소 2~3개) + 논술형 16점(4요소 × 4) = 22점** — 7등급표·`level_ref`는 그대로. 바꾸는 순서: ① `lib/studio/assessment-structure.ts`의 숫자(`SET_ITEMS`·`ASSESSMENT_SESSION`, 총점이 22가 아니면 `lib/studio/level-map.ts` `GRADE_TABLE_22`도) → 스키마·[TS]·5단계 프롬프트·검토 초점·화면 문구·규칙 문장(C-14·C-31·L-09·S-수-02, `lib/studio/structure-text.ts`가 만든다)이 따라 바뀐다 ② `npx vitest run tests/rules.test.ts`가 알려 주는 새 문장으로 스펙 부록 A의 C-14·C-31·L-09·S-수-02 행을 고친다 ③ 시연 fixture의 서술형 채점표(`scripts/upgrade-fixtures-v2.ts` PATCHES, 3요소 × 0~2)를 새 배점에 맞게 다시 쓰고 스크립트를 돌린다(배점이 안 맞으면 스크립트가 멈춘다). 평가 문항 수준 목표: 평가원·교육청 공개 예시 문항과 같은 수준·형식(5단계 프롬프트, 참고 카드 서술형 2 + 논술형 3). 옛 구조로 게시된 판(서술형 3+3 + 논술형)은 학생 답안·채점이 묶여 있어 그대로 둔다. 시연 세트: 수학은 상대도수 서술형을, 과학은 재활용이 어려운 이유 서술형을 남겼다(수학의 종이 답안 도수분포표 문항을 빼서 시연 세트에 종이 답안 문항이 없다).
- 2026-09-26 대표님: **퀴즈는 단답형만(객관식 폐지)** — 서논술 과정이라 어디에도 객관식이 없다. 교수 차시 마무리 퀴즈 3문항은 모두 학생이 낱말·수치·짧은 구를 직접 쓰는 단답형(선택지 없음, 정답·한두 줄 해설)이고, 채점은 기존 `lib/classroom/quiz.ts`의 너그러운 비교 그대로다(정답 표기가 여럿이면 " / "로). 새 세트는 zod(`LessonDesign`)와 [TS]("퀴즈는 단답형만(선택지 금지)")가 선택형을 막고(규칙 L-09·L-10), 이미 게시된 옛 판의 선택형 퀴즈는 바꾸지 않고 보기 단추로 그대로 보이고 채점된다(보기에 기대는 발문이 있어 기계 변환하지 않는다). 시연 fixture 20문항(수학 7·과학 13)을 단답형으로 다시 썼다(`scripts/upgrade-fixtures-v2.ts` PATCHES).
- 2026-09-26 대표님: 조건은 지침이지 풀이 힌트가 아니다(계산식·풀이 순서·자료 수치·결론 금지) — 조건은 논술형에만 2~4개, 서술형은 조건 없이 분량·형식만(규칙 C-32, [TS] 검사).
- 2026-09-24 오너 결정: 대주제 소개(0단계)는 검토 관문이 없다 — 세트 품질을 좌우하는 관문이 아니라 배경 정보이기 때문. `ThemeIntroPanel`은 이제 [AI 초안 받기]·[저장] 두 버튼뿐이고(검토·확정·시도 횟수 표시 삭제), 저장하면 검증만 거쳐 바로 확정 상태(`themes.intro`)로 저장된다(`lib/studio/stages.ts` `runThemeIntro`: `generate`|`save`, `review`/`accept`는 `STAGE_ERRORS.INTRO_ACTION_NOT_SUPPORTED`로 막힌다).
- 2026-09-26 대표님: **검토는 참고, [확인]으로 진행** — 세트 마법사(2~7단계)는 검토 때문에 멈추지 않는다. 각 단계는 [생성] → 관리자가 읽기 → [확인]. 생성 직후 [TS] 정적 검사가 「자동 검사 메모」로 붙고(모델 호출 없음), [AI 검토 의견 보기]는 선택(참고, 통과·불통과 없음). 시도 한도(`MAX_ATTEMPTS`)는 기록일 뿐 잠그지 않는다. [기본값으로 진행]은 생성→확인만 하고 생성 실패에서만 멈춘다. 게시는 구조만 본다(2~7단계 확인·성취기준 검증·핵심질문·단답형 퀴즈). 운영 순서는 런북 `docs/runbooks/2026-09-29-five-subjects.md` C절.

## 2주차-B 완료 (2026-09-21)
브랜치 `week2b-studio-ui`. 제작소 화면과 원장 열람 화면이 모두 붙었다.

**화면·라우트**
- `/admin/items` 대주제 목록 · `/admin/items/new` 대주제 생성
- `/admin/items/[themeId]` 대주제 소개(0단계, `ThemeIntroPanel`) 생성/검토/확정(**2026-09-24 결정으로 검토·확정 관문 삭제 — 위 "대표님이 결정한 것" 절**), 공유 자료 A~D(`SharedMaterialsPanel`), 성취기준 선택(`StandardsPicker`)으로 세트 생성
- `/admin/items/[themeId]/sets/[setId]` 세트 마법사(`StageWizard`/`useStageRunner`, 2~6단계 생성→검토→[다음]=accept, "기본값으로 진행"), 핵심질문 선택, 이미지 첨부(`Attachments`), 게시(`PublishPanel`, `item_set_versions` 스냅샷)
- `/admin/standards` 성취기준 검증(과목·학교급 필터, `verified_at` 체크) — PDF 쪽 입력은 이번 범위 밖
- `/teacher/items` 문항(세트) 목록 · `/teacher/items/[setId]` 게시된 세트 열람(검증된 성취기준·확정 자료만 노출)
- API: `POST/GET /api/studio/item-sets/[id]/stages/[stage]`, `POST/GET /api/studio/themes/[id]/intro`, `POST /api/studio/upload`(첨부) — 알려진 실패는 400 `{error: code, message}`, 그 외는 500 `{error:'internal'}`(로그만 서버에 남김). 오류 코드는 `lib/studio/stages.ts`의 `STAGE_ERRORS`(`stage-prev-not-accepted`/`too-few-standards`/`nothing-to-review`/`accept-requires-review`) — `StageError`로 던지고 라우트가 매핑한다.

**시연 절차**
- 관리자: 대주제 생성 → 소개 생성/확정 → 공유 자료 → 세트 생성(성취기준 선택) → 마법사 2~6 [기본값으로 진행] → 핵심질문 선택 → 미리보기 → 게시
- 원장: 로그인 → 문항 찾기 → 열기

**대표님이 아직 하실 일**
- (2B는 main에 병합·push 완료, 2026-09-20)
- **키가 오기 전 시연용**: Vercel → Settings → Environment Variables에 `AI_MOCK` = `1` 추가(Production·Preview·Development 모두) → Deployments에서 Redeploy. 운영 환경은 키가 없으면 mock으로 넘어가지 않고 "ANTHROPIC_API_KEY is not set" 오류가 난다.
- ~~키가 오면~~ **2026-09-20 완료**: Vercel에 `ANTHROPIC_API_KEY` 등록, `AI_MOCK` 삭제, Redeploy. 스테이징에서 대주제 소개를 실제 AI로 생성 확인(20초). 노트북 `.env.local`에는 아직 키가 없음(로컬은 mock) — 로컬에서 실제 호출이 필요하면 그때 넣는다.

**알려진 한계**
- 로컬(개발)은 `ANTHROPIC_API_KEY` 없으면 mock 모드(가짜 응답, `model:'mock'` 배지). Vercel(운영)은 `AI_MOCK=1`을 넣어야 mock, 아니면 오류
- 가짜 응답(fixture)은 **중1 수학, 성취기준 9수04-02·03·04** 세트와 **중1 과학, 성취기준 9과01-01·9과01-03** 세트를 흉내 낸다. 시연 연습에서 세트를 만들 때 수학이면 그 세 개를, 과학이면 그 두 개를 반드시 고를 것. **그 밖의 과목(국·영·사·한국사·세계사)은 과목 fixture가 없어 수학 fixture로 떨어지므로 2단계 검토가 "원문에 없는 표현"으로 실패한다**(검사기가 정상 작동한 것). 같은 과목이라도 성취기준을 다르게 고르면 마찬가지다. 자세한 규칙은 `data/studio-fixtures/README.md`. 대주제 공유 자료는 `docs/samples/2026-09-20-중1-일회용품-공유자료.json`을 붙여넣는다.
- hwp(한글) 내보내기 없음 — 화면에서 보고 복사/인쇄만 가능
- 첨부 이미지는 `materials` 버킷 공개 읽기이므로 URL을 아는 사람은 누구나 볼 수 있음(비공개 자료는 올리지 말 것)

## 3주차-A 완료 (2026-09-23)
브랜치 `week3a-classroom`. 학생 배정·답안 제출·AI 채점·원장 검수 화면과 로직이 모두 붙었다.

**화면·라우트**
- `/teacher` 원장 홈(대시보드: 검수 대기 수·진행 중 배정 수·학생 수)
- `/teacher/students` 학생 관리(추가/목록/비밀번호 초기화)
- `/teacher/items` 게시된 문항(세트) 목록 · `/teacher/items/[setId]` 세트 열람
- `/teacher/assignments` 배정 현황(목록) · `/teacher/assignments/new?set=[setId]` 배정하기
- `/teacher/assignments/[setId]` 배정 상세 = 차시 열기 조절 + 퀴즈 현황 + 답안 검수(AI 초안 확인·수정·확정, AI 다시 채점)
- `/student` 내 과제(배정된 세트 목록)
- `/student/assignments/[id]` 과제(차시별 퀴즈·답안 제출·결과·재도전)
- API: `POST /api/classroom/gradings/[id]/run`(AI 채점 실행). 확정·재채점·차시 열기·퀴즈 정오 뒤집기는 서버 액션 (`app/teacher/assignments/[setId]/actions.ts`).

**시연 절차** (가짜 응답 수학 세트 기준 — 2026-09-26 구조 변경 전 기록이다. 지금은 1~5차시 = 교수 차시(퀴즈만), 6차시 = 단원 평가(서술형·논술형). 최신 절차는 `docs/runbooks/2026-09-29-five-subjects.md` D절)
1. 원장: 학생 2명 추가(초기 비밀번호 메모)
2. 원장: 문항 찾기 → 수학 세트 열기 → [배정하기] → 학생 선택 · "처음 열 차시 수" 2 · "재도전 허용" 체크 → 배정
3. 학생: 1차시 퀴즈 제출(즉시 결과) → 2차시 퀴즈 → 2차시 서술형1 답안 60자 이상 제출 → "확인 중"
4. 원장: 배정 현황 → 세트 [열기](`/teacher/assignments/[setId]`) → 서술형1 검수 대기 카드 → 점수 그대로 또는 수정 → 확정
5. 원장: 같은 화면 "차시 열기"에서 "5차시까지 열기" → [반 전체에 적용]
6. 학생: 4차시 서술형2, 5차시 논술형 답안 제출 → 원장이 두 카드 확정 → 학생 화면에 종합 점수·등급
7. 학생: 결과 확인 → [다시 써 보기] → 2회차 제출 → 원장 확정 → 1·2회차 비교

**대표님이 아직 하실 일**
- 마이그레이션 0009(수업 운영 표) 적용: 프로젝트 폴더 터미널에서 `supabase db push`
- `git push` 브랜치를 main에 병합 후 또는 직접 push

**알려진 한계**
- 학생은 퀴즈 응답을 직접 쓰지 못한다(정책 없음). 서버가 채점(judgeQuiz)한 뒤 service role 로 넣는다. 답안 정책은 제출 전·50자·재도전 조건을 DB에서도 검사한다
- 채점 "실행 중" 표시는 pending + updated_at(5분 임대)이다. 5분 넘게 pending 이면 원장의 [AI 다시 채점]으로 다시 돌릴 수 있다
- 사진·교재·공유 자료 생성(대시보드·시연 자료)은 3B에서
- 비용 상한(월 채점 건수) 관리·관리자의 재채점 처리는 발표(2026-10-18) 뒤
- 학생 계정 삭제 기능 없음(활동 기록 유지)

## 제작소 v2 핵심 완료 (브랜치 `studio-v2`, 2026-09-25 계획 Task 1~9)
계획 `docs/superpowers/plans/2026-09-25-item-studio-v2-core.md`, 스펙 `docs/superpowers/specs/2026-09-25-item-studio-v2-design.md`. 진행 장부(모든 판단·이탈 기록) `.superpowers/sdd/2026-09-25-item-studio-v2-core/progress.md`, Task별 보고서는 같은 폴더의 `task-N-report.md`.

- 단계는 **0~7**(7 = 차시별 피드백 안내장 틀, 마법사 2~7). 게시하려면 2~7단계가 모두 확인(`accepted`)돼야 한다(`PUBLISH_STAGES`, `lib/studio/publish.ts`).
- ~~검토 반복 한도 3회로 막기~~ → 2026-09-26 대표님 결정으로 바뀌었다: 세트 단계는 [생성] → 읽기 → [확인]. [TS] 정적 검사는 생성 직후 「자동 검사 메모」(`status.notes`, 참고)로 붙고, [AI 검토 의견 보기]는 선택이며 아무것도 막지 않는다. `MAX_ATTEMPTS`(`lib/studio/max-attempts.ts`)는 기록용으로만 남는다(`lib/studio/stages.ts` `runStage`, `lib/studio/next-action.ts`).
- 단계를 편집하면 그 뒤 단계(7단계까지)가 전부 "준비 전"으로 초기화된다(`lib/studio/edit-rules.ts`).
- 게시 스냅샷은 v2(`schema_version: 2`, `unit_plan`·`reconstruction_detail`·`notice_plan`·`references`). v1 시절 게시 판은 그대로 두고 읽을 때 `upgradeSnapshot`(`lib/studio/compat.ts`)으로 올린다 — DB 재작성 없음.
- 마이그레이션 **0011**(`20260925000011_studio_v2.sql`): `item_sets.unit_plan/reconstruction_detail/notice_plan` 열 + 학생별 안내장 표 `lesson_notices`(기존 공지사항 표 `notices`와 이름이 겹쳐 따로 둠).
- 마이그레이션 **0012**(`20260926000012_theme_grade_optional.sql`, 2026-09-26, **적용 대기**): `themes.grade`·`item_sets.grade` null 허용 + "비어 있거나 1~6" 검사(`themes_grade_check`·`item_sets_grade_check`, 지우고 다시 만들어 여러 번 실행해도 안전). 코드 push 전에 `supabase db push` — 없이 배포하면 "학년 지정 안 함" 대주제 만들기·[학년 바꾸기]가 저장 오류.

**브랜치 내용 (Task별)**
| Task | 무엇을 했나 | 핵심 파일 |
|---|---|---|
| 1 | 스키마 v2(0~7단계), 7등급↔수준 대응표, v1→v2 업그레이더, [TS] 정적 검사 | `lib/studio/{schemas,level-map,compat,checks}.ts` |
| 2 | 성취수준 로더·예시 은행 선택기·서버 채움(enrich) | `lib/reference/{levels,exemplars}.ts`, `lib/studio/enrich.ts` |
| 3 | 규칙 부록 A → 코드(ID·출처 태그) 분할, 성취수준·예시 은행 주입 프롬프트 | `lib/studio/prompts/rules/**`, `lib/studio/prompts/stages.ts` |
| 4 | 단계별 검토 초점 v2, [TS] 선행 검토, enrich 출력 저장, 검토 prior 단계별 축소 | `lib/studio/stages.ts`, `lib/studio/prompts/stages.ts` |
| 5 | 마이그레이션 0011, repo 2·3·7단계 열 저장·복원, 스냅샷 v2, 7단계 게시 조건, 마법사 확장, tsc 46→0 | `supabase/migrations/20260925000011_studio_v2.sql`, `lib/studio/{repo,publish}.ts` |
| 6 | fixture v2(수학·과학, 2~7단계), `draftNoticePlan`, 변환 스크립트, C-03 정답 유출 제거 | `scripts/upgrade-fixtures-v2.ts`, `data/studio-fixtures/*`, `lib/studio/notice-draft.ts` |
| 7 | PackageView v2 카드(스펙 §2.9), 학생 화면(종이 답안·번호 조건), 채점 프롬프트 v2, 채점 기준 정합(`alignCriteria`) | `components/studio/PackageView.tsx`, `lib/classroom/grading-prompt.ts` |
| 8 | 학생별 차시 안내장(조립·린트·원장 확정·인쇄) | `lib/classroom/{notice,notice-lint,notice-prompt}.ts`, `app/teacher/assignments/[setId]/notices/**` |
| 9 | 문서(이 절), 실행 순서서, fixture README, 자리 채움 검사 테스트 | `docs/runbooks/2026-09-29-five-subjects.md`, `tests/no-placeholder.test.ts` |

**현재 수치 (HEAD `d8ddad6` 기준, 2026-09-25 재확인)**
- `npx vitest run`: 52 files / **444 tests, 0 skipped, 0 failed** (과제 9의 `tests/no-placeholder.test.ts`를 더하면 53 files / 445 tests).
- `npx tsc --noEmit`: **0 errors**.
- `npm run build`: 성공(전 라우트 컴파일).
- `npx eslint`: 알려진 사전 존재 오류 2건(`useStageRunner.ts` 40:3·50:5, react-hooks) — Task 5 보고서에서 베이스 커밋에도 있었음을 확인. 그 외 파일은 clean.

**실행 순서서**: `docs/runbooks/2026-09-29-five-subjects.md`(준비 → 성취기준 선택 → 과목별 생성 → 시연 흐름 → 대표님 12항목 체크리스트 → 실패 기록 → 알려진 한계).

**대표님이 하실 일 (순서를 지킬 것 — 1번이 2번보다 먼저다)**
1. **먼저** 마이그레이션 0012(대주제·세트의 학년 칸을 비울 수 있게) 적용: `supabase db push`. 0011은 2026-09-26에 이미 적용됐다. 0012는 열을 nullable로 바꾸고 제약을 다시 거는 것뿐이라 다시 실행해도 안전하다. **반대로 하면**(코드를 먼저 배포하면) "학년 지정 안 함"으로 대주제를 만들거나 "학년 바꾸기"를 누를 때 저장 오류가 난다(그 외 화면은 정상). **0010 파일은 없다** — 번호만 비어 있다. 자세한 순서는 `docs/runbooks/2026-09-29-five-subjects.md` A절 1번.
2. **그 다음에** `git push`, Vercel 배포 Ready 확인. 배포 뒤 대주제 페이지에서 "학년 바꾸기 → 학년 지정 안 함(학년군 전체)"으로 바꾸고 세트를 새 흐름([생성]→[확인])으로 만든다.
3. 공유 자료 B(작년·올해 일회용품 개수): `docs/samples/2026-09-20-중1-일회용품-공유자료.json`·fixture는 원자료(개수)로 이미 고쳤고 "두 해는 부스 수와 전체 개수가 다르다" 문장도 뺐다(수학 서술형 이유 요소 유출). 남은 것은 호스팅 DB의 대주제 공유 자료를 같은 원자료(개수) 표·본문으로 패치하는 일이다(순서서 A절 6번).
4. 5일차 생성 전에 실제 3단계·5단계 생성 한 번씩 시간을 재 둔다(API `maxDuration=300`초, Hobby 요금제라 한도 상향 불가). 2026-09-26 실측 3단계 4분·5단계 4분 → 5단계 effort 기본 `high`(`STUDIO_STAGE5_EFFORT=xhigh`로 복귀 가능). 기존 초안 세트는 7단계가 "준비 전"이라 게시가 막히므로 2단계부터 다시 생성한다(순서서 A절 5번).
5. 5일차 검토(순서서 E절, 과목×12항목 체크리스트를 `docs/review/2026-09-29-owner-review.md`에 기록).
   - 2026-09-25: 제작소 5단계 요약이 문항 전부(조건 번호·분량·채점표 요소×점수 표(0점부터)·총체적 기준·유의점·예시답안(접힘)·A~E)와 따로 선 "채점 기준표(공통)"(등급표·피드백 틀)를 보여 준다(`Stage5Summary.tsx`). 게시 판도 등급표·피드백 틀을 "채점 기준" 카드 하나로 모았다. 채점표 척도는 점수로 읽고 0점부터 오름차순으로 맞춘다(`lib/studio/scale.ts` — 영어 세트의 거짓 "0점 서술에 무응답·시도 구분이 없음" 7건은 풀어 쓴 0점 서술("답을 쓰지 않았거나 …썼지만")을 낱말 검사가 못 알아본 것). 5단계 지시문·검토에 선택형 발문 구체성·상황 인물 창작 금지·척도 오름차순·"<조건>에 맞게" 규칙, [TS]에 상황 인물 자문을 더했다(E절 8-1). **영어 세트의 발문("한 가지씩")·청중("교환학생")은 저장된 출력이라 5단계를 다시 생성해야 바뀐다.**

**뒤로 미룬 것 (§6.2 필수 아님, 2026-09-25 장부에 기록된 이탈 포함)**
- 스펙 §6.2: `standard_levels`·`exemplars` DB 적재(지금은 파일), 안내장 발송·학생/학부모 열람(지금은 원장 확정·인쇄만), 활동지 수준별 세 장 자동 분화(지금은 한 장에 3층 표시), 초등·고등 학교급 분기, 역사 세트, 2025 국·수·영 예시 파일 반영, 동사 뱅크 파일화, 난이도 실측 루프, 복붙·외부 AI 탐지, 검수 QA 루틴, 3B 교재 인쇄(`lib/print/booklet.ts`)는 v2 `Snapshot` 타입 기준으로 착수.
- `lib/studio/prompts/rules/index.ts`의 `FOLDER_FOR` 죽은 코드, `localeCompare` 동점 처리 미정(Task 2 리뷰 minor).
- 초등 `school_level` 스키마 확장(현재 중·고 기준 — Task 2 리뷰 minor).
- 검토 prompt에 들어가는 3단계 프로젝션 축소(현재 stage 3 전체를 그대로 넣어 5~7단계 검토가 3만자 안팎 — Task 4 fix round 1에서 측정, "slim stage-3 review projection"으로 명명, 발표 뒤 최적화).
- `app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts`의 react-hooks eslint 오류 2건(리스트에 있던 사전 존재 오류, Task 5·7에서 그대로 확인만 함).
- 스펙 부록 A C-24 두 문장 병합(Task 3 review, minor deferred).

**받아들인 부채(accepted debt) — 고칠 수는 있지만 이번 범위에서는 그대로 두기로 함**
- `lib/` 안 검토·린트 진단 문구가 한글 리터럴로 하드코딩됨(다국어 대응 시 손볼 대상). 같은 부류: `lib/studio/checks.ts`·`lib/classroom/notice-lint.ts`(이슈 문구, Task 8 review minor deferred), `lib/studio/stages.ts`(정적 검사 예외 문구, 예: "검토 반복 한도 도달 — 관리자가 직접 수정"), `lib/classroom/grade.ts`(`GradingAlignError` 메시지).
- `app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts`의 react-hooks eslint 오류 2건(위 목록과 중복 기재 — 사전 존재 오류, Task 5·7에서 확인만 함, 고치지 않음).

**진행 중(문서 작성 시점 기준, 병렬 진행)**: 최종 전체 리뷰(main..d8ddad6 범위)에서 나온 지적 I1~I4(Important)·M5·M6(Minor)의 수정 회차가 코드 파일에서 진행 중이다. 이 절의 수치·목록은 그 수정이 반영되기 전 상태이므로, 수정이 들어오면 이 STATUS.md도 다시 확인해야 한다.

**다음**: 위 수정 회차 반영 확인 → main 병합 → 5일차 실제 생성·검토(순서서 절차대로).

**알려진 한계**
- **사진 업로드 경로 없음 — 종이 답안 문항은 앱 안에서 채점이 끝나지 않는다.** 종이 답안 문항(과목 세트마다 최대 1개)은 학생이 직접 답할 수 없고(3B까지), 그 문항 점수와 종합 점수는 완성되지 않으며 단원 평가 안내장에서도 그 결과 칸이 빠진다. 시연 세트(수학·과학)에는 2026-09-26 구조 변경으로 종이 답안 문항이 없다.
- 원장 화면은 A~E 등급을 그대로 보여준다(스펙에 원장 제한 규정 없음).
- 가짜 응답(mock) fixture는 수학·과학만 v2다. 국·영·사는 실제 키로 생성해야 한다(2단계 [TS] 검사가 정상 작동해 다른 과목 성취기준으로는 실패한다).

## 다음: 3주차 계획 (아직 안 씀)

**시연 연습에서 발견한 3주차 손질 목록(2026-09-20)**
- 패키지 표지 `게시일`이 ISO 원문(`2026-09-20T06:14:16.066Z`)으로 보임 → 한국어 날짜로
- 게시 패널 첫 게시 전 문구 "현재 버전 1 → 다음 버전 1"이 어색함(초안 v1 = 첫 게시 v1) → 첫 게시 전에는 "첫 게시(버전 1)"로
- 대주제 공유 자료: JSON 붙여넣기 대신 AI 생성 + 표 폼(작업 칩 등록됨). 원장님 시연 전 필수
- 패키지 표·그래프 디자인: 표 가운데 정렬·숫자 오른쪽 정렬·제목 줄 배경, 그래프 배치, 인쇄용(A4) 화면 — 실제 AI 응답이 들어온 뒤 홈페이지 3.1 디자인과 함께(대표님 요청 2026-09-20)
- 세트 삭제 UI 없음(잘못 만든 세트는 DB에서 지워야 함; 과목당 1세트 제약 때문에 다시 못 만듦)
- 확인된 정상 흐름(스테이징 DB): 대주제 → 소개 생성·확정 → 공유 자료 저장 → 수학 세트(9수04-02·03·04) → 기본값 진행 → 핵심질문 선택 → 성취기준 3개 검증 → 게시 v1. 원장 화면 확인은 원장 계정으로 아직 안 함

학생 배정·답안 제출·AI 채점. 새 계획을 쓰기 전에 이번 문서의 "기술 메모"와 스펙 §6 완료 기준을 다시 확인할 것.

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
- **큰 스키마 단계는 JSON 모드(2026-09-26 운영 장애 수정)**: 3단계 차시 설계 생성이 API 400 `The compiled grammar is too large`로 막혔다(구조화 출력 `output_config.format`의 문법이 너무 큼). 이제 3·5·6·7단계 생성은 `output_config.format` 없이 시스템 끝 블록에 JSON 스키마(`z.toJSONSchema(schema, {io:'input'})`, 3단계 4,808자·5단계 4,666자)를 붙이고 응답 텍스트를 zod로 검증한다(`lib/studio/stages.ts` `STAGE_OUTPUT_MODE`, `lib/ai/claude.ts` `mode`). 0·1·2·4단계·검토·채점·안내문은 structured 그대로이고, structured가 같은 400을 받으면 같은 시도 안에서 JSON 모드로 자동 대체하고 그 스키마는 프로세스가 살아 있는 동안 JSON 모드로 기억한다(로그 `grammar-too-large → json`).
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
