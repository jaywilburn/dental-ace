#!/usr/bin/env python3
"""
One-time derivation of the new-companies import artifacts (July 2026 batch:
Emme Sanders RDH, SKF Practice Solutions, Chairside Collaborative + two new
People + Practice LLC courses) from the client's handoff files:

  ~/Downloads/Migration Plan/Migration report.xlsx        (per-course attendee sheets)
  ~/Downloads/Migration Plan/DentalACE_NewCompanies_Import_Overview.csv
  ~/Downloads/Migration Plan/DentalACE_NewCompanies_Quiz_Data.csv

Outputs (scripts/data/legacy/new-companies/):
  companies.json       3 NEW companies with assigned legacyIds (committed)
  courses.json         6 courses with assigned legacyIds + approvedAt (committed)
  attendees-DA252.csv  normalized attendee rows            (gitignored: PII)
  attendees-DA256.csv
  attendees-DA258.csv
  quiz-data.csv        verbatim copy of the client quiz CSV (committed)
  extraction-report.txt

Stdlib only (the client xlsx is parsed by hand: shared strings + cell refs, so
empty cells can never shift columns). The loader is scripts/import-new-companies.ts.

Usage: python3 scripts/legacy/extract-new-companies.py
"""
import csv
import json
import re
import shutil
import sys
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

SOURCE_DIR = Path.home() / "Downloads" / "Migration Plan"
XLSX = SOURCE_DIR / "Migration report.xlsx"
QUIZ_CSV = SOURCE_DIR / "DentalACE_NewCompanies_Quiz_Data.csv"
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "legacy" / "new-companies"

# Excel serial epoch (Windows 1900 system, includes the fictional 1900-02-29 offset)
EXCEL_EPOCH = date(1899, 12, 30)

# ---------------------------------------------------------------------------
# Batch identity. legacyIds continue the existing sequences (companies 1-39,
# courses 1-106 from the v3 migration); the TS importer verifies at runtime
# that these ids are either absent or already ours before writing.
# ---------------------------------------------------------------------------

COMPANIES = [
    {"legacyId": 40, "name": "Emme Sanders RDH"},
    {"legacyId": 41, "name": "SKF Practice Solutions"},
    {"legacyId": 42, "name": "Chairside Collaborative"},
]

# da -> (courseLegacyId, companyLegacyId, source org string in the xlsx sheet)
# People + Practice LLC is companyLegacyId 7 (exists in the DB from the v3 load).
# The DA256 sheet's org column says "COLLABricon"; John confirmed the company is
# "Emme Sanders RDH" (client plan doc, open item 2.1 resolution).
COURSES = {
    "DA252": {"legacyId": 107, "companyLegacyId": 7, "sheetOrg": "People + Practice LLC"},
    "DA254": {"legacyId": 108, "companyLegacyId": 41, "sheetOrg": None},
    "DA256": {"legacyId": 109, "companyLegacyId": 40, "sheetOrg": "COLLABricon"},
    "DA257": {"legacyId": 110, "companyLegacyId": 42, "sheetOrg": None},
    "DA258": {"legacyId": 111, "companyLegacyId": 41, "sheetOrg": "SKF Practice Solutions"},
    "DA260": {"legacyId": 112, "companyLegacyId": 7, "sheetOrg": None},
}

# approvedAt for courses with no cert history (client supplied no approval dates;
# decision 2026-07-21: earliest cert date where history exists, else today).
ZERO_CERT_APPROVED_AT = "2026-07-21"

MIN_COURSE_YEAR = 2020  # same guard as the Pearl importer

# ---------------------------------------------------------------------------
# Minimal xlsx reader: shared strings + cell-reference-addressed values.
# ---------------------------------------------------------------------------


def strip_tags(x: str) -> str:
    return re.sub(r"<[^>]+>", "", x)


def unescape(x: str) -> str:
    return (
        x.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")
    )


def shared_strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    xml = z.read("xl/sharedStrings.xml").decode("utf-8")
    out = []
    for si in re.findall(r"<si>(.*?)</si>", xml, re.S):
        texts = re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)
        out.append(unescape("".join(texts)))
    return out


def col_to_index(ref: str) -> int:
    """'A' -> 0, 'AB' -> 27."""
    n = 0
    for ch in ref:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1


def sheet_rows(z: zipfile.ZipFile, sheet_path: str, shared: list[str]) -> list[dict[int, str]]:
    xml = z.read(sheet_path).decode("utf-8")
    rows: list[dict[int, str]] = []
    for row_xml in re.findall(r"<row [^>]*>(.*?)</row>", xml, re.S):
        cells: dict[int, str] = {}
        for m in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', row_xml, re.S):
            col, _, attrs, inner = m.group(1), m.group(2), m.group(3), m.group(4) or ""
            vm = re.search(r"<v>(.*?)</v>", inner, re.S)
            tm = re.search(r"<t[^>]*>(.*?)</t>", inner, re.S)
            val = ""
            if 't="s"' in attrs and vm:
                val = shared[int(vm.group(1))]
            elif tm:  # inline string
                val = unescape(strip_tags(tm.group(1)))
            elif vm:
                val = unescape(vm.group(1))
            cells[col_to_index(col)] = val
        rows.append(cells)
    return rows


def sheet_paths_by_name(z: zipfile.ZipFile) -> dict[str, str]:
    wb = z.read("xl/workbook.xml").decode("utf-8")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rid_to_target = dict(re.findall(r'<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"', rels))
    out = {}
    for name, rid in re.findall(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wb):
        target = rid_to_target.get(rid, "")
        if target and "worksheets" in target:
            out[unescape(name)] = "xl/" + target.lstrip("/")
    return out


# ---------------------------------------------------------------------------
# Serial-date conversion
# ---------------------------------------------------------------------------


def serial_to_date(v: str) -> str | None:
    try:
        n = float(v)
    except ValueError:
        return None
    if n <= 0 or n > 80000:
        return None
    return (EXCEL_EPOCH + timedelta(days=int(n))).isoformat()


def serial_to_datetime_iso(v: str) -> str | None:
    try:
        n = float(v)
    except ValueError:
        return None
    if n <= 0 or n > 80000:
        return None
    dt = datetime(EXCEL_EPOCH.year, EXCEL_EPOCH.month, EXCEL_EPOCH.day) + timedelta(days=n)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"  # taken at face value as UTC (Pearl precedent)


# ---------------------------------------------------------------------------
# Attendee-sheet extraction
# ---------------------------------------------------------------------------

H_NAME = "First and Last name"
H_EMAIL = "Best email to send certificate"
H_COURSE_DATE = "What day, month and year did you take the course?"
H_ORG = "Please Select & Verify the Name of the Organization that Provided the Course"
H_TITLE = "Please Select & Verify the Name of the Course"
H_SUBJECT = "Please select the Course Subject Matter"
H_STATE = "State of Licensure"
H_ADDL_STATE = "Additional State of Licensure"
H_OCCUPATION = "Occupation"
H_FORMAT = "What was the Course Format?"
H_SCORE = "score"
H_SUBMITTED = "Submitted At"
H_TOKEN = "Token"


def extract_sheet(rows: list[dict[int, str]], da: str, report: list[str]) -> list[dict[str, str]]:
    header = rows[0]
    idx_of = {v.strip(): k for k, v in header.items() if v.strip()}

    def col(name: str) -> int:
        for text, i in idx_of.items():
            if text == name:
                return i
        raise SystemExit(f"{da}: missing column {name!r}")

    i_format = col(H_FORMAT)
    i_score = col(H_SCORE)
    addl_cols = sorted(k for k, v in header.items() if v.strip() == H_ADDL_STATE)

    # Quiz columns: between "What was the Course Format?" and the first trailing
    # outcome column (its header is the long "Unfortunately, you did not…" text).
    outcome_cols = sorted(
        k
        for k, v in header.items()
        if k > i_format and (v.strip().startswith("Unfortunately,") or v.strip().startswith("Congratulations,"))
    )
    quiz_end = outcome_cols[0] if outcome_cols else i_score
    quiz_cols = sorted(k for k in header if i_format < k < quiz_end)
    if len(quiz_cols) != 5:
        raise SystemExit(f"{da}: expected 5 quiz columns, found {len(quiz_cols)}: {[header[c] for c in quiz_cols]}")

    # Per-row ending verdict: the ending_displayed_id column carries the shown
    # outcome text in this export.
    i_ending = col("ending_displayed_id")

    out = []
    for n, cells in enumerate(rows[1:], start=1):
        get = lambda i: (cells.get(i) or "").strip()
        if not get(col(H_NAME)) and not get(col(H_EMAIL)):
            continue  # blank padding row
        course_date = serial_to_date(get(col(H_COURSE_DATE))) or get(col(H_COURSE_DATE))
        submitted = serial_to_datetime_iso(get(col(H_SUBMITTED)))
        if not submitted:
            report.append(f"{da} row {n}: unparseable Submitted At {get(col(H_SUBMITTED))!r} — row skipped")
            continue
        rec = {
            "name": get(col(H_NAME)),
            "email": get(col(H_EMAIL)),
            "course_date": course_date,
            "organization": get(col(H_ORG)),
            "course_title": get(col(H_TITLE)),
            "subject": get(col(H_SUBJECT)),
            "state": get(col(H_STATE)),
            "additional_states": json.dumps([s for s in (get(i) for i in addl_cols) if s]),
            "occupation": get(col(H_OCCUPATION)),
            "course_format": get(col(H_FORMAT)),
        }
        for k, qc in enumerate(quiz_cols, start=1):
            rec[f"q{k}_question"] = header[qc].strip()
            rec[f"q{k}_answer"] = get(qc)
        rec["score"] = get(i_score)
        rec["ending"] = get(i_ending)
        rec["submitted_at"] = submitted
        rec["token"] = get(col(H_TOKEN))
        out.append(rec)
    return out


def guarded_completion(course_date: str, submitted_at: str) -> str:
    """Mirror the TS importer's guard: keep the attendee course date only when it
    is a real ISO date, >= MIN_COURSE_YEAR, and not after submission."""
    submit_date = submitted_at[:10]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", course_date or ""):
        if int(course_date[:4]) >= MIN_COURSE_YEAR and course_date <= submit_date:
            return course_date
    return submit_date


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    report: list[str] = [f"new-companies extraction  |  source: {XLSX}"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(XLSX) as z:
        shared = shared_strings(z)
        paths = sheet_paths_by_name(z)
        by_da: dict[str, list[dict[str, str]]] = {}
        for name, path in paths.items():
            m = re.match(r"(DA\d{3})\b", name)
            if not m:
                continue
            da = m.group(1)
            rows = sheet_rows(z, path, shared)
            by_da[da] = extract_sheet(rows, da, report)
            report.append(f"{da}: {len(by_da[da])} attendee rows (sheet {name!r})")

    # Quiz CSV: copy verbatim + read course metadata out of it.
    quiz_rows = list(csv.DictReader(QUIZ_CSV.open()))
    shutil.copy(QUIZ_CSV, OUT_DIR / "quiz-data.csv")
    course_meta: dict[str, dict[str, str]] = {}
    for r in quiz_rows:
        course_meta.setdefault(
            r["course_da_number"],
            {
                "title": r["course_title"],
                "ceHours": r["ce_hours"],
                "subject": r["subject_matter"],
                # multi-select intake text; first listed option = primary format
                "formatFirstLine": r["course_format"].splitlines()[0].strip(),
            },
        )

    # Attendee CSVs + earliest cert date per course.
    earliest: dict[str, str] = {}
    for da, recs in sorted(by_da.items()):
        with (OUT_DIR / f"attendees-{da}.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(recs[0].keys()))
            w.writeheader()
            w.writerows(recs)
        earliest[da] = min(guarded_completion(r["course_date"], r["submitted_at"]) for r in recs)
        report.append(f"{da}: earliest cert date {earliest[da]}")

    companies = COMPANIES
    courses = []
    for da, meta in sorted(COURSES.items()):
        cm = course_meta.get(da)
        if not cm:
            raise SystemExit(f"{da} missing from the quiz CSV")
        courses.append(
            {
                "legacyId": meta["legacyId"],
                "companyLegacyId": meta["companyLegacyId"],
                "legacyCourseId": da,
                "courseIdNumber": f"ACE-LEG-{meta['legacyId']:05d}",
                "courseTitle": cm["title"],
                "ceHours": float(cm["ceHours"]),
                "subjectRaw": cm["subject"],
                "formatRaw": cm["formatFirstLine"],
                "sheetOrg": meta["sheetOrg"],
                "approvedAt": earliest.get(da, ZERO_CERT_APPROVED_AT),
            }
        )

    (OUT_DIR / "companies.json").write_text(json.dumps(companies, indent=2) + "\n")
    (OUT_DIR / "courses.json").write_text(json.dumps(courses, indent=2) + "\n")
    (OUT_DIR / "extraction-report.txt").write_text("\n".join(report) + "\n")
    print("\n".join(report))
    print(f"\nWrote artifacts to {OUT_DIR}")


if __name__ == "__main__":
    main()
