# server_fastapi.py
"""FastAPI microservice wrapping DestiniBackend features.
Endpoints:
- GET /search?q=... -> text search (requires GOOGLE_API_KEY env or pass ?key=)
- GET /place/{place_id}/wsi -> fetch place details and compute WSI
- GET /weather?place=... -> wttr.in weather fetch
- GET /crowd -> returns crowd pattern
- POST /chat -> {"message": "...", "place": {optional}} returns chatbot response
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from destini_backend import DestiniBackend

app = FastAPI(title="Destini Backend API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# initialize backend with API key from env (optional to override per-request)
backend = DestiniBackend(google_api_key=os.environ.get("GOOGLE_API_KEY"))

class ChatRequest(BaseModel):
    message: str
    place: dict = None

@app.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = 8, key: str = None):
    try:
        if key:
            b = DestiniBackend(google_api_key=key)
        else:
            b = backend
        results = b.search_places_text(q, limit=limit)
        return {"count": len(results), "results": [r.__dict__ for r in results]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/place/{place_id}/wsi")
def place_wsi(place_id: str, key: str = None):
    try:
        if key:
            b = DestiniBackend(google_api_key=key)
        else:
            b = backend
        details = b.get_place_details(place_id)
        score = b.calculate_safety_score(details.reviews, details.rating)
        label = b.get_safety_label(score)
        tips = b.generate_safety_tips(score)
        return {
            "place_id": place_id,
            "name": details.name,
            "rating": details.rating,
            "user_ratings_total": details.user_ratings_total,
            "wsi_score": score,
            "wsi_label": label,
            "safety_tips": tips,
            "reviews_count": len(details.reviews)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/weather")
def weather(place: str = Query(..., min_length=1)):
    try:
        return backend.fetch_weather(place)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/crowd")
def crowd():
    try:
        return backend.generate_crowd_pattern()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
def chat(req: ChatRequest):
    try:
        resp = backend.generate_chatbot_response(req.message, place=req.place)
        return {"response": resp}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search/mock")
def mock_search(q: str = Query(..., min_length=1)):
    """Mock endpoint for testing without Google API key"""
    # Generate mock places for testing
    mock_places = [
        {
            "name": f"{q} Museum",
            "place_id": "mock_place_1",
            "formatted_address": f"123 Main St, {q}",
            "rating": 4.5,
            "user_ratings_total": 1500,
            "geometry": {"location": {"lat": 40.7128, "lng": -74.0060}},
            "types": ["museum", "tourist_attraction"],
            "vicinity": f"Downtown {q}"
        },
        {
            "name": f"{q} Park",
            "place_id": "mock_place_2",
            "formatted_address": f"456 Park Ave, {q}",
            "rating": 4.7,
            "user_ratings_total": 2000,
            "geometry": {"location": {"lat": 40.7829, "lng": -73.9654}},
            "types": ["park", "point_of_interest"],
            "vicinity": f"Central {q}"
        },
        {
            "name": f"{q} Tower",
            "place_id": "mock_place_3",
            "formatted_address": f"789 High St, {q}",
            "rating": 4.3,
            "user_ratings_total": 1200,
            "geometry": {"location": {"lat": 40.7589, "lng": -73.9851}},
            "types": ["tourist_attraction", "point_of_interest"],
            "vicinity": f"Midtown {q}"
        }
    ]
    return {"count": len(mock_places), "results": mock_places}

@app.get("/place/mock_{place_id}/wsi")
def mock_place_wsi(place_id: str):
    """Mock endpoint for testing safety index without Google API key"""
    import random
    score = random.randint(60, 85)
    label = backend.get_safety_label(score)
    tips = backend.generate_safety_tips(score)
    return {
        "place_id": f"mock_{place_id}",
        "name": "Mock Place",
        "rating": 4.5,
        "user_ratings_total": 1500,
        "wsi_score": score,
        "wsi_label": label,
        "safety_tips": tips,
        "reviews_count": 10
    }
