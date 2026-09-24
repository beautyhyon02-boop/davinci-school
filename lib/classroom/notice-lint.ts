import { NOTICE_FORBIDDEN, SUGGEST_ENDINGS } from '@/lib/studio/checks'
import type { NoticeT } from './notice-schema'

/**
 * 짧은 부정("못 셌다", "못 풀어서") — N-05. 7단계 틀 검사(NOTICE_FORBIDDEN)는 긴 부정("못한다/못했다/못함")만 잡는다.
 * '못' 뒤에 띄어쓰기가 있을 때만 잡아 사실 설명 속 긴 부정("분해하지 못하기 때문")은 건드리지 않는다.
 */
const SHORT_NEGATION: [RegExp, string] = [/(^|\s)못\s+[가-힣]+/, '짧은 부정("못 ~") 대신 "~하는 데 어려움이 있다"']

/** 이름 비교용 토큰 경계(공백·문장부호). */
const TOKEN_SPLIT = /[\s,.!?()"'「」·:;]+/
/**
 * 이름 뒤에 붙는 조사·호칭 — "김민지가", "김민지에게는", "김민지님". 토큰 = 이름 + 조사 인지만 본다.
 * 비교·동반 조사(보다·처럼·만큼·랑·한테)도 넣는다 — "박OO보다 잘함"은 N-01·N-02 가 막으려는 바로 그 비교다.
 * '하고'는 넣지 않는다: "이해하고"처럼 동사 활용과 겹쳐 이름이 흔한 낱말일 때 오탐이 난다.
 */
const NAME_PARTICLES = ['은', '는', '이', '가', '을', '를', '의', '에게', '도', '와', '과', '님', '이는', '에게는', '보다', '처럼', '만큼', '랑', '이랑', '한테']

/** N-01: 다른 학생 이름이 낱말로(그대로 또는 이름+조사) 쓰였는가. 부분 문자열("이해하고" 속 "이해")은 잡지 않는다. */
function mentionsName(text: string, name: string): boolean {
  return text.split(TOKEN_SPLIT).some((t) => t === name || NAME_PARTICLES.some((p) => t === name + p))
}

/**
 * 학생별 안내장 문장 검사(순수). 빈 배열이면 통과. 부록 A N-01·02·04·05·06·12 + 확정 점수 ≤ 만점.
 * N-03(미확정 점수)은 뼈대 조립(buildNoticeSkeleton)과 서버 액션이, N-07~11 중 P 규칙은 프롬프트가 맡는다.
 * 원장 작성 칸(참여 관찰·원장 한마디)도 같은 규칙으로 검사한다.
 */
export function lintNotice(n: NoticeT, otherStudentNames: string[]): string[] {
  const issues: string[] = []
  // 본인 이름이거나 본인 이름의 일부("김민지"에게 "김민")인 원생 이름은 본인 언급과 구분할 수 없어 뺀다
  const others = otherStudentNames.filter((name) => name && !n.student_name.includes(name))
  const texts: [string, string | null][] = [
    ['학습 요약', n.lesson_context.topic_summary], ['다음 차시', n.next_lesson.preview], ['가정 학습', n.next_lesson.home_study_suggestion],
    ['원장 한마디', n.director_message], ['참여 관찰', n.participation.director_comment],
    ...n.participation.quiz.items.map((it, i): [string, string | null] => [`퀴즈 ${i + 1}`, it.note]),
    ...n.essay_results.flatMap((e) => e.criteria_feedback.flatMap((c): [string, string | null][] => [[`${c.criterion_name} 잘한 점`, c.good_point], [`${c.criterion_name} 보완`, c.improve_point]])),
    ...n.essay_results.map((e): [string, string | null] => [`${e.kind} 재도전`, e.retry?.improvement_comment ?? null]),
  ]
  for (const [where, text] of texts) {
    if (!text) continue
    for (const [re, why] of [...NOTICE_FORBIDDEN, SHORT_NEGATION]) if (re.test(text)) issues.push(`${where}: "${text.match(re)?.[0].trim()}" — ${why}`)
    for (const name of others) if (mentionsName(text, name)) issues.push(`${where}: 다른 학생 이름(${name}) 언급`)
  }
  if (!SUGGEST_ENDINGS.test(n.next_lesson.home_study_suggestion.trim())) issues.push('가정 학습 제안이 청유형으로 끝나지 않음')
  for (const c of n.essay_results.flatMap((e) => e.criteria_feedback)) {
    if (c.good_point.trim()) continue
    issues.push(c.improve_point ? `${c.criterion_name}: 잘한 점 없이 보완만 있음` : `${c.criterion_name}: 잘한 점이 비어 있음`)
  }
  for (const e of n.essay_results) if (e.confirmed_score > e.total_points || (e.retry && e.retry.after_score > e.total_points)) issues.push(`${e.kind}: 확정 점수가 만점을 넘음`)
  return issues
}
