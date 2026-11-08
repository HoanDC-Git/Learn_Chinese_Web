# Ôn từ tiếng Trung (bản web điện thoại)

Web tĩnh duy nhất 1 chức năng: **ôn flashcard** (nhớ/quên + hoàn tác), đồng bộ
với app laptop qua file `sync.json` trong repo private `LearnChineseSync`.

- Layout **1 cột** tối ưu màn xoay ngang (~860×320 CSS px, Redmi 12).
- Không backend, không build-time secret. Token PAT (quyền Contents read/write
  repo sync) do người dùng nhập trên máy mình, chỉ nằm trong `localStorage`.

## Chạy thử trên điện thoại thật (trước khi deploy)

```sh
npm install
npm run dev -- --host
```

Mở IP LAN hiện trên terminal bằng Chrome điện thoại (cùng Wifi).

## Đẩy lên repo public + bật Pages (làm 1 lần)

```sh
git push -u origin main
```

Rồi trên github.com/HoanDC-Git/Learn_Chinese_Web: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. Mỗi lần push lên `main`,
workflow tự build + deploy. Web có tại:

`https://hoandc-git.github.io/Learn_Chinese_Web/`

Trên điện thoại: mở URL → nhập token 1 lần → **Add to Home Screen** để chạy
standalone (mất thanh URL, thêm ~40px chiều cao).

## Luồng dùng hằng ngày

1. Tắt app laptop (tự đẩy snapshot lên `LearnChineseSync`).
2. Mở web → **Học bài** (kéo bản mới) → ôn → **Lưu tiến trình**.
3. Mở app laptop (tự kéo kết quả về).

## Quy ước sync (khớp app laptop)

`sync.json`: `{ version (UTC epoch, tăng đơn điệu), updated_by: laptop|phone,
updated_at, cards: [{ id, hanzi, pinyin, meaning, level, next_review,
remembered }] }`. Phone gửi `remembered: true/false` cho từng thẻ đã ôn;
laptop tái tính SRS từ level trong DB. Khi lưu, web merge kết quả vào bản
cloud **mới nhất** (lấy sha tươi) rồi mới PUT — không ghi đè mù.
# Learn_Chinese_Web
