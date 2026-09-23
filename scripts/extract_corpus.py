"""참고 자료 PDF 전체를 텍스트로 추출해 reference-corpus/ 에 저장하고 색인을 만든다.
- 파일마다 <slug>.txt (쪽 경계 '=== page N ===')
- reference-corpus/index.json: 출처 폴더, 파일명, 쪽수, 글자 추출 가능 여부, 앞 6쪽(목차) 요약, 해시
실행: PYTHONIOENCODING=utf-8 python scripts/extract_corpus.py
"""
import os, re, json, hashlib, sys
import pymupdf

BASE = r"C:\Users\beaut\OneDrive\바탕 화면"
ROOTS = {
    "참고/교육과정성취수준": BASE + r"\다빈치서논술참고자료\교육과정성취수준",
    "참고/서논술형평가,수행평가": BASE + r"\다빈치서논술참고자료\서논술형평가,수행평가",
    "참고/수업설계": BASE + r"\다빈치서논술참고자료\수업설계",
    "참고/학생부세특": BASE + r"\다빈치서논술참고자료\학생부세특",
    "자료/서울교육청등": BASE + r"\다빈치서논술참고자료\다빈치 서논술 자료",
    "자료/개념완성_수학중1-1": BASE + r"\다빈치서논술참고자료\다빈치 서논술 자료\수학 중1-1학기",
    "자료/서논술형(기존)": BASE + r"\서논술형",
    "자료/대구중2과학": BASE + r"\대구 중2 과학 서논술문항",
}
OUT = os.path.join(os.path.dirname(__file__), "..", "reference-corpus")

def slug(s):
    s = re.sub(r"[\/:*?\"<>|]+", "_", s)
    return re.sub(r"\s+", " ", s).strip()[:120]

def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    for label, d in ROOTS.items():
        if not os.path.isdir(d):
            print("missing", d); continue
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f)
            if not os.path.isfile(p) or not f.lower().endswith(".pdf"):
                continue
            h = hashlib.md5(open(p, "rb").read(1 << 20)).hexdigest()[:8]
            out_name = f"{label.replace('/', '__')}__{slug(f[:-4])}__{h}.txt"
            out_path = os.path.join(OUT, out_name)
            try:
                doc = pymupdf.open(p)
            except Exception as e:
                index.append({"group": label, "file": f, "error": str(e)}); continue
            n = doc.page_count
            text_pages = 0
            with open(out_path, "w", encoding="utf-8") as w:
                for i in range(n):
                    t = doc[i].get_text()
                    if len(t.strip()) > 80: text_pages += 1
                    w.write(f"\n=== page {i+1} ===\n{t}")
            head = ""
            for i in range(min(8, n)):
                head += doc[i].get_text()
            doc.close()
            index.append({"group": label, "file": f, "txt": out_name, "pages": n, "text_pages": text_pages,
                          "kind": "text" if text_pages >= n * 0.6 else ("mixed" if text_pages else "image"),
                          "mb": os.path.getsize(p) // (1 << 20), "head": re.sub(r"\s+", " ", head)[:1500]})
            print(f"{n:5d}p {label} / {f}", file=sys.stderr)
    json.dump(index, open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    tot = sum(x.get("pages", 0) for x in index); tp = sum(x.get("text_pages", 0) for x in index)
    print(f"files={len(index)} pages={tot} text_pages={tp}")

if __name__ == "__main__":
    main()
