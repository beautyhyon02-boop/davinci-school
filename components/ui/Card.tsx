export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)] ${className}`}>{children}</div>
}
