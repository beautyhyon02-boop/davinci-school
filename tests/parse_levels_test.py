import os
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from parse_levels import (  # noqa: E402
    CODE_FIXES,
    PDF_DIR,
    DocParser,
    Line,
    classify_kind,
    eq_span_text,
    extract_item_type,
    finalize_standard,
    find_codes,
    norm_code,
    norm_level_letter,
    split_std_text,
)

MATH_MID = os.path.join(PDF_DIR, "(중등)2022 개정 교육과정에 따른 성취수준(수학).pdf")


# ------------------------------------------------------------------ 코드 정규식
def test_code_regex_basic_and_whitespace():
    assert find_codes("[9수04-02] 자료를 줄기와") == ["[9수04-02]"]
    assert norm_code("[ 9수04 - 02 ] 문장") == "[9수04-02]"
    assert find_codes("[4국01-01]과 [4국01-01], [2바03-04]") == ["[4국01-01]", "[2바03-04]"]


def test_code_regex_parenthesized_social_labels():
    # 중학교 사회는 라벨 뒤에 (지리)/(일사)가 붙는다 — 이것을 놓쳐 사회 74개가 통째로 사라졌던 적이 있다
    assert find_codes("[9사(지리)01-01] 세계 여러") == ["[9사(지리)01-01]"]
    assert find_codes("[9사( 일사 )02-03]") == ["[9사(일사)02-03]"]


def test_code_regex_ignores_high_school_three_part_codes():
    # 고등 공통과목 3단 코드는 이 문서들의 대상이 아니다(잘못 잘라 먹지 않는지)
    assert find_codes("[10공국1-01-01]") == []


def test_code_fix_for_misprinted_korean_code():
    assert CODE_FIXES[("(중등)2022 개정 교육과정에 따른 성취수준(국어).pdf", "[6국05-07]")] == "[9국05-07]"


# ------------------------------------------------------------------ 텍스트 정리
def test_level_letter_fullwidth():
    assert norm_level_letter("Ｂ") == "B"
    assert norm_level_letter(" C ") == "C"


def test_split_std_text_inquiry_activities_and_notes():
    text, acts, notes = split_std_text(
        "확산 및 증발 현상을 관찰하여 추론할 수 있다. <탐구 활동> • 확산 현상 관찰하기 • 증발 관찰하기"
    )
    assert text == "확산 및 증발 현상을 관찰하여 추론할 수 있다."
    assert acts == ["확산 현상 관찰하기", "증발 관찰하기"]
    t2, _a, n2 = split_std_text("방안들을 제안한다. ※ 내용 체계표의 가치·태도 요소를 포함하여 성취수준 개발")
    assert t2 == "방안들을 제안한다."
    assert n2 == ["내용 체계표의 가치·태도 요소를 포함하여 성취수준 개발"]


def test_split_std_text_drops_footnote_marker():
    t, _a, _n = split_std_text("두 자리 수의 범위에서 덧셈과 뺄셈3)의 계산 원리를 이해하고")
    assert t == "두 자리 수의 범위에서 덧셈과 뺄셈의 계산 원리를 이해하고"


def test_hwp_equation_glyphs_and_superscript():
    # y=a(x-p) + 작은 글씨로 위에 붙은 2 → y=a(x-p)^2
    body = {"text": "", "size": 9.0, "bbox": (246, 502, 292, 512)}
    sup = {"text": "", "size": 6.1, "bbox": (292, 501, 295, 507)}
    assert eq_span_text(body, 9.0, 507) == "y=a(x-p)"
    assert eq_span_text(sup, 9.0, 507) == "^2"
    deg = {"text": "", "size": 9.0, "bbox": (0, 0, 10, 10)}
    assert eq_span_text(deg, 9.0, 5) == "30°"


def test_item_type_and_kind():
    ov = "학교급 중학교 과목 수학 평가 요소 함수 판단하기 문항 유형 지필평가(서·논술형) 배점 10점 정답 예시 답안 참고"
    assert extract_item_type(ov) == "지필평가(서·논술형)"
    assert classify_kind("지필평가(서·논술형)", "") == "논술형"
    assert classify_kind("서술형", "") == "서술형"
    assert classify_kind("선다형", "나. 수행평가 예시 평가 도구") == "기타"
    assert classify_kind("", "나. 수행평가 예시 평가 도구") == "수행"
    assert classify_kind("프로젝트법", "") == "수행"
    assert extract_item_type("평가 도구 유형 수행평가 (실험·실습) 배점 6점") == "수행평가 (실험·실습)"


# ------------------------------------------------------------------ 수준 나누기(합성 표)
def _synthetic_parser():
    p = DocParser("(중등)2022 개정 교육과정에 따른 성취수준(수학).pdf", open_pdf=False)
    p.mode = "std"
    p.domain = "수와 연산"
    return p


def test_level_splitting_with_merged_cells_synthetic():
    """좌표만으로 만든 표: A·B 병합 칸, C·D 병합 칸, E 단독.
    세로 괘선 179/206이 [성취기준 | 수준 | 진술] 열 경계, 가로 괘선이 칸 경계."""
    p = _synthetic_parser()
    lines = [
        Line(82, 352, 178, 362, 9, "[9수01-01] 소인수분해의"),
        Line(82, 363, 176, 373, 9, "뜻을 알고, 자연수를 소인수분해"),
        Line(82, 375, 122, 385, 9, "할 수 있다"),
        Line(189, 318, 195, 328, 9, "A"),
        Line(209, 329, 442, 338, 9, "소인수분해의 뜻을 설명하고, 자연수를 소인수분해 할 수 있다."),
        Line(189, 339, 195, 349, 9, "B"),
        Line(189, 359, 195, 369, 9, "C"),
        Line(209, 368, 462, 378, 9, "소인수분해의 뜻을 알고, 자연수를 소인수의 곱으로 표현할 수 있다."),
        Line(189, 378, 196, 388, 9, "D"),
        Line(190, 403, 195, 413, 9, "E"),
        Line(209, 397, 477, 407, 9, "소인수를 알고, 안내된 절차에 따라 자연수를 소인수의 곱으로 표현할 수"),
        Line(209, 409, 227, 419, 9, "있다."),
    ]
    hrules = [(178, 206, 333), (178, 477, 353), (178, 206, 374), (178, 477, 391), (79, 477, 313), (79, 477, 423)]
    vrules = [(179, 295, 519), (206, 313, 519)]
    p.parse_std_table(23, lines, hrules, vrules, 313, 423)
    rec = p.standards["[9수01-01]"]
    assert rec["text"] == "소인수분해의 뜻을 알고, 자연수를 소인수분해 할 수 있다"
    assert rec["levels"]["A"] == rec["levels"]["B"] == "소인수분해의 뜻을 설명하고, 자연수를 소인수분해 할 수 있다."
    assert rec["levels"]["C"] == rec["levels"]["D"]
    assert rec["levels"]["E"].endswith("곱으로 표현할 수 있다.")
    assert rec["merged_levels"] == [["A", "B"], ["C", "D"]]
    out = finalize_standard(rec, "A-E")
    assert out["complete"] and list(out["levels"]) == list("ABCDE")


def test_level_continuation_on_next_page_synthetic():
    """쪽이 바뀌며 성취기준 칸이 비어 있는(코드 없는) 표 조각은 앞 성취기준의 이어짐이다."""
    p = _synthetic_parser()
    page1 = [
        Line(82, 596, 176, 606, 9, "[9수01-03] 다양한 상황을"),
        Line(82, 608, 178, 617, 9, "이용하여 음수의 필요성을 인식한다."),
        Line(189, 596, 195, 606, 9, "A"),
        Line(208, 590, 476, 600, 9, "A 진술이다."),
        Line(189, 641, 195, 651, 9, "B"),
        Line(208, 635, 476, 645, 9, "B 진술이다."),
    ]
    p.parse_std_table(23, page1, [(79, 477, 579), (178, 477, 622), (79, 477, 669)], [(179, 561, 669), (206, 579, 669)], 579, 669)
    page2 = [
        Line(189, 150, 195, 160, 9, "C"),
        Line(208, 150, 476, 160, 9, "C 진술이다."),
        Line(189, 180, 195, 190, 9, "D"),
        Line(208, 180, 476, 190, 9, "D 진술이다."),
        Line(189, 210, 195, 220, 9, "E"),
        Line(208, 210, 476, 220, 9, "E 진술이다."),
    ]
    p.parse_std_table(24, page2, [(79, 477, 140), (178, 477, 170), (178, 477, 200), (79, 477, 230)],
                      [(179, 120, 230), (206, 140, 230)], 140, 230)
    rec = p.standards["[9수01-03]"]
    assert list(rec["levels"]) == list("ABCDE")
    assert rec["levels"]["E"] == "E 진술이다."
    assert rec["pages"] == [23, 24]
    assert rec["merged_levels"] == []


# ------------------------------------------------------------------ 실제 PDF 쪽(있을 때만)
@pytest.mark.skipif(not os.path.exists(MATH_MID), reason="원본 PDF 폴더가 없는 환경")
def test_fixture_pages_math_middle_23_24():
    p = DocParser(MATH_MID)
    p.mode = "std"
    for pno in (23, 24):
        p.parse_page(pno, p.doc[pno - 1])
    s = p.standards
    assert ["[9수01-01]", "[9수01-02]", "[9수01-03]", "[9수01-04]", "[9수01-05]", "[9수01-06]"] == list(s)[:6]
    assert s["[9수01-01]"]["merged_levels"] == [["A", "B"], ["C", "D"]]
    assert s["[9수01-01]"]["unit"] == "소인수분해"
    # 23쪽 A·B → 24쪽 C·D·E로 이어지는 성취기준
    r = s["[9수01-03]"]
    assert r["pages"] == [23, 24] and list(r["levels"]) == list("ABCDE")
    assert r["levels"]["E"] == "주어진 수에서 양수와 음수, 정수와 유리수를 구분할 수 있다."
    assert r["unit"] == "정수와 유리수"
    # 다음 표 머리 칸의 윗선을 이 표의 아랫선으로 오인해 소단원명이 성취기준 문장에 붙던 회귀
    assert s["[9수01-02]"]["text"] == "소인수분해를 이용하여 최대공약수와 최소공배수를 구할 수 있다."
