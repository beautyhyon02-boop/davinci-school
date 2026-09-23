#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA checker for data/reference/exemplars/*.json (curated 서·논술형 exemplar bank).

Checks:
  1. Required-field validation (every record has the schema's non-empty fields).
  2. Global id uniqueness across all bank files.
  3. Points vs. rubric-sum audit: for every record with a numeric top-level
     `points`, compute two interpretations of the rubric's maximum score and
     flag the record only if NEITHER matches:
       - sum_interpretation: sum of each criterion's highest-level points
         (criteria scored independently and added together — the common case).
       - max_tier_interpretation: the single highest level-point value that
         appears in any criterion (criteria describe the same ordinal tier
         picked once, not summed — used for holistic/총체적 multi-trait
         rubrics scored as one band).
     A record whose rubric carries a `type_note` explaining a non-standard
     scoring scheme is treated as a documented, resolved exception and is not
     flagged even if neither interpretation matches numerically.
     Records with `has_rubric: false` (no rubric in the source) are skipped.

Usage:
    python scripts/check_exemplars.py            # human-readable report
    python scripts/check_exemplars.py --json      # machine-readable report
Exit code is 0 iff there are zero unresolved flags/errors.
"""
import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXROOT = os.path.join(ROOT, "data", "reference", "exemplars")

REQUIRED_NONEMPTY_STR = ["id", "subject", "school_level", "kind"]


def all_bank_files():
    return sorted(glob.glob(os.path.join(EXROOT, "**", "*.json"), recursive=True))


def iter_records():
    """Yield (filepath, record) for every exemplar record in every bank file.
    Skips housekeeping files whose name starts with '_' (e.g. _pagemap.md's
    json sibling, _pagemap-2025.json) since those are not record containers."""
    for fp in all_bank_files():
        base = os.path.basename(fp)
        if base.startswith("_"):
            continue
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            for rec in data:
                if isinstance(rec, dict) and "id" in rec:
                    yield fp, rec
        elif isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    for rec in v:
                        if isinstance(rec, dict) and "id" in rec:
                            yield fp, rec


def criterion_max(levels):
    pts = [lv.get("points") for lv in levels if isinstance(lv.get("points"), (int, float))]
    return max(pts) if pts else None


def rubric_interpretations(rubric):
    """Return (sum_interpretation, max_tier_interpretation) for a rubric dict,
    or (None, None) if there is no usable criteria list."""
    criteria = rubric.get("criteria") if rubric else None
    if not criteria:
        return None, None
    maxes = []
    for c in criteria:
        levels = c.get("levels") or []
        m = criterion_max(levels)
        if m is None:
            return None, None
        maxes.append(m)
    return sum(maxes), max(maxes)


def validate_record(fp, rec, seen_ids, errors):
    rid = rec.get("id")
    if not rid:
        errors.append((fp, "<no id>", "missing id"))
        return
    if rid in seen_ids:
        errors.append((fp, rid, f"duplicate id (also in {seen_ids[rid]})"))
    else:
        seen_ids[rid] = fp

    for field in REQUIRED_NONEMPTY_STR:
        val = rec.get(field)
        if not isinstance(val, str) or not val.strip():
            errors.append((fp, rid, f"missing/empty required field '{field}'"))

    stem = rec.get("stem")
    if not isinstance(stem, str) or not stem.strip():
        errors.append((fp, rid, "missing/empty 'stem'"))

    rubric = rec.get("rubric")
    if not isinstance(rubric, dict):
        errors.append((fp, rid, "missing/invalid 'rubric' object"))
    else:
        has_rubric = rec.get("has_rubric", True)
        if has_rubric and not rubric.get("criteria"):
            errors.append((fp, rid, "rubric.criteria is empty but has_rubric is not false"))

    source = rec.get("source")
    if not isinstance(source, dict):
        errors.append((fp, rid, "missing/invalid 'source' object"))
    else:
        if not isinstance(source.get("file"), str) or not source["file"].strip():
            errors.append((fp, rid, "missing/empty 'source.file'"))
        pages = source.get("pages")
        if not isinstance(pages, list) or not pages:
            errors.append((fp, rid, "missing/empty 'source.pages'"))


def audit_points(fp, rec, flags):
    rid = rec["id"]
    points = rec.get("points")
    if not isinstance(points, (int, float)):
        return  # nothing to audit (e.g. 수행 tasks scored without a numeric total)
    if rec.get("has_rubric") is False:
        return  # documented absence of rubric — nothing to compare against

    rubric = rec.get("rubric") or {}
    sum_i, max_i = rubric_interpretations(rubric)
    if sum_i is None:
        flags.append((fp, rid, points, None, None, "rubric has no usable criteria/levels"))
        return

    if points == sum_i or points == max_i:
        return

    if rubric.get("type_note"):
        return  # documented, resolved exception

    flags.append((fp, rid, points, sum_i, max_i, None))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON report")
    args = ap.parse_args()

    seen_ids = {}
    errors = []
    flags = []
    total = 0

    for fp, rec in iter_records():
        total += 1
        validate_record(fp, rec, seen_ids, errors)
        audit_points(fp, rec, flags)

    report = {
        "total_records": total,
        "schema_errors": [
            {"file": fp, "id": rid, "problem": msg} for fp, rid, msg in errors
        ],
        "points_flags": [
            {
                "file": fp,
                "id": rid,
                "points": points,
                "sum_interpretation": sum_i,
                "max_tier_interpretation": max_i,
                "note": note,
            }
            for fp, rid, points, sum_i, max_i, note in flags
        ],
    }

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Total records scanned: {total}")
        print(f"Schema errors: {len(errors)}")
        for fp, rid, msg in errors:
            print(f"  [SCHEMA] {rid} ({os.path.relpath(fp, ROOT)}): {msg}")
        print(f"Points-vs-rubric flags: {len(flags)}")
        for fp, rid, points, sum_i, max_i, note in flags:
            rel = os.path.relpath(fp, ROOT)
            if note:
                print(f"  [POINTS] {rid} ({rel}): points={points} — {note}")
            else:
                print(
                    f"  [POINTS] {rid} ({rel}): points={points} "
                    f"sum_interpretation={sum_i} max_tier_interpretation={max_i}"
                )

    unresolved = len(errors) + len(flags)
    print(f"\n{'OK' if unresolved == 0 else 'FAIL'}: {unresolved} unresolved issue(s).")
    return 0 if unresolved == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
