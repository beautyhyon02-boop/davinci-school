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
# 예 [9사(일사)01-01]), 마지막으로 영역-일련번호 숫자를 캡처한다.
CODE = re.compile(r"^\[(\d{1,2})[가-힣()]+[\d\-]*\d\]")

# 성취기준 해설/적용 시 고려 사항 등, 성취기준 본문이 끝났음을 알리는 표시.
# 과학과처럼 "<탐구 활동>"/"<사회적 참여와 실천>" 같은 꺾쇠 소제목으로
# 예시 활동을 붙여두는 경우도 성취기준 본문의 끝으로 본다.
STOP = re.compile(r"^\((가|나|다|라)\)|^성취기준 해설|^성취기준 적용|^<.+>$")

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

# 러닝헤드(반복되는 쪽 머리말/꼬리말)에는 항상 "교육과정"이라는 단어가
# 들어간다: "교육과정", "공통 교육과정", "사회과 교육과정",
# "선택 중심 교육과정 – 일반 선택 과목 -" 등. 실제 성취기준 문장은
# 한국어 종결어미(예: "~다.")로 끝나므로, "교육과정"을 포함하면서
# 문장으로 끝나지 않는 짧은 줄은 러닝헤드로 간주해 걸러낸다.
_SENTENCE_END = re.compile(r"(다|음|함)[.)]$")


def _is_running_head(line: str) -> bool:
    return "교육과정" in line and len(line) <= 40 and not _SENTENCE_END.search(line)


def is_noise(line: str) -> bool:
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
    m = re.match(r"^\[\d{1,2}([가-힣()]+)", code)
    label = m.group(1) if m else ""
    if re.search(r"한국사|한사|역", label):
        return "한국사"
    return default_subject


def _code_label(code: str) -> str:
    """코드 대괄호 안, 학년 숫자 뒤·일련번호 숫자 앞의 한글 라벨(예: '공국', '화언')."""
    m = re.match(r"^\[\d{1,2}([가-힣()]+)", code)
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
        if is_noise(line):
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
