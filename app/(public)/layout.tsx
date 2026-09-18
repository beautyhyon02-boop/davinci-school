import { Header } from '@/components/site/Header'
import { Footer } from '@/components/site/Footer'
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (<><Header /><main>{children}</main><Footer /></>)
}
