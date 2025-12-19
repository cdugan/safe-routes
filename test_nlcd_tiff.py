"""Test script to load and display NLCD GeoTIFF data from NLCD_data folder."""
import os
import numpy as np
import matplotlib.pyplot as plt
from rasterio.plot import show
import rasterio

# Path to the 2024 NLCD GeoTIFF
nlcd_path = os.path.join(
    os.path.dirname(__file__),
    "NLCD_data",
    "Annual_NLCD_LndCov_2024_CU_C1V1_8e2769a7-7c7f-4c21-aa89-2286dda8f357.tiff"
)

if not os.path.exists(nlcd_path):
    print(f"❌ File not found: {nlcd_path}")
    exit(1)

print(f"📂 Loading NLCD GeoTIFF: {os.path.basename(nlcd_path)}")

try:
    with rasterio.open(nlcd_path) as src:
        print(f"\n📊 GeoTIFF Metadata:")
        print(f"  Driver: {src.driver}")
        print(f"  CRS: {src.crs}")
        print(f"  Bounds: {src.bounds}")
        print(f"  Transform: {src.transform}")
        print(f"  Width: {src.width}, Height: {src.height}")
        print(f"  Count: {src.count} band(s)")
        print(f"  Data type: {src.dtypes[0]}")
        
        # Read band 1 (NLCD class codes)
        data = src.read(1)
        print(f"\n🎨 Band 1 (NLCD Classes):")
        print(f"  Shape: {data.shape}")
        print(f"  Data type: {data.dtype}")
        print(f"  Min: {data.min()}, Max: {data.max()}")
        
        # Get unique values
        unique_vals = np.unique(data)
        print(f"  Unique values ({len(unique_vals)}): {sorted(unique_vals)[:20]}...")
        
        # Count frequency of top values
        unique, counts = np.unique(data, return_counts=True)
        top_idx = np.argsort(counts)[::-1][:10]
        print(f"\n📈 Top 10 class codes by frequency:")
        for i in top_idx:
            print(f"  Code {unique[i]}: {counts[i]:,} pixels")
        
        # Create visualization
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
        
        # Raw band visualization
        im1 = ax1.imshow(data, cmap='tab20', interpolation='nearest')
        ax1.set_title("NLCD 2024 Land Cover Classes (raw band)")
        ax1.set_xlabel("X")
        ax1.set_ylabel("Y")
        plt.colorbar(im1, ax=ax1, label="NLCD Class Code")
        
        # Histogram
        ax2.hist(data.flatten(), bins=np.arange(0, 256) - 0.5, edgecolor='black', alpha=0.7)
        ax2.set_xlabel("NLCD Class Code")
        ax2.set_ylabel("Pixel Count")
        ax2.set_title("Distribution of NLCD Classes")
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig("nlcd_2024_visualization.png", dpi=100, bbox_inches='tight')
        print(f"\n✅ Saved visualization to: nlcd_2024_visualization.png")
        plt.show()
        
except Exception as e:
    print(f"❌ Error loading GeoTIFF: {e}")
    import traceback
    traceback.print_exc()
