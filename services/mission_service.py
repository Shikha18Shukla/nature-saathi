"""Mission generation and validation, independent of Flask routes."""

import json
import re

from prompts.mission_prompts import MISSION_GENERATION_PROMPT
from services.ollama_service import OllamaError


DURATIONS = (15, 30, 45, 60)
DIFFICULTIES = ("Beginner", "Explorer", "Naturalist")
INTERESTS = (
    "Leaves", "Flowers", "Birds", "Insects", "Trees", "Soil", "Rocks",
    "Sounds", "Colors", "Textures", "Animal Signs", "Mixed Nature",
)
EVIDENCE_TYPES = ("observation", "photo", "count", "sound")

MISSION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "theme": {"type": "string", "enum": list(INTERESTS)},
        "duration_minutes": {"type": "integer", "enum": list(DURATIONS)},
        "difficulty": {"type": "string", "enum": list(DIFFICULTIES)},
        "intro": {"type": "string"},
        "safety_note": {"type": "string"},
        "missions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "title": {"type": "string"},
                    "task": {"type": "string"},
                    "observe": {"type": "string"},
                    "learn": {"type": "string"},
                    "evidence_type": {"type": "string", "enum": list(EVIDENCE_TYPES)},
                    "difficulty": {"type": "integer", "minimum": 1, "maximum": 3},
                },
                "required": ["id", "title", "task", "observe", "learn", "evidence_type", "difficulty"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "theme", "duration_minutes", "difficulty", "intro", "safety_note", "missions"],
    "additionalProperties": False,
}


class MissionGenerationError(RuntimeError):
    """Base exception for controlled mission-generation failures."""

    code = "mission_generation_failed"


class MissionValidationError(MissionGenerationError):
    """The model response was not valid or safe expedition data."""

    code = "invalid_mission_response"


class MissionInputError(ValueError):
    """The user's duration, difficulty, or interest is not supported."""


_UNSAFE_ACTIONS = re.compile(
    r"\b(?:(?:eat|taste|sample|consume|ingest|touch|handle|pick|pluck|collect|"
    r"approach|feed|chase|disturb|enter|trespass|climb)\w*|"
    r"(?:(?:get|move|go|walk)\s+)?(?:close|closer)\s+to|(?:go|move|walk)\s+(?:near|toward))\b"
    r"[^.!?\n]{0,55}\b(?:unknown|wild|unfamiliar|poisonous|dangerous|private|restricted|"
    r"unsafe|closed|plant|plants|leaf|leaves|berry|berries|mushroom|flower|flowers|fruit|seed|"
    r"animal|animals|wildlife|insect|insects|nest|nests|"
    r"tree|trees|fence|cliff|rock|rocks)\b",
    re.IGNORECASE,
)
_UNSAFE_DRINKING = re.compile(
    r"\b(?:drink|sip|taste|sample)\w*\b[^.!?\n]{0,55}\b(?:unknown|untreated|unfiltered|"
    r"standing|outdoor)\s+water\b|\b(?:drink|sip|taste|sample)\w*\b[^.!?\n]{0,55}\b"
    r"(?:stream|pond|river|lake|puddle|ditch|canal|spring)\b",
    re.IGNORECASE,
)
_NEGATION = re.compile(r"\b(?:do\s+not|don['’]t|never|avoid|without|stay\s+away\s+from)\b", re.IGNORECASE)
_PHONE_AWAY = re.compile(
    r"\b(?:put\s+(?:your\s+)?phone\s+away|put\s+away\s+(?:your\s+)?phone|"
    r"set\s+(?:your\s+)?phone\s+aside|keep\s+(?:your\s+)?phone\s+(?:away|in\s+your\s+pocket))\b",
    re.IGNORECASE,
)


def _validate_request(duration_minutes, difficulty, interest):
    if type(duration_minutes) is not int or duration_minutes not in DURATIONS:
        raise MissionInputError("Choose a duration of 15, 30, 45, or 60 minutes.")
    if difficulty not in DIFFICULTIES:
        raise MissionInputError("Choose Beginner, Explorer, or Naturalist difficulty.")
    if interest not in INTERESTS:
        raise MissionInputError("Choose one of the available nature interests.")


def _required_text(container, key, location, max_length=500):
    value = container.get(key) if isinstance(container, dict) else None
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > max_length:
        raise MissionValidationError(f"{location}.{key} must be a non-empty string under {max_length} characters.")
    return value.strip()


def _check_safety(text, location):
    matches = list(_UNSAFE_ACTIONS.finditer(text)) + list(_UNSAFE_DRINKING.finditer(text))
    for match in matches:
        prefix = text[:match.start()]
        preceding_words = re.split(r"[.!?;,\n]", prefix)[-1][-45:]
        if not _NEGATION.search(preceding_words):
            raise MissionValidationError(f"Unsafe instruction found in {location}.")


def validate_mission_response(data, duration_minutes, difficulty, interest):
    """Validate model output types, required values, and safety constraints."""
    if not isinstance(data, dict):
        raise MissionValidationError("Response must be a JSON object.")

    required = {"title", "theme", "duration_minutes", "difficulty", "intro", "safety_note", "missions"}
    missing = required - data.keys()
    if missing:
        raise MissionValidationError(f"Response is missing required fields: {', '.join(sorted(missing))}.")
    if data.keys() - required:
        raise MissionValidationError("Response contains unsupported fields.")

    result = {
        "title": _required_text(data, "title", "response", 100),
        "theme": _required_text(data, "theme", "response", 40),
        "duration_minutes": data["duration_minutes"],
        "difficulty": _required_text(data, "difficulty", "response", 20),
        "intro": _required_text(data, "intro", "response", 400),
        "safety_note": _required_text(data, "safety_note", "response", 300),
    }
    if result["theme"] != interest:
        raise MissionValidationError("Response theme does not match the selected interest.")
    if type(result["duration_minutes"]) is not int or result["duration_minutes"] != duration_minutes:
        raise MissionValidationError("Response duration does not match the selected duration.")
    if result["difficulty"] != difficulty:
        raise MissionValidationError("Response difficulty does not match the selected difficulty.")

    missions = data["missions"]
    if not isinstance(missions, list) or not 3 <= len(missions) <= 6:
        raise MissionValidationError("Response must contain between 3 and 6 missions.")

    validated_missions = []
    seen_ids = set()
    for index, mission in enumerate(missions, start=1):
        location = f"missions[{index - 1}]"
        if not isinstance(mission, dict):
            raise MissionValidationError(f"{location} must be an object.")
        mission_fields = {"id", "title", "task", "observe", "learn", "evidence_type", "difficulty"}
        if mission_fields - mission.keys():
            raise MissionValidationError(f"{location} is missing required fields.")
        if mission.keys() - mission_fields:
            raise MissionValidationError(f"{location} contains unsupported fields.")
        mission_id = mission["id"]
        if type(mission_id) is not int or mission_id < 1 or mission_id in seen_ids:
            raise MissionValidationError(f"{location}.id must be a unique positive integer.")
        seen_ids.add(mission_id)
        evidence_type = mission["evidence_type"]
        if evidence_type not in EVIDENCE_TYPES:
            raise MissionValidationError(f"{location}.evidence_type is unsupported.")
        level = mission["difficulty"]
        if type(level) is not int or level not in (1, 2, 3):
            raise MissionValidationError(f"{location}.difficulty must be 1, 2, or 3.")

        checked_mission = {"id": mission_id}
        for key, max_length in (("title", 90), ("task", 400), ("observe", 300), ("learn", 300)):
            checked_mission[key] = _required_text(mission, key, location, max_length)
            _check_safety(checked_mission[key], f"{location}.{key}")
        checked_mission["evidence_type"] = evidence_type
        checked_mission["difficulty"] = level
        validated_missions.append(checked_mission)

    _check_safety(result["intro"], "response.intro")
    _check_safety(result["safety_note"], "response.safety_note")
    if not any(_PHONE_AWAY.search(mission["task"]) for mission in validated_missions):
        raise MissionValidationError("At least one mission must invite the user to put their phone away.")
    result["missions"] = validated_missions
    return result


class MissionGenerationService:
    def __init__(self, ollama_service):
        self.ollama_service = ollama_service

    def generate(self, duration_minutes, difficulty, interest):
        _validate_request(duration_minutes, difficulty, interest)
        prompt = MISSION_GENERATION_PROMPT.format(
            duration_minutes=duration_minutes,
            difficulty=difficulty,
            interest=interest,
        )
        try:
            raw_response = self.ollama_service.generate(prompt, format_schema=MISSION_RESPONSE_SCHEMA)
        except OllamaError:
            raise

        try:
            parsed = json.loads(raw_response)
        except (TypeError, json.JSONDecodeError) as exc:
            raise MissionValidationError("Ollama returned invalid JSON. Please try generating the expedition again.") from exc
        return validate_mission_response(parsed, duration_minutes, difficulty, interest)
