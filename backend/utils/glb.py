"""Pack a multi-file glTF (model.gltf + .bin + texture images) into one self-contained .glb.

Some libraries (Poly Haven) ship glTF as separate files; the viewer, the cache and the
"Download" button all expect one file. A GLB is: 12-byte header + JSON chunk + BIN chunk.
"""

import json
import mimetypes
import struct
from pathlib import Path


def _pad(data: bytes, fill: bytes) -> bytes:
    return data + fill * ((4 - len(data) % 4) % 4)


def pack(gltf_path: Path, out_path: Path) -> Path:
    base = gltf_path.parent
    doc = json.loads(gltf_path.read_text(encoding="utf-8"))

    blob = bytearray()
    buffer_offsets = []
    for buf in doc.get("buffers", []):
        buffer_offsets.append(len(blob))
        blob += (base / buf["uri"]).read_bytes()
        blob += b"\0" * ((4 - len(blob) % 4) % 4)

    # Existing buffer views now point into the single merged buffer.
    for view in doc.get("bufferViews", []):
        view["byteOffset"] = view.get("byteOffset", 0) + buffer_offsets[view.get("buffer", 0)]
        view["buffer"] = 0

    # Embed every external image as a new buffer view.
    for image in doc.get("images", []):
        uri = image.pop("uri", None)
        if not uri or uri.startswith("data:"):
            if uri:
                image["uri"] = uri
            continue
        data = (base / uri).read_bytes()
        doc.setdefault("bufferViews", []).append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)})
        image["bufferView"] = len(doc["bufferViews"]) - 1
        image["mimeType"] = mimetypes.guess_type(uri)[0] or "image/jpeg"
        blob += data
        blob += b"\0" * ((4 - len(blob) % 4) % 4)

    doc["buffers"] = [{"byteLength": len(blob)}]
    json_chunk = _pad(json.dumps(doc, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = _pad(bytes(blob), b"\0")
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)

    with open(out_path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk)
        f.write(struct.pack("<I4s", len(bin_chunk), b"BIN\0") + bin_chunk)
    return out_path
