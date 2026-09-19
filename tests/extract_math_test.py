import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from extract_math import apply_formula_fixups


def test_rational_and_irrational_function_formulas_are_corrected():
    # [10공수2-03-04]/[10공수2-03-05]는 PDF의 분수식·근호식이 2차원으로
    # 쌓여 있어 pdfplumber의 읽기 순서가 뒤엉키고, 분자 부분이 통째로
    # 앞 성취기준 쪽으로 유실된다. "[별책4] 고등학교 교육과정.pdf" 473쪽을
    # pdfplumber로 직접 렌더링해 눈으로 대조 확인한 수식으로 보정한다.
    rows = [
        {
            "code": "[10공수2-03-04]",
            "text": "유리함수 y=  cx+d 의 그래프를 그릴 수 있고, 그 그래프의 성질을 탐구 할 수 있다.",
        },
        {
            "code": "[10공수2-03-05]",
            "text": "무리함수 y=√ ax+b+c의 그래프를 그릴 수 있고, 그 그래프의 성질을 탐구할 수 있다.",
        },
        {"code": "[12대수03-02]", "text": "등차수열의 뜻을 알고, 일반항, 첫째항부터 제n항까지의 합을 구할 수 있다."},
    ]
    apply_formula_fixups(rows)
    by_code = {r["code"]: r["text"] for r in rows}
    assert by_code["[10공수2-03-04]"] == (
        "유리함수 y=(ax+b)/(cx+d) 의 그래프를 그릴 수 있고, 그 그래프의 성질을 탐구 할 수 있다."
    )
    assert by_code["[10공수2-03-05]"] == (
        "무리함수 y=√(ax+b)+c의 그래프를 그릴 수 있고, 그 그래프의 성질을 탐구할 수 있다."
    )
    # 관련 없는 행은 그대로 유지된다.
    assert by_code["[12대수03-02]"] == "등차수열의 뜻을 알고, 일반항, 첫째항부터 제n항까지의 합을 구할 수 있다."
    for text in by_code.values():
        assert "" not in text
