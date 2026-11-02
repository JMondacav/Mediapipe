"""
Acepta cuerpos de petición comprimidos con gzip (Content-Encoding: gzip).

El frontend comprime las grabaciones antes de enviarlas: los números en JSON
se comprimen ~4 veces, y en el celular subir menos datos es lo que más
acorta la espera.
"""

import zlib

# Límites para no aceptar bombas de compresión.
MAX_COMPRESSED_BYTES = 5_000_000
MAX_BODY_BYTES = 25_000_000


class GzipRequestMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self._is_gzip(scope):
            await self.app(scope, receive, send)
            return

        compressed = bytearray()
        more_body = True

        while more_body:
            message = await receive()
            compressed.extend(message.get("body", b""))
            more_body = message.get("more_body", False)

            if len(compressed) > MAX_COMPRESSED_BYTES:
                await self._error(send, 413, "La grabación es demasiado grande")
                return

        try:
            decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
            body = decompressor.decompress(bytes(compressed), MAX_BODY_BYTES)

            if decompressor.unconsumed_tail:
                await self._error(send, 413, "La grabación es demasiado grande")
                return
        except zlib.error:
            await self._error(send, 400, "El cuerpo comprimido no es válido")
            return

        headers = [
            (name, value)
            for name, value in scope["headers"]
            if name not in (b"content-encoding", b"content-length")
        ]
        headers.append((b"content-length", str(len(body)).encode()))
        delivered = False

        async def receive_body():
            nonlocal delivered

            if not delivered:
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}

            return await receive()

        await self.app({**scope, "headers": headers}, receive_body, send)

    @staticmethod
    def _is_gzip(scope) -> bool:
        return any(
            name == b"content-encoding" and value.strip().lower() == b"gzip"
            for name, value in scope["headers"]
        )

    @staticmethod
    async def _error(send, status: int, detail: str):
        body = ('{"detail": "%s"}' % detail).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})
