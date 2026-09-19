"""2022 개정 교육과정 별책 PDF에서 성취기준을 추출해 JSON으로 저장한다.
사용: python scripts/extract_standards.py "<pdf 경로>" <과목> <출력 json>

과목(subject)은 기본값이며, 사회과 별책처럼 하나의 PDF 안에 역사/한국사
성취기준이 섞여 있는 경우 subject_for_code()가 코드를 보고 실제 과목을
재분류한다. (사회과 별책 → 사회.json / 한국사.json 두 파일로 분리)
"""
import json
import re
import sys
from pathlib import Path

# 코드 앞의 학년(군) 숫자, 과목/영역을 나타내는 한글(괄호 포함 가능:
# 예 [9사(일사)01-01]), 마지막으로 영역-일련번호 숫자를 캡처한다. 고등학교
# 수학 "미적분Ⅰ/Ⅱ"는 과목명에 로마 숫자(Ⅰ=U+2160, Ⅱ=U+2161)를 쓰는데
# ([12미적Ⅰ-01-01]처럼), 이 문자는 가-힣 범위가 아니라서 라벨 문자
# 클래스에 넣지 않으면 코드 자체를 통째로 못 알아보고 43개 성취기준이
# 조용히 사라진다(실제로 겪은 문제 — [별책4] 고등학교 교육과정.pdf).
CODE = re.compile(r"^\[(\d{1,2})[가-힣ⅠⅡ()]+[\d\-]*\d\]")

# 성취기준 해설/적용 시 고려 사항 등, 성취기준 본문이 끝났음을 알리는 표시.
# 과학과처럼 "<탐구 활동>"/"<사회적 참여와 실천>" 같은 꺾쇠 소제목으로
# 예시 활동을 붙여두는 경우도 성취기준 본문의 끝으로 본다.
# 초·중·고 교육과정 총론 별책(별책2/3/4, 수학과 성취기준을 걸러내는 데
# 쓰는 파일)은 성취기준 바로 뒤에 다음 소단원명을 "<PUA 글머리 기호>
# 소단원명" 형태(예: " 두 자리 수 범위의 덧셈과 뺄셈", 간혹
# " 무게"처럼 두 번 겹쳐 나오기도 함)로 붙여둔다. 이 글머리
# 기호는 실제로 항상 U+F000 한 글자만 쓰인다. 고등학교 수학(대수/미적분
# 등) 성취기준 안에는 수식(예: y, x, n 등 변수)이 폰트 문제로 다른
# 사용자 영역 코드(U+E0xx 대)로 추출되어 문장 중간·줄바꿈 지점에 그대로
# 섞여 있는데, 이는 소제목이 아니라 성취기준 문장 자체의 일부이므로 여기
# 걸리면 안 된다. 그래서 STOP은 글머리 기호로 실제 관찰된 U+F000 문자로
# 시작하는 줄만 매칭하도록 좁혀 둔다(넓게 U+E000~U+F8FF 전체를 매칭하면
# 고등학교 수식이 중간에 잘려나가는 회귀가 생김 — 실제로 확인함).
STOP = re.compile(r"^\((가|나|다|라)\)|^성취기준 해설|^성취기준 적용|^<.+>$|^")

# 영역 소제목: 예 "(1) 듣기·말하기", "(3) 쓰기". 나오면 domain을 갱신하고
# 직전까지 누적하던 성취기준은 마무리한다.
DOMAIN_HEADING = re.compile(r"^\((\d{1,2})\)\s*(.+)$")

# 쪽 번호, 반복되는 머리말(러닝헤드), 학년(군) 대괄호 헤더 등 성취기준
# 본문에 절대 속하지 않는 잡음 줄. 텍스트 누적 중에 끼어들어도 무시하고
# 누적을 끊지 않는다(다음 코드나 STOP이 나올 때까지 계속 이어붙인다).
NOISE = re.compile(
    r"^\d{1,4}$"  # 쪽 번호만 있는 줄
    r"|^\[(초등학교|중학교|고등학교)[^\]]*\]$"  # [중학교 1~3학년] 등 학년군 헤더
    r"|^[-–—•·\s]{1,3}$"  # "선택 중심 교육과정 – 진로 선택 과목\n-"처럼 줄바꿈으로
    # 떨어져 나온 낱개의 대시/불릿 기호만 있는 줄
)

# 고등학교 수학(공통수학/대수/미적분/경제 수학 등) 성취기준 문장 안에는
# 수식의 변수·기호(x, y, =, +, a, b, c, d, √, 2, n)가 임베드된 수식용
# 폰트 문제로 유니코드 사용자 영역(PUA) 문자로 추출된다. 아래 표는
# "[별책4] 고등학교 교육과정.pdf"의 실제 페이지를 pdfplumber로 렌더링해
# 눈으로 대조해 확인한 값이다(추측이 아니라 원문 대조 결과):
#   U+E0FC → x, U+E0FD → y  (472/471쪽 "[10공수2-01-07] …축, 직선 y=x…")
#   U+E047 → =, U+E048 → +  (473쪽 "[10공수2-03-04] 유리함수 y=(ax+b)/(cx+d)")
#   U+E0E5 → a, U+E0E6 → b, U+E0E7 → c, U+E0E8 → d  (같은 473쪽 수식)
#   U+E05C → √  (473쪽 "[10공수2-03-05] 무리함수 y=√(ax+b)+c")
#   U+E035 → 2  (576쪽 "[12경수03-02] …2×2 행렬의 역행렬을…")
#   U+E0F2 → n  (506쪽 "[12대수03-02] …제n항까지의 합을…")
# U+E06D는 위 두 수식(분수/근호)에서 각각 분수선·근호 위 가로줄(비큘럼)
# 자리에 나타나는데, 문맥에 따라 의미가 달라지는 순수 도형 요소라서
# 특정 문자로 옮기면 오히려 원문에 없는 표기를 지어내는 것이 되므로
# 일부러 치환표에 넣지 않고 그대로 남겨 둔다(알려진 한계로 보고서에 기록).
MATH_PUA_GLYPHS = {
    "": "x",
    "": "y",
    "": "=",
    "": "+",
    "": "a",
    "": "b",
    "": "c",
    "": "d",
    "": "√",  # √
    "": "2",
    "": "n",
}

# 성취기준 문장이 이미 "~다."로 끝난 뒤에, 다음 성취기준의 분수식
# 분자처럼 읽기 순서가 뒤엉켜 끼어든 순수 기호 조각(예: [10공수2-03-03]
# 뒤에 다음 성취기준 [10공수2-03-04]의 분자 "ax+b"가 통째로 잘못
# 붙는 경우)이 있다. 이미 완결된 문장 뒤에 한글이 전혀 없이 기호만 남은
# 꼬리는 어차피 해당 성취기준의 것이 아니므로 통째로 잘라낸다.
_TRAILING_SYMBOL_JUNK = re.compile(r"(다\.)\s*[-\s]+$")


def _fix_math_pua_glyphs(text: str) -> str:
    # 먼저 "~다." 뒤에 붙은, 다른 성취기준에서 뒤엉켜 들어온 기호만
    # 남은 꼬리를 잘라낸다(치환하기 전에 해야 PUA 문자로 판별할 수 있음).
    text = _TRAILING_SYMBOL_JUNK.sub(r"\1", text)
    for pua, ch in MATH_PUA_GLYPHS.items():
        text = text.replace(pua, ch)
    return text


# 러닝헤드(반복되는 쪽 머리말/꼬리말)에는 항상 "교육과정"이라는 단어가
# 들어간다: "교육과정", "공통 교육과정", "사회과 교육과정",
# "선택 중심 교육과정 – 일반 선택 과목 -" 등. 실제 성취기준 문장은
# 한국어 종결어미(예: "~다.")로 끝나므로, "교육과정"을 포함하면서
# 문장으로 끝나지 않는 짧은 줄은 러닝헤드로 간주해 걸러낸다.
_SENTENCE_END = re.compile(r"(다|음|함)[.)]$")


def _is_running_head(line: str) -> bool:
    return "교육과정" in line and len(line) <= 40 and not _SENTENCE_END.search(line)


def is_noise(line: str, subject: str = "") -> bool:
    # 초·중·고 교육과정 총론 별책(별책2/3/4)은 페이지가 바뀌는 자리에
    # "쪽 번호" 다음 줄에 과목명 한 단어짜리 러닝헤드가 따로 나온다(예:
    # "234" 다음 줄에 "수학"만 있는 줄). "OOO 교육과정" 형태가 아니라서
    # _is_running_head로 걸러지지 않으므로, 현재 과목명과 완전히 같은
    # 한 줄은 러닝헤드로 보고 잡음 처리한다.
    if subject and line == subject:
        return True
    return bool(NOISE.match(line)) or _is_running_head(line)


def level_from_code(code: str) -> str:
    n = int(re.match(r"\[(\d{1,2})", code).group(1))
    return "초" if n <= 6 else ("중" if n == 9 else "고")


def grade_band_from_code(code: str) -> str:
    n = int(re.match(r"\[(\d{1,2})", code).group(1))
    return {2: "1-2", 4: "3-4", 6: "5-6", 9: "1-3", 10: "1", 12: "2-3"}.get(n, str(n))


def subject_for_code(code: str, default_subject: str) -> str:
    """사회과 별책 안에 섞여 있는 역사/한국사 성취기준을 재분류한다.

    코드의 대괄호 안 텍스트(학년 숫자 뒤, 일련번호 숫자 앞)에 '역'
    또는 '한국사'가 포함되면 한국사로, 그 외 사회과 코드(사, 일사,
    통사, 지리, 정치, 경제, 법, 윤리 등)는 그대로 default_subject를
    반환한다. 국어/영어/과학처럼 사회과가 아닌 과목은 영향을 받지
    않는다.
    """
    if default_subject != "사회":
        return default_subject
    m = re.match(r"^\[\d{1,2}([가-힣ⅠⅡ()]+)", code)
    label = m.group(1) if m else ""
    if re.search(r"한국사|한사|역", label):
        return "한국사"
    return default_subject


def _code_label(code: str) -> str:
    """코드 대괄호 안, 학년 숫자 뒤·일련번호 숫자 앞의 한글(+로마 숫자Ⅰ/Ⅱ) 라벨
    (예: '공국', '화언', 고등학교 수학 '미적Ⅰ')."""
    m = re.match(r"^\[\d{1,2}([가-힣ⅠⅡ()]+)", code)
    return m.group(1) if m else ""


def parse_standards(text: str, subject: str, domain: str = "") -> list[dict]:
    rows, cur = [], None
    current_domain = domain
    prev_label = None
    domain_set_since_label = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if is_noise(line, subject):
            continue
        m = CODE.match(line)
        if m:
            if cur:
                rows.append(cur)
            code_end = line.index("]") + 1
            code = line[:code_end]
            label = _code_label(code)
            # 과목/과정(예: "매의" → "화언")이 바뀌었는데 그 사이에 새
            # 영역 제목을 만나지 못했다면, 이전 과정에서 남은 domain을
            # 그대로 이어붙이는 것은 틀린 값이므로 비운다.
            if prev_label is not None and label != prev_label and not domain_set_since_label:
                current_domain = ""
            prev_label = label
            domain_set_since_label = False
            cur = {
                "level": level_from_code(code),
                "subject": subject_for_code(code, subject),
                "grade_band": grade_band_from_code(code),
                "domain": current_domain,
                "code": code,
                "text": line[code_end:].strip(),
            }
            continue
        dm = DOMAIN_HEADING.match(line)
        # 실제 영역명("듣기⋅말하기", "화법과 언어" 등)은 짧다. 고등학교
        # 선택과목의 "(1)/(2)/(3)…" 목표 나열문처럼 긴 문장이나, "교수·학습
        # 및 평가" 절의 "(1) 교수·학습 방향"/"(3) 평가 방법" 같은 행정
        # 소제목은 영역 제목이 아니므로 무시한다(저비용 휴리스틱).
        candidate = dm.group(2).strip() if dm else ""
        if dm and len(candidate) <= 12 and not any(w in candidate for w in ("평가", "교수", "학습")):
            if cur:
                rows.append(cur)
                cur = None
            current_domain = candidate
            domain_set_since_label = True
            continue
        if cur:
            if STOP.match(line):
                rows.append(cur)
                cur = None
            else:
                cur["text"] = (cur["text"] + " " + line).strip()
    if cur:
        rows.append(cur)
    for r in rows:
        r["text"] = _fix_math_pua_glyphs(r["text"])
    return rows


def extract_pdf(pdf_path: str, subject: str) -> list[dict]:
    import pdfplumber

    out, seen = [], set()
    with pdfplumber.open(pdf_path) as pdf:
        # 페이지 경계에서 성취기준 본문이 줄바꿈되는 경우가 있어, 개별
        # 페이지가 아니라 전체 텍스트를 이어 붙여 한 번에 파싱한다.
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    for r in parse_standards(full_text, subject):
        if r["code"] not in seen:
            seen.add(r["code"])
            out.append(r)
    return out


if __name__ == "__main__":
    pdf, subject, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = extract_pdf(pdf, subject)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{subject}: {len(rows)}개 성취기준 → {out}")
