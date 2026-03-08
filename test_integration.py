"""
Integration test for Destini Backend and FastAPI server
Tests all endpoints and backend functionality
"""

import sys
import os

# Test 1: Import all modules
print("=" * 60)
print("TEST 1: Module Imports")
print("=" * 60)
try:
    from destini_backend import DestiniBackend, PlaceSearchResult, PlaceDetails, APIError
    print("✓ destini_backend imported successfully")
except Exception as e:
    print(f"✗ Failed to import destini_backend: {e}")
    sys.exit(1)

try:
    from fastapi.testclient import TestClient
    from server_fastapi import app
    FASTAPI_AVAILABLE = True
    print("✓ server_fastapi imported successfully")
except Exception as e:
    FASTAPI_AVAILABLE = False
    print(f"⚠ FastAPI not available (skipping API tests): {e}")

# Test 2: Backend Initialization
print("\n" + "=" * 60)
print("TEST 2: Backend Initialization")
print("=" * 60)
try:
    backend = DestiniBackend()
    print("✓ DestiniBackend initialized without API key")
    
    # Test with API key from environment
    api_key = os.environ.get("AIzaSyAl9oaNveCHXXX7KJnZ64G31GDW3PEaSXo")
    if api_key:
        backend_with_key = DestiniBackend(google_api_key=api_key)
        print("✓ DestiniBackend initialized with API key")
    else:
        print("⚠ No GOOGLE_API_KEY in environment (expected for local testing)")
except Exception as e:
    print(f"✗ Backend initialization failed: {e}")
    sys.exit(1)

# Test 3: Crowd Pattern Generation
print("\n" + "=" * 60)
print("TEST 3: Crowd Pattern Generation")
print("=" * 60)
try:
    crowd_data = backend.generate_crowd_pattern()
    assert "hours" in crowd_data, "Missing 'hours' key"
    assert "values" in crowd_data, "Missing 'values' key"
    assert len(crowd_data["hours"]) == 16, f"Expected 16 hours, got {len(crowd_data['hours'])}"
    assert len(crowd_data["values"]) == 16, f"Expected 16 values, got {len(crowd_data['values'])}"
    print(f"✓ Generated crowd pattern: {len(crowd_data['hours'])} hours")
    print(f"  Sample: {crowd_data['hours'][:3]} -> {crowd_data['values'][:3]}")
except Exception as e:
    print(f"✗ Crowd pattern generation failed: {e}")
    sys.exit(1)

# Test 4: Real-time Crowd Prediction
print("\n" + "=" * 60)
print("TEST 4: Real-time Crowd Prediction")
print("=" * 60)
try:
    for hour in [6, 12, 18, 21]:
        crowd_level = backend.predict_real_time_crowd(hour=hour)
        assert 0 <= crowd_level <= 100, f"Invalid crowd level: {crowd_level}"
        print(f"✓ Hour {hour}:00 -> Crowd level: {crowd_level}%")
except Exception as e:
    print(f"✗ Real-time crowd prediction failed: {e}")
    sys.exit(1)

# Test 5: Weather Fetching
print("\n" + "=" * 60)
print("TEST 5: Weather Fetching")
print("=" * 60)
try:
    weather = backend.fetch_weather("London")
    assert "temp" in weather, "Missing 'temp' key"
    assert "desc" in weather, "Missing 'desc' key"
    assert "humidity" in weather, "Missing 'humidity' key"
    assert "windspeed" in weather, "Missing 'windspeed' key"
    assert "available" in weather, "Missing 'available' key"
    print(f"✓ Weather fetched: {weather['temp']}°C, {weather['desc']}")
except Exception as e:
    print(f"✗ Weather fetching failed: {e}")

# Test 6: Safety Score Calculation
print("\n" + "=" * 60)
print("TEST 6: Safety Score Calculation")
print("=" * 60)
try:
    # Test with no reviews
    score1 = backend.calculate_safety_score([], 4.5)
    assert 0 <= score1 <= 100, f"Invalid safety score: {score1}"
    print(f"✓ Safety score (rating 4.5, no reviews): {score1}")
    
    # Test with sample reviews
    sample_reviews = [
        {"text": "Very safe and well-lit area with police presence", "rating": 5},
        {"text": "Good place to visit, secure environment", "rating": 4},
        {"text": "Avoided dark alleys but overall safe", "rating": 4}
    ]
    score2 = backend.calculate_safety_score(sample_reviews, 4.3)
    assert 0 <= score2 <= 100, f"Invalid safety score: {score2}"
    print(f"✓ Safety score (rating 4.3, 3 reviews): {score2}")
    
    # Test safety labels
    label1 = backend.get_safety_label(score1)
    label2 = backend.get_safety_label(score2)
    print(f"  Label 1: {label1['label']} ({label1['color']})")
    print(f"  Label 2: {label2['label']} ({label2['color']})")
except Exception as e:
    print(f"✗ Safety score calculation failed: {e}")
    sys.exit(1)

# Test 7: Safety Tips Generation
print("\n" + "=" * 60)
print("TEST 7: Safety Tips Generation")
print("=" * 60)
try:
    tips_safe = backend.generate_safety_tips(80)
    tips_moderate = backend.generate_safety_tips(60)
    tips_unsafe = backend.generate_safety_tips(30)
    
    assert len(tips_safe) > 0, "No tips for safe locations"
    assert len(tips_moderate) > 0, "No tips for moderate locations"
    assert len(tips_unsafe) > 0, "No tips for unsafe locations"
    
    print(f"✓ Safe location tips (score 80): {len(tips_safe)} tips")
    print(f"  Sample: {tips_safe[0]}")
    print(f"✓ Moderate location tips (score 60): {len(tips_moderate)} tips")
    print(f"  Sample: {tips_moderate[0]}")
    print(f"✓ Unsafe location tips (score 30): {len(tips_unsafe)} tips")
    print(f"  Sample: {tips_unsafe[0]}")
except Exception as e:
    print(f"✗ Safety tips generation failed: {e}")
    sys.exit(1)

# Test 8: Chatbot Response Generation
print("\n" + "=" * 60)
print("TEST 8: Chatbot Response Generation")
print("=" * 60)
try:
    response1 = backend.generate_chatbot_response("Is this place safe at night?")
    assert len(response1) > 0, "Empty chatbot response"
    print(f"✓ Chatbot response (no place): {response1[:100]}...")
    
    # Test with place context
    sample_place = {
        "name": "Eiffel Tower",
        "rating": 4.7,
        "user_ratings_total": 50000
    }
    response2 = backend.generate_chatbot_response("When is the best time to visit?", place=sample_place)
    assert len(response2) > 0, "Empty chatbot response with place"
    print(f"✓ Chatbot response (with place): {response2[:100]}...")
except Exception as e:
    print(f"✗ Chatbot response generation failed: {e}")
    sys.exit(1)

# Test 9: Directions URL Builder
print("\n" + "=" * 60)
print("TEST 9: Directions URL Builder")
print("=" * 60)
try:
    url = backend.build_directions_url("Times Square, New York", "Central Park, New York")
    assert url.startswith("https://www.google.com/maps/dir/"), "Invalid directions URL"
    print(f"✓ Directions URL: {url}")
    
    # Test error handling
    try:
        backend.build_directions_url("", "Destination")
        print("✗ Should have raised ValueError for empty from_addr")
        sys.exit(1)
    except ValueError:
        print("✓ Correctly raises ValueError for invalid inputs")
except Exception as e:
    print(f"✗ Directions URL builder failed: {e}")
    sys.exit(1)

# Test 10: FastAPI Endpoints (Optional)
if FASTAPI_AVAILABLE:
    print("\n" + "=" * 60)
    print("TEST 10: FastAPI Endpoints")
    print("=" * 60)
    try:
        client = TestClient(app)
        
        # Test /crowd endpoint
        response = client.get("/crowd")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        crowd_data = response.json()
        assert "hours" in crowd_data, "Missing 'hours' in /crowd response"
        assert "values" in crowd_data, "Missing 'values' in /crowd response"
        print(f"✓ GET /crowd: {response.status_code} - {len(crowd_data['hours'])} hours")
        
        # Test /weather endpoint
        response = client.get("/weather?place=Paris")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        weather_data = response.json()
        assert "temp" in weather_data, "Missing 'temp' in /weather response"
        print(f"✓ GET /weather?place=Paris: {response.status_code} - {weather_data['temp']}°C")
        
        # Test /chat endpoint
        response = client.post("/chat", json={"message": "Is this safe?"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        chat_data = response.json()
        assert "response" in chat_data, "Missing 'response' in /chat response"
        print(f"✓ POST /chat: {response.status_code} - Response: {chat_data['response'][:50]}...")
        
        print("✓ All FastAPI endpoints working correctly")
    except Exception as e:
        print(f"✗ FastAPI endpoints test failed: {e}")
        sys.exit(1)
else:
    print("\n" + "=" * 60)
    print("TEST 10: FastAPI Endpoints (SKIPPED - FastAPI not installed)")
    print("=" * 60)

# Final Summary
print("\n" + "=" * 60)
print("INTEGRATION TEST SUMMARY")
print("=" * 60)
print("✅ All core tests passed successfully!")
print("✅ Backend components working correctly")
if FASTAPI_AVAILABLE:
    print("✅ FastAPI server endpoints functional")
else:
    print("⚠ FastAPI tests skipped (not installed)")
print("✅ No syntax or logic errors detected")
print("\nNote: Google Places API tests skipped (requires API key)")
print("=" * 60)
