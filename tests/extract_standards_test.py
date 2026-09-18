import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from extract_standards import (
    parse_standards,
    level_from_code,
    grade_band_from_code,
    subject_for_code,
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
