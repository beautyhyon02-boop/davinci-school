"""「2022 개정 교육과정에 따른 성취수준」(교육부·한국교육과정평가원, 초·중) PDF를 파싱해
성취기준 코드별 성취수준 JSON을 만든다.

출력: data/reference/levels/<과목>-<학교급>.json  (+ coverage.md)
  - 중등 문서 7개: 과목별 1파일 (역사-중.json 은 9역 코드 = DB의 한국사/세계사)
  - 초등 문서 3개(학년군별, 여러 교과 합본): 교과별로 나눠 3개 학년군을 한 파일에 모은다
    (예: 수학-초.json = 1~2 + 3~4 + 5~6)

방법(평문 정규식이 아니라 PDF 좌표 기반 표 복원):
  - pymupdf get_text("dict")로 줄 단위 좌표·글자 크기, get_drawings()로 표 괘선을 읽는다.
  - 표 머리("성취기준 | 성취기준별 성취수준") 아래를 표 영역으로 보고, 세로 괘선으로
    [성취기준 열 | 수준 글자 열(A~E) | 수준 진술 열]을 나눈다.
  - 가로 괘선 중 '진술 열을 가로지르는 것'으로 진술 칸을 나누고, 그 칸에 들어 있는
    수준 글자들을 한 묶음으로 본다(병합 칸: 예) A·B가 한 칸이면 두 수준이 같은 진술).
  - '성취기준 열을 가로지르는 것'으로 성취기준 칸을 나눈다. 코드 없는 칸이 쪽 맨 위에
    오면 앞 쪽 성취기준의 이어짐으로 본다.
  - 영역별 성취수준 표(영역 | 수준 | 지식·이해/과정·기능/가치·태도 | 진술)도 같은 방식.
  - 예시 평가 도구는 '…개요' 소제목 단위로 끊어 원문 텍스트를 그대로 싣는다.

실행:
  PYTHONIOENCODING=utf-8 python scripts/parse_levels.py --all
  PYTHONIOENCODING=utf-8 python scripts/parse_levels.py 수학        # 파일명에 '수학'이 든 문서만
  (초등 문서를 하나라도 고르면 교과 파일이 학년군 3개를 합치므로 초등 3개를 모두 다시 읽는다.)
결정적(deterministic)이며 몇 번을 돌려도 같은 결과가 나온다.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PDF_DIR = r"C:\Users\beaut\OneDrive\바탕 화면\다빈치서논술참고자료\교육과정성취수준"
OUT_DIR = os.path.join(ROOT, "data", "reference", "levels")
STANDARDS_DIR = os.path.join(ROOT, "data", "standards")

DOCS = [
    "(중등)2022 개정 교육과정에 따른 성취수준(국어).pdf",
    "(중등)2022 개정 교육과정에 따른 성취수준(수학).pdf",
    "(중등)2022 개정 교육과정에 따른 성취수준(과학).pdf",
    "(중등)2022 개정 교육과정에 따른 성취수준(사회).pdf",
    "(중등)2022 개정 교육과정에 따른 성취수준(영어).pdf",
    "(중등)2022 개정 교육과정에 따른 성취수준(도덕).pdf",
    "(중등)2022 개정 교육과정에 따른 성취수준(역사).pdf",
    "(초등)2022 개정 교육과정에 따른 성취수준(1~2학년군).pdf",
    "(초등)2022 개정 교육과정에 따른 성취수준(3~4학년군).pdf",
    "(초등)2022 개정 교육과정에 따른 성취수준(5~6학년군).pdf",
]
PUBLISHER = "교육부·한국교육과정평가원"
YEAR = 2024

# 초등 문서의 교과 제목(글자 크기 15) → 출력 파일 과목명
ELEM_SUBJECTS = {
    "국어": "국어", "사회": "사회", "도덕": "도덕", "수학": "수학", "과학": "과학",
    "실과": "실과", "체육": "체육", "음악": "음악", "미술": "미술", "영어": "영어",
    "바른생활": "바른생활", "슬기로운생활": "슬기로운생활", "즐거운생활": "즐거운생활",
}
# 코드 라벨 → 과목 (교차 확인용)
LABEL_SUBJECT = {
    "국": "국어", "수": "수학", "과": "과학", "사": "사회", "영": "영어", "도": "도덕",
    "역": "역사", "실": "실과", "체": "체육", "음": "음악", "미": "미술",
    "바": "바른생활", "슬": "슬기로운생활", "즐": "즐거운생활",
}
# 문서 인쇄 오기 → 바른 코드. 본문이 DB 성취기준 문장과 글자 단위로 같음을 확인한 것만 둔다.
CODE_FIXES = {
    # 중학교 국어 성취수준 문서의 매체 영역 7번째 성취기준이 [6국05-07]로 인쇄됨(초등 코드 형식).
    # 문장 "연관성이 있는 …"은 DB [9국05-07]과 같고, 앞뒤가 [9국05-06]·[9국05-08]이다(2026-09-24 대조).
    ("(중등)2022 개정 교육과정에 따른 성취수준(국어).pdf", "[6국05-07]"): "[9국05-07]",
}

# 분수처럼 2층으로 쌓인 수식은 좌표로 복원할 수 없어, 쪽을 이미지로 렌더링해 눈으로 확인한 원문으로 고친다.
LEVEL_FIXES = {
    # (초등 3~4학년군 68쪽) 분수 1/10과 소수점이 수식 글리프라 "1=01임을 … 10"으로 흩어짐
    ("[4수01-12]", "C"): "1/10=0.1임을 알고, 소수 한 자리 수를 읽고 쓸 수 있다.",
    # (초등 5~6학년군 79쪽) 분수 1/2이 "^1 … _2"로 흩어짐
    ("[6수04-05]", "C"): "안내된 절차에 따라 간단한 사건에 대하여 사건이 일어날 가능성을 0, 1/2, 1로 구분할 수 있다.",
}

# ---------------------------------------------------------------- 텍스트 유틸
RUNNING_HEAD_Y = 80      # 이 y보다 위는 러닝헤드
RUNNING_FOOT_GAP = 60    # 쪽 아래 끝에서 이만큼은 쪽 번호
# 성취기준 문장 속 각주 번호: '뺄셈3)의' → '뺄셈의' (한글 바로 뒤에 붙은 한 자리 숫자+괄호)
FOOTNOTE_MARK_RE = re.compile(r"(?<=[가-힣])\d\)")
# 한글(HWP) 수식 글꼴 HyhwpEQ의 사용자 영역(PUA) 글리프 → 문자.
# 문서 속 30°·45°·60°, y=a(x-p)²+q, (-2, 9) 같은 식을 대조해 정했다(2026-09-24, 수학 중 31·33·38·56쪽).
HWP_EQ_FONT = "HyhwpEQ"
HWP_EQ_MAP = {chr(0xE034 + i): str(i + 1) for i in range(9)}          # U+E034..E03C = 1..9
HWP_EQ_MAP.update({chr(0xE03D): "0", chr(0xE044): "(", chr(0xE045): ")", chr(0xE046): "-",
                   chr(0xE047): "=", chr(0xE048): "+", chr(0xE052): ",", chr(0xE05C): "√",
                   chr(0xE0C8): "°"})
HWP_EQ_MAP.update({chr(0xE0E5 + i): chr(ord("a") + i) for i in range(26)})  # U+E0E5.. = a..z
# U+E06D(분수 가로줄) 등 나머지는 옮길 수 없어 지워지고, 해당 성취기준에 formula_glyphs_lost 표시가 붙는다.
# 라벨 뒤 괄호 하위 과목: [9사(지리)01-01], [9사(일사)02-03]
CODE_RE = re.compile(r"\[\s*(\d{1,2})\s*([가-힣ⅠⅡ]+(?:\s*\(\s*[가-힣]+\s*\))?)\s*(\d{2})\s*[-‐‑–−]\s*(\d{2})\s*\]")
LEVEL_RE = re.compile(r"^[A-EＡ-Ｅ]$")
PUA_RE = re.compile("[\ue000-\uf8ff\U000f0000-\U000ffffd\U00100000-\U0010fffd]")
MIDDOT_RE = re.compile("[･・∙⋅ㆍ‧]")  # 가운뎃점 변형 → U+00B7 (영역별 표의 글머리 '∙'도 '·'가 된다)


def _fmt_code(m) -> str:
    label = re.sub(r"\s+", "", m.group(2))
    return f"[{m.group(1)}{label}{m.group(3)}-{m.group(4)}]"


def norm_code(s: str) -> str | None:
    """'[ 9수04 - 02 ]' 같은 흔들린 표기를 '[9수04-02]'로. 코드가 없으면 None."""
    m = CODE_RE.search(s)
    return _fmt_code(m) if m else None


def find_codes(s: str) -> list[str]:
    out = []
    for m in CODE_RE.finditer(s):
        c = _fmt_code(m)
        if c not in out:
            out.append(c)
    return out


def code_label(code: str) -> str:
    m = CODE_RE.search(code)
    return re.sub(r"\s+", "", m.group(2)) if m else ""


def norm_level_letter(s: str) -> str:
    s = s.strip()
    if s and "Ａ" <= s <= "Ｅ":
        return chr(ord(s) - ord("Ａ") + ord("A"))
    return s


def clean_text(s: str) -> str:
    """PUA 글리프 제거, 가운뎃점 통일, 공백 정리."""
    s = PUA_RE.sub("", s)
    s = s.replace("\u00a0", " ").replace("\u3000", " ")
    s = MIDDOT_RE.sub("·", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([.,])", r"\1", s)
    return s


def join_lines(lines: list[str]) -> str:
    """셀 안 줄들을 이어 붙인다(한글은 어절 단위로 줄바꿈되므로 공백으로 잇는다)."""
    return clean_text(" ".join(x for x in lines if x is not None))


def has_pua(s: str) -> bool:
    return bool(PUA_RE.search(s))


# ---------------------------------------------------------------- PDF 좌표 추출
class Line:
    __slots__ = ("x0", "y0", "x1", "y1", "size", "text", "eq")

    def __init__(self, x0, y0, x1, y1, size, text, eq=False):
        self.x0, self.y0, self.x1, self.y1, self.size, self.text = x0, y0, x1, y1, size, text
        self.eq = eq  # 한글(HWP) 수식 글꼴 조각이 들어 있는 줄

    @property
    def cy(self):
        return (self.y0 + self.y1) / 2

    @property
    def cx(self):
        return (self.x0 + self.x1) / 2

    def __repr__(self):
        return f"Line({self.x0:.0f},{self.y0:.0f},{self.x1:.0f},{self.y1:.0f},{self.size:.1f},{self.text!r})"


def eq_span_text(span, line_size: float, line_cy: float) -> str:
    """HWP 수식 글꼴(HyhwpEQ) 조각을 선형 표기로. 작은 글씨로 위에 붙은 조각은 '^'(지수)."""
    t = "".join(HWP_EQ_MAP.get(ch, ch) for ch in span["text"])
    x0, y0, x1, y1 = span["bbox"]
    if span["size"] < 0.8 * line_size and t.strip():
        cy = (y0 + y1) / 2
        if cy < line_cy - 1:
            return "^" + t
        if cy > line_cy + 1:
            return "_" + t
    return t


def page_lines(page) -> list[Line]:
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = l["spans"]
            if not "".join(s["text"] for s in spans).strip():
                continue
            size = max(s["size"] for s in spans)
            x0, y0, x1, y1 = l["bbox"]
            eq = any(s["font"].startswith(HWP_EQ_FONT) for s in spans)
            if eq:
                t = "".join(eq_span_text(s, size, (y0 + y1) / 2) if s["font"].startswith(HWP_EQ_FONT) else s["text"]
                            for s in spans)
            else:
                t = "".join(s["text"] for s in spans)
            out.append(Line(x0, y0, x1, y1, size, t, eq))
    return out


def page_rules(page):
    """가로 괘선 [(x0,x1,y)], 세로 괘선 [(x,y0,y1)] — 선과 얇은 사각형 모두."""
    hs, vs = set(), set()
    for dr in page.get_drawings():
        for it in dr["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 1.5 and abs(p1.x - p2.x) > 3:
                    hs.add((round(min(p1.x, p2.x), 1), round(max(p1.x, p2.x), 1), round((p1.y + p2.y) / 2, 1)))
                elif abs(p1.x - p2.x) < 1.5 and abs(p1.y - p2.y) > 3:
                    vs.add((round((p1.x + p2.x) / 2, 1), round(min(p1.y, p2.y), 1), round(max(p1.y, p2.y), 1)))
            elif it[0] == "re":
                r = it[1]
                if r.height < 2.5 and r.width > 3:
                    hs.add((round(r.x0, 1), round(r.x1, 1), round((r.y0 + r.y1) / 2, 1)))
                elif r.width < 2.5 and r.height > 3:
                    vs.add((round((r.x0 + r.x1) / 2, 1), round(r.y0, 1), round(r.y1, 1)))
    return sorted(hs, key=lambda h: (h[2], h[0])), sorted(vs)


# ---------------------------------------------------------------- 표 구조
def find_table_headers(lines: list[Line]):
    """표 머리 줄 찾기. ('std'|'domain', y0, y1) 목록."""
    heads = []
    small = [l for l in lines if l.size < 10.5]
    for l in small:
        t = re.sub(r"\s+", "", l.text)
        if t == "성취기준":
            kind, want = "std", "성취기준별성취수준"
        elif t == "영역":
            kind, want = "domain", "영역별성취수준"
        else:
            continue
        mates = [m for m in small if m is not l and abs(m.cy - l.cy) < 4 and re.sub(r"\s+", "", m.text).startswith(want)]
        if mates:
            heads.append((kind, min(l.y0, mates[0].y0), max(l.y1, mates[0].y1), l.x0))
    heads.sort(key=lambda h: h[1])
    return heads


def table_regions(lines, hrules, page_w, page_h):
    """표 머리마다 (kind, top, bottom) 영역을 만든다. top=머리 아래 괘선, bottom=마지막 넓은 괘선."""
    heads = find_table_headers(lines)
    wide = [h for h in hrules if (h[1] - h[0]) > 150 and (h[1] - h[0]) < page_w * 0.9]
    regs = []
    for i, (kind, y0, y1, _x) in enumerate(heads):
        nxt = heads[i + 1][1] if i + 1 < len(heads) else page_h
        # 다음 표 머리 칸의 윗선(머리 글자 바로 위 ~10pt 안)은 이 표의 선이 아니다
        below = [h for h in wide if y1 - 1 <= h[2] < nxt - 10]
        if not below:
            continue
        top = min(h[2] for h in below)
        bottom = max(h[2] for h in below)
        if bottom - top < 5:
            continue
        regs.append((kind, y0, top, bottom))
    return regs


def letter_column(lines_in, vrules, top, bottom):
    letters = [l for l in lines_in if LEVEL_RE.match(l.text.strip()) and (l.x1 - l.x0) < 14]
    if not letters:
        return None, letters
    lx0 = min(l.x0 for l in letters)
    lx1 = max(l.x1 for l in letters)
    vx = sorted({v[0] for v in vrules if v[1] < bottom - 2 and v[2] > top + 2})
    left = [x for x in vx if x <= lx0 + 1]
    right = [x for x in vx if x >= lx1 - 1]
    L = max(left) if left and lx0 - max(left) < 30 else lx0 - 8
    R = min(right) if right and min(right) - lx1 < 30 else lx1 + 8
    return (L, R), letters


def boundaries(hrules, x_from, x_to, top, bottom):
    """[x_from, x_to] 구간을 가로지르는 가로 괘선의 y (top/bottom 포함)."""
    ys = {top, bottom}
    for x0, x1, y in hrules:
        if top - 0.5 <= y <= bottom + 0.5 and x0 <= x_from + 3 and x1 >= x_to - 3:
            ys.add(y)
    ys = sorted(ys)
    merged = []
    for y in ys:
        if merged and y - merged[-1] < 2:
            continue
        merged.append(y)
    return merged


def cells(bounds):
    return [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]


def in_cell(y, cell):
    return cell[0] - 0.5 <= y < cell[1] + 0.5


def lines_text(ls):
    ls = sorted(ls, key=lambda l: (round(l.cy / 3), l.x0))
    return join_lines([l.text for l in ls])


# ---------------------------------------------------------------- 문서 파서
class DocParser:
    def __init__(self, path: str, open_pdf: bool = True):
        """open_pdf=False면 PDF를 열지 않는다(테스트에서 표 조각만 먹여 볼 때)."""
        self.path = path
        self.file = os.path.basename(path)
        if open_pdf:
            import pymupdf  # 지연 import

            self.doc = pymupdf.open(path)
        else:
            self.doc = None
        self.school = "초" if self.file.startswith("(초등)") else "중"
        m = re.search(r"\(([^()]*)\)\.pdf$", self.file)
        self.tag = m.group(1) if m else self.file
        self.title = self.file[:-4]
        # 상태
        self.subject = None if self.school == "초" else self.tag
        self.mode = None  # 'std' | 'domain' | 'examples'
        self.domain = None
        self.domain_group = None
        self.unit = None
        self.cur = None  # 현재 성취기준(들) 레코드 목록
        self.last_letters = []  # 현재 성취기준의 마지막 진술 칸 수준 글자들
        self.standards: "OrderedDict[str, dict]" = OrderedDict()
        self.domain_levels = []  # [{subject, domain, levels, pages}]
        self.dl_cur = None
        self.dl_letter = None
        self.dl_dim = None
        self.examples_raw = []  # (subject, lines)
        self.ex_cur = None
        self.ex_pending = None
        self.ex_context = ""
        self.ex_context_base = ""
        self.page_h = 754
        self.unparsed = []
        self.std_pages_codes = defaultdict(set)  # 쪽 → 평문에서 본 코드 (교차 확인)

    # ----- 로그
    def note(self, page, note):
        self.unparsed.append({"file": self.file, "page": page, "note": note})

    # ----- 상태 전환(소제목)
    def on_heading(self, pno, l: Line):
        t = l.text.strip()
        tn = re.sub(r"\s+", "", PUA_RE.sub("", t))
        if l.size >= 14.5 and self.school == "초" and tn in ELEM_SUBJECTS:
            self.close_example()
            self.ex_pending = None
            self.subject = ELEM_SUBJECTS[tn]
            self.mode = None
            self.domain = self.domain_group = self.unit = None
            self.cur = None
            return
        # 절 제목: 대개 12~15pt. 초등 3~4 체육 '나. 영역별 성취수준'(11pt)·초등 1~2 '■ 수행평가 예시 평가 도구'(11pt)처럼
        # 작은 것은 '가.'/'■' 머리가 붙은 경우만 인정(목차의 '1. 성취기준별 성취수준'(11pt)은 제외).
        section_like = l.size >= 11.5 or (l.size >= 10.5 and re.match(r"^([가-하]\.|■)", t))
        if section_like and "개발" not in tn:
            if re.search(r"성취기준별성취수준$", tn):
                self.close_example()
                self.ex_pending = None
                self.mode = "std"
                self.domain = self.domain_group = self.unit = None
                self.cur = None
                return
            if re.search(r"영역별성취수준$", tn):
                self.close_example()
                self.ex_pending = None
                self.mode = "domain"
                self.domain = self.domain_group = None
                self.dl_cur = None
                return
            if re.search(r"예시평가도구$", tn) and (len(tn) <= 12 or tn.startswith("■")):
                self.close_example()
                self.ex_pending = None
                self.mode = "examples"
                self.ex_context = self.ex_context_base = ""
                if not tn.startswith("■"):
                    return
        if self.mode in ("std", "domain"):
            m = re.match(r"^\((\d+)\)\s*(.+)$", PUA_RE.sub("", t))
            if m and 10.5 <= l.size < 14.5:
                self.domain = clean_text(m.group(2))
                self.unit = None
                if self.mode == "domain":
                    self.dl_cur = None
                return
            if 11.5 <= l.size < 14.5 and re.fullmatch(r"(.{1,8})영역", tn):
                self.domain_group = tn[:-2]
                self.domain = None
                return
            if self.mode == "std" and 10.5 <= l.size < 14.5 and PUA_RE.match(t.strip()):
                u = clean_text(t)
                if u:  # 번호 글리프만 있는 줄(󰊺)은 무시
                    self.unit = u
                return

    # ----- 페이지 처리
    def run(self):
        for i, page in enumerate(self.doc):
            self.parse_page(i + 1, page)
        self.close_example()
        self.finish_examples()
        return self

    def parse_page(self, pno, page):
        lines = page_lines(page)
        hrules, vrules = page_rules(page)
        W, H = page.rect.width, page.rect.height
        self.page_h = H
        regs = table_regions(lines, hrules, W, H)

        def region_of(l):
            for r in regs:
                if r[1] - 1 <= l.cy <= r[3] + 1:
                    return r
            return None

        # 쪽 안의 사건을 y 순서로: (y, 'heading', line) / (y, 'table', region)
        events = []
        for l in lines:
            if region_of(l) is None:
                events.append((l.y0, 0, "line", l))
        for r in regs:
            events.append((r[1], 1, "table", r))
        events.sort(key=lambda e: (e[0], e[1]))

        for _y, _o, kind, obj in events:
            if kind == "line":
                if obj.size >= 10.5 and obj.size < 30:
                    self.on_heading(pno, obj)
                if self.mode == "examples":
                    self.example_line(pno, obj)
            else:
                rk, hy0, top, bottom = obj
                inside = [l for l in lines if top - 0.5 < l.cy < bottom + 0.5]
                if self.mode == "std" and rk == "std":
                    for l in inside:
                        for c in find_codes(l.text):
                            self.std_pages_codes[pno].add(c)
                    self.parse_std_table(pno, inside, hrules, vrules, top, bottom)
                elif self.mode == "domain" and rk == "domain":
                    self.parse_domain_table(pno, inside, hrules, vrules, top, bottom)
                elif self.mode == "examples":
                    hdr = [l for l in lines if hy0 - 1 <= l.cy < top + 0.5]
                    for l in sorted(hdr + inside, key=lambda l: (round(l.cy / 3), l.x0)):
                        self.example_line(pno, l)

    # ----- 성취기준별 성취수준 표
    def new_standard(self, pno, code, text):
        printed = code
        code = CODE_FIXES.get((self.file, code), code)
        subj = self.subject
        lab = code_label(code)
        rec = self.standards.get(code)
        if rec is not None:
            self.note(pno, f"{code} 중복 등장 — 뒤 표의 수준 진술을 덧붙임")
            return rec
        rec = OrderedDict(
            code=code,
            subject=subj,
            text=text,
            domain=self.domain,
        )
        if self.domain_group:
            rec["domain_group"] = self.domain_group
        if self.unit:
            rec["unit"] = self.unit
        rec["dimensions"] = None
        rec["levels"] = OrderedDict()
        rec["merged_levels"] = []
        rec["pages"] = [pno]
        rec["examples"] = []
        rec["_file"] = self.file
        rec["_pua"] = False
        rec["_eq"] = False
        if printed != code:
            rec["code_as_printed"] = printed
            self.note(pno, f"문서에 {printed}로 인쇄됐으나 {code}의 오기로 보고 고침(CODE_FIXES)")
        exp = LABEL_SUBJECT.get(lab[:1])
        if subj and exp and exp != subj and not (subj == "역사" and lab.startswith("역")):
            self.note(pno, f"{code}: 코드 라벨({lab})과 현재 교과({subj})가 다름")
        self.standards[code] = rec
        return rec

    def add_page(self, rec, pno):
        if pno not in rec["pages"]:
            rec["pages"].append(pno)

    def parse_std_table(self, pno, inside, hrules, vrules, top, bottom):
        col, letters = letter_column(inside, vrules, top, bottom)
        if col is None:
            # 수준 글자가 없는 표 조각: 앞 쪽 진술의 이어짐일 수 있다
            txt = lines_text(inside)
            if txt and self.cur and self.last_letters:
                for rec in self.cur:
                    for L in self.last_letters:
                        rec["levels"][L] = clean_text(rec["levels"].get(L, "") + " " + txt)
                    self.add_page(rec, pno)
            elif txt:
                self.note(pno, f"수준 글자 열을 찾지 못한 표 조각: {txt[:60]}")
            return
        L, R = col
        xs = [h[0] for h in hrules if top - 1 <= h[2] <= bottom + 1] + [l.x0 for l in inside]
        tleft = min(xs) if xs else L - 100
        left_lines = [l for l in inside if l.x1 <= L + 3]
        desc_lines = [l for l in inside if l.x0 >= R - 3]
        mid_other = [l for l in inside if l not in letters and l not in left_lines and l not in desc_lines]
        for l in mid_other:
            self.note(pno, f"수준 열에 글자 외 텍스트: {l.text.strip()[:40]}")
        std_cells = cells(boundaries(hrules, tleft + 15, L, top, bottom))
        desc_cells = cells(boundaries(hrules, R, R + 40, top, bottom))
        for sc in std_cells:
            ltxt_lines = [l for l in left_lines if in_cell(l.cy, sc)]
            raw = " ".join(l.text for l in sorted(ltxt_lines, key=lambda l: (round(l.cy / 3), l.x0)))
            codes = find_codes(raw)
            if codes:
                body = clean_text(CODE_RE.sub(" ", raw))
                self.cur = [self.new_standard(pno, c, body) for c in codes]
                if len(codes) > 1:
                    self.note(pno, f"한 칸에 코드 {len(codes)}개 {codes} — 같은 수준 진술을 공유")
                self.last_letters = []
                for rec in self.cur:
                    rec["_pua"] = rec["_pua"] or has_pua(raw)
                    rec["_eq"] = rec["_eq"] or any(l.eq for l in ltxt_lines)
            elif raw.strip():
                if self.cur:
                    for rec in self.cur:
                        rec["text"] = clean_text(rec["text"] + " " + raw)
                else:
                    self.note(pno, f"코드 없는 성취기준 칸(앞 성취기준 없음): {clean_text(raw)[:60]}")
            dcs = [dc for dc in desc_cells if in_cell((dc[0] + dc[1]) / 2, sc)]
            for dc in dcs:
                lets = [norm_level_letter(l.text) for l in sorted(letters, key=lambda l: l.cy) if in_cell(l.cy, dc)]
                dls = [l for l in desc_lines if in_cell(l.cy, dc)]
                txt = lines_text(dls)
                if any(has_pua(l.text) for l in dls) and self.cur:
                    for rec in self.cur:
                        rec["_pua"] = True
                if any(l.eq for l in dls) and self.cur:
                    for rec in self.cur:
                        rec["_eq"] = True
                if not self.cur:
                    if txt or lets:
                        self.note(pno, f"성취기준 없이 나온 수준 칸 {lets}: {txt[:50]}")
                    continue
                for rec in self.cur:
                    self.add_page(rec, pno)
                    if lets:
                        for Lt in lets:
                            prev = rec["levels"].get(Lt)
                            rec["levels"][Lt] = clean_text((prev + " " + txt) if prev else txt)
                        if len(lets) > 1 and lets not in rec["merged_levels"]:
                            rec["merged_levels"].append(lets)
                    elif txt:
                        if self.last_letters:
                            for Lt in self.last_letters:
                                rec["levels"][Lt] = clean_text(rec["levels"].get(Lt, "") + " " + txt)
                        else:
                            self.note(pno, f"{rec['code']}: 수준 글자 없는 진술 칸: {txt[:50]}")
                if lets:
                    self.last_letters = lets

    # ----- 영역별 성취수준 표
    def parse_domain_table(self, pno, inside, hrules, vrules, top, bottom):
        col, letters = letter_column(inside, vrules, top, bottom)
        if col is None:
            txt = lines_text(inside)
            if txt and self.dl_cur is not None and self.dl_letter:
                self._dl_append(self.dl_letter, self.dl_dim, txt)
            elif txt:
                self.note(pno, f"영역별 표에서 수준 열을 찾지 못함: {txt[:60]}")
            return
        L, R = col
        vx = sorted({v[0] for v in vrules if v[1] < bottom - 2 and v[2] > top + 2 and v[0] > R + 3})
        dimlab = [l for l in inside if l.x0 >= R - 3 and re.fullmatch(r"(지식|과정|가치)\s*[･·・∙⋅]\s*(이해|기능|태도)", l.text.strip())]
        D = None
        if dimlab and vx:
            cand = [x for x in vx if x >= max(l.x1 for l in dimlab) - 1]
            D = min(cand) if cand else None
        left_lines = [l for l in inside if l.x1 <= L + 3]
        xs = [h[0] for h in hrules if top - 1 <= h[2] <= bottom + 1] + [l.x0 for l in inside]
        tleft = min(xs) if xs else L - 60
        left_cells = cells(boundaries(hrules, tleft + 5, L - 5, top, bottom))
        let_cells = cells(boundaries(hrules, L, R, top, bottom))
        text_x = D if D is not None else R
        body = [l for l in inside if l.x0 >= text_x - 3 and l not in dimlab]
        dim_cells = cells(boundaries(hrules, R, D, top, bottom)) if D is not None else []
        for lc in let_cells:
            # 영역 이름: '(1) 수와 연산' 소제목이 있으면 그것, 없으면(초등 영어 등) 왼쪽 영역 칸 글자
            lcy = (lc[0] + lc[1]) / 2
            name = ""
            for dc0 in left_cells:
                if in_cell(lcy, dc0):
                    name = lines_text([l for l in left_lines if in_cell(l.cy, dc0)])
            dom = self.domain or name or None
            if self.dl_cur is None or (dom and self.dl_cur["domain"] != dom):
                self.dl_cur = OrderedDict(subject=self.subject, domain=dom, levels=OrderedDict(), pages=[pno], _file=self.file)
                if self.domain_group:
                    self.dl_cur["domain_group"] = self.domain_group
                self.domain_levels.append(self.dl_cur)
                self.dl_letter = self.dl_dim = None
            if pno not in self.dl_cur["pages"]:
                self.dl_cur["pages"].append(pno)
            lets = [norm_level_letter(l.text) for l in letters if in_cell(l.cy, lc)]
            if lets:
                self.dl_letter = lets
                self.dl_dim = None
            if not self.dl_letter:
                continue
            if D is None:
                txt = lines_text([l for l in body if in_cell(l.cy, lc)])
                if txt:
                    self._dl_append(self.dl_letter, None, txt)
                continue
            for dc in [c for c in dim_cells if in_cell((c[0] + c[1]) / 2, lc)]:
                labs = [l for l in dimlab if in_cell(l.cy, dc)]
                if labs:
                    self.dl_dim = MIDDOT_RE.sub("·", re.sub(r"\s+", "", labs[0].text))
                txt = lines_text([l for l in body if in_cell(l.cy, dc)])
                if txt:
                    self._dl_append(self.dl_letter, self.dl_dim, txt)

    def _dl_append(self, letters, dim, txt):
        for Lt in letters:
            if dim:
                d = self.dl_cur["levels"].setdefault(Lt, OrderedDict())
                if isinstance(d, str):
                    d = self.dl_cur["levels"][Lt] = OrderedDict(기타=d)
                d[dim] = clean_text(d.get(dim, "") + " " + txt)
            else:
                prev = self.dl_cur["levels"].get(Lt)
                if isinstance(prev, dict):
                    prev["기타"] = clean_text(prev.get("기타", "") + " " + txt)
                else:
                    self.dl_cur["levels"][Lt] = clean_text((prev or "") + " " + txt)

    # ----- 예시 평가 도구 (원문 텍스트)
    def example_line(self, pno, l: Line):
        """예시 평가 도구 구간의 줄을 항목 단위로 모은다.

        항목 시작: 도구 제목('…예시 평가 도구 ②: 서･논술형', '나. 수행평가 예시 평가 도구') 또는
        '…개요' 소제목. 단, '평가 개요'·'문항 내용'이 연달아 나오는 탭 모양 장식(내용 없이 소제목만
        이어짐)은 새 항목으로 보지 않는다 → '개요' 소제목은 다음 줄을 보고 판단(pending).
        """
        t = l.text.strip()
        tn = re.sub(r"\s+", "", t)
        if l.y1 < RUNNING_HEAD_Y or l.y0 > self.page_h - RUNNING_FOOT_GAP:
            return  # 러닝헤드("Ⅲ. 성취수준")·쪽 번호
        big = l.size >= 11.5 and len(tn) < 40
        is_ctx = l.size >= 10.5 and (
            ("예시평가도구" in tn and (":" in t.replace("：", ":") or tn.startswith("■")))
            or (l.size >= 11.5 and re.match(r"^[가-하]\.\s*(지필|수행)", t)))
        is_sub = (not is_ctx) and 10.5 <= l.size < 14.5 and re.match(r"^\(\d+\)\s*\S", t) and len(tn) < 30
        if is_ctx or is_sub:
            # 가./나. 소제목·'…예시 평가 도구 ②: 서･논술형'은 새 맥락, '(1) 지필평가-1'은 그 아래 번호
            self.close_example()
            if is_ctx:
                self.ex_context_base = clean_text(t)
                self.ex_context = self.ex_context_base
            else:
                self.ex_context = clean_text(f"{self.ex_context_base} {t}")
            self.open_example(pno, self.ex_pending or "")
            self.ex_pending = None
            return
        if big and "개요" in tn:
            self.ex_pending = clean_text(t)
            return
        part = None
        if big:
            if re.search(r"문항내용|^\d\.평가도구$|^\d\.문항및해설|^\d\.과제$|^평가도구$", tn):
                part = "stem"
            elif re.search(r"정답해설|예시답안|모범답안", tn):
                part = "answer"
            elif re.search(r"채점기준", tn):
                part = "rubric"
            elif re.search(r"(채점|평가)시고려", tn):
                part = "notes"
        if part:
            if self.ex_cur is None:
                self.open_example(pno, self.ex_pending or "")
            self.ex_pending = None  # '개요' 바로 뒤 소제목 → 장식 탭이었음
            self.ex_cur["parts"].append([part, []])
            self.touch_example(pno)
            return
        if l.size >= 30:
            return
        if self.ex_pending is not None:
            if self.ex_cur is not None and not any(ls for _k, ls in self.ex_cur["parts"]):
                self.ex_cur["heading"] = self.ex_pending
            else:
                self.close_example()
                self.open_example(pno, self.ex_pending)
            self.ex_pending = None
        if self.ex_cur is None:
            return
        self.touch_example(pno)
        self.ex_cur["parts"][-1][1].append(t)

    def open_example(self, pno, heading):
        self.ex_cur = {"subject": self.subject, "context": self.ex_context, "heading": heading,
                       "pages": [pno], "parts": [["overview", []]]}

    def touch_example(self, pno):
        if pno not in self.ex_cur["pages"]:
            self.ex_cur["pages"].append(pno)

    def close_example(self):
        # 내용 줄이 하나도 없는 항목(도구 제목만 있고 곧바로 다음 제목)은 버린다
        if self.ex_cur is not None and any(ls for _k, ls in self.ex_cur["parts"]):
            self.examples_raw.append(self.ex_cur)
        self.ex_cur = None

    def finish_examples(self):
        for ex in self.examples_raw:
            parts = defaultdict(list)
            for k, ls in ex["parts"]:
                parts[k].extend(ls)
            overview = join_lines(parts["overview"])
            full = " ".join([overview] + [join_lines(parts[k]) for k in ("stem", "answer", "rubric", "notes")])
            codes = [CODE_FIXES.get((self.file, c), c) for c in (find_codes(overview) or find_codes(full))]
            item_type = extract_item_type(overview)
            kind = classify_kind(item_type or "", ex["context"] + " " + ex["heading"])
            lvl = None
            m = re.search(r"_\s*([A-E])\s*수준", ex["heading"])
            if m:
                lvl = m.group(1)
            else:
                m = re.search(r"성취\s*수준\s*(?:중\s*)?[‘'“\"]?([A-E](?:\s*[~∼]\s*[A-E])?)[’'”\"]?\s*(?:수준|를|을)", overview)
                if m:
                    lvl = re.sub(r"\s+", "", m.group(1)).replace("∼", "~")
            rec = OrderedDict(
                kind=kind,
                item_type=item_type,
                title=clean_text((ex["context"] + " / " if ex["context"] else "") + ex["heading"]),
                level_target=lvl,
                codes=codes,
                overview=overview,
                stem=join_lines(parts["stem"]) or None,
                answer=join_lines(parts["answer"]) or None,
                rubric=join_lines(parts["rubric"] + (["[고려 사항]"] + parts["notes"] if parts["notes"] else [])) or None,
                pages=ex["pages"],
            )
            ex["rec"] = rec
            if not codes:
                self.note(ex["pages"][0], f"예시 평가 도구에서 성취기준 코드를 찾지 못함: {ex['heading']}")

    # ----- 평문 교차 확인: 성취기준별 표 영역의 코드가 모두 잡혔는가
    def cross_check(self):
        missing = []
        for pno, cs in sorted(self.std_pages_codes.items()):
            for c in sorted(cs):
                if CODE_FIXES.get((self.file, c), c) not in self.standards:
                    missing.append((pno, c))
        for pno, c in missing:
            self.note(pno, f"표 영역에 {c}가 보이지만 성취기준으로 파싱되지 않음")


ITEM_TYPE_LABEL_RE = re.compile(r"(?:문항|평가\s*도구|평가)\s*유형")
ITEM_TYPE_STOP_RE = re.compile(
    r"\s*(?:배점|정답|평가\s*요소|성취기준|개발\s*방향|채점|예시\s*답안|학교급|과목|영역|교과\s*역량|학년|평가\s*방법|문항\s*수|소요\s*시간)")
PERFORMANCE_WORDS = ("수행", "실험", "실습", "구술", "발표", "프로젝트", "보고서", "포트폴리오", "토의", "토론",
                     "실기", "관찰", "면접", "협력")


def extract_item_type(overview: str) -> str | None:
    """개요 표의 '문항 유형 / 평가 도구 유형' 값. 라벨 뒤 첫 다음 라벨 전까지."""
    m = ITEM_TYPE_LABEL_RE.search(overview)
    if not m:
        return None
    rest = overview[m.end():m.end() + 60]
    stop = ITEM_TYPE_STOP_RE.search(rest)
    val = clean_text(rest[: stop.start()] if stop else rest[:30])
    return val or None


def classify_kind(item_type: str, context: str) -> str:
    """서술형|논술형|수행|기타. '서·논술형'은 논술형으로 본다(원문 값은 item_type에 그대로 남긴다).

    판단 순서: 문항 유형 값 → (없거나 모호하면) 도구 제목/가·나 소제목.
    """
    it = re.sub(r"\s+", "", MIDDOT_RE.sub("·", item_type or ""))
    ctx = re.sub(r"\s+", "", MIDDOT_RE.sub("·", context or ""))
    for src in (it, ctx):
        if not src:
            continue
        if "논술" in src:
            return "논술형"
        if "서술" in src:
            return "서술형"
        if any(w in src for w in PERFORMANCE_WORDS):
            return "수행"
        if re.search(r"선다|선택형|단답|지필|서답", src):
            return "기타"
    return "기타"


# ---------------------------------------------------------------- 출력 조립
def attach_examples(parsers):
    """예시 도구를 성취기준에 붙인다. 같은 문서 우선, 없으면 다른 문서(같은 학교급)의 같은 코드.

    (예: 초등 5~6학년군 문서의 '영역 융합 세트'가 [4수01-01] 같은 3~4학년군 성취기준을 쓴다.)
    """
    for p in parsers:
        for ex in p.examples_raw:
            ex["attached"] = False
            for c in ex["rec"]["codes"]:
                targets = [p.standards[c]] if c in p.standards else [
                    q.standards[c] for q in parsers if q is not p and q.school == p.school and c in q.standards]
                for rec in targets[:1]:
                    rec["examples"].append(ex["rec"])
                    ex["attached"] = True


def scheme_of(standards):
    lets = set()
    for r in standards:
        lets |= set(r["levels"].keys())
    if lets & {"D", "E"}:
        return "A-E"
    if lets <= {"A", "B", "C"} and lets:
        return "ABC"
    if lets & {"상", "중", "하"}:
        return "상중하"
    return "?"


def expected_letters(scheme):
    return {"A-E": list("ABCDE"), "ABC": list("ABC"), "상중하": ["상", "중", "하"]}.get(scheme, [])


def split_std_text(raw: str):
    """성취기준 칸 문장에서 '<탐구 활동> • …'(과학)과 '※ …'(개발 메모)를 떼어 낸다."""
    notes = []
    t = FOOTNOTE_MARK_RE.sub("", raw)
    if "※" in t:
        t, *rest = t.split("※")
        notes = [clean_text(x) for x in rest if clean_text(x)]
    acts = []
    m = re.search(r"<\s*탐구\s*활동\s*>", t)
    if m:
        body = t[m.end():]
        t = t[: m.start()]
        acts = [clean_text(x) for x in re.split(r"[•∙]", body) if clean_text(x)]
    return clean_text(t), acts, notes


def finalize_standard(r, scheme):
    exp = expected_letters(scheme)
    lv = OrderedDict((k, r["levels"][k]) for k in exp if k in r["levels"])
    for k in r["levels"]:
        if k not in lv:
            lv[k] = r["levels"][k]
    fixed = [k for k in lv if (r["code"], k) in LEVEL_FIXES]
    for k in fixed:
        lv[k] = LEVEL_FIXES[(r["code"], k)]
    missing = [k for k in exp if not lv.get(k)]
    out = OrderedDict()
    text, acts, notes = split_std_text(r["text"])
    out["code"] = r["code"]
    out["text"] = text
    if acts:
        out["inquiry_activities"] = acts
    if notes:
        out["notes"] = notes
    out["domain"] = r["domain"]
    if r.get("domain_group"):
        out["domain_group"] = r["domain_group"]
    if r.get("unit"):
        out["unit"] = r["unit"]
    out["dimensions"] = None
    out["levels"] = lv
    out["merged_levels"] = r["merged_levels"]
    out["complete"] = not missing
    if missing:
        out["missing_levels"] = missing
    if r["_eq"]:
        out["formula_linearized"] = True  # 수식 글리프를 선형 표기로 옮김(지수는 '^')
    if fixed:
        out["manual_fixes"] = fixed  # LEVEL_FIXES로 원문 대조 보정한 수준
    if r["_pua"] and not fixed:
        out["formula_glyphs_lost"] = True
    out["pages"] = sorted(r["pages"])
    if r.get("_file_label"):
        out["source_file"] = r["_file_label"]
    out["examples"] = r["examples"]
    return out


def build_outputs(parsers):
    """과목·학교급별 출력 dict 목록."""
    groups = OrderedDict()  # (subject, school) -> {sources, standards, domain_levels, unparsed, examples_unattached}
    for p in parsers:
        subj_std = defaultdict(list)
        for r in p.standards.values():
            subj_std[r["subject"] or "?"].append(r)
        subj_dl = defaultdict(list)
        for d in p.domain_levels:
            subj_dl[d["subject"] or "?"].append(d)
        subj_ex = defaultdict(list)
        for ex in p.examples_raw:
            if not ex.get("attached"):
                subj_ex[ex["subject"] or "?"].append(ex["rec"])
        subjects = list(OrderedDict.fromkeys(list(subj_std) + list(subj_dl)))
        for s in subjects:
            key = (s, p.school)
            g = groups.setdefault(key, OrderedDict(sources=[], standards=[], domain_levels=[], unparsed=[], examples_unattached=[]))
            g["sources"].append(OrderedDict(file=p.file, title=p.title, publisher=PUBLISHER, year=YEAR))
            for r in subj_std.get(s, []):
                if p.school == "초":
                    r["_file_label"] = p.tag
                g["standards"].append(r)
            for d in subj_dl.get(s, []):
                dd = OrderedDict((k, v) for k, v in d.items() if k not in ("_file", "subject"))
                if p.school == "초":
                    dd["source_file"] = p.tag
                g["domain_levels"].append(dd)
            g["examples_unattached"].extend(subj_ex.get(s, []))
            pages_s = {pg for r in subj_std.get(s, []) for pg in r["pages"]} | {pg for d in subj_dl.get(s, []) for pg in d["pages"]}
            lo, hi = (min(pages_s), max(pages_s)) if pages_s else (0, 10**9)
            for u in p.unparsed:
                if lo - 2 <= u["page"] <= hi + 25 or p.school == "중":
                    g["unparsed"].append(u)
    outs = OrderedDict()
    for (s, school), g in groups.items():
        scheme = scheme_of(g["standards"])
        doc = OrderedDict()
        doc["subject"] = s
        doc["school_level"] = school
        doc["source"] = g["sources"][0] if len(g["sources"]) == 1 else g["sources"]
        doc["scheme"] = scheme
        doc["standards"] = [finalize_standard(r, scheme) for r in g["standards"]]
        doc["domain_levels"] = g["domain_levels"]
        doc["examples_unattached"] = g["examples_unattached"]
        # 같은 쪽·같은 메모 중복 제거
        seen, un = set(), []
        for u in g["unparsed"]:
            k = (u["file"], u["page"], u["note"])
            if k not in seen:
                seen.add(k)
                un.append(OrderedDict(page=u["page"], note=u["note"], file=u["file"]) if school == "초" else OrderedDict(page=u["page"], note=u["note"]))
        doc["unparsed"] = un
        outs[f"{s}-{school}"] = doc
    return outs


# ---------------------------------------------------------------- 커버리지
def load_reference_codes(db_json: str | None):
    """DB 코드 목록. db_json(npx tsx로 뽑은 {code,subject,level}[])이 있으면 그것, 없으면 data/standards/*.json."""
    rows = []
    if db_json and os.path.exists(db_json):
        rows = json.load(open(db_json, encoding="utf-8"))
        src = f"DB 덤프({os.path.basename(db_json)})"
    else:
        for f in sorted(glob.glob(os.path.join(STANDARDS_DIR, "*.json"))):
            rows += json.load(open(f, encoding="utf-8"))
        src = "data/standards/*.json"
    texts = {}
    for f in sorted(glob.glob(os.path.join(STANDARDS_DIR, "*.json"))):
        for r in json.load(open(f, encoding="utf-8")):
            texts[r["code"]] = r["text"]
    return rows, texts, src


def text_key(s: str) -> str:
    return re.sub(r"[\s.·･‧ㆍ⋅∙・,'‘’\"“”]", "", PUA_RE.sub("", s or ""))


DB_SUBJECT_FOR = {"역사": ["한국사", "세계사"]}


def coverage_md(outs, ref_rows, ref_texts, ref_src):
    by_level_subj = defaultdict(set)
    for r in ref_rows:
        by_level_subj[(r["level"], r["subject"])].add(r["code"])
    all_ref = {r["code"] for r in ref_rows}
    L = []
    L.append("# 성취수준 파싱 커버리지\n")
    L.append(f"생성: `python scripts/parse_levels.py --all` · 비교 대상: {ref_src} (코드 {len(all_ref):,}개)\n")
    L.append("> 2026-09-24에 호스팅 DB `standards`(1,814행)를 읽기 전용으로 뽑아 `data/standards/*.json`과 대조한 결과 "
             "코드 집합이 완전히 같았다(양쪽 차집합 0). 그래서 기본값은 오프라인으로 재현 가능한 JSON을 쓴다. "
             "DB 덤프로 다시 계산하려면 `--db-codes <덤프.json>`.\n")
    L.append("- **문서 코드**: 성취기준별 성취수준 표에서 파싱한 코드 수")
    L.append("- **DB 일치**: 그중 DB에 같은 코드가 있는 수 / 비율")
    L.append("- **DB 쪽 누락**: 같은 과목·학교급의 DB 코드 중 문서에 없는 것")
    L.append("- **완결**: 기대 수준(초 A~C, 중 A~E)이 모두 채워진 성취기준 수")
    L.append("- **본문 일치**: 성취기준 문장이 DB 문장과 공백·문장부호 무시하고 같은 수\n")
    L.append("| 파일 | 체계 | 문서 코드 | DB 일치 | 일치율 | 문서에만 | DB에만 | 완결 | 병합 칸 있는 기준 | 본문 일치 | 예시 도구(연결/미연결) | 영역별 표 | unparsed |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    details = []
    totals = {}
    order = sorted(outs, key=lambda k: (k.split("-")[1] != "중", k))
    for key in order:
        d = outs[key]
        subj, school = d["subject"], d["school_level"]
        codes = [s["code"] for s in d["standards"]]
        cs = set(codes)
        matched = cs & all_ref
        db_subjects = DB_SUBJECT_FOR.get(subj, [subj])
        ref_same = set()
        for ds in db_subjects:
            ref_same |= by_level_subj.get((school, ds), set())
        only_doc = sorted(cs - all_ref)
        only_db = sorted(ref_same - cs)
        complete = sum(1 for s in d["standards"] if s["complete"])
        merged = sum(1 for s in d["standards"] if s["merged_levels"])
        tmatch = sum(1 for s in d["standards"] if s["code"] in ref_texts and text_key(s["text"]) == text_key(ref_texts[s["code"]]))
        tcomp = sum(1 for s in d["standards"] if s["code"] in ref_texts)
        ex_att = len({id(e) for s in d["standards"] for e in s["examples"]})
        ex_un = len(d["examples_unattached"])
        rate = f"{100 * len(matched) / len(cs):.1f}%" if cs else "-"
        if not ref_same:
            rate += " (DB에 과목 없음)"
        if ref_same:
            tot = totals.setdefault(school, [0, 0, 0, 0])
            tot[0] += len(cs)
            tot[1] += len(matched)
            tot[2] += len(ref_same)
            tot[3] += len(ref_same & cs)
        L.append(f"| `{key}.json` | {d['scheme']} | {len(cs)} | {len(matched)} | {rate} | {len(only_doc)} | {len(only_db)} | {complete}/{len(cs)} | {merged} | {tmatch}/{tcomp} | {ex_att}/{ex_un} | {len(d['domain_levels'])} | {len(d['unparsed'])} |")
        det = [f"\n## {key}\n"]
        if isinstance(d["source"], list):
            det.append("출처: " + ", ".join(f"`{s['file']}`" for s in d["source"]))
        else:
            det.append(f"출처: `{d['source']['file']}`")
        if ref_same:
            det.append(f"\n- DB 비교 과목: {'/'.join(db_subjects)} ({school}) {len(ref_same)}개")
        else:
            det.append(f"\n- DB에 이 과목({subj}, {school})의 성취기준이 없음 → 일치율 비교 불가")
        det.append(f"- 문서에만 있는 코드 ({len(only_doc)}): " + (", ".join(only_doc) if only_doc else "없음"))
        if ref_same:
            det.append(f"- DB에만 있는 코드 ({len(only_db)}): " + (", ".join(only_db) if only_db else "없음"))
        inc = [s for s in d["standards"] if not s["complete"]]
        det.append(f"- 수준이 비거나 빠진 성취기준 ({len(inc)}): " + (", ".join(f"{s['code']}(빠짐 {''.join(s.get('missing_levels', []))})" for s in inc) if inc else "없음"))
        fl = [s["code"] for s in d["standards"] if s.get("formula_glyphs_lost")]
        if fl:
            det.append(f"- 수식 글리프(PUA)가 지워진 성취기준 ({len(fl)}): " + ", ".join(fl))
        tm = [s for s in d["standards"] if s["code"] in ref_texts and text_key(s["text"]) != text_key(ref_texts[s["code"]])]
        if tm:
            det.append(f"- 성취기준 문장이 DB와 다른 것 ({len(tm)}):")
            for s in tm[:40]:
                det.append(f"  - {s['code']} 문서: {s['text']} / DB: {ref_texts[s['code']]}")
            if len(tm) > 40:
                det.append(f"  - … 외 {len(tm) - 40}건")
        if d["unparsed"]:
            det.append(f"- unparsed 메모 {len(d['unparsed'])}건 (JSON `unparsed` 참고)")
        details.extend(det)
    L.append("\n**합계(DB에 있는 과목만)**\n")
    for school in ("중", "초"):
        if school in totals:
            a, m, r, rc = totals[school]
            L.append(f"- {school}: 문서 코드 {a}개 중 DB 일치 {m}개({100 * m / a:.1f}%) · "
                     f"DB 코드 {r}개 중 문서에 있는 것 {rc}개({100 * rc / r:.1f}%)")
    L.extend(details)
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- main
def select_docs(args):
    if args.all or not args.targets:
        return list(DOCS)
    chosen = []
    for t in args.targets:
        hits = [d for d in DOCS if t in d or os.path.basename(t) == d]
        if not hits:
            sys.exit(f"문서를 찾지 못함: {t}")
        chosen += hits
    if any(d.startswith("(초등)") for d in chosen):
        chosen += [d for d in DOCS if d.startswith("(초등)")]
    return [d for d in DOCS if d in set(chosen)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="*", help="문서 파일명 일부(예: 수학, 3~4) — 생략 시 --all")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--pdf-dir", default=PDF_DIR)
    ap.add_argument("--out", default=OUT_DIR)
    ap.add_argument("--db-codes", default=None, help="DB에서 뽑은 {code,subject,level} JSON (없으면 data/standards)")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    parsers = []
    for d in select_docs(args):
        p = DocParser(os.path.join(args.pdf_dir, d)).run()
        p.cross_check()
        parsers.append(p)
        print(f"{d}: 성취기준 {len(p.standards)} · 영역별 {len(p.domain_levels)} · 예시 {len(p.examples_raw)} · 메모 {len(p.unparsed)}", file=sys.stderr)
    attach_examples(parsers)
    outs = build_outputs(parsers)
    for key, doc in outs.items():
        with open(os.path.join(args.out, f"{key}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write("\n")
    # 커버리지는 출력 폴더의 모든 JSON으로 다시 계산(부분 실행해도 전체 표 유지)
    all_outs = OrderedDict()
    for f in sorted(glob.glob(os.path.join(args.out, "*-*.json"))):
        k = os.path.basename(f)[:-5]
        all_outs[k] = json.load(open(f, encoding="utf-8"))
    rows, texts, src = load_reference_codes(args.db_codes)
    with open(os.path.join(args.out, "coverage.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write(coverage_md(all_outs, rows, texts, src))
    print(f"wrote {len(outs)} files → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
