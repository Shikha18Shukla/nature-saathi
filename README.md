# Nature Saathi

> An AI-powered outdoor learning companion that turns a walk into a real-world nature expedition.

Nature Saathi is designed to make the screen the shortest part of an outdoor learning experience. It creates phone-light outdoor expeditions with a local Ollama model.

## Requirements

- Python 3.9 or newer
- Ollama running locally, with the configured text model available

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

Open <http://127.0.0.1:5000>. The API health check is at <http://127.0.0.1:5000/api/health>.

Start Ollama and make sure the configured model is available. The initial default is `gemma3:4b`; check with `ollama list` and, if needed, run `ollama pull gemma3:4b`. Set `OLLAMA_MODEL` in `.env` to use another locally installed text model.

## Configuration

Copy `.env.example` to `.env` and change values as needed. The development server binds to `127.0.0.1` by default. Set `FLASK_DEBUG=true` only for local development.

## Mission generation API

`POST /api/missions/generate` accepts JSON:

```json
{
  "duration_minutes": 45,
  "difficulty": "Explorer",
  "interest": "Birds"
}
```

On success it returns an expedition JSON object containing its title, theme, requested duration and difficulty, intro, safety note, and mission list. Each mission has an id, title, task, observation cue, learning note, evidence type, and difficulty. Invalid requests return `400`; unavailable Ollama returns `503`; malformed, incomplete, or unsafe model output returns `502`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

The page lets people choose a duration, difficulty, and interest, then review the generated mission list. Starting an expedition shows one mission at a time with progress and a completion action, encouraging people to read, put the phone away, explore, return, and mark it complete. The active expedition is temporarily saved in the current browser tab's `sessionStorage` so a refresh can restore the run; closing the tab clears that temporary state. “Review What I Discovered” shows completed prompts only; no personal notes, uploads, or database are used.

Run the dependency-light mission-service checks with:

```powershell
python -m unittest discover -s tests -v
node tests/test_frontend_render.js
```

The frontend test uses a small mocked DOM to cover mission navigation, progress, completion, refresh recovery, and malformed mission data. It does not replace a visual browser test.
