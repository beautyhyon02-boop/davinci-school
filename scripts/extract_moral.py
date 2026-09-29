"""도덕과(도덕·윤리) 성취기준 추출. 도덕과 단독 별책(별책6)이 없어 학교급 총괄 별책(2·3·4)에서
도덕과 코드([4도]·[6도]·[9도]·[12현윤]·[12윤사]·[12인윤]·[12윤탐])만 뽑는다.

사용: PYTHONIOENCODING=utf-8 python scripts/extract_moral.py [--src <별책 PDF 폴더>] [--check]
  --check  파일을 쓰지 않고, 지금 data/standards/도덕.json 과 같은지만 본다(다르면 종료 코드 1).

문장은 지어내거나 고치지 않는다 — PDF 글자 층을 그대로 옮긴다(pymupdf).
- 성취기준 상자 안에서 코드로 시작하는 줄부터 다음 코드(또는 "다."로 끝나는 줄)까지가 한 문장이다.
- 줄이 바뀌는 자리: 앞줄 끝에 공백 글자가 있으면 띄어 쓰고, 없으면 낱말 중간에서 끊긴 것이라 붙인다
  (예: "자신의 일" + "상에서" → "자신의 일상에서"). 줄 안의 띄어쓰기는 그대로다.
- 가운뎃점(⋅)·마침표 유무도 인쇄된 그대로 둔다([6도03-03]은 별책2에 마침표가 없다).
- 영역(domain)은 "나. 성취기준" 아래 "(n) 영역명" 소제목, 고등학교 과목 이름은 과목 표제(큰 글씨)에서 읽는다.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf

DEFAULT_SRC = Path(r"C:\Users\beaut\OneDrive\바탕 화면\다빈치서논술참고자료\다빈치 서논술 자료")
OUT = Path(__file__).resolve().parents[1] / "data" / "standards" / "도덕.json"

BOOKS = [
    ("[별책2] 초등학교 교육과정.pdf", "초"),
    ("[별책3] 중학교 교육과정.pdf", "중"),
    ("[별책4] 고등학교 교육과정.pdf", "고"),
]
LABELS = ("도", "현윤", "윤사", "인윤", "윤탐")
CODE = re.compile(r"^\s*\[(\d{1,2})(%s)(\d{2})-(\d{2})\]" % "|".join(LABELS))
DOMAIN = re.compile(r"^\s*\((\d{1,2})\)\s*(.+?)\s*$")
GRADE_BAND = {"4": "3-4", "6": "5-6", "9": "1-3", "12": "2-3"}
# 고등학교 과목 이름(별책4 과목 표제에 인쇄된 그대로) — 코드 글자와 짝을 맞춰 확인만 한다.
COURSES = {"현윤": "현대사회와 윤리", "윤사": "윤리와 사상", "인윤": "인문학과 윤리", "윤탐": "윤리문제 탐구"}
MAX_LINES = 8


def page_lines(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            text = "".join(span["text"] for span in line["spans"])
            if text.strip():
                out.append((text, max(span["size"] for span in line["spans"])))
    return out


def join_lines(parts):
    text = ""
    for part in parts:
        if text and (text[-1].isspace() or part[:1].isspace()):
            text = text.rstrip() + " " + part.lstrip()
        else:
            text += part
    return re.sub(r"[ \t\u00a0]+", " ", text).strip()


def extract_book(path: Path, level: str):
    rows = []
    doc = pymupdf.open(path)
    domain = ""
    course = ""
    for pno, page in enumerate(doc, 1):
        lines = page_lines(page)
        i = 0
        while i < len(lines):
            text, size = lines[i]
            stripped = text.strip()
            if size > 18 and stripped in COURSES.values():
                course = stripped
                domain = ""
            m = DOMAIN.match(text)
            if m and size > 11:
                domain = m.group(2)
            c = CODE.match(text)
            if not c:
                i += 1
                continue
            code = "[%s%s%s-%s]" % c.groups()
            parts = [text[c.end():]]
            j = i + 1
            while not parts[-1].rstrip().endswith("다.") and j < len(lines) and len(parts) < MAX_LINES:
                nxt = lines[j][0]
                if CODE.match(nxt) or nxt.lstrip().startswith(("(", "Ÿ", "•")):
                    break
                parts.append(nxt)
                j += 1
            body = join_lines(parts)
            label = c.group(2)
            if label in COURSES and COURSES[label] != course:
                raise SystemExit(f"{code}: 과목 표제가 맞지 않음({course!r}) — {path.name} {pno}쪽")
            if not re.search(r"다\.?$", body):
                raise SystemExit(f"{code}: 문장 끝을 찾지 못함 — {path.name} {pno}쪽: {body!r}")
            rows.append({
                "level": level,
                "subject": "도덕",
                "grade_band": GRADE_BAND[c.group(1)],
                "domain": domain,
                "code": code,
                "text": body,
                "_page": pno,
                "_course": course if label in COURSES else "",
            })
            i = j
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(DEFAULT_SRC))
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--pages", action="store_true", help="코드별 별책 쪽 번호를 출력")
    args = ap.parse_args()

    rows = []
    for name, level in BOOKS:
        rows += extract_book(Path(args.src) / name, level)
    codes = [r["code"] for r in rows]
    if len(set(codes)) != len(codes):
        dup = sorted({c for c in codes if codes.count(c) > 1})
        raise SystemExit(f"코드가 겹침: {dup}")
    rows.sort(key=lambda r: (["초", "중", "고"].index(r["level"]), r["code"]))
    if args.pages:
        for r in rows:
            print(r["code"], r["_page"], r["_course"], r["domain"], sep="\t")
    clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
    payload = json.dumps(clean, ensure_ascii=False, indent=1)
    if args.check:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == payload
        print("same" if same else "DIFFERENT", len(clean))
        sys.exit(0 if same else 1)
    OUT.write_bytes(payload.encode("utf-8"))
    print(f"{OUT.name}: {len(clean)}")


if __name__ == "__main__":
    main()
