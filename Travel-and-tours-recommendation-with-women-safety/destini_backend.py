# destini_backend.py
"""Core backend module (DestiniBackend) converted from final demo.html UI/JS.

Contains:
- PlaceSearchResult, PlaceDetails dataclasses
- DestiniBackend class with Google Places helpers, WSI, crowd, weather, and NLP chatbot
- No executable main block (import-safe)
Source: final demo.html."""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import requests
import math
import re
from datetime import datetime
import random
import os

class APIError(Exception):
    pass

def safe_get(d: Dict, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and k in d:
            d = d[k]
        else:
            return default
    return d

@dataclass
class PlaceSearchResult:
    name: str
    place_id: str
    formatted_address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    geometry: Dict = field(default_factory=dict)
    types: List[str] = field(default_factory=list)
    raw: Dict = field(default_factory=dict)

@dataclass
class PlaceDetails:
    place_id: str
    name: str
    rating: float
    user_ratings_total: int
    reviews: List[Dict[str, Any]]
    raw: Dict = field(default_factory=dict)

class DestiniBackend:
    def __init__(self, google_api_key: Optional[str] = None, requests_session: Optional[requests.Session] = None):
        self.google_api_key = google_api_key or os.environ.get("GOOGLE_API_KEY")
        self.session = requests_session or requests.Session()
        self.nlp_intents = self._build_nlp_intents()

    def _ensure_api(self):
        if not self.google_api_key:
            raise APIError("Google API key is required for this operation.")

    def search_places_text(self, query: str, region: str = None, limit: int = 10) -> List[PlaceSearchResult]:
        self._ensure_api()
        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {"query": query, "key": self.google_api_key}
        if region:
            params["region"] = region
        resp = self.session.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            raise APIError(f"Google Places TextSearch error: {resp.status_code} {resp.text}")
        j = resp.json()
        results = []
        for item in j.get("results", [])[:limit]:
            results.append(
                PlaceSearchResult(
                    name=item.get("name"),
                    place_id=item.get("place_id"),
                    formatted_address=item.get("formatted_address") or item.get("vicinity"),
                    rating=item.get("rating"),
                    user_ratings_total=item.get("user_ratings_total"),
                    geometry=item.get("geometry", {}),
                    types=item.get("types", []),
                    raw=item
                )
            )
        return results

    def get_place_details(self, place_id: str, fields: Optional[List[str]] = None) -> PlaceDetails:
        self._ensure_api()
        if fields is None:
            fields = ['reviews', 'rating', 'user_ratings_total', 'name']
        url = "https://maps.googleapis.com/maps/api/place/details/json"
        params = {"place_id": place_id, "fields": ",".join(fields), "key": self.google_api_key}
        resp = self.session.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            raise APIError(f"Google Place Details error: {resp.status_code} {resp.text}")
        j = resp.json()
        result = j.get("result", {})
        reviews = result.get("reviews", [])
        rating = result.get("rating", 0)
        total = result.get("user_ratings_total", 0)
        name = result.get("name", "")
        return PlaceDetails(place_id=place_id, name=name, rating=rating, user_ratings_total=total, reviews=reviews, raw=result)

    def calculate_safety_score(self, reviews: List[Dict[str, Any]], rating: float) -> int:
        base = (rating or 0) / 5.0 * 70.0
        positive_keywords = {
            r"\bsafe\b": 2.5, r"\bwell[- ]lit\b": 2.0, r"\bwell lit\b": 2.0, r"\bcctv\b": 1.8,
            r"\bpolice\b": 1.5, r"\bsecure\b": 2.0, r"\bfriendly\b": 1.0, r"\bpopulated\b": 1.5
        }
        negative_keywords = {
            r"\bharrass(ed|ment)?\b": -3.0, r"\bunsafe\b": -3.0, r"\bdanger(ous)?\b": -3.0,
            r"\bsteal\b": -2.5, r"\brobbery\b": -3.0, r"\bscam\b": -2.0, r"\bdark\b": -1.5,
            r"\bavoid\b": -1.5, r"\bassault\b": -4.0
        }
        score_mod = 0.0
        total_reviews_considered = 0
        for r in reviews:
            text = (r.get("text") or "").lower()
            if not text:
                continue
            total_reviews_considered += 1
            for pat, w in positive_keywords.items():
                if re.search(pat, text):
                    score_mod += w
            for pat, w in negative_keywords.items():
                if re.search(pat, text):
                    score_mod += w
        if total_reviews_considered > 0:
            avg_mod = score_mod / max(1, total_reviews_considered)
            review_contrib = max(-30.0, min(30.0, avg_mod * 6.0))
        else:
            review_contrib = 0.0
        raw_score = base + review_contrib
        score = int(max(0, min(100, round(raw_score))))
        return score

    def get_safety_label(self, score: int) -> Dict[str, str]:
        if score >= 75:
            return {"label": "Safe", "color": "#4caf50"}
        elif score >= 45:
            return {"label": "Moderate", "color": "#FFD700"}
        else:
            return {"label": "Unsafe", "color": "#FF4C4C"}

    def generate_safety_tips(self, score: int) -> List[str]:
        tips = []
        if score >= 75:
            tips.extend([
                "✅ Generally safe during day and night",
                "✅ Well-lit streets with good CCTV coverage",
                "✅ Good public transport available",
                "✅ Populated and friendly area"
            ])
        elif score >= 45:
            tips.extend([
                "⚠️ Exercise caution at night",
                "✅ Prefer main roads and populated areas",
                "✅ Use ride-hailing services after dark",
                "⚠️ Avoid poorly lit side streets"
            ])
        else:
            tips.extend([
                "⚠️ High caution advised — avoid late night visits",
                "⚠️ Prefer traveling in groups",
                "✅ Use official transport and avoid isolated spots",
                "⚠️ Keep emergency contacts and share live location"
            ])
        return tips

    def predict_real_time_crowd(self, hour: Optional[int] = None) -> int:
        if hour is None:
            hour = datetime.now().hour
        if 6 <= hour < 9:
            return random.randint(20, 30)
        elif 9 <= hour < 12:
            return random.randint(40, 70)
        elif 12 <= hour < 16:
            return random.randint(65, 85)
        elif 16 <= hour < 19:
            return random.randint(50, 75)
        elif 19 <= hour < 22:
            return random.randint(35, 55)
        else:
            return random.randint(10, 25)

    def generate_crowd_pattern(self) -> Dict[str, List]:
        hours = []
        values = []
        for h in range(6, 22):
            hours.append(f"{h}:00")
            values.append(self.predict_real_time_crowd(hour=h))
        return {"hours": hours, "values": values}

    def fetch_weather(self, place_name: str) -> Dict[str, Any]:
        url = f"https://wttr.in/{requests.utils.quote(place_name)}?format=j1"
        try:
            resp = self.session.get(url, timeout=10)
            if resp.status_code != 200:
                return {"temp": "N/A", "desc": "Weather unavailable", "humidity": "N/A", "windspeed": "N/A", "available": False}
            j = resp.json()
            current = j.get("current_condition", [{}])[0]
            return {
                "temp": current.get("temp_C", "N/A"),
                "desc": safe_get(current, "weatherDesc", 0, "value") or "N/A",
                "humidity": current.get("humidity", "N/A"),
                "windspeed": current.get("windspeedKmph", "N/A"),
                "available": True,
                "raw": j
            }
        except Exception as e:
            return {"temp": "N/A", "desc": f"Error: {e}", "humidity": "N/A", "windspeed": "N/A", "available": False}

    def _build_nlp_intents(self) -> Dict[str, Dict]:
        return {
            "timing": {
                "keywords": ['best time', 'when', 'visit', 'season', 'weather', 'open', 'hours', 'time', 'schedule', 'timing', 'available'],
                "response": lambda place: f"The best time to visit {place.get('name') if place else 'this place'} is during weekdays, especially early morning (6-9 AM) or late evening (after 7 PM) to avoid peak crowds."
            },
            "pricing": {
                "keywords": ['price', 'cost', 'fee', 'charge', 'expensive', 'money', 'ticket', 'entry', 'admission', 'pay', 'afford', 'budget'],
                "response": lambda place: f"For pricing information, check the official listing for {place.get('name') if place else 'this place'} — prices vary by season."
            },
            "rating": {
                "keywords": ['rating', 'review', 'good', 'best', 'popular', 'feedback', 'star', 'quality', 'recommend', 'worth', 'opinion'],
                "response": lambda place: f"{place.get('name', 'This place')} has a rating of {place.get('rating', 'N/A')}/5 based on {place.get('user_ratings_total', 'many')} reviews." 
            },
            "crowd": {
                "keywords": ['crowd', 'busy', 'crowded', 'people', 'packed', 'rush', 'peak', 'congestion', 'visitors', 'tourists', 'queue', 'wait'],
                "response": lambda place: f"Check the Crowd Analysis: we predict crowd levels by time; mornings are usually quieter. Use crowd pattern to pick best times."
            },
            "weather": {
                "keywords": ['weather', 'temperature', 'rain', 'sunny', 'climate', 'forecast', 'hot', 'cold', 'humidity', 'wind'],
                "response": lambda place: f"View the Weather tab for current conditions and a 5-day forecast for {place.get('name') if place else 'this area'}."
            },
            "safety": {
                "keywords": ['safe', 'safety', 'secure', 'danger', 'risk', 'women', 'female', 'night', 'alone', 'security', 'crime', 'police'],
                "response": lambda place: f"Check the Women Safety Index (WSI) tab for {place.get('name') if place else 'this location'} to see the safety score and tips."
            }
        }

    def generate_chatbot_response(self, message: str, place: Optional[Dict] = None) -> str:
        q = (message or "").lower()
        best_intent = None
        best_count = 0
        for key, data in self.nlp_intents.items():
            count = sum(1 for kw in data["keywords"] if kw in q)
            if count > best_count:
                best_count = count
                best_intent = key
        if place and best_intent:
            return self.nlp_intents[best_intent]["response"](place)
        if place:
            rating_text = f"{place.get('rating')}/5" if place.get('rating') else "rating available"
            reviews_text = f"{place.get('user_ratings_total', 'many')} reviews"
            return (f"{place.get('name', 'This place')} — {rating_text} from {reviews_text}.\n"
                    "Try asking: 'best time to visit', 'is it safe?', 'how crowded is it?', 'weather?'.")
        if best_intent:
            return self.nlp_intents[best_intent]["response"]({})
        return ("Hi! I can help with destinations, safety scores, crowd levels, weather, and directions. " 
                "Search for a place or ask a specific question like 'Is this place safe at night?'")

    def build_directions_url(self, from_addr: str, to_addr: str) -> str:
        if not from_addr or not to_addr:
            raise ValueError("Both from_addr and to_addr must be provided.")
        return f"https://www.google.com/maps/dir/{requests.utils.quote(from_addr)}/{requests.utils.quote(to_addr)}"
