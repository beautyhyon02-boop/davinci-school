/**
 * 문장 고치기(대표 2026-09-26: 관리자가 JSON 을 만지지 않고 단계 출력의 문장만 고친다). 단계(2~7)마다 고칠 수 있는 문장의 경로와
 * 입력 모양만 여기 둔다 — 화면 라벨은 content/site.ts(app.studio.wizard.fieldEditor.labels[경로], groups[맨 앞 키])에서만 고친다.
 *
 * 경로 문법: 점으로 잇고, 배열은 `[]`(원소마다 펼친다). 예: `lessons[].flow.main[].activities[]`.
 * 끝값이 문자열인 곳만 칸이 된다 — null(없는 총체적 기준·표 자료의 본문 등)이나 없는 키는 건너뛴다.
 * 저장은 고친 출력 전체를 기존 saveStageEdit(zod 검증 → 저장 → 뒤 단계 초기화 → 자동 검사 메모)로 보낸다.
 */
import { STAGE_SCHEMAS } from './schemas'
import type { WizardStage as EditableStage } from './wizard-stages'

export type FieldSpec = { pattern: string; multiline: boolean }

const line = (pattern: string): FieldSpec => ({ pattern, multiline: false })
const text = (pattern: string): FieldSpec => ({ pattern, multiline: true })

export const EDITABLE_FIELDS: Record<EditableStage, FieldSpec[]> = {
  2: [
    text('reconstruction'),
    text('standards[].reconstructed_text'),
    text('learning_goals[].text'),
    text('key_question_candidates[]'),
  ],
  3: [
    line('lessons[].topic'),
    text('lessons[].goal'),
    text('lessons[].key_question'),
    text('lessons[].flow.intro[]'),
    text('lessons[].flow.main[].activities[]'),
    text('lessons[].flow.wrapup[]'),
    text('lessons[].teacher_script.questions[].prompt'),
    text('lessons[].teacher_script.questions[].expected_answer'),
    text('lessons[].teacher_script.questions[].if_stuck'),
    text('lessons[].caution_notes[]'),
    text('lessons[].worksheet.tasks[].prompt'),
    text('lessons[].worksheet.tasks[].expected'),
    text('lessons[].worksheet.self_check[]'),
    text('lessons[].formative_check.quiz[].q'),
    line('lessons[].formative_check.quiz[].answer'),
    text('lessons[].formative_check.quiz[].explanation'),
  ],
  4: [
    line('materials[].title'),
    text('materials[].body'),
  ],
  5: [
    text('items[].stem'),
    text('items[].conditions.items[].text'),
    line('items[].conditions.length'),
    line('items[].conditions.format'),
    line('items[].rubric.criteria[].name'),
    text('items[].rubric.criteria[].scale[].descriptor'),
    text('items[].rubric.holistic.상'),
    text('items[].rubric.holistic.중'),
    text('items[].rubric.holistic.하'),
    text('items[].rubric.notes[]'),
    text('items[].exemplar_answers[].text'),
    text('feedback_templates.상'),
    text('feedback_templates.중'),
    text('feedback_templates.하'),
  ],
  6: [
    text('general.purpose'),
    text('general.schedule_note'),
    line('general.materials[]'),
    line('glossary[].term'),
    text('glossary[].explanation'),
    text('merge_guide[].skip_activities[]'),
    text('grading_guide.common_errors[].error'),
    text('grading_guide.common_errors[].how_to_read'),
    text('grading_guide.review_tips[]'),
    text('grading_guide.retry_guidance'),
    text('per_lesson[].notes[]'),
  ],
  7: [
    text('per_lesson[].topic_summary'),
    text('per_lesson[].preview'),
    text('per_lesson[].home_study_suggestion'),
    text('per_lesson[].quiz_notes[].wrong_note'),
    text('per_lesson[].criteria_phrases[].good[]'),
    text('per_lesson[].criteria_phrases[].improve[]'),
  ],
}

/** 원소마다 따로 묶어 보여 줄 맨 앞 배열(차시·문항·자료·성취기준). 나머지(학습 목표·용어 등)는 맨 앞 키 하나로 묶는다. */
const GROUP_BY_ELEMENT = new Set(['standards', 'lessons', 'materials', 'items', 'per_lesson'])

export type FieldPath = (string | number)[]
export type EditableField = {
  /** 경로를 점으로 이은 것(`lessons.0.topic`) — 입력 칸 키. */
  id: string
  path: FieldPath
  pattern: string
  multiline: boolean
  /** 경로의 배열 번호들(0부터) — 라벨 문구가 쓴다. */
  indices: number[]
  /** 끝값을 담은 객체(배열 원소 끝값이면 그 배열을 가진 객체) — 라벨 문구가 점수·등급 같은 곁값을 읽는다. */
  parent: Record<string, unknown>
  value: string
  /** 묶음: key 는 `lessons.0`·`learning_goals` 꼴, top 은 맨 앞 키(라벨 groups[top]), tag 는 묶음 이름표(차시 번호·자료 ID 등). */
  group: { key: string; top: string; tag: string }
}

type Trie = { children: Map<string, Trie>; spec?: FieldSpec }

function segmentsOf(pattern: string): string[] {
  return pattern.split('.').flatMap((part) => {
    const m = /^([^[\]]+)((?:\[\])*)$/.exec(part)
    if (!m) throw new Error(`bad field pattern: ${pattern}`)
    return [m[1], ...Array.from({ length: m[2].length / 2 }, () => '[]')]
  })
}

function trieOf(specs: FieldSpec[]): Trie {
  const root: Trie = { children: new Map() }
  for (const spec of specs) {
    let node = root
    for (const seg of segmentsOf(spec.pattern)) {
      if (!node.children.has(seg)) node.children.set(seg, { children: new Map() })
      node = node.children.get(seg)!
    }
    node.spec = spec
  }
  return root
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 묶음 이름표: 차시는 번호(no·lesson_no), 자료는 ID, 성취기준은 코드, 그 밖에는 1부터 센 번호. */
function tagOf(top: string, element: unknown, index: number): string {
  if (isObject(element)) {
    if (top === 'materials' && typeof element.id === 'string') return element.id
    if (top === 'standards' && typeof element.code === 'string') return element.code
    if (top === 'lessons' && typeof element.no === 'number') return String(element.no)
    if (top === 'per_lesson') {
      const no = element.lesson_no ?? element.no
      if (typeof no === 'number') return String(no)
    }
  }
  return String(index + 1)
}

/**
 * 단계 출력에서 고칠 수 있는 문장 칸을 펼친다. 순서는 문서 순서(1차시의 모든 칸 → 2차시 …, 퀴즈 1의 문제·정답·해설 → 퀴즈 2 …)다 —
 * 경로를 나무(trie)로 모아 출력을 따라 내려가므로 같은 원소의 칸이 붙어 나온다.
 */
export function expandFields(stage: EditableStage, output: unknown): EditableField[] {
  const out: EditableField[] = []
  const walk = (node: Trie, value: unknown, path: FieldPath, indices: number[], parent: Record<string, unknown>) => {
    if (node.spec && typeof value === 'string') {
      const top = String(path[0])
      const grouped = GROUP_BY_ELEMENT.has(top) && typeof path[1] === 'number'
      const root = output as Record<string, unknown[]>
      out.push({
        id: path.join('.'),
        path,
        pattern: node.spec.pattern,
        multiline: node.spec.multiline,
        indices,
        parent,
        value,
        group: grouped
          ? { key: `${top}.${path[1]}`, top, tag: tagOf(top, root[top][path[1] as number], path[1] as number) }
          : { key: top, top, tag: '' },
      })
    }
    for (const [seg, child] of node.children) {
      if (seg === '[]') {
        if (!Array.isArray(value)) continue
        value.forEach((v, i) => walk(child, v, [...path, i], [...indices, i], parent))
      } else if (isObject(value) && seg in value) {
        walk(child, value[seg], [...path, seg], indices, value)
      }
    }
  }
  walk(trieOf(EDITABLE_FIELDS[stage]), output, [], [], {})
  return out
}

/** 묶음 순서를 지키며 칸을 묶음별로 모은다(화면이 묶음마다 제목을 단다). */
export function groupFields(fields: EditableField[]): { key: string; top: string; tag: string; fields: EditableField[] }[] {
  const groups = new Map<string, { key: string; top: string; tag: string; fields: EditableField[] }>()
  for (const f of fields) {
    if (!groups.has(f.group.key)) groups.set(f.group.key, { ...f.group, fields: [] })
    groups.get(f.group.key)!.fields.push(f)
  }
  return [...groups.values()]
}

/** path 의 값을 value 로 바꾼 새 출력(원본은 건드리지 않는다). 경로가 없으면 오류. */
export function setAtPath<T>(output: T, path: FieldPath, value: string): T {
  const next = structuredClone(output) as unknown
  let cur = next as Record<string | number, unknown>
  for (const seg of path.slice(0, -1)) {
    const child = cur?.[seg]
    if (!child || typeof child !== 'object') throw new Error(`no such path: ${path.join('.')}`)
    cur = child as Record<string | number, unknown>
  }
  const last = path[path.length - 1]
  if (!cur || !(last in cur)) throw new Error(`no such path: ${path.join('.')}`)
  cur[last] = value
  return next as T
}

/** 칸 값(id → 문장)을 출력에 한꺼번에 반영한 새 출력. 바뀐 칸만 쓴다. */
export function applyFieldEdits<T>(output: T, fields: EditableField[], values: Record<string, string>): T {
  let next = output
  for (const f of fields) {
    const v = values[f.id]
    if (v !== undefined && v !== f.value) next = setAtPath(next, f.path, v)
  }
  return next
}

/**
 * 저장 전에 화면에서 먼저 형식(zod, STAGE_SCHEMAS)을 본다 — 서버(saveStageEdit)도 같은 검사를 하지만, 여기서는 어긋난 경로를 칸에 이어
 * 어느 문장이 문제인지 보여 준다. 통과하면 null. fieldId 는 문제 경로가 가리키는 칸(없으면 undefined — 칸이 아닌 곳의 규칙).
 */
export function validateEdited(stage: EditableStage, next: unknown, fields: EditableField[]): { fieldId?: string; message: string } | null {
  const r = STAGE_SCHEMAS[stage].safeParse(next)
  if (r.success) return null
  const issue = r.error.issues[0]
  const id = issue.path.join('.')
  const field = fields.find((f) => f.id === id) ?? fields.find((f) => id !== '' && f.id.startsWith(`${id}.`))
  return { fieldId: field?.id, message: issue.message }
}
