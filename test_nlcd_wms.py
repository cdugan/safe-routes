"""
Quick NLCD WMS fetch + viewer for the project BBOX.

Uses the MRLC WMS endpoint to grab NLCD 2021 land cover for the Hendersonville
bounding box and displays it with matplotlib. Not wired into the web app yet.
"""

import io
import sys
from typing import Tuple

import matplotlib.pyplot as plt
import requests

# Project bbox (north, south, east, west)
from config import BBOX

# MRLC WMS endpoint and layer
WMS_URL = "https://www.mrlc.gov/geoserver/mrlc_display/wms"
WMS_LAYER = "Annual_NLCD_Land_Cover_2024_L48"


def bbox_to_wms(bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
    """Convert (north, south, east, west) to (minx, miny, maxx, maxy) in lon/lat."""
    north, south, east, west = bbox
    return (west, south, east, north)


def fetch_nlcd_png(bbox: Tuple[float, float, float, float], width: int = 800) -> bytes:
    """Fetch NLCD WMS image bytes for the given bbox.

    Uses WMS 1.1.1 with EPSG:4326 (lon/lat axis order). Height is sized to
    maintain aspect ratio. Prints debug info about the request/response.
    """
    minx, miny, maxx, maxy = bbox_to_wms(bbox)
    # Maintain aspect ratio
    x_span = maxx - minx
    y_span = maxy - miny
    if x_span == 0 or y_span == 0:
        raise ValueError("Invalid bbox span")
    height = max(1, int(width * (y_span / x_span)))

    params = {
        "service": "WMS",
        "version": "1.1.1",
        "request": "GetMap",
        "layers": WMS_LAYER,
        "srs": "EPSG:4326",  # WMS 1.1.1 uses SRS
        "bbox": f"{minx},{miny},{maxx},{maxy}",  # lon/lat order
        "width": width,
        "height": height,
        "styles": "",
        "format": "image/png",
        "transparent": "true",
    }

    print(f"Requesting NLCD WMS: {WMS_URL}")
    print(f"Params: {params}")

    resp = requests.get(WMS_URL, params=params, timeout=30)
    print(f"HTTP {resp.status_code}")
    print(f"Content-Type: {resp.headers.get('Content-Type')}")
    print(f"Content-Length: {resp.headers.get('Content-Length')}\nURL: {resp.url}")
    resp.raise_for_status()
    if not resp.content:
        raise RuntimeError("Empty response from WMS")

    # If server returned XML/HTML error, surface it
    ctype = resp.headers.get("Content-Type", "").lower()
    if "xml" in ctype or "html" in ctype:
        text_preview = resp.text[:500]
        raise RuntimeError(f"Unexpected non-image response: {ctype}\n{text_preview}")

    return resp.content


def show_png(png_bytes: bytes, bbox: Tuple[float, float, float, float]) -> None:
    """Display the PNG in a simple matplotlib viewer with lon/lat extent."""
    img = plt.imread(io.BytesIO(png_bytes), format="png")
    minx, miny, maxx, maxy = bbox_to_wms(bbox)
    plt.figure(figsize=(8, 6))
    plt.imshow(img, extent=(minx, maxx, miny, maxy), origin="upper")
    plt.xlabel("Longitude")
    plt.ylabel("Latitude")
    plt.title(f"NLCD land cover ({WMS_LAYER})")
    plt.tight_layout()
    plt.show()


def main():
    try:
        png_bytes = fetch_nlcd_png(BBOX)
        show_png(png_bytes, BBOX)
    except Exception as exc:
        print(f"Failed to fetch/display NLCD WMS: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
