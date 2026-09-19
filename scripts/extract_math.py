"""수학과 성취기준 추출. 수학 별책(별책8)이 없어 학교급 총괄 별책(2·3·4)에서 수학 코드만 걸러낸다.
사용: python scripts/extract_math.py

별책2/3/4는 파일이 커서(별책4는 22MB) pdfplumber 파싱에 몇 분이 걸린다.
한 번 추출한 페이지 전체 텍스트는 .superpowers/raw/<파일명>.txt 에 캐시해
두고, 캐시가 있으면 재사용한다(정규식/휴리스틱만 고치며 반복 실행할 때
PDF를 다시 열지 않기 위함). .superpowers/는 git 추적 대상이 아니다.
"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_standards import parse_standards, _code_label

SRC = Path(r"C:\Users\beaut\OneDrive\바탕 화면\서논술형")
BOOKS = ["[별책2] 초등학교 교육과정.pdf", "[별책3] 중학교 교육과정.pdf", "[별책4] 고등학교 교육과정.pdf"]
MATH_LABELS = {"수", "공수", "대수", "미적", "확통", "기하", "경수", "인수", "직수", "수과탐", "실수", "미적Ⅰ", "미적Ⅱ", "미적I", "미적II"}
CACHE_DIR = Path(__file__).resolve().parents[1] / ".superpowers" / "raw"


def is_math(code: str) -> bool:
    label = _code_label(code)
    return label in MATH_LABELS or re.match(r"^(수|미적)", label) is not None


# [10공수2-03-04]/[10공수2-03-05]는 PDF에 유리함수/무리함수 공식이
# 분자-분수선-분모(또는 근호-근호선-피개수)가 위아래로 쌓인 도형으로
# 그려져 있는데, pdfplumber는 이런 2차원 배치를 하나의 읽기 순서로
# 펴내지 못한다. 실제로 분자("ax+b")가 코드 표시([10공수2-03-04])보다
# *앞선* 줄에 나타나, 파서 입장에서는 바로 앞 성취기준([10공수2-03-03],
# 이미 "~다."로 끝난 문장)의 꼬리로 잘못 붙는다(별도로 고쳐 잘라냄 —
# _fix_math_pua_glyphs의 _TRAILING_SYMBOL_JUNK 참고). 그 결과 원래
# 분자 위치의 정보가 [10공수2-03-04] 쪽에는 아예 없다. 정규식으로는
# 복원할 수 없는 손실이라, "[별책4] 고등학교 교육과정.pdf" 473쪽
# (pdfplumber 87쪽/487페이지)을 pdfplumber.to_image()로 직접 렌더링해
# 눈으로 대조 확인한 수식으로 그 부분만 명시적으로 보정한다(추측이
# 아니라 원문 이미지 대조 결과). "√" 뒤 비큘럼(가로줄, U+E06D)은 어느
# 한 글자로 옮기면 원문에 없는 표기를 지어내는 것이라 substitution
# 표에서 일부러 빼 두었으므로, 여기서 함께 정리한다.
FORMULA_FIXUPS = {
    "[10공수2-03-04]": (
        re.compile(r"유리함수 y=  cx\+d "),
        "유리함수 y=(ax+b)/(cx+d) ",
    ),
    "[10공수2-03-05]": (
        re.compile(r"무리함수 y=√ ax\+b\+c"),
        "무리함수 y=√(ax+b)+c",
    ),
}


def apply_formula_fixups(rows: list[dict]) -> None:
    for r in rows:
        fixup = FORMULA_FIXUPS.get(r["code"])
        if fixup:
            pattern, replacement = fixup
            r["text"] = pattern.sub(replacement, r["text"])


def get_full_text(book: str) -> str:
    cache_path = CACHE_DIR / book.replace(".pdf", ".txt")
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    import pdfplumber

    with pdfplumber.open(str(SRC / book)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(full_text, encoding="utf-8")
    return full_text


def main():
    rows, seen = [], set()
    for b in BOOKS:
        full_text = get_full_text(b)
        for r in parse_standards(full_text, "수학"):
            if r["code"] in seen or not is_math(r["code"]):
                continue
            seen.add(r["code"])
            r["subject"] = "수학"
            rows.append(r)
        print(f"{b}: 누적 {len(rows)}개")
    apply_formula_fixups(rows)
    out = Path("data/standards/수학.json")
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    by = {}
    for r in rows:
        by[r["level"]] = by.get(r["level"], 0) + 1
    print("수학 총", len(rows), "개", by)


if __name__ == "__main__":
    main()
