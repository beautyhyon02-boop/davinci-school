# studio-fixtures

`lib/ai/claude.ts`의 `callStructured`가 가짜 응답 모드(`AI_MOCK=1` 또는 `ANTHROPIC_API_KEY` 미설정)에서 실제 Claude 호출 대신 읽어 들이는 고정 JSON 응답이다. 파일명은 `<fixtureKey>.json`이며, 제작소 단계 호출에는 `stage<n>-generate.json` / `stage<n>-review.json` 규칙을 따른다(예: `stage0-generate.json`, `stage3-review.json`). 각 파일의 내용은 호출 시 전달된 zod 스키마로 파싱되므로 스키마를 통과하는 값이어야 하며, 파일이 없으면 `callStructured`는 어떤 fixtureKey가 없는지 알려주는 에러를 던진다.

## 과목별 fixture와 폴백

세트 단계(1~6단계)의 fixtureKey에는 과목이 붙는다 — `stage<n>-generate-<과목>.json` / `stage<n>-review-<과목>.json`(예: `stage3-generate-과학.json`). 0단계(대주제 소개)는 과목이 없으므로 `stage0-generate.json` 그대로다.

`lib/ai/mock.ts`의 `loadFixture`는

1. `<fixtureKey>.json`을 먼저 찾고,
2. 없고 키가 `-<과목>`(`lib/studio/schemas.ts`의 `SUBJECTS`)으로 끝나면 과목을 뗀 기본 키(`stage3-generate.json`)로 한 번 더 찾고,
3. 둘 다 없으면 처음 찾던 경로를 담은 에러를 던진다.

그래서 과목 fixture가 있으면 그 과목 내용이, 없으면 기본(중1 수학 샘플) 내용이 나온다.

## 지금 들어 있는 것

| 파일 | 흉내 내는 세트 |
|---|---|
| `stage0~6-{generate,review}.json` | 중1 **수학**, 성취기준 `9수04-02·03·04` (기본값 = 과목 fixture가 없을 때 쓰인다) |
| `stage2~6-{generate,review}-과학.json` | 중1 **과학**, 성취기준 `9과01-01·9과01-03` |
| `standards-math.json`, `standards-science.json` | 위 두 세트의 성취기준 원문(`data/standards/*.json`에서 그대로 복사). 2단계 재구성 원문 이탈 검사(`lib/studio/fidelity.ts`) 테스트용 |

2단계 검토는 모델이 아니라 순수 TS 검사기가 먼저 거르므로, 시연할 때 세트의 성취기준이 위 표와 다르면 2단계 검토가 "원문에 없는 표현"으로 실패한다. 새 과목 fixture를 추가할 때는 `tests/mock-fixtures.test.ts`에 스키마·재구성 검사를 함께 늘린다.
