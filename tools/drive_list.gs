/**
 * Liệt kê file HDSD trong thư mục Google Drive -> Google Sheet (Tên file, Link, Chia sẻ).
 *
 * Cách dùng:
 *  1. Vào https://script.google.com -> Dự án mới -> dán toàn bộ file này.
 *  2. Sửa FOLDER_ID bên dưới (đoạn cuối của link thư mục Drive:
 *     https://drive.google.com/drive/folders/<FOLDER_ID>).
 *  3. Chọn hàm xuatDanhSachHDSD -> Chạy -> cấp quyền bằng tài khoản có quyền xem thư mục.
 *  4. Xem Nhật ký thực thi để lấy link Google Sheet vừa tạo.
 *     Mở Sheet -> Tệp -> Tải xuống -> CSV, lưu thành nguon/hdsd_drive.csv
 *  5. Chạy: python tools/build_data.py nguon/DM_thuoc_tong.xlsx --drive-csv nguon/hdsd_drive.csv
 *
 * Cột "Chia sẻ" báo file nào CHƯA để chế độ "Bất kỳ ai có đường liên kết đều xem được"
 * (bệnh nhân bấm vào file đó sẽ bị đòi đăng nhập). Đặt SUA_CHIA_SE = true để script tự mở
 * quyền xem cho các file đó.
 */
const FOLDER_ID = 'DAN_ID_THU_MUC_VAO_DAY';
const SUA_CHIA_SE = false;

function xuatDanhSachHDSD() {
  const rows = [['Tên file', 'Link', 'Chia sẻ']];
  const walk = (folder) => {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      let shared = f.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK;
      if (!shared && SUA_CHIA_SE) {
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        shared = true;
      }
      rows.push([f.getName(), f.getId(), shared ? 'OK' : 'CHƯA CHIA SẺ']);
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) walk(subs.next());
  };
  walk(DriveApp.getFolderById(FOLDER_ID));

  const ss = SpreadsheetApp.create('Danh sách HDSD ' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm'));
  const sh = ss.getSheets()[0];
  sh.getRange(1, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  const chuaChiaSe = rows.filter((r) => r[2] === 'CHƯA CHIA SẺ').length;
  Logger.log('Số file: ' + (rows.length - 1) + ', chưa chia sẻ: ' + chuaChiaSe);
  Logger.log('Sheet: ' + ss.getUrl());
}
