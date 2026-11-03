"""
Voz para la persona oyente: lee en voz alta el texto de las señas con una voz
neuronal (natural). Todo lo del proveedor, hoy edge-tts, queda en este
archivo: para pasar a Azure Speech (las mismas voces) basta cambiar
synthesize(). El frontend elige la voz por su nombre corto, nunca por el de
Microsoft.
"""

import asyncio
from collections import OrderedDict
from typing import Literal

import aiohttp
import edge_tts
from edge_tts.exceptions import EdgeTTSException
from pydantic import BaseModel, Field

# Voces que se pueden elegir en Perfil, en español de Chile.
VOICES = {
    "female": "es-CL-CatalinaNeural",
    "male": "es-CL-LorenzoNeural",
}

# Un poco más lenta de lo normal, como la voz que usaba antes la app.
RATE = "-5%"

MAX_TEXT_LENGTH = 500

# Si el servicio no responde en este tiempo se avisa, en vez de dejar esperando.
RECEIVE_TIMEOUT_S = 15

# Las frases se repiten mucho (HOLA, DEJAME PENSAR): las últimas se guardan
# para responder al instante. Cada una pesa unos pocos KB.
CACHE_SIZE = 200
_cache: OrderedDict[tuple[str, str], bytes] = OrderedDict()


class TTSUnavailable(Exception):
    """No se pudo generar el audio: sin internet o el servicio no respondió."""


class SpeechIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: Literal["female", "male"] = "female"


async def synthesize(text: str, voice: str = "female") -> bytes:
    """Devuelve el texto leído en voz alta, en MP3."""
    text = text.strip()

    if not text:
        raise ValueError("No hay texto para leer")

    key = (voice, text)

    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]

    communicate = edge_tts.Communicate(
        text,
        VOICES[voice],
        rate=RATE,
        receive_timeout=RECEIVE_TIMEOUT_S,
    )
    audio = bytearray()

    try:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
    except (EdgeTTSException, aiohttp.ClientError, asyncio.TimeoutError) as exc:
        raise TTSUnavailable("No se pudo cargar el audio. Revisa tu conexión a internet.") from exc

    if not audio:
        raise TTSUnavailable("No se pudo cargar el audio. Inténtalo de nuevo.")

    _cache[key] = bytes(audio)

    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)

    return _cache[key]
