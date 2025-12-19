import requests
import os
import json
import time
import osmnx as ox
# import matplotlib.pyplot as plt

# The endpoint
URL = "https://salor-api.duke-energy.app/streetlights"

# Define a small bounding box (Asheville example)
payload = {
    "swLat": 35.590,   # South Latitude
    "swLong": -82.560, # West Longitude
    "neLat": 35.600,   # North Latitude
    "neLong": -82.550  # East Longitude
}

# Optional headers
headers = {
    # "User-Agent": "Mozilla/5.0",
    # "Referer": "https://salor-web.duke-energy.app/"
}

CACHE_FILE = 'duke_cache.json'


def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cdata):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cdata, f)


def cache_key_from_payload(p):
    # Round to 5 decimals to avoid tiny float diffs
    return f"{round(p['swLat'],5)},{round(p['swLong'],5)},{round(p['neLat'],5)},{round(p['neLong'],5)}"


def extract_latlon(item):
    # Try multiple possible coordinate layouts
    if not isinstance(item, dict):
        # If it's a simple list/tuple like [lat, lon] or [lon, lat]
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            try:
                a = float(item[0]); b = float(item[1])
                # Heuristic: lat is between -90 and 90, lon between -180 and 180
                if -90 <= a <= 90 and -180 <= b <= 180:
                    return a, b
                if -90 <= b <= 90 and -180 <= a <= 180:
                    return b, a
            except Exception:
                return None
        return None

    # Normalize keys to lowercase for case-insensitive matching
    lower_map = {k.lower(): k for k in item.keys()}
    if 'latitude' in lower_map and 'longitude' in lower_map:
        try:
            return float(item[lower_map['latitude']]), float(item[lower_map['longitude']])
        except Exception:
            pass
    if 'lat' in lower_map and 'lng' in lower_map:
        try:
            return float(item[lower_map['lat']]), float(item[lower_map['lng']])
        except Exception:
            pass
    if 'lat' in lower_map and 'lon' in lower_map:
        try:
            return float(item[lower_map['lat']]), float(item[lower_map['lon']])
        except Exception:
            pass
    if 'y' in lower_map and 'x' in lower_map:
        try:
            return float(item[lower_map['y']]), float(item[lower_map['x']])
        except Exception:
            pass

    # GeoJSON style
    geom = item.get('geometry') or item.get('geo') or item.get('location')
    if isinstance(geom, dict):
        # { 'coordinates': [lon, lat] }
        coords = geom.get('coordinates')
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            try:
                return float(coords[1]), float(coords[0])
            except Exception:
                pass
        # { 'latitude':.., 'longitude':.. }
        if 'latitude' in geom and 'longitude' in geom:
            return float(geom['latitude']), float(geom['longitude'])

    # Fallback: sometimes top-level has 'lat' inside nested dicts
    for k, v in item.items():
        if isinstance(v, dict):
            lat = v.get('lat') or v.get('latitude') or v.get('y')
            lon = v.get('lon') or v.get('longitude') or v.get('x')
            if lat is not None and lon is not None:
                try:
                    return float(lat), float(lon)
                except Exception:
                    pass

    return None


def main():
    cache = load_cache()
    key = cache_key_from_payload(payload)

    if key in cache:
        print(f"⚡ Cache hit: loaded {len(cache[key])} lights from {CACHE_FILE}")
        data = cache[key]
        # Debug: show a sample of the cached payload to help extraction heuristics
        try:
            sample = data[0] if isinstance(data, (list, tuple)) and data else data
            print("Sample cached item type:", type(sample))
            # print a short repr (max 500 chars)
            s = repr(sample)
            print(s[:500] + ("..." if len(s) > 500 else ""))
        except Exception:
            pass
    else:
        print("🌐 Cache miss: querying Duke API...")
        try:
            resp = requests.get(URL, params=payload, headers=headers, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            cache[key] = data
            save_cache(cache)
            print(f"💾 Saved {len(data) if isinstance(data, list) else 1} items to cache")
        except Exception as e:
            print(f"Error fetching data: {e}")
            return

    # Extract lat/lon pairs
    coords = []
    if isinstance(data, list):
        for item in data:
            ll = extract_latlon(item)
            if ll:
                coords.append(ll)
    elif isinstance(data, dict):
        # Some APIs return {'results':[...]} or similar
        maybe = data.get('results') or data.get('data') or []
        if isinstance(maybe, list) and maybe:
            for item in maybe:
                ll = extract_latlon(item)
                if ll:
                    coords.append(ll)

    if not coords:
        print("No coordinate data could be extracted from response.")
        # Helpful hint for debugging: print first item if available
        try:
            if isinstance(data, list) and data:
                print("First item (repr):", repr(data[0])[:1000])
            elif isinstance(data, dict):
                print("Response keys:", list(data.keys())[:20])
        except Exception:
            pass
        return

    lats, lons = zip(*coords)

    # Build a road graph for the bbox and plot
    north = payload['neLat']
    south = payload['swLat']
    east = payload['neLong']
    west = payload['swLong']

    print("🗺️  Downloading road network for bbox and plotting...")
    G = ox.graph_from_bbox((west, south, east, north), network_type='drive', simplify=True)

    fig, ax = plt.subplots(figsize=(10, 10), facecolor='#111111')
    ax.set_facecolor('#111111')

    # Plot roads (subdued)
    ox.plot_graph(G, ax=ax, show=False, close=False,
                  edge_color='#444444', edge_linewidth=0.6, node_size=0)

    # Overlay lights
    ax.scatter(lons, lats, c='#FFFF00', s=20, edgecolors='k', linewidths=0.3, zorder=5, alpha=0.9)

    # Zoom to bbox (a tiny margin)
    margin_lat = (north - south) * 0.03
    margin_lon = (east - west) * 0.03
    ax.set_xlim(west - margin_lon, east + margin_lon)
    ax.set_ylim(south - margin_lat, north + margin_lat)

    ax.set_title(f"Duke Streetlights ({len(coords)} points)", color='white')
    plt.tight_layout()
    plt.show()


if __name__ == '__main__':
    main()