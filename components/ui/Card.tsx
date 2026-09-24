/** print='keep' → 문제지 인쇄(html.print-questions)에서도 남는 칸(app/globals.css). */
export function Card({ children, className = '', print }: { children: React.ReactNode; className?: string; print?: 'keep' }) {
  return <div data-print={print} className={`rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)] ${className}`}>{children}</div>
}
