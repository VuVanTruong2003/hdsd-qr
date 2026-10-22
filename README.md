# QR hướng dẫn sử dụng thuốc

Trang web tĩnh (không server, không database):

- **Trang tạo QR** (`index.html`): dược sĩ dán đơn thuốc copy từ phần mềm KCB, hoặc tìm và thêm từng thuốc → ra mã QR, in kèm đơn.
- **Trang bệnh nhân** (`index.html?d=...`): quét QR → danh sách thuốc trong đơn → bấm vào thuốc để mở tờ HDSD.

QR chỉ chứa link dạng `https://<trang>/?d=15013-15091-15035` (ID nội bộ của từng thuốc, cột "Mã" trong danh mục), không chứa thông tin bệnh nhân.

## Cấu trúc

```
index.html, app.js      trang web
lib/qrcode.js           thư viện vẽ QR (Kazuhiko Arase, MIT), chạy offline
data/thuoc.js           dữ liệu thuốc — SINH TỰ ĐỘNG, không sửa tay
hdsd/                   file HDSD (nếu để chung với trang web)
nguon/                  danh mục Excel, báo cáo thiếu HDSD
tools/build_data.py     tạo data/thuoc.js
tools/drive_list.gs     Apps Script liệt kê file HDSD trên Google Drive
```

## Quy ước file HDSD

Mỗi file đặt tên **đúng bằng mã số thuốc** trên đơn, ví dụ `T26.BV.1000.175.TD17.pdf`.
Mã có khoảng trắng hay ký tự `/` thì bỏ các ký tự đó khi đặt tên (script tự khớp).

## Cập nhật dữ liệu (khi có thuốc mới / đổi thầu)

Cần Python 3 + `pip install openpyxl`.

**Cách A – HDSD để chung với trang web** (đơn giản nhất, PDF nằm trong thư mục `hdsd/`):

```
python tools/build_data.py nguon/DM_thuoc_tong.xlsx --local-dir hdsd
```

**Cách B – HDSD để trên Google Drive:**

1. Mở `tools/drive_list.gs`, làm theo hướng dẫn đầu file → tải về `nguon/hdsd_drive.csv`.
   Thư mục Drive phải ở chế độ *Bất kỳ ai có đường liên kết đều xem được* (script có cột báo file nào chưa chia sẻ).
2. `python tools/build_data.py nguon/DM_thuoc_tong.xlsx --drive-csv nguon/hdsd_drive.csv`

Sau khi chạy, xem `nguon/bao_cao_hdsd.csv`: thuốc đang dùng còn thiếu HDSD, file đặt tên sai mã.
Rồi commit + push, trang tự cập nhật.

Danh mục Excel xuất từ phần mềm KCB, cần các cột `Mã số`, `Tên thuốc`, `ĐVT`, `Mã`. **Chỉ thêm, không xoá** mã cũ, để QR đã in vẫn mở được.

## Đưa lên mạng (GitHub Pages, miễn phí)

1. Tạo repo trên GitHub, đẩy toàn bộ thư mục này lên nhánh `main`.
2. Settings → Pages → Source: *Deploy from a branch*, Branch: `main` / `/ (root)` → Save.
3. Vài phút sau có link `https://<tên>.github.io/<repo>/`. Mở link đó để tạo QR (QR tạo trên máy local chỉ để thử).

Khi có tên miền riêng: điền vào `CONFIG.publicUrl` trong `app.js`, để QR luôn trỏ về tên miền đó dù sau này đổi chỗ host.
Tên đơn vị sửa ở `CONFIG.tenDonVi`.

## Chạy thử trên máy

```
python -m http.server 8000
```
rồi mở `http://localhost:8000/`.
