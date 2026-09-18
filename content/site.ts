export type ProgramSlug = 'inquiry' | 'essay' | 'consulting' | 'lab'

export const site = {
  name: '다빈치스쿨',
  tagline: '스스로 묻고, 탐구하고, 글로 증명하는 아이들',
  intro:
    '다빈치스쿨은 5년간 40권의 탐구보고서 교재로 검증된 수업을 전국 가맹원에 공급하는 교육 본사입니다. 이제 서논술형 수업과 AI 피드백으로 아이의 생각을 글로 완성합니다.',
  stats: [
    { label: '전국 가맹원', value: '40+' },
    { label: '탐구보고서 교재', value: '40권' },
    { label: '누적 수업 기간', value: '5년' },
  ],
  programs: [
    { slug: 'inquiry', name: '탐구보고서', short: '질문에서 보고서까지, 5년 검증된 탐구 수업', status: 'open', accent: 'mint' },
    { slug: 'essay', name: '서논술형 수업', short: '성취기준 기반 문항과 AI 채점·피드백', status: 'open', accent: 'lemon' },
    { slug: 'consulting', name: '대입 컨설팅', short: '탐구 이력을 대입 전략으로', status: 'soon', accent: 'lavender' },
    { slug: 'lab', name: '다빈치랩', short: '자기주도 학습관', status: 'soon', accent: 'mint' },
  ] as const satisfies ReadonlyArray<{ slug: ProgramSlug; name: string; short: string; status: 'open' | 'soon'; accent: 'mint' | 'lemon' | 'lavender' }>,
  why: [
    { title: '교육과정에서 출발', body: '2022 개정 교육과정 성취기준 원문에서 문항을 설계합니다.' },
    { title: '글로 남는 배움', body: '탐구와 논술의 결과가 학생의 글로 축적됩니다.' },
    { title: '원장님과 함께', body: '본사가 문항·지침서·자료를 만들고, 원장님은 수업에 집중합니다.' },
  ],
  contact: { email: 'davincischooloffice@gmail.com' },
  nav: [
    { href: '/programs/inquiry', label: '탐구보고서' },
    { href: '/programs/essay', label: '서논술형' },
    { href: '/programs/consulting', label: '대입 컨설팅' },
    { href: '/programs/lab', label: '다빈치랩' },
  ],
  header: { login: '로그인', franchise: '가맹문의' },
  hero: { ctaPrimary: '서논술형 수업 보기', ctaFranchise: '가맹문의' },
  sections: {
    programs: { eyebrow: 'PROGRAMS', title: '다빈치스쿨의 네 가지 수업' },
    why: { eyebrow: 'WHY DAVINCI', title: '왜 다빈치인가' },
  },
  franchiseCta: {
    title: '우리 지역에 다빈치스쿨을 열고 싶다면',
    body: '본사가 교재·문항·교사용 지침서를 준비합니다.',
    button: '가맹 안내 보기',
  },
  statusLabel: { open: '운영 중', soon: '준비 중' },
  footer: { contactLabel: '문의' },
}
