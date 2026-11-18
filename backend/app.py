"""Local AI helper for F&B Product Studio.
Start with: python -m uvicorn app:app --host 127.0.0.1 --port 8000
This service never sends photos to an external AI service.
"""
import io
import logging
from functools import lru_cache
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError

app = FastAPI(title="F&B Product Studio Local AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])
MAX_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 32_000_000


@lru_cache(maxsize=1)
def get_session():
    from rembg import new_session
    return new_session("isnet-general-use")


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "local", "features": ["background-removal"]}


@app.post("/api/remove-background")
async def remove_background(file: UploadFile = File(...)):
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ PNG, JPG, WebP")
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Ảnh vượt quá 20 MB")
    try:
        original = Image.open(io.BytesIO(content))
        if original.width * original.height > MAX_PIXELS:
            raise HTTPException(status_code=413, detail="Ảnh vượt quá 32 megapixel")
        original.load()
        original = original.convert("RGBA")
        from rembg import remove
        result = remove(original, session=get_session(), alpha_matting=True)
        buf = io.BytesIO()
        result.save(buf, format="PNG", optimize=True)
        return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Ảnh tải lên không hợp lệ") from exc
    except Exception:
        logging.exception("Local background removal failed")
        raise HTTPException(status_code=500, detail="AI không thể tách nền. Kiểm tra model và log Python.")
