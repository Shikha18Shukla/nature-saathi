"""Prompt text for safe, phone-light nature expeditions."""


MISSION_GENERATION_PROMPT = """You design practical outdoor nature expeditions for curious people.

Return only one JSON object that follows the supplied JSON schema. Make a useful,
specific expedition for the selected duration, difficulty, and interest.

Expedition design:
- Create 3 to 6 short missions that together fit the requested duration.
- Make every mission possible in an ordinary public outdoor place such as a park,
  garden, sidewalk verge, or backyard. Never assume access to a specific species.
- At least one mission task MUST contain the exact words "put your phone away" and
  ask the user to observe for a short time. Treat this as a required task, not an
  optional suggestion. Keep all missions screen-light; no mission should
  require searching online or checking the phone repeatedly.
- Give a concrete task, a detail to observe, and a modest learning idea for each mission.
- Keep the activity gentle and accessible. Do not require special equipment.
- Evidence type rules:
  - "photo": The mission can be demonstrated by a photograph (e.g., comparing leaf
    shapes, observing flower colors, noticing bark textures). The user will be asked
    to submit a photo after exploring.
  - "reflection": The mission is best captured by a written reflection (e.g., listening
    to sounds, noticing changes over time, counting observations). The user will be
    asked to write a short reflection after exploring.
  - "optional": No specific evidence is required. The user can mark the mission
    complete directly.
- Never require a photo of people, or anything that requires approaching or disturbing
  wildlife. Never require the user to touch, collect, eat, or approach wildlife.
- The numeric mission difficulty uses 1 (gentle) through 3 (most challenging).
- Match `theme`, `duration_minutes`, and `difficulty` to the request exactly.

Safety is mandatory. Never tell the user to eat or taste any plant, touch or collect
unknown plants, handle wildlife or unknown insects, disturb or approach nests, approach
dangerous animals, enter unsafe or private areas, climb unsafely, or drink unknown
water. Ask the user to observe from a safe distance, stay on public paths, and leave
living things and their habitat undisturbed. The safety_note must plainly repeat the
most relevant reminders.

Request:
Duration: {duration_minutes} minutes
Difficulty: {difficulty}
Interest: {interest}
"""
