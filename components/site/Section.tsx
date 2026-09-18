export function Section({ title, eyebrow, children, className = '' }: { title?: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mx-auto max-w-6xl px-4 py-16 ${className}`}>
      {eyebrow && <p className="mb-2 text-sm font-semibold text-lavender-600">{eyebrow}</p>}
      {title && <h2 className="mb-8 text-3xl font-extrabold tracking-tight">{title}</h2>}
      {children}
    </section>
  )
}
