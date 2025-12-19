#!/usr/bin/env python3
"""Test that fastest and safest routes match when safety_alpha=0.0"""

import requests
import json

def test_routes(name, start, end):
    print(f"\n=== {name} ===")
    resp = requests.post('http://127.0.0.1:5000/api/routes', json={
        'start': start,
        'end': end,
        'safety_alpha': 0.0
    })
    
    data = resp.json()
    if data['status'] != 'success':
        print(f"ERROR: {data.get('message')}")
        return False
    
    fastest = data.get('fastest', {}).get('data', {})
    safest = data.get('safest', {}).get('data', {})
    
    fastest_nodes = fastest.get('nodes', [])
    safest_nodes = safest.get('nodes', [])
    fastest_time = fastest.get('travel_time_s', 0)
    safest_time = safest.get('travel_time_s', 0)
    
    print(f'Fastest: {len(fastest_nodes)} nodes, time={fastest_time:.0f}s')
    print(f'Safest:  {len(safest_nodes)} nodes, time={safest_time:.0f}s')
    
    if fastest_nodes == safest_nodes:
        print('✓ ROUTES MATCH when alpha=0.0')
        return True
    else:
        print('✗ ROUTES DIFFER (should match)')
        print(f"  Fastest nodes: {fastest_nodes[:5]}...")
        print(f"  Safest nodes:  {safest_nodes[:5]}...")
        return False

# Test two different route pairs
test1 = test_routes(
    "Test 1: Duke Campus to Downtown",
    [35.34, -82.50],
    [35.27, -82.57]
)

test2 = test_routes(
    "Test 2: Northgate to Chapel Hill",
    [35.35, -82.50],
    [35.29, -82.56]
)

if test1 and test2:
    print("\n✓ ALL TESTS PASSED")
else:
    print("\n✗ SOME TESTS FAILED")
