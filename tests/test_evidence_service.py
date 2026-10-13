"""Unit checks for photo evidence validation and vision analysis."""

import io
import json
import unittest

from PIL import Image

from services.evidence_service import (
    EvidenceService,
    EvidenceSizeError,
    EvidenceValidationError,
)
from services.ollama_service import OllamaError


def make_image_bytes(format="PNG", size=(100, 100), color="green"):
    """Create valid image bytes for testing."""
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


class FakeFileStorage:
    """Minimal file storage mock for testing."""
    def __init__(self, data, content_type="image/png"):
        self._data = data
        self.content_type = content_type
        self._pos = 0

    def seek(self, offset, whence=0):
        if whence == 0:
            self._pos = offset
        elif whence == 2:
            self._pos = len(self._data) + offset

    def tell(self):
        return self._pos

    def read(self):
        return self._data


class StubVisionOllama:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.received_prompt = None
        self.received_image = None

    def generate_with_image(self, prompt, image_base64, format_schema=None):
        self.received_prompt = prompt
        self.received_image = image_base64
        if self.error:
            raise self.error
        return self.response


class EvidenceServiceTests(unittest.TestCase):
    def service_for(self, response=None, error=None, max_size_mb=10):
        ollama = StubVisionOllama(response=response, error=error)
        return EvidenceService(ollama, max_size_mb=max_size_mb), ollama

    def test_valid_png_image_is_accepted(self):
        service, _ = self.service_for()
        data = make_image_bytes("PNG")
        file = FakeFileStorage(data, "image/png")
        result = service.validate_image(file)
        self.assertEqual(result, data)

    def test_valid_jpeg_image_is_accepted(self):
        service, _ = self.service_for()
        data = make_image_bytes("JPEG")
        file = FakeFileStorage(data, "image/jpeg")
        result = service.validate_image(file)
        self.assertEqual(result, data)

    def test_valid_webp_image_is_accepted(self):
        service, _ = self.service_for()
        data = make_image_bytes("WEBP")
        file = FakeFileStorage(data, "image/webp")
        result = service.validate_image(file)
        self.assertEqual(result, data)

    def test_unsupported_content_type_is_rejected(self):
        service, _ = self.service_for()
        data = make_image_bytes("PNG")
        file = FakeFileStorage(data, "image/gif")
        with self.assertRaises(EvidenceValidationError):
            service.validate_image(file)

    def test_corrupted_image_data_is_rejected(self):
        service, _ = self.service_for()
        file = FakeFileStorage(b"not an image", "image/png")
        with self.assertRaises(EvidenceValidationError):
            service.validate_image(file)

    def test_empty_file_is_rejected(self):
        service, _ = self.service_for()
        file = FakeFileStorage(b"", "image/png")
        with self.assertRaises(EvidenceValidationError):
            service.validate_image(file)

    def test_oversized_image_is_rejected(self):
        service, _ = self.service_for(max_size_mb=1)
        # Create a large image that exceeds 1MB when saved
        img = Image.new("RGB", (2000, 2000), "blue")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        if len(data) < 1024 * 1024:
            # Pad to exceed limit if needed
            data = data + b"\x00" * (1024 * 1024 - len(data) + 1)
        file = FakeFileStorage(data, "image/png")
        with self.assertRaises(EvidenceSizeError):
            service.validate_image(file)

    def test_valid_reflection_is_accepted(self):
        service, _ = self.service_for()
        result = service.validate_reflection("I noticed a bird singing.")
        self.assertEqual(result, "I noticed a bird singing.")

    def test_empty_reflection_is_rejected(self):
        service, _ = self.service_for()
        with self.assertRaises(EvidenceValidationError):
            service.validate_reflection("   ")

    def test_non_string_reflection_is_rejected(self):
        service, _ = self.service_for()
        with self.assertRaises(EvidenceValidationError):
            service.validate_reflection(123)

    def test_long_reflection_is_rejected(self):
        service, _ = self.service_for()
        with self.assertRaises(EvidenceValidationError):
            service.validate_reflection("a" * 501)

    def test_vision_analysis_success(self):
        response = json.dumps({
            "description": "A green leaf with visible veins.",
            "possible_identification": "",
            "observation": "Leaf veins transport water and nutrients.",
            "uncertainty": "Species cannot be determined from this image alone.",
        })
        service, ollama = self.service_for(response=response)
        data = make_image_bytes("PNG")
        result = service.analyze_image(data)
        self.assertEqual(result["description"], "A green leaf with visible veins.")
        self.assertEqual(result["possible_identification"], "")
        self.assertEqual(result["observation"], "Leaf veins transport water and nutrients.")
        self.assertEqual(result["uncertainty"], "Species cannot be determined from this image alone.")
        self.assertIsNotNone(ollama.received_image)

    def test_vision_analysis_ollama_error_is_preserved(self):
        service, _ = self.service_for(error=OllamaError("offline"))
        data = make_image_bytes("PNG")
        with self.assertRaises(OllamaError):
            service.analyze_image(data)

    def test_vision_analysis_malformed_json_raises_ollama_error(self):
        service, _ = self.service_for(response="not JSON")
        data = make_image_bytes("PNG")
        with self.assertRaises(OllamaError):
            service.analyze_image(data)

    def test_vision_analysis_non_dict_response_raises_ollama_error(self):
        service, _ = self.service_for(response='"just a string"')
        data = make_image_bytes("PNG")
        with self.assertRaises(OllamaError):
            service.analyze_image(data)


if __name__ == "__main__":
    unittest.main()
