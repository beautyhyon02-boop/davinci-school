import { site } from '@/content/site'
export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-ink-100/40">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-500">
        <p className="font-semibold text-ink-700">{site.name}</p>
        <p className="mt-1">문의 {site.contact.email}</p>
        <p className="mt-4">© {new Date().getFullYear()} {site.name}</p>
      </div>
    </footer>
  )
}
