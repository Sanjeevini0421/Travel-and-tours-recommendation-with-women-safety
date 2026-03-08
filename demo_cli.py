# demo_cli.py
"""Simple CLI demo showing usage of DestiniBackend functions.
Run: python demo_cli.py
"""

from destini_backend import DestiniBackend
import os

def main():
    api_key = os.environ.get("AIzaSyAl9oaNveCHXXX7KJnZ64G31GDW3PEaSXo") or ""
    b = DestiniBackend(google_api_key=api_key if api_key else None)

    print("=== Destini Backend CLI Demo ===")
    # Crowd pattern demo
    pattern = b.generate_crowd_pattern()
    print("Crowd pattern hours:", pattern["hours"])
    print("Crowd values:", pattern["values"][:6], "...")

    # Weather demo
    place = "Bengaluru"
    print(f"Fetching weather for {place}...")
    weather = b.fetch_weather(place)
    print("Weather:", weather.get("temp"), "C -", weather.get("desc"))

    # Chatbot demo
    q = "Is this place safe at night?"
    print("Chatbot:", b.generate_chatbot_response(q))

    # Directions URL demo (local example)
    try:
        url = b.build_directions_url("MG Road, Bengaluru", "Bangalore Palace")
        print("Directions URL (example):", url)
    except Exception as e:
        print("Directions URL error:", e)

if __name__ == '__main__':
    main()
