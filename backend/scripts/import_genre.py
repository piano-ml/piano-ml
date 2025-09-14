import sys
import requests
import time

API_URL = "https://api.pianoml.org/genre"
FETCH_URL = "https://musicbrainz.org/ws/2/genre/all?fmt=json&offset={offset}&limit=100"


def fetch_and_post_genres(token):
    offset = 0
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    while True:
        try:
            resp = requests.get(FETCH_URL.format(offset=offset), headers=headers)
            resp.raise_for_status()
            genres = resp.json().get("genres")
            if not genres:
                print(f"No more genres to fetch at offset {offset}. Exiting.")
                break

            for genre in genres:
                genre["mbid"]= genre.get("id")
                del genre["id"]
                del genre["disambiguation"]
                print(genre)
                post_resp = requests.post(API_URL, json=genre, headers=headers)
                print(post_resp)
                if post_resp.status_code not in (200, 201):
                    print(f"Error posting genre : {post_resp.status_code} {post_resp.text}")
            offset += 100
            time.sleep(1)

        except Exception as error:
            print(f"Error fetching genres at offset {offset}: {error}")
            break

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Please provide a bearer token as a command-line argument.")
        sys.exit(1)
    token = sys.argv[1]
    fetch_and_post_genres(token)

