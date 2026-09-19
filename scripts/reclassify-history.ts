/**
 * data/standards/한국사.json(92건, 모두 subject:'한국사'로 뭉뚱그려져 있었음)을
 * 실제 한국사/세계사로 재분류해 data/standards/한국사.json(한국사만)과
 * data/standards/세계사.json(세계사만) 두 파일로 나누고, 세계사로 옮겨간
 * 코드에 대해 DB standards 테이블의 subject도
 *   update standards set subject='세계사' where code in (...)
 * 로 맞춘다(supabase-js `.update({subject:'세계사'}).in('code', codes)`를
 * 100개씩 배치로 호출).
 *
 * 분류 규칙과 근거(별책7 쪽수 포함)는 data/standards/README.md의
 * "역사 분리" 절 참고. classifyHistory()가 그 규칙을 코드로 옮긴 순수
 * 판정 함수다 — 추측이 아니라 README에 인용된 [별책7] 사회과 교육과정.pdf
 * 73쪽(물리 79쪽) 문단과 실제 성취기준 문장 대조로 정한 경계다.
 *
 * 실행(마이그레이션 0006 적용 후, 컨트롤러가 실행):
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/reclassify-history.ts
 *
 * .env.local 없이 실행하면(또는 이 파일을 테스트에서 import만 하면) JSON
 * 파일 분리까지만 하고 DB 갱신은 건너뛴다 — service role 키 없이 DB를
 * 건드리지 않기 위함이다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { standardsSchema, type Standard } from '../lib/standards/parse'

/**
 * [9역NN-..] 코드의 영역 번호(NN)가 이 값 이하이면 세계사, 초과하면
 * 한국사로 분류한다.
 *
 * 근거([별책7] 사회과 교육과정.pdf 물리 79쪽 / 인쇄쪽수 73, "역사과
 * 교육과정 설계의 개요"): "역사과의 공통 교육과정 영역은 한국과 세계의
 * 역사를 중심으로 구성하였다. 한국사와 세계사의 통합 영역으로는 '역사
 * 학습의 기초', '문명의 발생과 고대 세계의 형성'이 있다. 세계사 관련
 * 영역으로는 '세계 종교의 확산과 지역 문화의 발전', '지역 세계의 교류와
 * 변화', '제국주의와 국민 국가 건설 운동', '세계 대전과 사회 변동',
 * '현대 세계의 전개와 과제'가 있다. 한국사 관련 영역은 세계사와의 연계를
 * 고려하였으며, '국가의 형성과 발전', '통일신라와 발해', '고려의 성립과
 * 변천', '조선의 성립과 발전', '조선 사회의 변동', '근⋅현대 사회로의
 * 전환'이 있다."
 *
 * 이 순서를 코드 영역 번호에 대응하면 01=역사 학습의 기초, 02=문명의
 * 발생과 고대 세계의 형성, 03=세계 종교의 확산과 지역 문화의 발전,
 * 04=지역 세계의 교류와 변화, 05=제국주의와 국민 국가 건설 운동, 06=세계
 * 대전과 사회 변동, 07=현대 세계의 전개와 과제, 08=국가의 형성과 발전,
 * 09=통일신라와 발해, 10=고려의 성립과 변천, 11=조선의 성립과 발전,
 * 12=조선 사회의 변동, 13=근⋅현대 사회로의 전환이다. 06과 08~13은
 * data/standards/한국사.json에 실제 기록된 domain 필드와 글자 그대로
 * 일치해 이 대응을 재확인했다.
 *
 * "통합 영역"인 01~02는 실제 성취기준 문장이 전부 세계 문명(서아시아⋅
 * 지중해⋅중국⋅인도 비교 등)이고 한국 특정 내용이 전혀 없어 세계사 쪽에
 * 둔다. 그 결과 [9역01]~[9역07]=세계사(20건), [9역08]~[9역13]=한국사
 * (20건)로 정확히 반씩 나뉜다.
 */
export const WORLD_HISTORY_9YEOK_MAX_DOMAIN = 7

function codeLabel(code: string): string {
  const m = code.match(/^\[\d{1,2}([가-힣ⅠⅡ()]+)/)
  return m ? m[1] : ''
}

/**
 * 역사 성취기준 코드를 한국사/세계사로 분류한다(순수 함수, DB나 파일을
 * 건드리지 않는다).
 *
 * 규칙:
 * - 라벨이 `한사`(고등학교 '한국사1/2') 또는 `한국사`면 한국사.
 * - 라벨이 `세사`/`세계사`(고등학교 일반선택 '세계사')면 세계사.
 * - 라벨이 `동역`(고등학교 진로선택 '동아시아 역사 기행')이면 세계사 —
 *   동북아시아⋅동남아시아 지역사를 다루되 한국만 단독으로 다루지 않고,
 *   성취기준 문장에도 한국 특정 내용이 없다(전부 동아시아 전역/유목⋅
 *   해양 세계/이슬람⋅유럽과의 교류 등).
 * - 라벨이 `역현`(고등학교 융합선택 '역사로 탐구하는 현대 세계')이면
 *   세계사 — 냉전, 기후변화, 세계화 등 전지구적 현대사 주제이고 한국
 *   특정 내용이 없다.
 * - 라벨이 `역`(중학교 '역사')이면 영역 번호로 판정한다: 01~07은 세계사,
 *   08~13은 한국사(근거는 WORLD_HISTORY_9YEOK_MAX_DOMAIN 주석 참고).
 *
 * domainOrText는 향후 근거 로깅/추가 검증에 쓸 수 있도록 받아 두지만,
 * 현재 규칙은 코드(학년⋅과목 라벨⋅영역 번호)만으로 결정된다 — 교육과정이
 * 코드 자체에 과목/영역을 고정해 부여하기 때문에 텍스트 휴리스틱이
 * 필요 없다.
 */
export function classifyHistory(code: string, domainOrText: string): '한국사' | '세계사' {
  void domainOrText
  const label = codeLabel(code)
  if (label === '한사' || label === '한국사') return '한국사'
  if (label === '세사' || label === '세계사') return '세계사'
  if (label === '동역') return '세계사'
  if (label === '역현') return '세계사'
  if (label === '역') {
    const m = code.match(/^\[\d{1,2}역(\d{2})-\d{2}\]$/)
    if (!m) {
      throw new Error(`중학교 역사 코드에서 영역 번호를 읽지 못함: ${code}`)
    }
    const domainNum = Number(m[1])
    return domainNum <= WORLD_HISTORY_9YEOK_MAX_DOMAIN ? '세계사' : '한국사'
  }
  throw new Error(`분류 규칙이 없는 역사 코드 라벨: ${code} (label="${label}")`)
}

function splitRows(rows: Standard[]): { korea: Standard[]; world: Standard[] } {
  const korea: Standard[] = []
  const world: Standard[] = []
  for (const r of rows) {
    const subject = classifyHistory(r.code, r.domain || r.text)
    const updated: Standard = { ...r, subject }
    if (subject === '한국사') korea.push(updated)
    else world.push(updated)
  }
  return { korea, world }
}

async function main() {
  const dir = 'data/standards'
  const srcPath = join(dir, '한국사.json')
  const raw = JSON.parse(readFileSync(srcPath, 'utf8'))
  const rows = standardsSchema.parse(raw)

  if (rows.length !== 92) {
    console.error(`예상치 못한 행 수: ${rows.length}개 (92개 기대) — data/standards/한국사.json 확인 필요`)
    process.exit(1)
  }

  const { korea, world } = splitRows(rows)
  if (korea.length + world.length !== rows.length) {
    console.error('분류 후 행 수가 원본과 일치하지 않음')
    process.exit(1)
  }

  writeFileSync(join(dir, '한국사.json'), JSON.stringify(korea, null, 1) + '\n', 'utf8')
  writeFileSync(join(dir, '세계사.json'), JSON.stringify(world, null, 1) + '\n', 'utf8')
  console.log(`한국사.json: ${korea.length}개, 세계사.json: ${world.length}개로 분리 완료 (합 ${korea.length + world.length})`)

  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      'env(NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) 없음 — DB 갱신은 건너뜀. ' +
        '마이그레이션 적용 후 `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/reclassify-history.ts`로 재실행.'
    )
    return
  }

  const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const worldCodes = world.map((r) => r.code)
  let updated = 0
  for (let i = 0; i < worldCodes.length; i += 100) {
    const batch = worldCodes.slice(i, i + 100)
    const { data, error } = await sb
      .from('standards')
      .update({ subject: '세계사' })
      .in('code', batch)
      .select('code')
    if (error) {
      console.error('DB 갱신 실패:', error.message)
      process.exit(1)
    }
    updated += data?.length ?? 0
  }
  console.log(`DB standards 테이블: subject='세계사'로 ${updated}행 갱신 완료 (대상 ${worldCodes.length}행)`)
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
