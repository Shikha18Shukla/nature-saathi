"""Photo evidence validation and optional local vision analysis.

This service handles image validation (type, size, actual image data) and
optional AI vision analysis through the local Ollama setup. It never persists
image data and never sends images to external services.
"""

import base64
import io
import json

from PIL import Image

from services.ollama_service import OllamaError


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}

VISION_ANALYSIS_PROMPT = """You are a careful nature observer looking at a photo taken during an outdoor learning expedition.

Describe what you see in the image. Return only one JSON object with these fields:
- "description": A neutral, concise description of what is visibly present (1-2 sentences).
- "possible_identification": A possible identification of the main subject, or an empty string if uncertain. Never claim certainty without clear evidence.
- "observation": A short observation or learning point about what the image shows.
- "uncertainty": A note about any ambiguity or uncertainty in the identification.

Rules:
- Never identify an exact species unless the image shows unmistakable, diagnostic features.
- Never say a plant, mushroom, insect, or animal is safe to touch or eat.
- Never identify people in the image.
- Be honest when the image is unclear or the subject is ambiguous.
- Keep each field under 80 characters.
"""

VISION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "possible_identification": {"type": "string"},
        "observation": {"type": "string"},
        "uncertainty": {"type": "string"},
    },
    "required": ["description", "possible_identification", "observation", "uncertainty"],
    "additionalProperties": False,
}


class EvidenceValidationError(ValueError):
    """The uploaded file is not a valid image."""


class EvidenceSizeError(ValueError):
    """The uploaded file exceeds the size limit."""


class EvidenceService:
    def __init__(self, ollama_service, max_size_mb=10, max_reflection_length=500):
        self.ollama_service = ollama_service
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self.max_reflection_length = max_reflection_length

    def validate_image(self, file_storage):
        """Validate file type, size, and actual image data.

        Returns the image bytes if valid. Raises EvidenceValidationError or
        EvidenceSizeError on failure.
        """
        # Check file size
        file_storage.seek(0, io.SEEK_END)
        size = file_storage.tell()
        file_storage.seek(0)
        if size == 0:
            raise EvidenceValidationError("The uploaded file is empty.")
        if size > self.max_size_bytes:
            raise EvidenceSizeError(
                f"Image must be under {self.max_size_bytes // (1024 * 1024)} MB."
            )

        # Check content type header
        content_type = file_storage.content_type or ""
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise EvidenceValidationError(
                "Only JPEG, PNG, and WebP images are supported."
            )

        # Read and validate actual image data using Pillow
        image_bytes = file_storage.read()
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                img.verify()
        except Exception as exc:
            raise EvidenceValidationError(
                "The file is not a valid image."
            ) from exc

        # Re-open to check format (verify() closes the file object)
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                if img.format not in ALLOWED_IMAGE_FORMATS:
                    raise EvidenceValidationError(
                        "Only JPEG, PNG, and WebP images are supported."
                    )
        except EvidenceValidationError:
            raise
        except Exception as exc:
            raise EvidenceValidationError(
                "The file is not a valid image."
            ) from exc

        return image_bytes

    def validate_reflection(self, text):
        """Validate reflection text. Returns cleaned text or raises EvidenceValidationError."""
        if not isinstance(text, str):
            raise EvidenceValidationError("Reflection must be text.")
        cleaned = text.strip()
        if not cleaned:
            raise EvidenceValidationError(
                "Please write a short reflection before submitting."
            )
        if len(cleaned) > self.max_reflection_length:
            raise EvidenceValidationError(
                f"Reflection must be under {self.max_reflection_length} characters."
            )
        return cleaned

    def analyze_image(self, image_bytes):
        """Analyze image using local Ollama vision model.

        Returns a structured dict with description, possible_identification,
        observation, and uncertainty fields. Raises OllamaError on failure.
        """
        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        try:
            raw_response = self.ollama_service.generate_with_image(
                VISION_ANALYSIS_PROMPT,
                base64_image,
                format_schema=VISION_RESPONSE_SCHEMA,
            )
        except OllamaError:
            raise

        try:
            parsed = json.loads(raw_response)
        except (json.JSONDecodeError, TypeError) as exc:
            raise OllamaError(
                "Vision model returned an invalid response."
            ) from exc

        if not isinstance(parsed, dict):
            raise OllamaError("Vision model returned an invalid response.")

        return {
            "description": str(parsed.get("description", "")),
            "possible_identification": str(parsed.get("possible_identification", "")),
            "observation": str(parsed.get("observation", "")),
            "uncertainty": str(parsed.get("uncertainty", "")),
        }
