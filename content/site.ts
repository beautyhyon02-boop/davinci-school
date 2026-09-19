export type ProgramSlug = 'inquiry' | 'essay' | 'consulting' | 'lab'

export const site = {
  name: '다빈치스쿨',
  tagline: '스스로 묻고, 탐구하고, 글로 증명하는 아이들',
  intro:
    '다빈치스쿨은 5년간 40권의 탐구보고서 교재로 검증된 수업을 전국 가맹원에 공급하는 교육 본사입니다. 이제 서논술형 수업과 AI 피드백으로 아이의 생각을 글로 완성합니다.',
  metaDescription: '탐구보고서와 서논술형 수업, 전국 가맹원 네트워크 다빈치스쿨',
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

export const programDetails: Record<ProgramSlug, { headline: string; paragraphs: string[]; bullets: string[] }> = {
  inquiry: {
    headline: '질문에서 보고서까지, 스스로 완성하는 탐구',
    paragraphs: ['5년간 40권의 교재로 다듬어진 탐구보고서 수업입니다. 학생은 질문을 세우고, 자료를 모으고, 보고서로 정리하는 과정을 학년별로 반복합니다.'],
    bullets: ['초·중·고 학년별 교재 40권', '주제 선정 → 자료 조사 → 보고서 작성의 3단계', '원장님용 수업 지도안 제공'],
  },
  essay: {
    headline: '성취기준에서 출발하는 서논술형 수업과 AI 피드백',
    paragraphs: ['2022 개정 교육과정 성취기준 원문에서 문항을 설계합니다. 학생이 답안을 제출하면 루브릭에 따라 AI가 채점하고, 잘한 점과 보완할 점을 나누어 피드백합니다.', '한 가지 대주제를 국어·영어·수학·과학·사회가 함께 다루는 융합(STEAM) 방식으로 문항을 구성합니다.'],
    bullets: ['초·중·고 × 국·영·수·과·사·한국사', '루브릭 기반 AI 채점, 30초 안에 피드백', '교사용 지침서·차시 설계·예시답안 제공'],
  },
  consulting: { headline: '탐구 이력을 대입 전략으로', paragraphs: ['준비 중입니다.'], bullets: [] },
  lab: { headline: '자기주도 학습관 다빈치랩', paragraphs: ['준비 중입니다.'], bullets: [] },
}

export const auth = {
  login: {
    title: '로그인',
    subtitle: '원장님·학생·관리자 모두 여기서 로그인합니다.',
    idLabel: '아이디 또는 이메일',
    passwordLabel: '비밀번호',
    submit: '로그인',
    submitting: '확인 중…',
    errors: {
      missing: '아이디와 비밀번호를 입력하세요.',
      invalid: '아이디 또는 비밀번호가 맞지 않습니다.',
    },
  },
}

export const app = {
  roleLabel: { admin: '본사 관리자', teacher: '원장님', student: '학생' },
  logout: '로그아웃',
  nav: {
    admin: [
      { href: '/admin', label: '대시보드' },
      { href: '/admin/academies', label: '가맹원 관리' },
      { href: '/admin/items', label: '문항 제작소' },
      { href: '/admin/inquiries', label: '가맹문의' },
    ],
    teacher: [
      { href: '/teacher', label: '홈' },
      { href: '/teacher/students', label: '학생 관리' },
      { href: '/teacher/items', label: '문항 찾기' },
      { href: '/teacher/results', label: '결과 보기' },
    ],
    student: [
      { href: '/student', label: '내 과제' },
    ],
  },
  dashboard: {
    admin: { title: '본사 대시보드', body: '가맹원·학생·채점 현황이 여기에 표시됩니다.' },
    teacher: { title: '원장님 홈', body: '학생 현황과 최근 결과가 여기에 표시됩니다.' },
    student: { title: '내 과제', body: '아직 배정된 과제가 없어요.' },
  },
  adminItems: {
    title: '문항 제작소',
    body: '성취기준에서 문항·루브릭·예시답안까지 만드는 제작 도구입니다. 2주차(9/25~10/1)에 열립니다.',
  },
  adminInquiries: {
    title: '가맹문의 접수함',
    columns: { date: '접수', name: '이름', phone: '연락처', region: '지역', message: '내용', status: '상태' },
    statusLabel: { new: '신규', contacted: '연락함', done: '완료' } as const,
    empty: '아직 접수된 문의가 없습니다.',
  },
  adminAcademies: {
    listTitle: '가맹원 관리',
    columns: { code: '코드', name: '이름', region: '지역', teacherCount: '원장 수', studentCount: '학생 수' },
    newButton: '새 가맹원',
    form: {
      labels: { code: '원 코드', name: '원 이름', region: '지역', directorPhone: '원장 연락처' },
      submit: '등록',
    },
    teacherAccount: {
      heading: '원장 계정',
      formHeading: '원장 계정 발급',
      placeholders: { name: '원장님 이름', email: '원장님 이메일 (로그인 아이디)' },
      submit: '계정 발급',
      submitting: '발급 중…',
      issuedNotice: '아래 정보를 원장님께 전달하세요. 이 화면을 벗어나면 비밀번호를 다시 볼 수 없습니다.',
      labels: { id: '아이디:', password: '초기 비밀번호:' },
    },
    detailMeta: {
      studentCapacity: (n: number) => `학생 정원 ${n}`,
      monthlyGradingLimit: (n: number) => `월 채점 상한 ${n}건`,
    },
    errors: {
      codeInvalid: '원 코드는 영문 소문자·숫자 3~12자입니다.',
      nameRequired: '원 이름을 입력하세요.',
      codeTaken: '이미 있는 원 코드입니다.',
      teacherMissing: '이메일과 이름을 입력하세요.',
      invalidInput: '입력을 확인하세요.',
    },
  },
}

export const email = {
  inquiry: {
    // Resend에서 davinci-lab.kr 도메인 인증 후 lib/email/config.ts 의 주소를 교체할 때 이 표시 이름을 쓴다.
    fromName: '다빈치스쿨',
    subject: (region: string, name: string) => `[가맹문의] ${region} ${name}`,
    labels: { name: '이름', phone: '연락처', region: '지역' },
  },
}

export const pages = {
  comingSoon: {
    eyebrow: 'COMING SOON',
    title: (name: string) => `${name}은(는) 준비 중입니다`,
    body: '곧 자세한 안내를 드리겠습니다.',
    back: '메인으로',
  },
  program: {
    cta: '이 수업으로 가맹 문의',
  },
  franchise: {
    title: '다빈치스쿨 가맹 안내',
    intro: '본사가 교재·문항·교사용 지침서·AI 채점 시스템을 제공합니다. 원장님은 학생과 수업에 집중하세요.',
    formTitle: '문의 남기기',
    fields: {
      name: { label: '이름' },
      phone: { label: '연락처', placeholder: '010-0000-0000' },
      region: { label: '지역', placeholder: '예: 경기 성남' },
      message: { label: '문의 내용' },
    },
    submit: '문의 보내기',
    submitting: '보내는 중…',
    success: {
      title: '문의가 접수되었습니다',
      body: '본사에서 1~2일 안에 연락드리겠습니다.',
    },
    errors: {
      name: '이름을 입력하세요.',
      phone: '연락처를 확인하세요.',
      region: '지역을 입력하세요.',
      generic: '입력을 확인하세요.',
      submitFailed: '접수 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.',
    },
  },
}
