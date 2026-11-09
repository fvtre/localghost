"""Local CPU transcription endpoint for LocalGhost.

Only binds to loopback. Audio never leaves this machine.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from faster_whisper import WhisperModel

HOST = "127.0.0.1"
PORT = 8000
DEFAULT_MODEL = "Systran/faster-whisper-small"
MODEL_ALIASES = {
    "Systran/faster-whisper-tiny": "Systran/faster-whisper-tiny",
    "Systran/faster-whisper-base": "Systran/faster-whisper-base",
    "Systran/faster-whisper-small": "Systran/faster-whisper-small",
    "Systran/faster-whisper-medium": "Systran/faster-whisper-medium",
    "Systran/faster-whisper-large-v3": "Systran/faster-whisper-large-v3",
}

app = FastAPI(title="LocalGhost CPU Whisper", docs_url=None, redoc_url=None)
model_cache: dict[str, WhisperModel] = {}


def get_model(model_id: str) -> WhisperModel:
    model_name = MODEL_ALIASES.get(model_id)
    if model_name is None:
        raise HTTPException(status_code=400, detail="Modelo Whisper no habilitado en este servicio local.")
    if model_name not in model_cache:
        threads = max(1, (os.cpu_count() or 4) - 2)
        model_cache[model_name] = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
            cpu_threads=threads,
            num_workers=1,
        )
    return model_cache[model_name]


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "device": "cpu", "loaded_models": list(model_cache)}


@app.post("/v1/audio/transcriptions")
async def transcribe(request: Request) -> dict[str, object]:
    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío.")
    if len(audio) > 500 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo local de 500 MB.")

    model_id = request.headers.get("x-localghost-model", DEFAULT_MODEL)
    filename = request.headers.get("x-audio-filename", "recording.webm")
    extension = Path(filename).suffix.lower()
    if extension not in {".webm", ".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".flac"}:
        extension = ".webm"

    whisper = get_model(model_id)
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as temp_audio:
            temp_audio.write(audio)
            temp_path = temp_audio.name

        segments_iter, info = whisper.transcribe(
            temp_path,
            language="es",
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segments = [
            {"start": segment.start, "end": segment.end, "text": segment.text.strip()}
            for segment in segments_iter
        ]
        return {
            "text": " ".join(segment["text"] for segment in segments).strip(),
            "segments": segments,
            "language": info.language,
            "device": "cpu",
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"No se pudo decodificar o transcribir el audio: {error}") from error
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
