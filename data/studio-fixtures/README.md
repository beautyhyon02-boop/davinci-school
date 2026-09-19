# studio-fixtures

`lib/ai/claude.ts`의 `callStructured`가 가짜 응답 모드(`AI_MOCK=1` 또는 `ANTHROPIC_API_KEY` 미설정)에서 실제 Claude 호출 대신 읽어 들이는 고정 JSON 응답이다. 파일명은 `<fixtureKey>.json`이며, 제작소 단계 호출에는 `stage<n>-generate.json` / `stage<n>-review.json` 규칙을 따른다(예: `stage0-generate.json`, `stage3-review.json`). 각 파일의 내용은 호출 시 전달된 zod 스키마로 파싱되므로 스키마를 통과하는 값이어야 하며, 파일이 없으면 `callStructured`는 어떤 fixtureKey가 없는지 알려주는 에러를 던진다.
