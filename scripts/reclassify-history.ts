/**
 * 역사 성취기준 한국사/세계사 재분류 CLI. 두 모드가 있다.
 *
 * 1) split 모드 — `--source <92행 원본 json 경로>`를 줄 때만 실행된다.
 *    분리 전(모두 subject:'한국사') 92행짜리 원본 파일(예:
 *    `git show <분리 전 커밋>:data/standards/한국사.json`로 복원한 파일)을
 *    읽어 classifyHistory()로 한국사/세계사를 나누고
 *    data/standards/한국사.json / data/standards/세계사.json을 덮어쓴다.
 *    --source가 없으면 이 모드는 건너뛴다 — data/standards/한국사.json은
 *    이미 분리되어 46행뿐이라 92행을 기대하는 이 모드의 기본 입력으로 쓸
 *    수 없다.
 *
 *      node --env-file=.env.local node_modules/tsx/dist/cli.mjs \
 *        scripts/reclassify-history.ts --source /tmp/한국사-92-original.json
 *
 * 2) update-db 모드(기본, --source 없을 때) — data/standards/세계사.json을
 *    읽어(이미 분리되어 있는 파일) 모든 행이 subject:'세계사'인지 검증한
 *    뒤(codesToUpdate), 그 code 목록으로 DB standards 테이블을
 *      update standards set subject='세계사' where code in (...)
 *    로 갱신한다(supabase-js `.update({subject:'세계사'}).in('code', codes)`를
 *    100개씩 배치 호출). 파일은 건드리지 않고 갱신 행 수만 출력한다.
 *
 *      node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/reclassify-history.ts
 *
 * env(NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)가 없으면
 * update-db 모드는 DB를 건드리지 않고 에러 메시지를 출력한 뒤 종료 코드
 * 1로 실패한다(조용히 넘어가지 않는다 — service role 키 없이 실행했다는
 * 사실을 놓치면 안 되므로).
 *
 * 분류 규칙과 근거(별책7 쪽수 포함)는 data/standards/README.md의
 * "역사 분리" 절 참고. classifyHistory()가 그 규칙을 코드로 옮긴 순수
 * 판정 함수다.
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
 * 12=조선 사회의 변동, 13=근⋅현대 사회로의 전환이다.
 *
 * 03~07("세계사 관련 영역")과 08~13("한국사 관련 영역")은 위 문단이
 * 문서로 직접 그렇게 명명했고, 06과 08~13은 분리 전 한국사.json에 실제
 * 기록되어 있던 domain 필드와 글자 그대로 일치해 문서로 뒷받침된다.
 * 반면 01~02("역사 학습의 기초", "문명의 발생과 고대 세계의 형성")는
 * 원문이 "한국사와 세계사의 통합 영역"이라고 부른 부분이라, 세계사로
 * 단정할 문서상 근거는 없다 — 이 스크립트는 중학교 「역사」 교과서에서
 * 통상 역사①(세계사 쪽 절반)에 배치된다는 점을 근거로 우선 세계사에
 * 임시로 배정해 둔 것이며, 담당자 확정이 필요한 판단이다(대상 5개 코드:
 * [9역01-01], [9역01-02], [9역02-01], [9역02-02], [9역02-03]).
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
 *   08~13은 한국사(근거와 01~02의 판단 성격은
 *   WORLD_HISTORY_9YEOK_MAX_DOMAIN 주석 참고).
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

/**
 * [9역01]/[9역02]("통합 영역")는 추출 스크립트가 영역 표제를 못 찾아
 * domain이 비어 있다(다른 영역은 domain이 채워져 있음 — 위 domain 필드
 * 관련 알려진 한계 참고). 이 5개 코드만 콕 집어, 이미 domain이 채워져
 * 있으면 손대지 않고 비어 있을 때만 '통합'으로 채운다(텍스트는 절대
 * 건드리지 않는다).
 */
const INTEGRATED_DOMAIN_CODES = ['[9역01-01]', '[9역01-02]', '[9역02-01]', '[9역02-02]', '[9역02-03]']

function fillIntegratedDomain(rows: Standard[]): Standard[] {
  return rows.map((r) =>
    INTEGRATED_DOMAIN_CODES.includes(r.code) && r.domain === '' ? { ...r, domain: '통합' } : r
  )
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
  return { korea, world: fillIntegratedDomain(world) }
}

/**
 * 세계사.json의 각 행이 실제로 subject==='세계사'인지 검증하고 DB 갱신
 * 대상 code만 뽑아낸다(순수 함수, DB나 파일을 건드리지 않는다). 하나라도
 * 아니면 던진다 — 파일이 손상되었거나 다른 과목 행이 섞여 들어온 경우를
 * 조용히 넘기면 엉뚱한 code를 DB에서 세계사로 바꿔 버릴 수 있으므로.
 */
export function codesToUpdate(rows: Standard[]): string[] {
  return rows.map((r) => {
    if (r.subject !== '세계사') {
      throw new Error(`세계사.json에 subject가 '세계사'가 아닌 행이 있음: ${r.code} (subject=${r.subject})`)
    }
    return r.code
  })
}

function runSplit(sourcePath: string) {
  const dir = 'data/standards'
  const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const rows = standardsSchema.parse(raw)

  if (rows.length !== 92) {
    console.error(`예상치 못한 행 수: ${rows.length}개 (92개 기대) — ${sourcePath} 확인 필요`)
    process.exit(1)
  }

  const { korea, world } = splitRows(rows)
  if (korea.length + world.length !== rows.length) {
    console.error('분류 후 행 수가 원본과 일치하지 않음')
    process.exit(1)
  }

  writeFileSync(join(dir, '한국사.json'), JSON.stringify(korea, null, 1) + '\n', 'utf8')
  writeFileSync(join(dir, '세계사.json'), JSON.stringify(world, null, 1) + '\n', 'utf8')
  console.log(
    `[split] 한국사.json: ${korea.length}개, 세계사.json: ${world.length}개로 분리 완료 (합 ${korea.length + world.length}, 원본 ${sourcePath})`
  )
}

async function runUpdateDb() {
  const dir = 'data/standards'
  const raw = JSON.parse(readFileSync(join(dir, '세계사.json'), 'utf8'))
  const rows = standardsSchema.parse(raw)
  const codes = codesToUpdate(rows)

  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. ' +
        'run with `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/reclassify-history.ts`.'
    )
    process.exit(1)
  }

  const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  let updated = 0
  for (let i = 0; i < codes.length; i += 100) {
    const batch = codes.slice(i, i + 100)
    const { data, error } = await sb.from('standards').update({ subject: '세계사' }).in('code', batch).select('code')
    if (error) {
      console.error('DB 갱신 실패:', error.message)
      process.exit(1)
    }
    updated += data?.length ?? 0
  }
  console.log(`DB standards 테이블: subject='세계사'로 ${updated}행 갱신 완료 (대상 ${codes.length}행)`)
}

async function main() {
  const sourceIdx = process.argv.indexOf('--source')
  const sourcePath = sourceIdx >= 0 ? process.argv[sourceIdx + 1] : undefined
  if (sourcePath) {
    runSplit(sourcePath)
    return
  }
  await runUpdateDb()
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
