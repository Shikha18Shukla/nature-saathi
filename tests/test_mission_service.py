"""Unit checks for mission generation using a fake local model response."""

import json
import unittest

from services.mission_service import (
    MissionGenerationService,
    MissionInputError,
    MissionValidationError,
)
from services.ollama_service import OllamaError


def valid_expedition():
    return {
        "title": "The Listening Walk",
        "theme": "Birds",
        "duration_minutes": 45,
        "difficulty": "Explorer",
        "intro": "Take a gentle walk and notice the birds sharing your everyday outdoor space.",
        "safety_note": "Stay on public paths and observe from a distance. Do not touch wildlife, plants, or nests, and do not drink outdoor water.",
        "missions": [
            {
                "id": 1,
                "title": "A quiet minute",
                "task": "Pause somewhere safe, put your phone away for two minutes, and listen.",
                "observe": "Notice calls, pauses, and sounds coming from different directions.",
                "learn": "Birds use calls to communicate, though a sound alone may not identify a species.",
                "evidence_type": "sound",
                "difficulty": 1,
            },
            {
                "id": 2,
                "title": "Count the movement",
                "task": "From the path, count birds you can see without approaching them.",
                "observe": "Look for movement in open areas and high branches.",
                "learn": "A count is a snapshot of activity, not a measure of every bird nearby.",
                "evidence_type": "count",
                "difficulty": 2,
            },
            {
                "id": 3,
                "title": "Find a pattern",
                "task": "Watch from a comfortable distance and notice one repeated movement.",
                "observe": "Look for hopping, gliding, or a bird returning to the same perch.",
                "learn": "Repeating an observation can reveal how an animal uses its surroundings.",
                "evidence_type": "observation",
                "difficulty": 2,
            },
        ],
    }


class StubOllama:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.received_schema = None

    def generate(self, prompt, format_schema=None):
        self.received_schema = format_schema
        if self.error:
            raise self.error
        return self.response


class MissionGenerationServiceTests(unittest.TestCase):
    def service_for(self, response):
        client = StubOllama(response=json.dumps(response))
        return MissionGenerationService(client), client

    def test_valid_structured_response_is_returned(self):
        service, client = self.service_for(valid_expedition())
        result = service.generate(45, "Explorer", "Birds")
        self.assertEqual(result["missions"][0]["evidence_type"], "sound")
        self.assertEqual(client.received_schema["type"], "object")
        self.assertIn("missions", client.received_schema["properties"])

    def test_invalid_json_is_rejected(self):
        service = MissionGenerationService(StubOllama(response="not JSON"))
        with self.assertRaises(MissionValidationError):
            service.generate(45, "Explorer", "Birds")

    def test_missing_required_field_is_rejected(self):
        response = valid_expedition()
        del response["intro"]
        service, _ = self.service_for(response)
        with self.assertRaisesRegex(MissionValidationError, "intro"):
            service.generate(45, "Explorer", "Birds")

    def test_unsafe_task_is_rejected(self):
        response = valid_expedition()
        response["missions"][0]["task"] = "Touch the unknown plant beside the path."
        service, _ = self.service_for(response)
        with self.assertRaises(MissionValidationError):
            service.generate(45, "Explorer", "Birds")

    def test_unsafe_approach_to_nest_is_rejected(self):
        response = valid_expedition()
        response["missions"][0]["task"] = "Move closer to a nest to hear the young birds."
        service, _ = self.service_for(response)
        with self.assertRaises(MissionValidationError):
            service.generate(45, "Explorer", "Birds")

    def test_negative_safety_sentence_does_not_hide_later_unsafe_instruction(self):
        response = valid_expedition()
        response["missions"][0]["task"] = "Avoid touching plants. Touch the unknown plant beside the path."
        service, _ = self.service_for(response)
        with self.assertRaises(MissionValidationError):
            service.generate(45, "Explorer", "Birds")

    def test_drinking_from_stream_is_rejected_but_bottled_water_is_allowed(self):
        response = valid_expedition()
        response["missions"][0]["task"] = "Drink water from the stream beside the trail."
        service, _ = self.service_for(response)
        with self.assertRaises(MissionValidationError):
            service.generate(45, "Explorer", "Birds")

        response["missions"][0]["task"] = "Put your phone away for a moment, then bring a water bottle and drink bottled water before you listen."
        service, _ = self.service_for(response)
        self.assertEqual(service.generate(45, "Explorer", "Birds")["theme"], "Birds")

    def test_mission_set_without_phone_away_invitation_is_rejected(self):
        response = valid_expedition()
        response["missions"][0]["task"] = "Pause somewhere safe for two minutes and listen."
        service, _ = self.service_for(response)
        with self.assertRaisesRegex(MissionValidationError, "phone away"):
            service.generate(45, "Explorer", "Birds")

    def test_ollama_unavailable_error_is_preserved(self):
        service = MissionGenerationService(StubOllama(error=OllamaError("offline")))
        with self.assertRaises(OllamaError):
            service.generate(45, "Explorer", "Birds")

    def test_unsupported_duration_is_rejected_before_model_call(self):
        client = StubOllama(response=json.dumps(valid_expedition()))
        service = MissionGenerationService(client)
        with self.assertRaises(MissionInputError):
            service.generate(20, "Explorer", "Birds")
        self.assertIsNone(client.received_schema)


if __name__ == "__main__":
    unittest.main()
