import re
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from extract_standards import (
    parse_standards,
    level_from_code,
    grade_band_from_code,
    subject_for_code,
    _code_label,
)

SAMPLE = """
(2) 내용 요소
[9국03-01] 다양한 주제에 대해 자신의 생각을 논리적으로 표현하는 글을 쓴다.
[9국03-02] 대상의 특성에 맞게 설명하는 방법을
활용하여 글을 쓴다.
(나) 성취기준 해설
"""


def test_parses_codes_and_joins_wrapped_lines():
    rows = parse_standards(SAMPLE, subject="국어", domain="쓰기")
    assert [r["code"] for r in rows] == ["[9국03-01]", "[9국03-02]"]
    assert rows[1]["text"] == "대상의 특성에 맞게 설명하는 방법을 활용하여 글을 쓴다."


def test_level_from_code():
    assert level_from_code("[9국03-01]") == "중"
    assert level_from_code("[6과01-02]") == "초"
    assert level_from_code("[10공국1-01-01]") == "고"
    assert level_from_code("[4국01-01]") == "초"


def test_level_from_code_high_school_elective():
    # 선택과목(문학 등)은 12로 시작해도 고등학교
    assert level_from_code("[12문학01-01]") == "고"


def test_grade_band_high_school_sensible():
    assert grade_band_from_code("[10공국1-01-01]") == "1"
    assert grade_band_from_code("[12문학01-01]") == "2-3"


def test_code_with_parentheses_is_captured():
    # 일반선택 사회 과목은 코드 안에 괄호가 들어간다: [9사(일사)01-01]
    rows = parse_standards(
        "[9사(일사)01-01] 사례를 통해 인권 문제를 분석한다.", subject="사회", domain=""
    )
    assert rows[0]["code"] == "[9사(일사)01-01]"


def test_subject_for_code_defaults_to_given_subject():
    assert subject_for_code("[9사01-01]", "사회") == "사회"
    assert subject_for_code("[9사(일사)01-01]", "사회") == "사회"


def test_subject_for_code_detects_history_and_korean_history():
    assert subject_for_code("[9역01-01]", "사회") == "한국사"
    assert subject_for_code("[10한사1-01-01]", "사회") == "한국사"


def test_page_break_does_not_corrupt_wrapped_text():
    # 실제 PDF에서는 표준 텍스트가 줄바꿈 되는 도중에 쪽 번호나
    # 반복되는 머리말(예: "공통 교육과정", "42")이 끼어들 수 있다.
    text = """
(3) 쓰기
[9국03-04] 의견 차이가 있는 사안에 대해 자료를 수집하고 사회⋅문화적 맥락을 고려하며 주장하는
공통 교육과정
42
글을 쓴다.
(가) 성취기준 해설
"""
    rows = parse_standards(text, subject="국어", domain="쓰기")
    assert len(rows) == 1
    assert rows[0]["text"] == (
        "의견 차이가 있는 사안에 대해 자료를 수집하고 사회⋅문화적 맥락을 고려하며 주장하는 글을 쓴다."
    )


def test_long_parenthesized_goal_sentence_is_not_treated_as_domain():
    # 고등학교 선택과목의 "목표" 절은 "(1) ...(2) ...(3) ..." 처럼 긴 문장을
    # 나열하는데, 형식이 영역 소제목("(1) 듣기⋅말하기")과 같아 보이지만
    # 실제 영역명이 아니므로 domain으로 채택하면 안 된다.
    text = """
(1) 언어의 힘과 가치를 이해하고 바람직한 언어문화 실천에 능동적으로 참여한다.
(2) 화법의 원리를 바탕으로 다양한 담화를 수행한다.
[12화언01-01] 언어를 인간의 삶과 관련지어 이해하고 국어와 국어생활이 시간의 흐름에 따라 변화하는 양상을 분석한다.
"""
    rows = parse_standards(text, subject="국어", domain="")
    assert rows[0]["domain"] == ""


def test_admin_section_heading_is_not_treated_as_domain():
    # "교수·학습 및 평가" 절의 "(1) 교수·학습 방향", "(3) 평가 방법" 같은
    # 짧은 행정 소제목은 실제 내용 영역이 아니므로 domain에 채택되면 안 된다.
    text = """
(1) 교수·학습 방향
교사는 학습자의 수준을 고려하여 지도한다.
(3) 평가 방법
평가 계획을 세울 때는 다양한 방법을 활용한다.
[12화언01-01] 언어를 인간의 삶과 관련지어 이해하고 국어와 국어생활이 시간의 흐름에 따라 변화하는 양상을 분석한다.
"""
    rows = parse_standards(text, subject="국어", domain="")
    assert rows[0]["domain"] == ""


def test_domain_does_not_leak_across_course_when_no_new_heading():
    # 선택과목처럼 (n) 영역 소제목이 없는 새 과정으로 넘어갈 때, 직전
    # 과정("매의")의 domain을 새 과정("화언")에 그대로 이어붙이면 안 된다.
    text = """
(1) 매체
[12매의01-01] 매체 자료의 특성을 이해하고 이를 비판적으로 수용한다.
[12화언01-01] 언어를 인간의 삶과 관련지어 이해하고 국어와 국어생활이 시간의 흐름에 따라 변화하는 양상을 분석한다.
"""
    rows = parse_standards(text, subject="국어", domain="")
    assert rows[0]["domain"] == "매체"
    assert rows[1]["domain"] == ""


def test_bracket_heading_stops_accumulation():
    # 과학과 교육과정은 성취기준 뒤에 "<탐구 활동>" 같은 꺾쇠 소제목과
    # 예시 활동(글머리 기호)을 바로 붙여둔다. 이는 성취기준 문장이
    # 아니므로 누적되면 안 된다.
    text = """
[4과01-04] 지레, 빗면과 같은 도구를 이용하면 물체를 들어 올릴 때 드는 힘의 크기가 달라짐을 알고,
도구가 일상생활에서 어떻게 쓰이는지 조사하여 공유할 수 있다.
<탐구 활동>
• 무거운 물체를 밀 때와 가벼운 물체를 밀 때의 특징 탐구하기
(가) 성취기준 해설
"""
    rows = parse_standards(text, subject="과학", domain="")
    assert len(rows) == 1
    assert rows[0]["text"] == (
        "지레, 빗면과 같은 도구를 이용하면 물체를 들어 올릴 때 드는 힘의 크기가 달라짐을 알고, "
        "도구가 일상생활에서 어떻게 쓰이는지 조사하여 공유할 수 있다."
    )


def test_running_head_with_extra_dash_text_is_noise():
    # 사회과 교육과정 PDF는 "선택 중심 교육과정 – 일반 선택 과목 -" 처럼
    # 단순 "OOO 교육과정" 형태를 벗어난 러닝헤드도 사용한다.
    text = """
[12세사04-03] 현대 세계의 과제를 해결하기 위해 인류가 기울여온 노력을
탐구한다.
선택 중심 교육과정 – 일반 선택 과목 -
(가) 성취기준 해설
"""
    rows = parse_standards(text, subject="사회", domain="")
    assert len(rows) == 1
    assert rows[0]["text"] == "현대 세계의 과제를 해결하기 위해 인류가 기울여온 노력을 탐구한다."


def test_stray_dash_line_from_running_head_wrap_is_noise():
    # 러닝헤드가 줄바꿈되면서 대시(-) 기호만 다음 줄에 홀로 남는 경우가
    # 있다. 이 낱개 기호가 성취기준 문장 끝에 붙으면 안 된다.
    text = """
[12세사04-03] 현대 세계의 과제를 해결하기 위해 인류가 기울여온 노력을
탐구한다.
선택 중심 교육과정 – 일반 선택 과목
-
(가) 성취기준 해설
"""
    rows = parse_standards(text, subject="사회", domain="")
    assert rows[0]["text"] == "현대 세계의 과제를 해결하기 위해 인류가 기울여온 노력을 탐구한다."


def test_heading_line_stops_accumulation():
    # 영역 소제목 "(1) 듣기·말하기" 등도 성취기준 텍스트 누적을 멈춰야 한다.
    text = """
[9국01-11] 듣기⋅말하기 과정을 점검하고 듣기⋅말하기의 어려움을 효과적으로 조정한다.
(가) 성취기준 해설
• [9국01-01] 이 성취기준은 담화의 맥락을 고려하여 담화에서 표면적으로 드러나지 않는
숨겨진 요소를 추론하며 들음으로써 담화의 내용을 깊이 이해하는 능력을 기르기 위해 설
정하였다.
(2) 읽기
[9국02-01] 읽기는 사회⋅문화적 맥락에서 의미를 구성하는 과정임을 이해하며 사회적 독서에 참여
하고 사회적 독서 문화 형성에 기여한다.
"""
    rows = parse_standards(text, subject="국어", domain="")
    assert [r["code"] for r in rows] == ["[9국01-11]", "[9국02-01]"]
    assert "이 성취기준은" not in rows[0]["text"]


def test_pua_bullet_subunit_heading_stops_accumulation():
    # 총론 별책(초·중·고 교육과정, 별책2/3/4)에서는 성취기준 뒤에 다음
    # 소단원명이 "<PUA 글머리 기호> 소단원명" 형태로 바로 붙어 나온다
    # (예: "[별책2] 초등학교 교육과정.pdf" 실제 텍스트). 이는 성취기준
    # 본문이 아니므로 누적을 멈추고 버려야 한다.
    text = (
        "[2수01-04] 하나의 수를 두 수로 분해하고 두 수를 하나의 수로 합성하는 활동을 통하여 수 감각을\n"
        "기른다.\n"
        " 두 자리 수 범위의 덧셈과 뺄셈\n"
        "[2수01-05] 덧셈과 뺄셈이 이루어지는 실생활 상황과 연결하여 덧셈과 뺄셈의 의미를 이해한다.\n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    assert [r["code"] for r in rows] == ["[2수01-04]", "[2수01-05]"]
    assert rows[0]["text"] == (
        "하나의 수를 두 수로 분해하고 두 수를 하나의 수로 합성하는 활동을 통하여 수 감각을 기른다."
    )
    assert "" not in rows[0]["text"]


def test_doubled_pua_bullet_subunit_heading_stops_accumulation():
    # 소제목 앞에 PUA 글머리 기호가 두 개 붙어 나오는 경우도 있다
    # (예: "[별책2] 초등학교 교육과정.pdf" "[4수03-19]" 뒤).
    text = (
        "[4수03-19] 실생활 문제 상황과 연결하여 들이의 덧셈과 뺄셈을 할 수 있다.\n"
        " 무게\n"
        "[4수03-20] 실생활에서 무게를 나타낼 때 사용하는 단위 1g과 1kg을 알고, 이를 이용하여 무게를\n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    assert rows[0]["code"] == "[4수03-19]"
    assert rows[0]["text"] == "실생활 문제 상황과 연결하여 들이의 덧셈과 뺄셈을 할 수 있다."
    assert "" not in rows[0]["text"]


def test_bare_subject_running_head_after_page_number_is_noise():
    # 총론 별책은 페이지가 바뀌는 자리에 쪽 번호 다음 줄에 과목명만 있는
    # 러닝헤드가 나온다(예: "[별책2] 초등학교 교육과정.pdf"의
    # "234" / "수학"). 과목명 한 줄짜리는 성취기준 본문에 붙으면 안 된다.
    text = (
        "[6수03-09] 쌓기나무로 만든 입체도형을 보고 사용된 쌓기나무의 개수를 구할 수 있다.\n"
        "234\n"
        "수학\n"
        "[6수03-10] 쌓기나무로 만든 입체도형의 위, 앞, 옆에서 본 모양을 표현할 수 있고, 이러한 표현을\n"
        "보고 입체도형의 모양을 추측할 수 있다.\n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    assert rows[0]["code"] == "[6수03-09]"
    assert rows[0]["text"] == "쌓기나무로 만든 입체도형을 보고 사용된 쌓기나무의 개수를 구할 수 있다."
    assert "수학" not in rows[0]["text"]


def test_math_formula_pua_glyph_is_not_treated_as_subunit_heading():
    # 고등학교 수학 성취기준은 폰트 문제로 수식의 변수(x, y, n 등)가
    # U+E0xx 대 사용자 영역 문자로 추출되며, 그 문자가 줄바꿈 지점에서
    # 줄의 맨 앞에 오기도 한다(실제 사례: "[별책4] 고등학교 교육과정.pdf"
    # [10공수2-03-04]). 이는 소단원 글머리 기호(U+F000)가 아니라 성취기준
    # 문장 자체의 일부이므로, 다음 코드가 나오기 전까지 계속 누적되어야
    # 한다(글머리 기호로 오인해 잘라내면 안 됨).
    text = (
        "[10공수2-03-03] 역함수의 개념을 설명하고, 역함수를 구할 수 있다.\n"
        "\n"
        "[10공수2-03-04] 유리함수 \n"
        " \n"
        "의 그래프를 그릴 수 있고, 그 그래프의 성질을 탐구\n"
        "할 수 있다.\n"
        "[10공수2-03-05] 무리함수  의 그래프를 그릴 수 있고, 그 그래프의 성질을\n"
        "탐구할 수 있다.\n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    row = next(r for r in rows if r["code"] == "[10공수2-03-04]")
    assert row["text"].startswith("유리함수 ")
    assert row["text"].endswith("그 그래프의 성질을 탐구 할 수 있다.")


def test_code_label_accepts_roman_numeral_for_calculus_subjects():
    # 고등학교 수학 "미적분Ⅰ/Ⅱ"는 코드 라벨에 로마 숫자(Ⅰ=U+2160,
    # Ⅱ=U+2161)를 쓴다(실제 사례: "[별책4] 고등학교 교육과정.pdf"
    # "[12미적Ⅰ-01-01]"). 라벨 문자 클래스가 가-힣만 허용하면 코드
    # 자체를 인식하지 못해 43개 성취기준이 통째로 사라지는 문제가 있었다.
    assert _code_label("[12미적Ⅰ-01-01]") == "미적Ⅰ"
    assert _code_label("[12미적Ⅱ-03-07]") == "미적Ⅱ"


def test_calculus_roman_numeral_codes_are_parsed_as_standards():
    text = (
        "(1) 함수의 극한과 연속\n"
        "[12미적Ⅰ-01-01] 함수의 극한의 뜻을 알고, 이를 설명할 수 있다.\n"
        "[12미적Ⅰ-01-02] 함수의 극한에 대한 성질을 이해하고, 함수의 극한값을 구할 수 있다.\n"
        "[12미적Ⅱ-01-01] 수열의 극한의 뜻을 알고, 이를 설명할 수 있다.\n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    assert [r["code"] for r in rows] == ["[12미적Ⅰ-01-01]", "[12미적Ⅰ-01-02]", "[12미적Ⅱ-01-01]"]
    assert rows[0]["text"] == "함수의 극한의 뜻을 알고, 이를 설명할 수 있다."


def test_math_pua_glyphs_are_substituted_with_visually_confirmed_characters():
    # 고등학교 수학 성취기준의 수식 변수·기호가 폰트 문제로 PUA 문자로
    # 추출되는데, "[별책4] 고등학교 교육과정.pdf" 471쪽(10공수2-01-07),
    # 506쪽(12대수03-02), 576쪽(12경수03-02)을 실제로 렌더링해 눈으로
    # 대조 확인한 값으로 치환해야 한다(추측이 아님).
    text = (
        "[10공수2-01-07] 원점, 축, 축, 직선 에 대한 대칭이동을 탐구하고, 실생활과 연결\n"
        "하여 문제를 해결할 수 있다.\n"
        "[12대수03-02] 등차수열의 뜻을 알고, 일반항, 첫째항부터 제항까지의 합을 구할 수 있다.\n"
        "[12경수03-02] 역행렬의 뜻을 알고, × 행렬의 역행렬을 구할 수 있다.\n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    by_code = {r["code"]: r["text"] for r in rows}
    assert by_code["[10공수2-01-07]"] == (
        "원점, x축, y축, 직선 y=x에 대한 대칭이동을 탐구하고, 실생활과 연결 하여 문제를 해결할 수 있다."
    )
    assert by_code["[12대수03-02]"] == "등차수열의 뜻을 알고, 일반항, 첫째항부터 제n항까지의 합을 구할 수 있다."
    assert by_code["[12경수03-02]"] == "역행렬의 뜻을 알고, 2×2 행렬의 역행렬을 구할 수 있다."
    for text_value in by_code.values():
        assert not re.search(r"[-]", text_value)


def test_orphaned_formula_fragment_after_complete_sentence_is_dropped():
    # 실제 PDF에서 분수식의 분자("ax+b")가 읽기 순서가 뒤엉켜 다음
    # 성취기준([10공수2-03-04])이 아니라 그 앞의, 이미 "~다."로 완결된
    # 성취기준([10공수2-03-03]) 뒤에 통째로 잘못 붙는다(실제 사례:
    # "[별책4] 고등학교 교육과정.pdf" 473쪽). 이미 끝난 문장 뒤에 한글
    # 없이 기호만 남은 꼬리는 버려야 한다.
    text = (
        "[10공수2-03-03] 역함수의 개념을 설명하고, 역함수를 구할 수 있다.\n"
        "\n"
        "[10공수2-03-04] 유리함수 \n"
    )
    rows = parse_standards(text, subject="수학", domain="")
    row = next(r for r in rows if r["code"] == "[10공수2-03-03]")
    assert row["text"] == "역함수의 개념을 설명하고, 역함수를 구할 수 있다."
    assert not re.search(r"[-]", row["text"])
