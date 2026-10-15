"""What Can I Make? — Flask server: serves the frontend and generates recipes live with an LLM.

Uses Google Gemini (free tier) when GEMINI_API_KEY is set, otherwise Claude via ANTHROPIC_API_KEY.
"""

import json
import logging
import os
from typing import Literal

import anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel

load_dotenv()

GEMINI_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
PROVIDER = "gemini" if GEMINI_KEY else "anthropic"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("ANTHROPIC_EFFORT", "low")
# Tried in order until one works on the account (free-tier availability differs per model)
GEMINI_MODELS = [os.environ["GEMINI_MODEL"]] if os.environ.get("GEMINI_MODEL") else \
    ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]


class AIError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status

app = Flask(__name__, static_folder="static", static_url_path="")
# Sites allowed to call the API from the browser (the GitHub Pages frontend)
ALLOWED_ORIGINS = {o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "https://chenbaslo.github.io").split(",") if o.strip()}


@app.after_request
def cors(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Vary"] = "Origin"
    return response
log = logging.getLogger("wcim")
logging.basicConfig(level=logging.INFO)


# ---------- Structured output schema (what Claude must return) ----------

class Ingredient(BaseModel):
    name: str
    quantity: str
    # Exact name of the user's kitchen/pantry item this comes from, or "" if the user does NOT have it.
    from_kitchen_item: str


class Recipe(BaseModel):
    name: str
    emoji: str
    description: str
    time_minutes: int
    difficulty: Literal["Easy", "Medium", "Hard"]
    servings: int
    ingredients: list[Ingredient]
    use_soon_used: list[str]
    equipment: list[str]
    basic_tools: list[str]
    equipment_note: str
    steps: list[str]
    diet_tags: list[str]
    why_it_works: str


class RecipeSet(BaseModel):
    recipes: list[Recipe]


# ---------- Prompt ----------

SYSTEM_PROMPT = """You are the recipe engine of "What Can I Make?", an app that tells people what they can cook right now with what they actually have at home.

You will receive the user's kitchen as JSON and must create exactly 3 original recipes.

Honesty about ingredients (the most important rule):
- The user has ONLY the ingredients, spices and condiments listed. Never assume anything else is available — not salt, not oil, not butter — unless it is listed. Water is always available.
- For every ingredient, set `from_kitchen_item` to the EXACT name of the matching item from the user's lists (copy it character for character, e.g. "Tomato", "Olive oil"). For water use "Water". If the user does not have it, set `from_kitchen_item` to "" — that marks it as missing.
- Strongly prefer recipes made entirely from what the user has. Add a missing ingredient only if it is genuinely necessary, and never more than 2 missing ingredients per recipe. At least 2 of the 3 recipes should need nothing missing when the kitchen allows it.
- You do not need to use every ingredient. Never build absurd combinations just to use things up — every recipe must be realistic and appetizing.

Hard constraints (never violate):
- Equipment: `equipment` may only contain names from the user's equipment list, copied exactly. Do not require any other appliance. Basic hand tools (knife, cutting board, bowls, pan, pot, baking tray, spatula, whisk, grater) go in `basic_tools`. If a dish would classically use an appliance the user lacks, adapt it to what they have and explain the adaptation in `equipment_note` (otherwise leave it "").
- Time: `time_minutes` is the total active + passive time and must be <= the maximum cooking time.
- Diet: respect the diet completely (vegetarian: no meat or fish; vegan: no animal products incl. eggs, dairy, honey, mayonnaise; gluten-free: no wheat, pasta, bread, flour, couscous, regular noodles, regular soy sauce or other gluten sources). Ignore kitchen items that conflict with the diet.
- Difficulty: if Easy is requested, every recipe must be Easy; if Medium, Easy or Medium.
- Scale quantities for the requested number of servings and set `servings` to it.

Use Soon items are about to expire. Prioritize them strongly, especially in "use_what_i_have" mode. `use_soon_used` lists the Use Soon items (exact names) the recipe uses.

Recipe modes:
- practical: simple, realistic everyday lunches/dinners someone would actually make tonight.
- creative: more surprising, interesting ideas and flavor pairings — still delicious and doable.
- use_what_i_have: use as many of the user's ingredients as sensibly possible to reduce food waste, with Use Soon items used in every recipe where reasonable.

Make the 3 recipes clearly different from each other (different dish styles / techniques). If a list of recipes to avoid is given, create different dishes.

Field guidance: `emoji` is one food emoji; `description` is one appetizing sentence; `steps` are clear, concise instructions with times and heat levels; `diet_tags` are short labels that truly apply (e.g. "Vegetarian", "Vegan", "Gluten-free", "High-protein", "Dairy-free"); `why_it_works` is 1–2 sentences on why the combination works."""

MODE_NAMES = {"practical": "practical", "creative": "creative", "use_what_i_have": "use_what_i_have"}

MEAT_FISH = {"chicken", "ground beef", "tuna", "salmon", "beef", "pork", "bacon", "ham", "sausage", "shrimp", "fish", "turkey", "lamb", "anchovies"}
ANIMAL = MEAT_FISH | {"eggs", "egg", "milk", "cream", "butter", "cheese", "parmesan", "mozzarella", "honey", "mayonnaise", "yogurt"}
GLUTEN = {"pasta", "bread", "flour", "tortillas", "couscous", "noodles", "soy sauce", "oats"}
# Words that mark a plant-based / gluten-free variant ("plant-based milk", "rice noodles", "corn tortillas")
DIET_SAFE_WORDS = ("plant", "vegan", "almond", "oat milk", "soy milk", "coconut", "peanut", "dairy-free",
                   "gluten-free", "tamari", "rice noodle", "rice flour", "corn tortilla", "chickpea flour", "egg-free")

client = None


def get_client():
    global client
    if client is None:
        client = anthropic.Anthropic()
    return client


def clean_list(value, limit=80):
    if not isinstance(value, list):
        return []
    out, seen = [], set()
    for v in value:
        if isinstance(v, str) and v.strip() and v.strip().lower() not in seen:
            seen.add(v.strip().lower())
            out.append(v.strip()[:60])
    return out[:limit]


def parse_request(data):
    max_time = data.get("max_time")
    return {
        "ingredients": clean_list(data.get("ingredients")),
        "use_soon": clean_list(data.get("use_soon")),
        "pantry": clean_list(data.get("pantry")),
        "equipment": clean_list(data.get("equipment"), 20),
        "max_time": int(max_time) if isinstance(max_time, (int, float)) and max_time > 0 else None,
        "difficulty": data.get("difficulty") if data.get("difficulty") in ("Easy", "Medium") else "Anything",
        "diet": data.get("diet") if data.get("diet") in ("Vegetarian", "Vegan", "Gluten-free") else "Anything",
        "servings": max(1, min(12, int(data.get("servings") or 2))),
        "mode": MODE_NAMES.get(data.get("mode"), "practical"),
        "avoid": clean_list(data.get("avoid"), 30),
    }


def build_user_message(k):
    payload = {
        "ingredients": k["ingredients"],
        "use_soon_ingredients": k["use_soon"],
        "spices_and_condiments": k["pantry"],
        "equipment": k["equipment"],
        "max_cooking_time_minutes": k["max_time"] or "no limit",
        "difficulty": k["difficulty"],
        "diet": k["diet"],
        "servings": k["servings"],
        "mode": k["mode"],
    }
    text = "Here is my kitchen:\n" + json.dumps(payload, indent=2)
    if k["avoid"]:
        text += "\n\nI already saw these ideas — give me different dishes: " + ", ".join(k["avoid"])
    return text + "\n\nWhat can I make? Give me 3 recipes."


# ---------- Server-side verification (never trust the model blindly) ----------

def problems_with(recipe, k):
    issues = []
    equipment = {e.lower() for e in k["equipment"]}
    for e in recipe["equipment"]:
        if e.lower() not in equipment:
            issues.append(f"uses unavailable equipment '{e}'")
    if k["max_time"] and recipe["time_minutes"] > k["max_time"]:
        issues.append(f"takes {recipe['time_minutes']} min (> {k['max_time']})")
    if k["difficulty"] == "Easy" and recipe["difficulty"] != "Easy":
        issues.append("not Easy")
    if k["difficulty"] == "Medium" and recipe["difficulty"] == "Hard":
        issues.append("too hard")
    banned = {"Vegetarian": MEAT_FISH, "Vegan": ANIMAL, "Gluten-free": GLUTEN}.get(k["diet"], set())
    for ing in recipe["ingredients"]:
        names = {ing["name"].lower(), ing["from_kitchen_item"].lower()}
        if any(safe in n for safe in DIET_SAFE_WORDS for n in names):
            continue
        if any(b == n or n.startswith(b + " ") or n.endswith(" " + b) for b in banned for n in names):
            issues.append(f"'{ing['name']}' breaks {k['diet']}")
    return issues


def annotate(recipe, k):
    """Decide from the user's real lists (not the model's word) what is available and what is missing."""
    kitchen = {i.lower(): i for i in k["ingredients"]}
    pantry = {p.lower(): p for p in k["pantry"]}
    use_soon = {u.lower() for u in k["use_soon"]}
    from_kitchen, spices, missing = [], [], []
    for ing in recipe["ingredients"]:
        key = ing["from_kitchen_item"].strip().lower()
        if key in kitchen:
            ing["source"] = "kitchen"
            from_kitchen.append(kitchen[key])
        elif key in pantry:
            ing["source"] = "pantry"
            spices.append(pantry[key])
        elif key == "water":
            ing["source"] = "pantry"
        else:
            ing["source"] = "missing"
            missing.append(ing["name"])
    recipe["uses_from_kitchen"] = list(dict.fromkeys(from_kitchen))
    recipe["spices_used"] = list(dict.fromkeys(spices))
    recipe["missing"] = list(dict.fromkeys(missing))
    recipe["use_soon_used"] = [kitchen[i.lower()] for i in recipe["use_soon_used"] if i.lower() in use_soon and i.lower() in kitchen]
    for item in recipe["uses_from_kitchen"]:
        if item.lower() in use_soon and item not in recipe["use_soon_used"]:
            recipe["use_soon_used"].append(item)
    recipe["status"] = "ready" if not recipe["missing"] else "almost"
    return recipe


def generate(k):
    return generate_gemini(k) if PROVIDER == "gemini" else generate_claude(k)


gemini_client = None


def generate_gemini(k):
    global gemini_client, GEMINI_MODELS
    if gemini_client is None:
        gemini_client = genai.Client(api_key=GEMINI_KEY)
    config = genai_types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=RecipeSet,
    )
    last = None
    for model in list(GEMINI_MODELS):
        try:
            response = gemini_client.models.generate_content(model=model, contents=build_user_message(k), config=config)
        except genai_errors.APIError as e:
            last = e
            if e.code in (400, 401, 403) and "API key" in str(e):
                raise AIError("The server's GEMINI_API_KEY is invalid.", 500)
            if e.code in (404, 429) and len(GEMINI_MODELS) > 1:
                # Model unavailable or out of free quota: drop it and try the next one
                log.warning("Gemini model %s failed (%s), trying next", model, e.code)
                GEMINI_MODELS = [m for m in GEMINI_MODELS if m != model]
                continue
            if e.code >= 500 and model != GEMINI_MODELS[-1]:
                # Temporarily overloaded: try the next model now, keep this one for later requests
                log.warning("Gemini model %s unavailable (%s), trying next", model, e.code)
                continue
            if e.code == 429:
                raise AIError("Free AI quota reached for now. Wait a minute and try again.", 429)
            if e.code >= 500:
                raise AIError("Google's AI is overloaded right now. Try again in a few seconds.", 503)
            log.exception("Gemini API error")
            raise AIError(f"The AI service returned an error ({e.code}). Please try again.")
        except Exception:
            log.exception("Gemini connection error")
            raise AIError("Couldn't reach the AI service. Check the server's internet connection.")
        parsed = response.parsed
        if not isinstance(parsed, RecipeSet):
            try:
                parsed = RecipeSet.model_validate_json(response.text or "")
            except Exception:
                raise AIError("The AI response was incomplete. Please try again.")
        log.info("Generated with %s", model)
        return [r.model_dump() for r in parsed.recipes]
    raise AIError(f"No Gemini model is available for this key ({getattr(last, 'code', '?')}).")


def generate_claude(k):
    response = get_client().beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_message(k)}],
        output_format=RecipeSet,
        thinking={"type": "adaptive"},
        output_config={"effort": EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise ValueError("The AI declined this request. Try different ingredients.")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise ValueError("The AI response was incomplete. Please try again.")
    return [r.model_dump() for r in response.parsed_output.recipes]


@app.post("/api/recipes")
def recipes():
    data = request.get_json(silent=True) or {}
    k = parse_request(data)
    if not k["ingredients"]:
        return jsonify(error="Add at least one ingredient to your kitchen first."), 400
    if not k["equipment"]:
        return jsonify(error="Select at least one piece of kitchen equipment."), 400
    if not key_configured():
        return jsonify(error="The AI isn't configured yet: set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY on the server (see README)."), 500

    try:
        good = []
        for attempt in range(2):
            for r in generate(k):
                issues = problems_with(r, k)
                if issues:
                    log.warning("Rejected '%s': %s", r["name"], "; ".join(issues))
                elif len(good) < 3 and r["name"].lower() not in {g["name"].lower() for g in good}:
                    good.append(annotate(r, k))
            if len(good) >= 3:
                break
            k = {**k, "avoid": k["avoid"] + [g["name"] for g in good]}
        if not good:
            return jsonify(error="Couldn't find recipes that fit all your constraints. Try relaxing time or difficulty, or adding ingredients."), 422
        return jsonify(recipes=good)
    except anthropic.AuthenticationError:
        return jsonify(error="The server's ANTHROPIC_API_KEY is missing or invalid."), 500
    except anthropic.RateLimitError:
        return jsonify(error="The AI is busy right now (rate limited). Wait a few seconds and try again."), 429
    except anthropic.APIStatusError as e:
        log.exception("Anthropic API error")
        return jsonify(error=f"The AI service returned an error ({e.status_code}). Please try again."), 502
    except anthropic.APIConnectionError:
        return jsonify(error="Couldn't reach the AI service. Check the server's internet connection."), 502
    except anthropic.AnthropicError as e:
        # Raised by the client constructor when no credentials are configured
        log.exception("Anthropic client error")
        return jsonify(error=f"AI is not configured on the server: {e}"), 500
    except AIError as e:
        return jsonify(error=str(e)), e.status
    except ValueError as e:
        return jsonify(error=str(e)), 502


@app.get("/api/health")
def health():
    return jsonify(ok=True, provider=PROVIDER, api_key_configured=key_configured())


def key_configured():
    return bool(GEMINI_KEY or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
