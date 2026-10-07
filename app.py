"""Flask entry point for Nature Saathi."""

from flask import Flask, current_app, jsonify, render_template, request

from config import Settings
from services.mission_service import (
    MissionGenerationError,
    MissionGenerationService,
    MissionInputError,
    MissionValidationError,
)
from services.ollama_service import OllamaError, OllamaService


def create_app(settings_class=Settings, mission_service=None):
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_object(settings_class)
    if mission_service is None:
        ollama_service = OllamaService(
            app.config["OLLAMA_BASE_URL"],
            app.config["OLLAMA_MODEL"],
            timeout=app.config["OLLAMA_TIMEOUT_SECONDS"],
        )
        mission_service = MissionGenerationService(ollama_service)
    app.extensions["mission_service"] = mission_service

    @app.get("/")
    def home():
        return render_template("index.html", app_name=app.config["APP_NAME"])

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service=app.config["APP_NAME"])

    @app.post("/api/missions/generate")
    def generate_mission():
        payload = request.get_json(silent=True)
        expected_fields = {"duration_minutes", "difficulty", "interest"}
        if not isinstance(payload, dict):
            return jsonify(error={
                "code": "invalid_request",
                "message": "Send a JSON object with duration_minutes, difficulty, and interest.",
            }), 400
        if payload.keys() != expected_fields:
            missing = sorted(expected_fields - payload.keys())
            unknown = sorted(payload.keys() - expected_fields)
            details = []
            if missing:
                details.append(f"Missing fields: {', '.join(missing)}.")
            if unknown:
                details.append(f"Unsupported fields: {', '.join(unknown)}.")
            return jsonify(error={"code": "invalid_request", "message": " ".join(details)}), 400

        try:
            expedition = app.extensions["mission_service"].generate(
                payload["duration_minutes"], payload["difficulty"], payload["interest"]
            )
        except MissionInputError as exc:
            return jsonify(error={"code": "invalid_request", "message": str(exc)}), 400
        except OllamaError:
            current_app.logger.exception("Ollama mission-generation request failed")
            return jsonify(error={
                "code": "ollama_unavailable",
                "message": "Your local nature guide is taking a break. Check that Ollama is running and try again.",
            }), 503
        except MissionValidationError as exc:
            current_app.logger.exception("Mission model response was rejected: %s", exc)
            return jsonify(error={
                "code": "invalid_mission_response",
                "message": "The local model returned a response we could not use. Please try again.",
            }), 502
        except MissionGenerationError as exc:
            current_app.logger.warning("Mission generation failed: %s", exc)
            return jsonify(error={
                "code": "mission_generation_failed",
                "message": "We could not prepare that expedition. Please try again.",
            }), 502

        return jsonify(expedition), 200

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host=app.config["HOST"], port=app.config["PORT"], debug=app.config["DEBUG"])
