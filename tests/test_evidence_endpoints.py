"""Integration checks for photo evidence and vision analysis endpoints."""

import io
import json
import unittest

from PIL import Image

from app import create_app
from services.evidence_service import EvidenceService
from services.mission_service import MissionGenerationService


def make_image_bytes(format="PNG", size=(100, 100), color="green"):
    """Create valid image bytes for testing."""
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


class StubOllama:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def generate(self, prompt, format_schema=None):
        if self.error:
            raise self.error
        return self.response


class StubVisionOllama:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def generate_with_image(self, prompt, image_base64, format_schema=None):
        if self.error:
            from services.ollama_service import OllamaError
            raise OllamaError(str(self.error))
        return self.response


class EvidenceEndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(mission_service=MissionGenerationService(StubOllama(response="{}")))
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def upload_image(self, data=None, content_type="image/png", filename="test.png"):
        if data is None:
            data = make_image_bytes("PNG")
        return {"file": (io.BytesIO(data), filename, content_type)}

    def test_valid_photo_evidence_returns_200(self):
        response = self.client.post(
            "/api/evidence/photo",
            data=self.upload_image(),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")

    def test_missing_file_returns_400(self):
        response = self.client.post(
            "/api/evidence/photo",
            data={},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"]["code"], "missing_file")

    def test_unsupported_file_type_returns_400(self):
        response = self.client.post(
            "/api/evidence/photo",
            data=self.upload_image(b"not an image", "image/gif", "test.gif"),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"]["code"], "invalid_image")

    def test_corrupted_image_returns_400(self):
        response = self.client.post(
            "/api/evidence/photo",
            data=self.upload_image(b"corrupted data", "image/png", "test.png"),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"]["code"], "invalid_image")

    def test_oversized_image_returns_413(self):
        # Temporarily reduce max size for testing
        original = self.app.extensions["evidence_service"].max_size_bytes
        self.app.extensions["evidence_service"].max_size_bytes = 10  # 10 bytes
        try:
            response = self.client.post(
                "/api/evidence/photo",
                data=self.upload_image(),
                content_type="multipart/form-data",
            )
            self.assertEqual(response.status_code, 413)
            data = response.get_json()
            self.assertEqual(data["error"]["code"], "file_too_large")
        finally:
            self.app.extensions["evidence_service"].max_size_bytes = original

    def test_valid_reflection_returns_200(self):
        response = self.client.post(
            "/api/evidence/reflection",
            data=json.dumps({"text": "I noticed a bird singing."}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")

    def test_empty_reflection_returns_400(self):
        response = self.client.post(
            "/api/evidence/reflection",
            data=json.dumps({"text": "   "}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"]["code"], "invalid_reflection")

    def test_missing_text_field_returns_400(self):
        response = self.client.post(
            "/api/evidence/reflection",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"]["code"], "invalid_reflection")

    def test_vision_analysis_success_returns_200(self):
        vision_response = json.dumps({
            "description": "A green leaf.",
            "possible_identification": "",
            "observation": "Leaf veins are visible.",
            "uncertainty": "Species unknown.",
        })
        self.app.extensions["evidence_service"].ollama_service = StubVisionOllama(response=vision_response)
        response = self.client.post(
            "/api/vision/analyze",
            data=self.upload_image(),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["analysis"]["description"], "A green leaf.")

    def test_vision_analysis_unavailable_returns_200_with_unavailable_status(self):
        self.app.extensions["evidence_service"].ollama_service = StubVisionOllama(
            error=Exception("connection refused")
        )
        response = self.client.post(
            "/api/vision/analyze",
            data=self.upload_image(),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "unavailable")

    def test_vision_analysis_malformed_response_returns_unavailable(self):
        self.app.extensions["evidence_service"].ollama_service = StubVisionOllama(
            response="not JSON"
        )
        response = self.client.post(
            "/api/vision/analyze",
            data=self.upload_image(),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "unavailable")

    def test_vision_analysis_invalid_image_returns_400(self):
        response = self.client.post(
            "/api/vision/analyze",
            data=self.upload_image(b"corrupted", "image/png", "test.png"),
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"]["code"], "invalid_image")


if __name__ == "__main__":
    unittest.main()
