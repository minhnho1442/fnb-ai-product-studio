# F&B Product Studio v0.1

**Bản nền tảng hoạt động được** cho studio chỉnh ảnh sản phẩm F&B chạy local trên Windows. Đây chưa phải bản Photoshop/AI Studio đầy đủ, mà là bộ khung dễ học, tự mở rộng từ HTML/CSS/JavaScript + Python.

## Chạy ngay (chỉnh ảnh thường, không cần AI)

1. Giải nén thư mục.
2. Mở `index.html` trên Chrome/Edge để thêm ảnh, thay nền, chỉnh màu, layer và xuất PNG/JPG/WebP.
3. Hoặc mở thư mục trong VS Code, terminal chạy `python -m http.server 5500`, truy cập `http://127.0.0.1:5500`. **Cách này cũng chạy được ảnh demo.**

## Bật tách nền AI offline (cần Internet lần đầu để tải model)

1. Cài **Python 3.11 64-bit** trên Windows.
2. Mở PowerShell/terminal tại thư mục `backend`.
3. Chạy:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Nếu PowerShell chặn Activate.ps1, không cần đổi chính sách bảo mật. Dùng trực tiếp `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`, sau đó `.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000`.

Mở `http://127.0.0.1:8000/api/health` để xem backend chạy chưa. Quay lại Studio, làm mới trang, chọn layer ảnh và nhấn **Tách nền tự động**.

**Lưu ý:** rembg sẽ tải mô hình khi dùng lần đầu; với ảnh có tóc, logo trong suốt hoặc cạnh thủy tinh, luôn kiểm tra viền và kết quả. Phần xử lý ảnh chạy trên máy bạn sau khi model đã tải.

## Chức năng v0.1 đã thực hiện

- Upload nhiều ảnh sản phẩm; kéo/thả lên canvas.
- Thêm ảnh nền từ máy hoặc chọn 7 preset studio, nền trong suốt.
- Chỉnh sáng, tương phản, độ bão hòa, nhiệt màu mô phỏng, blur, opacity theo layer.
- Kéo di chuyển và scale layer trên canvas; xoay, nhân bản, thay thứ tự, ẩn, xóa.
- Bóng đổ mềm theo alpha layer, thêm text layer.
- Undo/redo (30 trạng thái); so sánh trước/sau bộ lọc.
- Đổi kích thước artboard: 1:1, 4:5, 9:16, 16:9, A4 300 dpi, 4K dọc/ngang.
- Xuất ảnh PNG/JPEG/WebP; lưu/mở file dự án `.studio.json`.
- Backend tách nền AI local bằng rembg.

## Chức năng dự kiến các bản tiếp theo (chưa có trong v0.1)

- Vẽ và sửa mask bằng cọ; erase/restore; tóc và kính trong suốt.
- HSL, Curves, Color Grading, WB kỹ thuật, màu RAW.
- AI inpainting (xóa vật thể), AI sinh nền với ảnh tham chiếu; kiểm tra logo và chữ gốc.
- Tạo bóng tiếp xúc, reflection, light matching, perspective, depth of field.
- Xử lý hàng loạt, hàng đợi AI, preset riêng từng ảnh, xuất ZIP.
- Sổ tay template menu/poster/standee; font và đơn vị in, PDF với ICC.
- Lịch sử dự án tự lưu, SQLite, backup, phiên bản presets/skills.
- Đóng gói app Windows bằng Tauri và gắn Python sidecar.

## Cấu trúc

```
index.html                 giao diện và điều khiển
styles.css                 theme UI
app.js                     canvas, layers, filters, undo, dự án, xuất
assets/demo-binh-giu-nhiet.jpeg
backend/app.py             FastAPI + rembg local
backend/requirements.txt  dependencies Python
```

## Giới hạn kỹ thuật hiện tại

- Chỉnh màu v0.1 là bộ lọc Canvas để thử nhanh, không phải bộ màu RAW/Camera Raw chuẩn chỉnh; blur đơn vị là pixels của canvas.
- Studio chưa tạo bối cảnh bằng AI. Chức năng này cần máy có GPU phù hợp chạy ComfyUI hoặc API bên ngoài.
- Xuất 4K tăng kích thước canvas chứ **không tự làm tăng chi tiết thật của ảnh gốc**.
- JSON chứa ảnh gốc dưới dạng data URL nên có thể khá lớn; nên lưu project theo thư mục trong bản desktop về sau.
- File chạy local không có hệ thống người dùng, phân quyền hay mã hóa. Không mở backend ra Internet công cộng.
- Browser có thể chặn mở ảnh demo khi chạy qua `file://`, dùng local server để tránh.
- Tách nền AI là thao tác tạo raster mới: muốn phục hồi thì dùng Undo hoặc giữ project gốc.

## Hướng nâng cấp

Giữ tách biệt 3 lớp: **giao diện / engine canvas / xử lý AI**. Khi chuyển sang React + Konva hoặc Fabric.js, có thể giữ backend Python và các JSON preset. Tránh tích hợp mọi AI model trực tiếp vào code giao diện.
