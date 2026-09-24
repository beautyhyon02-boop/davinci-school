# studio-fixtures

`lib/ai/claude.ts`의 `callStructured`가 가짜 응답 모드(`AI_MOCK=1` 또는 `ANTHROPIC_API_KEY` 미설정)에서 실제 Claude 호출 대신 읽어 들이는 고정 JSON 응답이다. 파일명은 `<fixtureKey>.json`이며, 제작소 단계 호출에는 `stage<n>-generate.json` / `stage<n>-review.json` 규칙을 따른다(예: `stage0-generate.json`, `stage3-review.json`). 각 파일의 내용은 호출 시 전달된 zod 스키마로 파싱되므로 스키마를 통과하는 값이어야 하며, 파일이 없으면 `callStructured`는 어떤 fixtureKey가 없는지 알려주는 에러를 던진다.

**v2(단계 0~7)로 갱신됨(2026-09-25, Task 6).** 채점·안내장 fixture(`grading-*.json`, `notice-draft.json`)도 v2 스키마를 따른다.

## 과목별 fixture와 폴백

세트 단계(1~7단계)의 fixtureKey에는 과목이 붙는다 — `stage<n>-generate-<과목>.json` / `stage<n>-review-<과목>.json`(예: `stage3-generate-과학.json`). 0단계(대주제 소개)는 과목이 없으므로 `stage0-generate.json` 그대로다.

`lib/ai/mock.ts`의 `loadFixture`는

1. `<fixtureKey>.json`을 먼저 찾고,
2. 없고 키가 `-<과목>`(`lib/studio/schemas.ts`의 `SUBJECTS`)으로 끝나면 과목을 뗀 기본 키(`stage3-generate.json`)로 한 번 더 찾고,
3. 둘 다 없으면 처음 찾던 경로를 담은 에러를 던진다.

그래서 과목 fixture가 있으면 그 과목 내용이, 없으면 기본(중1 수학 샘플) 내용이 나온다.

## 지금 들어 있는 것

**세트 구조(대표님 2026-09-26)**: 두 세트 모두 교수 차시 5개(1~5, 퀴즈 3문항씩 — 코드는 3~5개 허용) + 6차시 단원 평가(서술형 6점 + 논술형 16점). v1에서 서술형 둘 중 하나를 뺐다 — 수학은 상대도수 서술형을 남기고 종이 답안 도수분포표 서술형을 뺐고, 과학은 재활용이 어려운 이유 서술형을 남기고 개인 방안 서술형을 뺐다(이유는 `scripts/upgrade-fixtures-v2.ts` PATCHES). 그래서 fixture에 종이 답안 문항이 없다.

| 파일 | 흉내 내는 세트 |
|---|---|
| `stage0~7-{generate,review}.json` | 중1 **수학**, 성취기준 `9수04-02·03·04` (기본값 = 과목 fixture가 없을 때 쓰인다). 7단계는 `stage7-generate.json`/`stage7-review.json`(안내장 틀) |
| `stage2~7-{generate,review}-과학.json` | 중1 **과학**, 성취기준 `9과01-01·9과01-03`(1단계는 과학 전용 파일이 없어 기본(수학) fixture로 폴백한다) |
| `standards-math.json`, `standards-science.json` | 위 두 세트의 성취기준 원문(`data/standards/*.json`에서 그대로 복사). 2단계 재구성 원문 이탈 검사(`lib/studio/fidelity.ts`, `lib/studio/checks.ts`) 테스트용 |
| `grading-서술형.json`, `grading-서술형-과학.json`, `grading-논술형.json`, `grading-논술형-과학.json` | 채점 호출(`lib/classroom/grading-prompt.ts`)이 흉내 내는 AI 채점 초안(서술형은 2026-09-26부터 6점 3요소라 과목마다 요소 이름이 달라 과학 파일이 따로 있다). 문항 카드 채점표에 있는 요소 이름·최댓값을 그대로 따라야 `alignCriteria`(`lib/classroom/grade.ts`)가 받아들인다 |
| `notice-draft.json` | 학생별 차시 안내장 초안 호출(`lib/classroom/notice-prompt.ts`)이 흉내 내는 응답. 수학·과학의 서술형 3요소 + 논술형 4요소 요소명을 모두 담아, 어느 과목 mock 세트로 안내장을 만들어도 린트를 통과한다 |

**과학 4단계(자료) fixture는 공유 자료 B·D 사본을 들고 있다.** 실제 대주제는 공유 자료(A~D)를 과목들이 함께 참조하지만, mock 모드에는 대주제 공유 자료가 없으므로(`prior.shared_materials`가 비어 있음) 과학 세트가 자료 B·D를 "없는 자료"로 [TS] 검사에 걸리는 것을 막기 위해 과학 fixture 자체에 사본을 넣어 두었다. 실제 생성에서는 이 문제가 없다(대주제 공유 자료가 항상 `prior`에 들어간다).

## fixture를 고칠 때 — 손으로 JSON을 고치지 않는다

새 fixture는 실제 생성 결과를 복사해서 만든다. `scripts/upgrade-fixtures-v2.ts`는 **v1 fixture(`tests/fixtures/v1/*`)를 v2로 변환하는 일회성 스크립트**이지, fixture를 유지보수하는 도구가 아니다 — 지금 있는 수학·과학 v2 fixture만 이 스크립트의 결과물이다.

그래도 지금 있는 수학·과학 fixture에서 문제(정답 유출, 오탈자, 스키마 이탈 등)를 발견하면:
1. 손으로 JSON을 고치지 않는다.
2. `scripts/upgrade-fixtures-v2.ts`의 `PATCHES` 항목에 이유 한 줄과 함께 고침 내용을 적는다(예: C-03 정답 유출 패치 — v1 원문을 업그레이드 전에 바꿔치기).
3. `npx tsx scripts/upgrade-fixtures-v2.ts`로 다시 생성한다. 스크립트는 v2 zod와 `staticIssues`([TS])를 전부 통과해야 파일을 쓰고, 문제가 있으면 아무것도 쓰지 않는다.
4. 재실행 결과가 `git status`에서 깨끗해야 한다(바이트 단위로 같아야 함 — 결정적 변환). 안 그러면 스크립트 어딘가에 비결정적 부분(현재 시각, `Math.random` 등)이 섞인 것이다.

`tests/mock-fixtures.test.ts`가 이 규칙(정답 유출 없음, 스키마·[TS] 통과, 결정성)을 검사한다. 새 과목 fixture를 추가할 때도 같은 파일에 스키마·재구성 검사를 함께 늘린다.

## mock e2e 테스트가 fixture를 쓰는 방법

`AI_MOCK=1 npx vitest run tests/mock-fixtures.test.ts`가 수학·과학 두 세트에 대해 0~7단계를 처음부터 끝까지(생성→[TS]→검토→확정) 돌린다. 각 단계는 이전 단계의 accepted 출력을 prior로 받아 다음 fixtureKey를 요청하므로, 표에 없는 조합(예: 다른 성취기준, 다른 과목)을 쓰면 `loadFixture`가 기본(수학) fixture로 폴백하고 2단계 [TS] 검사가 "원문에 없는 표현"으로 실패한다 — 검사기가 의도대로 작동한 것이다. 실제 시연·개발에서 세트를 만들 때는 위 표의 성취기준을 그대로 골라야 한다. 자세한 시연 절차는 `docs/runbooks/2026-09-29-five-subjects.md`를 참고한다.
