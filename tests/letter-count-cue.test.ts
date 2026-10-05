// tests/letter-count-cue.test.ts
// 대표 2026-10-05(국어 세트 2차시 퀴즈 3 "…그 대안의 무엇인지 다섯 글자로 쓰시오", 정답 "실행 가능성"):
// "글자 수에 맞춰서 답을 유도하는 건 지양" — 퀴즈·활동지·서술형·논술형에 일관되게(C-42). 참고 메모일 뿐 막지 않는다.
import { describe, it, expect } from 'vitest'
import { staticIssues, letterCountCue } from '@/lib/studio/checks'
import { assessmentV2, lessonV2, assessmentSession } from './studio-schemas.test'

const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }]
const materials = [{ id: 'A', title: 't', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] }]
const cueNotes = (issues: { kind: string; detail: string }[]) => issues.filter((i) => i.detail.includes('글자 수로 답을 유도함'))

describe('letterCountCue — 글자 수·낱말 수로 답을 좁히는 단서(C-42)', () => {
  it.each([
    ["'텀블러를 빌려주자'는 대안에 한 학생이 '씻을 사람이 없다'고 말했다. 이 말이 지적한 것은 그 대안의 무엇인지 다섯 글자로 쓰시오.", '다섯 글자로'],
    ['발표를 듣는 사람들을 가리키는 말을 두 글자로 쓰시오.', '두 글자로'],
    ['그 주장에 부족한 것은 무엇인지 2글자로 답하시오.', '2글자로'],
    ['빈칸에 들어갈 말을 한 글자로 쓰시오.', '한 글자로'],
    ['빈칸에 알맞은 다섯 글자짜리 낱말을 쓰시오.', '다섯 글자짜리'],
    ['세 음절로 된 낱말을 쓰시오.', '세 음절로'],
    ['이 관계를 두 낱말로 쓰시오.', '두 낱말로'],
    ['핵심을 세 단어로 답하시오.', '세 단어로'],
    ['Write the answer in two words.', 'in two words'],
    ['Write a five-letter word for the blank.', 'five-letter'],
    // 검토 2026-10-05: 생성기가 비켜 가기 쉬운 꼴 — 괄호 안, "~의 낱말", "이내", 어림수, 범위, "자"만 쓴 것, 어절
    ['그 대안의 무엇을 지적한 것인지 쓰시오. (다섯 글자)', '다섯 글자'],
    ['빈칸에 알맞은 다섯 글자의 낱말을 쓰시오.', '다섯 글자'],
    ['빈칸에 알맞은 말을 5글자 이내로 쓰시오.', '5글자'],
    ['빈칸에 알맞은 말을 두세 글자로 쓰시오.', '두세 글자로'],
    ['빈칸에 알맞은 말을 2~3글자로 쓰시오.', '3글자로'],
    ['발표를 듣는 사람들을 가리키는 말을 두 자로 쓰시오.', '두 자로'],
    ['핵심을 세 어절로 쓰시오.', '세 어절로'],
    ['Answer with three words.', 'with three words'],
    ['Write a two-word phrase for the blank.', 'two-word'],
    ['Write the missing 5 letter word.', '5 letter word'],
  ])('짚는다: %s', (text, cue) => {
    expect(letterCountCue(text)).toBe(cue)
  })
  it.each([
    ['답의 꼴(낱말 하나)', '조례를 만들어 시행한 사례의 주체를 한 낱말로 쓰시오.'],
    ['답의 꼴(짧은 구)', "'부담'이라는 낱말을 넣어 짧은 구로 쓰시오."],
    ['답의 꼴(한 문장)', "쟁점을 '~해야 하는가' 꼴의 한 문장으로 쓰시오."],
    ['분량 지침(자 내외)', '전체를 350자 내외(300~400자)로 쓰고, 대안을 둘 이상 쓴 경우 앞의 한 가지만 채점함'],
    ['분량 지침(문장 수)', '4~6문장(250자 내외)으로 서술하시오.'],
    ['분량 지침(단어 범위)', '제목을 포함해 40~60단어의 영어로 쓸 것'],
    ['분량 지침(단어 범위 + 로)', '플라스틱컵을 기준으로 40~60단어로 쓸 것'],
    ['분량 지침(단어 수)', '50단어로 쓸 것'],
    ['분량 지침(영어)', 'Write 40-60 words in 3 sentences, including a title'],
    ['답의 꼴(영어 한 낱말)', 'Answer in one word.'],
    ['근거 개수', '근거를 두 가지 이상 들 것'],
    ['글자라는 낱말만', '발표 자료의 글자 크기를 키운다'],
    // 검토 2026-10-05: 낱말·글자·편지(letter)가 답의 길이가 아니라 재료일 때, 글자 수가 분량일 때
    ['재료로 주어진 낱말', '제시된 두 낱말로 문장을 만드시오.'],
    ['재료로 주어진 단어', '주어진 세 단어로 문장을 완성하시오.'],
    ['찾을 대상인 글자', '받침이 있는 두 글자를 찾아 쓰시오.'],
    ['분량 지침(글자 수)', '읽은 글을 100글자로 요약하시오.'],
    ['분량 지침(글자 범위)', '300~400글자로 쓰시오.'],
    ['편지 두 통(영어)', 'Read the two letters and compare the writers.'],
    ['편지 한 통(영어)', 'Write one letter to your friend.'],
  ])('짚지 않는다 — %s', (_why, text) => {
    expect(letterCountCue(text)).toBeNull()
  })
})

describe('3단계 참고 메모 — 퀴즈·활동지 과제(C-42)', () => {
  const design = (lessons: unknown[]) => ({ unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons })
  const [q1, q2, q3] = lessonV2.formative_check.quiz
  const cued = {
    ...lessonV2, no: 2,
    worksheet: { ...lessonV2.worksheet, tasks: [
      { ...lessonV2.worksheet.tasks[0], prompt: '발표 내용을 순서대로 짜는 일을 가리키는 말을 네 글자로 적으세요.' },
      lessonV2.worksheet.tasks[1], lessonV2.worksheet.tasks[2] ] },
    formative_check: { quiz: [
      { ...q1, q: '발표를 듣는 사람들을 가리키는 말을 두 글자로 쓰시오.' },
      q2,
      { ...q3, q: '이 말이 지적한 것은 그 대안의 무엇인지 다섯 글자로 쓰시오.' } ] },
  }
  const notes = (l: unknown) => cueNotes(staticIssues(3, design([{ ...lessonV2, no: 1 }, l, ...[3, 4, 5].map((no) => ({ ...lessonV2, no })), assessmentSession(6)]), { standards, prior: {} }))
  it('글자 수 단서가 든 퀴즈와 활동지 과제를 자리·문구와 함께 적는다(kind other — 막지 않음)', () => {
    expect(notes(cued)).toEqual([
      { kind: 'other', detail: '2차시 퀴즈 1: 글자 수로 답을 유도함("두 글자로") — 글자 수 단서를 뺀다(C-42)' },
      { kind: 'other', detail: '2차시 퀴즈 3: 글자 수로 답을 유도함("다섯 글자로") — 글자 수 단서를 뺀다(C-42)' },
      { kind: 'other', detail: '2차시 활동지 과제 1번: 글자 수로 답을 유도함("네 글자로") — 글자 수 단서를 뺀다(C-42)' },
    ])
  })
  it('단서가 없는 차시에는 메모가 없다', () => {
    expect(notes({ ...lessonV2, no: 2 })).toEqual([])
  })
  it('활동지가 없는 옛 차시(퀴즈도 비어 있음)에서도 오류 없이 지나간다', () => {
    expect(() => notes({ ...lessonV2, no: 2, worksheet: undefined, formative_check: { quiz: [] } })).not.toThrow()
  })
})

describe('5단계 참고 메모 — 서술형·논술형의 문두·조건·분량(C-42)', () => {
  const prior = { stage4: { materials }, stage3: { lessons: [] } }
  it('문두·분량 칸·조건의 글자 수 단서를 문항·자리와 함께 적는다; 분량 지침("300자 내외")은 짚지 않는다', () => {
    const a = structuredClone(assessmentV2)
    a.items[0].stem = '자료 A에서 가장 많은 계급을 가리키는 말을 세 글자로 쓰고 변화와 이유를 쓰시오. [6점]'
    a.items[0].conditions.length = '두 글자'   // 서술형은 조건이 없어 분량 칸이 단서 자리가 된다
    a.items[1].conditions.items[0].text = '핵심 낱말을 두 글자로 밝히고 근거를 두 가지 이상 들 것. (2점)'
    a.items[1].conditions.length = '300자 내외'
    expect(cueNotes(staticIssues(5, a, { standards, prior }))).toEqual([
      { kind: 'other', detail: '문항 1 문두: 글자 수로 답을 유도함("세 글자로") — 글자 수 단서를 뺀다(C-42)' },
      { kind: 'other', detail: '문항 1 분량: 글자 수로 답을 유도함("두 글자") — 글자 수 단서를 뺀다(C-42)' },
      { kind: 'other', detail: '문항 2 조건 1: 글자 수로 답을 유도함("두 글자로") — 글자 수 단서를 뺀다(C-42)' },
    ])
  })
  it('단서가 없는 문항 세트에는 메모가 없다', () => {
    expect(cueNotes(staticIssues(5, assessmentV2, { standards, prior }))).toEqual([])
  })
})
