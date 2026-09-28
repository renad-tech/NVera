"""Search settings the user reviews before every search (shown under the input box)."""

import base64
import io
from typing import Literal

from PIL import Image
from pydantic import BaseModel, Field, field_validator

MAX_REFERENCE_IMAGES = 2
REFERENCE_PX = 512


class SearchSettings(BaseModel):
    space_size: Literal["small", "medium", "large"] = "medium"
    color_mode: Literal["colored", "monochrome"] = "colored"
    # data: URLs from the browser; re-encoded server-side (see validator)
    reference_images: list[str] = Field(default_factory=list, max_length=MAX_REFERENCE_IMAGES)

    @field_validator("reference_images")
    @classmethod
    def _normalize_images(cls, images: list[str]) -> list[str]:
        """Decode, shrink and re-encode as JPEG - rejects anything that isn't a real image."""
        out = []
        for data_url in images:
            if not data_url.startswith("data:image/") or "," not in data_url:
                raise ValueError("reference images must be image data URLs")
            raw = base64.b64decode(data_url.split(",", 1)[1])
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            img.thumbnail((REFERENCE_PX, REFERENCE_PX))
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=80)
            out.append("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode())
        return out

    def describe(self) -> str:
        """Plain-text summary for the AI prompts."""
        refs = f", {len(self.reference_images)} reference image(s) attached" if self.reference_images else ""
        return f"space size = {self.space_size}, color mode = {self.color_mode}{refs}"

    def public(self) -> dict:
        """Echoed back to the frontend (without the image data)."""
        return {
            "space_size": self.space_size,
            "color_mode": self.color_mode,
            "reference_images": len(self.reference_images),
        }
