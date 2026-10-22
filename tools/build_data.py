"""Tạo data/thuoc.js (dữ liệu cho trang web) từ danh mục thuốc + danh sách file HDSD.

Quy ước: mỗi file HDSD đặt tên đúng bằng MÃ SỐ thuốc, vd "T26.BV.1000.175.TD17.pdf".

Cách chạy (từ thư mục gốc dự án):

  # HDSD để trên Google Drive: dùng file CSV xuất từ tools/drive_list.gs
  python tools/build_data.py nguon/DM_thuoc_tong.xlsx --drive-csv nguon/hdsd_drive.csv

  # HDSD để chung với trang web (thư mục hdsd/ trong dự án)
  python tools/build_data.py nguon/DM_thuoc_tong.xlsx --local-dir hdsd

Danh mục cần các cột: "Mã số" (mã trên đơn), "Tên thuốc", "ĐVT", "Mã" (ID nội bộ của
phần mềm KCB, là số, không trùng; ID này được đưa vào QR vì ngắn hơn mã số).

Script in ra số mã đã có HDSD, và ghi nguon/bao_cao_hdsd.csv liệt kê
  - thuốc đang dùng (mã thầu >= 2024) chưa có file HDSD,
  - file HDSD có tên không khớp mã số nào (thường do gõ sai tên file).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
ACTIVE_FROM_YEAR = 2024

HEADER_ALIASES = {
    "code": ["mã số", "ma so"],
    "name": ["tên thuốc", "ten thuoc", "thuốc - vật tư"],
    "unit": ["đvt", "dvt", "đơn vị tính"],
    "id": ["mã", "ma", "id"],
}


def clean(s) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(s))).strip()


def code_key(s: str) -> str:
    """Khoá so khớp mã số với tên file: bỏ khoảng trắng, chữ thường, bỏ ký tự
    không được phép trong tên file Windows (vd mã có dấu '/')."""
    return re.sub(r'[\s/\\:*?"<>|]', "", clean(s).lower())


def tender_year(code: str) -> int:
    """T25.xxx -> 2025, 2017.4 -> 2017, mã cũ dạng số -> 0."""
    m = re.match(r"^T(\d{2})(?:\.|$)", code)
    if m:
        return 2000 + int(m.group(1))
    m = re.match(r"^(20\d{2})(?:\.|$)", code)
    return int(m.group(1)) if m else 0


def drive_url(value: str) -> str:
    """Link Drive (nhiều dạng) hoặc file ID -> link xem chuẩn."""
    v = clean(value)
    m = re.search(r"/d/([-\w]{20,})", v) or re.search(r"[?&]id=([-\w]{20,})", v)
    if m:
        return f"https://drive.google.com/file/d/{m.group(1)}/view"
    if re.fullmatch(r"[-\w]{20,}", v):
        return f"https://drive.google.com/file/d/{v}/view"
    if v.startswith(("https://", "http://")):
        return v
    raise ValueError(f"Link/ID Drive không hợp lệ: {v!r}")


def read_table(path: Path) -> list[tuple]:
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            return [tuple(r) for r in csv.reader(f)]
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    return [tuple(r) for r in wb.worksheets[0].iter_rows(values_only=True)]


def load_catalog(path: Path) -> tuple[list[dict], list[str]]:
    rows = read_table(path)
    for h, row in enumerate(rows[:20]):
        cells = [clean(c).lower() for c in row]
        cols = {k: cells.index(a) for k, al in HEADER_ALIASES.items() for a in al if a in cells}
        if {"code", "name", "id"} <= cols.keys():
            break
    else:
        raise SystemExit("Không thấy dòng tiêu đề có cột 'Mã số', 'Tên thuốc', 'Mã'.")

    out, skipped, seen = [], [], set()
    for line_no, row in enumerate(rows[h + 1 :], start=h + 2):
        get = lambda k: clean(row[cols[k]]) if k in cols and cols[k] < len(row) else ""
        code, name, unit, rid = get("code"), get("name"), get("unit"), get("id")
        if not code and not name:
            continue
        if code.lower().startswith("nhầm") or name in ("", "0"):
            skipped.append(f"dòng {line_no}: {code} | {name} (dòng nhầm/rỗng)")
        elif not re.fullmatch(r"\d+", rid):
            skipped.append(f"dòng {line_no}: {code} | {name} (cột Mã không phải số: {rid!r})")
        elif rid in seen:
            skipped.append(f"dòng {line_no}: {code} | {name} (trùng Mã {rid})")
        else:
            seen.add(rid)
            out.append({"id": int(rid), "code": code, "name": name, "unit": unit, "year": tender_year(code)})
    return out, skipped


def files_from_drive_csv(path: Path) -> dict[str, str]:
    """CSV từ drive_list.gs: cột 'Tên file', 'Link' (link hoặc file ID)."""
    rows = read_table(path)
    header = [clean(c).lower() for c in rows[0]]
    try:
        i_name, i_link = header.index("tên file"), header.index("link")
    except ValueError:
        raise SystemExit(f"{path}: cần cột 'Tên file' và 'Link'.")
    if "chia sẻ" in header:
        i_share = header.index("chia sẻ")
        not_shared = [clean(r[i_name]) for r in rows[1:] if len(r) > i_share and clean(r[i_share]) not in ("", "OK")]
        if not_shared:
            print(f"CẢNH BÁO: {len(not_shared)} file chưa chia sẻ công khai, bệnh nhân sẽ bị đòi đăng nhập, "
                  f"vd: {', '.join(not_shared[:3])}", file=sys.stderr)
    return {clean(r[i_name]): drive_url(r[i_link]) for r in rows[1:] if len(r) > i_link and clean(r[i_link])}


def files_from_local_dir(d: Path) -> dict[str, str]:
    d = d.resolve()
    if ROOT not in d.parents:
        raise SystemExit("--local-dir phải nằm trong thư mục dự án để trang web mở được file.")
    return {p.name: p.relative_to(ROOT).as_posix() for p in sorted(d.iterdir()) if p.is_file() and not p.name.startswith(".")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("catalog", type=Path, help="file Excel/CSV danh mục thuốc")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--drive-csv", type=Path, help="CSV danh sách file HDSD trên Drive (từ drive_list.gs)")
    src.add_argument("--local-dir", type=Path, help="thư mục chứa file HDSD đặt cùng trang web")
    args = ap.parse_args()

    drugs, skipped = load_catalog(args.catalog)
    files = {}
    if args.drive_csv:
        files = files_from_drive_csv(args.drive_csv)
    elif args.local_dir:
        files = files_from_local_dir(args.local_dir)

    # tên file (bỏ đuôi) -> link
    by_key: dict[str, tuple[str, str]] = {}
    for fname, link in files.items():
        stem = fname.rsplit(".", 1)[0] if "." in fname and len(fname.rsplit(".", 1)[1]) <= 4 else fname
        by_key[code_key(stem)] = (fname, link)

    used = set()
    for d in drugs:
        hit = by_key.get(code_key(d["code"]))
        d["hdsd"] = hit[1] if hit else ""
        if hit:
            used.add(hit[0])

    drugs.sort(key=lambda d: (d["name"].lower(), -d["year"], -d["id"]))
    payload = {
        "version": date.today().isoformat(),
        # mỗi dòng: [ID, mã số, tên thuốc, ĐVT, năm thầu, link HDSD]
        "rows": [[d["id"], d["code"], d["name"], d["unit"], d["year"], d["hdsd"]] for d in drugs],
    }
    out = ROOT / "data" / "thuoc.js"
    out.write_text(
        "// Sinh tự động bởi tools/build_data.py, đừng sửa tay.\n"
        "window.THUOC_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    active = [d for d in drugs if d["year"] >= ACTIVE_FROM_YEAR]
    missing = [d for d in active if not d["hdsd"]]
    orphans = sorted(set(files) - used)
    report = ROOT / "nguon" / "bao_cao_hdsd.csv"
    report.parent.mkdir(exist_ok=True)
    with report.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Loại", "Mã số / Tên file", "Tên thuốc"])
        for d in sorted(missing, key=lambda d: d["code"]):
            w.writerow(["Thuốc đang dùng chưa có HDSD", d["code"], d["name"]])
        for name in orphans:
            w.writerow(["File không khớp mã số nào", name, ""])

    print(f"Đã ghi {out.relative_to(ROOT)}: {len(drugs)} mã thuốc, {sum(1 for d in drugs if d['hdsd'])} mã có HDSD")
    print(f"Thuốc đang dùng (mã thầu >= {ACTIVE_FROM_YEAR}): {len(active)} mã, còn thiếu HDSD {len(missing)} mã")
    print(f"File HDSD: {len(files)} file, {len(orphans)} file không khớp mã số nào")
    print(f"Chi tiết: {report.relative_to(ROOT)}")
    if skipped:
        print(f"Bỏ qua {len(skipped)} dòng danh mục (dòng nhầm/trùng/rỗng)", file=sys.stderr)


if __name__ == "__main__":
    main()
