"""Transport checks for the shared Ollama client using local HTTP only."""

import json
from io import BytesIO
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch
from urllib.error import HTTPError

from services.ollama_service import OllamaError, OllamaService


class OllamaServiceTests(unittest.TestCase):
    def test_generate_sends_json_schema_to_ollama(self):
        received = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers["Content-Length"])
                received.update(json.loads(self.rfile.read(length)))
                response = json.dumps({"response": '{"title":"Walk"}'}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)

            def log_message(self, *_args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        schema = {"type": "object", "required": ["title"]}
        try:
            result = OllamaService(f"http://127.0.0.1:{server.server_port}", "test-model").generate(
                "Make a walk", format_schema=schema
            )
            self.assertEqual(result, '{"title":"Walk"}')
            self.assertEqual(received["format"], schema)
            self.assertEqual(received["stream"], False)
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_unavailable_local_endpoint_raises_controlled_error(self):
        service = OllamaService("http://127.0.0.1:1", "test-model", timeout=0.5)
        with self.assertRaises(OllamaError):
            service.generate("Make a walk", format_schema={"type": "object"})

    def test_timeout_error_keeps_technical_detail(self):
        service = OllamaService("http://127.0.0.1:11434", "gemma3:4b", timeout=240)
        with patch("services.ollama_service.urlopen", side_effect=TimeoutError("timed out")):
            with self.assertRaisesRegex(OllamaError, "did not finish.*240 seconds"):
                service.generate("Make a walk")

    def test_ollama_http_error_includes_server_response(self):
        service = OllamaService("http://127.0.0.1:11434", "missing-model")
        error = HTTPError("http://127.0.0.1:11434/api/generate", 404, "Not Found", {}, BytesIO(b"model not found"))
        with patch("services.ollama_service.urlopen", side_effect=error):
            with self.assertRaisesRegex(OllamaError, "HTTP 404.*missing-model.*model not found"):
                service.generate("Make a walk")


if __name__ == "__main__":
    unittest.main()
