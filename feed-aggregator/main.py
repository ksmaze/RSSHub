import os
import time
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

BASE_URL = os.getenv('RSS_BASE_URL')
USERNAME = os.getenv('RSS_USERNAME')
PASSWORD = os.getenv('RSS_PASSWORD')


def get_auth_token(email, password):
    url = f"{BASE_URL}/api/greader.php/accounts/ClientLogin"
    params = {
        "Email": email,
        "Passwd": password
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        # Parse the response to get only the Auth token
        for line in response.text.splitlines():
            if line.startswith('Auth='):
                return line[5:]  # Return everything after 'Auth='
        return None
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching auth token: {e}")
        return None

def get_write_token(token):
    url = f"{BASE_URL}/api/greader.php/reader/api/0/token"
    try:
        response = requests.get(url, headers={
            "Authorization": f"GoogleLogin auth={token}"
        })
        response.raise_for_status()
        return response.text.strip()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching write token: {e}")
        return ''


def map_article(item):
    return {
        "id": item["id"],
        "title": item["title"],
        "streamId": item["origin"]["streamId"],
        "read": "user/-/state/com.google/read" in item["categories"],
    }


def fetch_articles(token):
    url = f"{BASE_URL}/api/greader.php/reader/api/0/stream/contents/reading-list?n=1000"
    try:
        response = requests.get(url, headers={
            "Authorization": f"GoogleLogin auth={token}"
        })
        response.raise_for_status()
        return list(map(map_article, response.json()["items"]))

    except requests.exceptions.RequestException as e:
        print(f"Error fetching article: {e}")
        return []


def mark_read_article(article, token, write_token):
    print('dedup ' + str(article))
    url = f"{BASE_URL}/api/greader.php/reader/api/0/edit-tag"
    try:
        response = requests.post(url, data=[
            ("a","user/-/state/com.google/read"),
            ("i", article["id"]),
            ('T', write_token),
        ], headers={
            "Authorization": f"GoogleLogin auth={token}",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        response.raise_for_status()
        print(response.text)

    except requests.exceptions.RequestException as e:
        print(f"Error set article: {e}")


def redupe_articles(articles, token, write_token):
    # Reverse the articles list
    articles.reverse()
    
    # Handle duplicates by title
    seen_read_titles = set()
    seen_unread_titles = set()
    unique_articles = []
    for article in articles:
        if article["read"] and article["title"] not in seen_read_titles:
            seen_read_titles.add(article["title"])
        elif not article["read"] and article["title"] not in seen_unread_titles:
            seen_unread_titles.add(article["title"])
        elif not article["read"] and (article["title"] in seen_read_titles or article["title"] in seen_unread_titles):
            mark_read_article(article, token, write_token)


def main():
    while True:
        auth_token = get_auth_token(USERNAME, PASSWORD)
        print("Fetching articles...")
        articles = fetch_articles(auth_token)
        write_token = get_write_token(auth_token)
        redupe_articles(articles, auth_token, write_token)
        time.sleep(600)


if __name__ == "__main__":
    main()
