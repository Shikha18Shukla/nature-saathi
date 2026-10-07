"""Reusable client for Ollama's local generate API.

Application services use this client so Ollama transport details stay out of
Flask routes and feature logic.
"""

import json
import socket
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class OllamaError(RuntimeError):
    """Raised when Ollama is unreachable or returns an invalid response."""


class OllamaService:
    def __init__(self, base_url, model, timeout=240):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def generate(self, prompt, format_schema=None):
        """Generate text from a prompt using the configured local model."""
        payload_data = {"model": self.model, "prompt": prompt, "stream": False}
        if format_schema is not None:
            payload_data["format"] = format_schema
        payload = json.dumps(payload_data).encode("utf-8")
        request = Request(
            f"{self.base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            try:
                response_detail = exc.read().decode("utf-8", errors="replace").strip()
            except OSError:
                response_detail = ""
            detail = f"Ollama returned HTTP {exc.code} ({exc.reason}) for model {self.model}."
            if response_detail:
                detail += f" Response: {response_detail[:500]}"
            raise OllamaError(detail) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise OllamaError(
                f"Ollama did not finish the request for model {self.model} within {self.timeout:g} seconds."
            ) from exc
        except URLError as exc:
            reason = exc.reason
            raise OllamaError(
                f"Could not reach Ollama at {self.base_url}: {type(reason).__name__}: {reason}"
            ) from exc
        except OSError as exc:
            raise OllamaError(
                f"Ollama request to {self.base_url} failed: {type(exc).__name__}: {exc}"
            ) from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise OllamaError("Ollama returned an invalid response.") from exc

        text = result.get("response") if isinstance(result, dict) else None
        if not isinstance(text, str):
            raise OllamaError("Ollama response did not contain generated text.")
        return text
