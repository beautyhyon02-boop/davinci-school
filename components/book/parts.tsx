import type { ReactNode } from 'react'
import type { z } from 'zod'
import type { Material as MaterialSchema } from '@/lib/studio/schemas'
import { MaterialChart } from '@/components/studio/parts/MaterialsFull'
import { cleanMaterialTitle } from '@/lib/studio/materials'
import { conditionDisplayText } from '@/lib/studio/condition-text'
import type { BookItem, BookPlan, BookSection, BookTask } from '@/lib/book/plan'
import { app } from '@/content/site'

// 제본용 교재의 공통 조각(학생용 교재·교사용 지도서가 같이 쓴다) — 순수 표시, 서버에서 렌더(node:fs 없음, 함수 prop 없음).
// 인쇄 규칙은 app/globals.css 의 [data-book](A4 양면, 절마다 새 쪽, 자료·문항·채점표는 가르지 않음, 본문 10.5pt).
// 읽기 위계(대표 2026-09-26): 세로로 쌓고 한 줄에 하나, 크기·굵기로 위계. 학생용은 흑백 인쇄 전제 — 색이 아니라 괘선·굵기로 구분한다.

type Material = z.infer<typeof MaterialSchema>
const copy = app.book
const pv = app.packageView

/** 절 하나 — 인쇄에서 새 쪽에서 시작한다(표지 제외). id 는 플랜의 BookSection.id. */
export function Section({ section, children, className = '' }: { section: BookSection; children: ReactNode; className?: string }) {
  return (
    <section data-book-section={section.id} data-book-kind={section.kind} className={`book-section${className ? ` ${className}` : ''}`}>
      {children}
    </section>
  )
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="book-h2">{children}</h2>
}
export function Heading3({ children }: { children: ReactNode }) {
  return <h3 className="book-h3">{children}</h3>
}
export function Heading4({ children }: { children: ReactNode }) {
  return <h4 className="book-h4">{children}</h4>
}

/** 소제목 + 한 줄에 하나씩. 빈 목록이면 그리지 않는다. */
export function LabeledList({ label, items, ordered = false }: { label: ReactNode; items: ReactNode[]; ordered?: boolean }) {
  if (items.length === 0) return null
  const body = items.map((x, i) => <li key={i}>{x}</li>)
  return (
    <div className="book-block">
      <Heading4>{label}</Heading4>
      {ordered ? <ol className="book-list list-decimal">{body}</ol> : <ul className="book-list list-disc">{body}</ul>}
    </div>
  )
}

/** "라벨: 값" 한 줄(값이 없으면 생략). stacked = 소제목 아래 문단. */
export function KV({ label, children, stacked = false }: { label: ReactNode; children: ReactNode; stacked?: boolean }) {
  if (children === undefined || children === null || children === '') return null
  if (stacked) return <div className="book-block"><Heading4>{label}</Heading4><p className="whitespace-pre-wrap">{children}</p></div>
  return <p><span className="font-semibold">{label}:</span> {children}</p>
}

/** 아랫줄 보조(예상 답·정답·해설·기대 답) — 앞 줄 아래 들여쓴 줄. kind 는 data-book-aside 표식(검사용). */
export function Below({ label, children, kind }: { label: ReactNode; children: ReactNode; kind: string }) {
  return <p data-book-aside={kind} className="book-aside"><span className="font-semibold">{label}:</span> {children}</p>
}

/** 차례 — 절 제목을 순서대로(쪽 번호는 브라우저가 매긴다). */
export function Toc({ plan }: { plan: BookPlan }) {
  const section = plan.sections.find((s) => s.kind === 'toc')!
  return (
    <Section section={section}>
      <h2 className="book-h1">{copy.toc.heading}</h2>
      <ol data-book-toc className="book-toc">
        {plan.toc.map((s) => <li key={s.id} data-toc-entry={s.id}>{s.title}</li>)}
      </ol>
    </Section>
  )
}

const SPLIT_ROWS_OVER = 12

function TableGrid({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="book-table">
      <thead>
        <tr>{columns.map((col, i) => <th key={i}>{col}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j} data-num={typeof cell === 'number' ? '' : undefined}>{String(cell)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/** 괘선 표(흑백 인쇄용) — 숫자 칸은 가운데, 글자 칸은 왼쪽. 두 열짜리 긴 표(부스 20개 등)는 화면과 같이 반으로 나눠 나란히(한 쪽에 들어가게). */
export function BookTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  if (columns.length === 2 && rows.length > SPLIT_ROWS_OVER) {
    const half = Math.ceil(rows.length / 2)
    return (
      <div className="book-table-split">
        <TableGrid columns={columns} rows={rows.slice(0, half)} />
        <TableGrid columns={columns} rows={rows.slice(half)} />
      </div>
    )
  }
  return <TableGrid columns={columns} rows={rows} />
}

/** 자료 본문 — 설명글·표·자동 그래프·첨부 이미지. */
export function MaterialBody({ material: m }: { material: Material }) {
  const images = Array.isArray(m.images) ? m.images : []
  return (
    <>
      {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
      {m.table && Array.isArray(m.table.columns) && Array.isArray(m.table.rows) && <BookTable columns={m.table.columns} rows={m.table.rows} />}
      <div className="book-chart"><MaterialChart material={m} /></div>
      {images.length > 0 && (
        <div className="book-images">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={pv.materials.imagesAlt(m.title, i + 1)} />
          ))}
        </div>
      )}
    </>
  )
}

/** 공개 자료의 출처(공공누리 표기 의무). 자작은 적지 않는다. */
function SourceLine({ material }: { material: Material }) {
  const s = material.source
  if (!s || typeof s !== 'object' || s.kind !== '공개' || !s.attribution) return null
  return <p className="book-faint">{pv.materials.sourceLabel.공개} · {s.attribution}</p>
}

/**
 * 차시 자료 상자: "자료 A · 제목" 머리 + 본문. 교사용(teacherLabels)에서만 「공동 자료 B의 영어판」을 적는다 — 학생용에는 없다.
 * 「공동」 배지도 학생용 교재에는 두지 않는다(종이 교재에서는 구분이 의미 없고 흑백에서 배지는 읽기만 방해한다).
 */
export function MaterialBox({ material: m, teacherLabels = false }: { material: Material; teacherLabels?: boolean }) {
  const from = m.english_version_of
  return (
    <div data-book-material={m.id} className="book-box">
      <p className="book-box-title">
        <span className="font-bold">{copy.lesson.materialLabel(m.id)}</span>
        {cleanMaterialTitle(m.title ?? '') !== '' && <> · {cleanMaterialTitle(m.title ?? '')}</>}
        {teacherLabels && typeof from === 'string' && from !== '' && <span data-english-version-of={from} className="book-faint"> ({pv.materials.englishVersionBadge(from)})</span>}
      </p>
      <SourceLine material={m} />
      <MaterialBody material={m} />
    </div>
  )
}

/** 문항 안 자료 상자 — 문제지와 같은 <자료 n> 라벨(문항 안 번호) + 작은 세트 ID 표시. */
export function ItemMaterialBox({ entry }: { entry: BookItem['materials'][number] }) {
  const { label: l, material: m } = entry
  return (
    <div data-book-item-material={l.id} data-material-no={l.no} className="book-box">
      <p className="book-box-title text-center">
        <span className="font-bold">{l.label}</span> <span className="book-faint">{l.hint}</span>
      </p>
      {m ? (
        <>
          {cleanMaterialTitle(m.title ?? '') !== '' && <p className="text-center font-semibold">{cleanMaterialTitle(m.title ?? '')}</p>}
          <SourceLine material={m} />
          <MaterialBody material={m} />
        </>
      ) : <p className="book-faint text-center">{pv.items.materialMissing(l.id)}</p>}
    </div>
  )
}

/** 답 쓰는 줄 n개(문제지의 .answer-line 과 같은 모양). */
export function AnswerLines({ n }: { n: number }) {
  return <div className="answer-space">{Array.from({ length: n }, (_, i) => <div key={i} data-answer-line className="answer-line" />)}</div>
}

/** 활동지 과제의 쓰는 칸 — 단답 2줄, 서술 5줄, 표·그림은 네모 칸. */
export function WritingSpace({ space }: { space: BookTask['answer_space'] }) {
  if (space === 'short') return <AnswerLines n={2} />
  if (space === 'lines') return <AnswerLines n={5} />
  return <div data-writing-box={space} className="writing-box" />
}

/**
 * 문항 몸통(학생용·교사용 공통): 문두 → <자료 n> 상자 → 조건(번호) → 분량·형식·초과 응답 → 평가 요소(이름·만점) → 답란(10줄/20줄 또는 종이 칸).
 * 문제지(PackageView)와 같은 내용·순서. 교사용 조각(채점표·예시답안 등)은 TeacherBook 이 이 아래에 붙인다.
 */
export function ItemBody({ item, headerExtra }: { item: BookItem; headerExtra?: ReactNode }) {
  const a = copy.assessment
  const c = item.conditions
  return (
    <div data-book-item={item.no} className="book-item">
      <p className="book-item-head">
        <span className="font-bold">{a.itemNo(item.no)}</span> <span className="book-faint">{a.kindPoints(item.kind, item.points)}</span>
        {headerExtra}
      </p>
      <p data-item-stem className="book-stem whitespace-pre-wrap">{item.stem}</p>
      {item.materials.length > 0 && <div className="book-item-materials">{item.materials.map((e) => <ItemMaterialBox key={e.label.id} entry={e} />)}</div>}
      <div data-item-conditions className="book-conditions">
        {c.items.length > 0 && (
          <div>
            <Heading4>{a.conditions}</Heading4>
            <ol className="book-list">
              {c.items.map((x) => (
                <li key={x.no}>
                  <span className="font-semibold">{a.conditionNo(x.no)}</span> {conditionDisplayText(x.text, x.points)}{x.points !== null && <> {a.conditionPoints(x.points)}</>}
                </li>
              ))}
            </ol>
          </div>
        )}
        <KV label={a.length}>{c.length}</KV>
        <KV label={a.format}>{c.format}</KV>
        <KV label={a.overflow}>{c.overflow_rule}</KV>
        {item.criteria.length > 0 && (
          <div data-item-criteria>
            <Heading4>{pv.items.criteriaHeading}</Heading4>
            <ul className="book-list list-disc">{item.criteria.map((cr, i) => <li key={i}>{pv.items.criterionLine(cr.name, cr.max)}</li>)}</ul>
          </div>
        )}
      </div>
      {/* 답란(머리 + 줄)은 한 덩어리 — 줄 한두 개만 다음 쪽으로 넘어가 거의 빈 쪽이 생기지 않게 */}
      {item.answerLines === null
        ? <div data-answer-kind="paper" className="answer-space book-answer"><div className="answer-box">{a.paperBox}</div></div>
        : <div data-answer-kind={item.kind} className="book-answer"><Heading4>{a.answerSpace}</Heading4><AnswerLines n={item.answerLines} /></div>}
    </div>
  )
}

/** 표지의 학년·반·번호·이름 빈줄(학생용). */
export function StudentFields() {
  const f = copy.cover.fields
  return (
    <p data-book-student-line className="book-student-line">
      {([f.grade, f.klass, f.number, f.name] as const).map((label) => (
        <span key={label} className="book-field"><span className="book-faint">{label}</span><span className="book-blank" /></span>
      ))}
    </p>
  )
}
