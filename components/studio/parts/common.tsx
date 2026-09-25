import type { ReactNode } from 'react'
import { app } from '@/content/site'

// 패키지 화면 조각(parts/)이 함께 쓰는 작은 틀. parts/ 는 서버·클라이언트 어디서나 렌더된다 —
// node:fs 를 쓰는 모듈(@/lib/reference/levels 등)을 가져오지 않고, 함수 prop 없이 평범한 데이터만 받는다.
//
// 읽기 위계(오너 요청 2026-09-26 "옆으로 쭉 나열하지 말 것 — 글자 크기·볼드·줄 내림으로 눈에 딱 들어오게", 모든 과목):
//   칸 제목 = SectionTitle(text-base 굵게) → 소제목 = SubLabel(작은 회색 굵은 글자) → 본문 = text-sm →
//   보조(예상 답·막힐 때·정답·해설·기대 답) = Aside(왼쪽 선 + 들여쓰기 + 옅은 글자).
//   내용 목록은 가로로 잇지 않고(' · ' · ' / ' 금지) 한 줄에 하나씩 — Lines·LabeledLines. 코드·배지·분 같은 짧은 메타데이터만 한 줄에.

const copy = app.packageView

export function Label({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink-500">{children}</span>
}

/** 칸 안의 큰 제목(교사용 지침·전체 안내·검수 요령 등). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-base font-bold text-ink-900">{children}</p>
}

/** 소제목 — 목록·값 바로 위의 작은 이름표(발문 대본·지도상 유의점·준비물 등). */
export function SubLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{children}</p>
}

/** 한 줄에 하나씩. ordered = 번호 목록. 빈 목록이면 그리지 않는다. */
export function Lines({ items, ordered = false, className = '' }: { items: ReactNode[]; ordered?: boolean; className?: string }) {
  if (items.length === 0) return null
  const cls = `mt-1 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}${className ? ` ${className}` : ''}`
  const body = items.map((x, i) => <li key={i}>{x}</li>)
  return ordered ? <ol className={cls}>{body}</ol> : <ul className={cls}>{body}</ul>
}

/** 소제목 + 한 줄에 하나씩 목록. 빈 목록이면 소제목도 그리지 않는다. */
export function LabeledLines({ label, items, ordered = false, className = '' }: { label: ReactNode; items: ReactNode[]; ordered?: boolean; className?: string }) {
  if (items.length === 0) return null
  return (
    <div className={className || undefined}>
      <SubLabel>{label}</SubLabel>
      <Lines items={items} ordered={ordered} />
    </div>
  )
}

/**
 * 이름표 줄: "라벨: 값" 한 줄 — 값이 없으면 그리지 않는다.
 * stacked = 긴 값(문단)용: 소제목을 위에, 값을 아랫줄에.
 */
export function KV({ label, children, className = '', stacked = false }: { label: ReactNode; children: ReactNode; className?: string; stacked?: boolean }) {
  if (children === undefined || children === null || children === '') return null
  if (stacked) {
    return (
      <div className={className || undefined}>
        <SubLabel>{label}</SubLabel>
        <p className="mt-1 whitespace-pre-wrap">{children}</p>
      </div>
    )
  }
  return <p className={className || undefined}><Label>{label}:</Label> {children}</p>
}

/**
 * 보조 줄(예상 답·막힐 때·정답·해설·기대 답) — 앞 줄 아래 새 줄에, 들여쓰고 옅게. faint = 더 옅게(막힐 때 힌트 등).
 * kind 는 data-aside 표식(테스트·인쇄에서 이 줄을 찾는 데 쓴다).
 */
export function Aside({ label, children, faint = false, kind }: { label: ReactNode; children: ReactNode; faint?: boolean; kind?: string }) {
  return (
    <p data-aside={kind} className={`mt-1 border-l-2 border-lavender-200 pl-3 text-sm ${faint ? 'text-ink-500' : 'text-ink-700'}`}>
      <span className="font-semibold">{label}</span> {children}
    </p>
  )
}

/** 채점 자료 접이식. open = 관리자 미리보기·제작소(펼침), 원장 열람은 접힘. */
export function Answers({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details open={open} data-print="omit" className="mt-3 rounded-lg bg-lemon-100/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink-500">{copy.answersToggle}</summary>
      <div className="mt-2 space-y-3">{children}</div>
    </details>
  )
}

/** 저장된 출력은 옛 판·손으로 고친 판일 수 있다 — 배열이 아니면 빈 배열로 읽는다(빠진 칸은 그리지 않는다). */
export const arr = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])
