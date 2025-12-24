// LitRoutes Web App - Main Application Logic
console.log('app.js loaded');

let map;
let graphLayer;
let startMarker;
let endMarker;
let fastestRouteLayer;
let safestRouteLayer; // will be a LayerGroup containing halo + route
let lightsLayer;
let boundaryBox; // boundary rectangle layer
let mapClickMode = null; // 'start' or 'end' for map picking mode
const BBOX = window.APP_BBOX || [35.42, 35.28, -82.40, -82.55]; // [north, south, east, west] - fallback to Hendersonville if not set

// Check if coordinates are within bounds
function isWithinBounds(lat, lon) {
    const [north, south, east, west] = BBOX;
    return lat >= south && lat <= north && lon >= west && lon <= east;
}

// Initialize map
function initMap() {
    // Calculate center and zoom from bbox
    const [north, south, east, west] = BBOX;
    const center = [(north + south) / 2, (east + west) / 2];
    
    map = L.map('map').setView(center, 13);
    
    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Set up map bounds
    const bounds = L.latLngBounds(
        [south, west],
        [north, east]
    );
    map.fitBounds(bounds);
    
    // Add boundary box visualization
    boundaryBox = L.rectangle(
        [[south, west], [north, east]],
        {
            color: '#ff7800',
            weight: 3,
            fillOpacity: 0,
            dashArray: '10, 10',
            interactive: false
        }
    ).addTo(map);
    
    // Add click handler for map-based point selection
    map.on('click', function(e) {
        if (mapClickMode === 'start') {
            setStartPoint(e.latlng.lat, e.latlng.lng);
            mapClickMode = null;
            document.getElementById('startMapBtn').style.background = '';
        } else if (mapClickMode === 'end') {
            setEndPoint(e.latlng.lat, e.latlng.lng);
            mapClickMode = null;
            document.getElementById('endMapBtn').style.background = '';
        }
    });
    
    // Load initial graph data
    loadGraphData();
}

// Load graph data from backend
async function loadGraphData() {
    try {
        // show loader
        const loader = document.getElementById('mapLoader');
        if (loader) loader.style.display = 'flex';

        // Load lightweight sampled graph first for fast rendering
        console.log('Fetching /api/graph-data-lite');
        const response = await fetch('/api/graph-data-lite');
        const data = await response.json();
        console.log('/api/graph-data-lite returned', data && data.status);
        
        if (data.status === 'success') {
            try {
                // Remove old graph layer
                if (graphLayer) {
                    map.removeLayer(graphLayer);
                }
                
                // Add graph edges as GeoJSON
                console.log('Creating L.geoJSON with', data.edges.features ? data.edges.features.length + ' features' : 'data.edges');
                graphLayer = L.geoJSON(data.edges, {
                    style: function(feature) {
                        const safetyScore = feature.properties.safety_score || 100;
                        const color = getSafetyColor(safetyScore);
                        return {
                            color: color,
                            weight: 2,
                            opacity: 0.7
                        };
                    },
                    onEachFeature: function(feature, layer) {
                        const props = feature.properties;
                        const safetyScore = props.safety_score !== undefined ? props.safety_score.toFixed(1) : 'N/A';
                        const lightCount = props.light_count || 0;
                        const curveScore = props.curve_score !== undefined ? props.curve_score.toFixed(3) : 'N/A';
                        const darknessScore = props.darkness_score !== undefined ? props.darkness_score.toFixed(3) : 'N/A';
                        const highwayRisk = props.highway_risk !== undefined ? props.highway_risk.toFixed(3) : 'N/A';
                        const highwayTag = props.highway_tag || 'unknown';
                        const landRisk = props.land_risk !== undefined ? props.land_risk.toFixed(3) : 'N/A';
                        const landLabel = props.land_label || 'Unknown';
                        const safetyPerLen = (props.safety_per_length !== undefined && props.safety_per_length !== null)
                            ? props.safety_per_length.toFixed(6)
                            : 'N/A';
                        let popup = `<b>${props.name || 'Unknown Road'}</b><br>`;
                        popup += `Danger Score: ${safetyScore}<br>`;
                        if (props.length !== undefined) {
                            popup += `Length: ${(props.length / 1000).toFixed(2)} km<br>`;
                        }
                        if (props.travel_time !== undefined) {
                            popup += `Travel Time: ${props.travel_time.toFixed(0)} s<br>`;
                        }
                        popup += `Lights: ${lightCount}<br>`;
                        popup += `Curvature Score: ${curveScore}<br>`;
                        popup += `Darkness Score: ${darknessScore}<br>`;
                        popup += `Highway Risk (0 safest): ${highwayRisk}<br>`;
                        popup += `Highway Tag: ${highwayTag}<br>`;
                        popup += `Land Risk (0 safest): ${landRisk}<br>`;
                        popup += `Land Use: ${landLabel}<br>`;
                        popup += `Danger per Length: ${safetyPerLen}`;
                        layer.bindPopup(popup);
                    }
                }).addTo(map);
                console.log('Lite graph layer added successfully');
            } catch (layerErr) {
                console.error('Error creating lite graph layer:', layerErr);
                throw layerErr;
            }
            
            // Add streetlights
            try {
                if (lightsLayer) {
                    map.removeLayer(lightsLayer);
                }
                
                if (data.lights && data.lights.length > 0) {
                    const lightMarkers = data.lights.map(light => 
                        L.circleMarker([light.lat, light.lon], {
                            radius: 3,
                            fillColor: '#FFFF00',
                            color: '#FFD700',
                            weight: 1,
                            opacity: 0.6,
                            fillOpacity: 0.6
                        })
                    );
                    lightsLayer = L.featureGroup(lightMarkers).addTo(map);
                    console.log('Added', data.lights.length, 'streetlights');
                }
            } catch (lightsErr) {
                console.error('Error adding lights:', lightsErr);
            }

            // Hint to the console that this is the lite payload; fetch full graph in background
            console.log('Loaded lite graph; fetching full graph in background');
            fetch('/api/graph-data').then(r => r.json()).then(full => {
                console.log('/api/graph-data returned', full && full.status);
                if (full && full.status === 'success') {
                    // replace graphLayer with full geometry
                    if (graphLayer) map.removeLayer(graphLayer);
                    graphLayer = L.geoJSON(full.edges, {
                        style: function(feature) {
                            const safetyScore = feature.properties.safety_score || 100;
                            const color = getSafetyColor(safetyScore);
                            return { color: color, weight: 2, opacity: 0.85 };
                        },
                        onEachFeature: function(feature, layer) {
                            const props = feature.properties;
                            const safetyScore = props.safety_score !== undefined ? props.safety_score.toFixed(1) : 'N/A';
                            const lightCount = props.light_count || 0;
                            const curveScore = props.curve_score !== undefined ? props.curve_score.toFixed(3) : 'N/A';
                            const darknessScore = props.darkness_score !== undefined ? props.darkness_score.toFixed(3) : 'N/A';
                            const highwayRisk = props.highway_risk !== undefined ? props.highway_risk.toFixed(3) : 'N/A';
                            const highwayTag = props.highway_tag || 'unknown';
                            const landRisk = props.land_risk !== undefined ? props.land_risk.toFixed(3) : 'N/A';
                            const landLabel = props.land_label || 'Unknown';
                            const safetyPerLen = (props.safety_per_length !== undefined && props.safety_per_length !== null)
                                ? props.safety_per_length.toFixed(6)
                                : 'N/A';
                            let popup = `<b>${props.name || 'Unknown Road'}</b><br>`;
                            popup += `Danger Score: ${safetyScore}<br>`;
                            if (props.length !== undefined) {
                                popup += `Length: ${(props.length / 1000).toFixed(2)} km<br>`;
                            }
                            if (props.travel_time !== undefined) {
                                popup += `Travel Time: ${props.travel_time.toFixed(0)} s<br>`;
                            }
                            popup += `Lights: ${lightCount}<br>`;
                            popup += `Curvature Score: ${curveScore}<br>`;
                            popup += `Darkness Score: ${darknessScore}<br>`;
                            popup += `Highway Risk (0 safest): ${highwayRisk}<br>`;
                            popup += `Highway Tag: ${highwayTag}<br>`;
                            popup += `Land Risk (0 safest): ${landRisk}<br>`;
                            popup += `Land Use: ${landLabel}<br>`;
                            popup += `Danger per Length: ${safetyPerLen}`;
                            layer.bindPopup(popup);
                        }
                    }).addTo(map);
                    // hide loader when full graph arrives
                    if (loader) {
                        loader.textContent = 'Full map loaded';
                        setTimeout(() => { loader.style.display = 'none'; }, 600);
                    }
                } else if (loader) {
                    // if full failed, hide loader after a moment and keep lite
                    setTimeout(() => { loader.style.display = 'none'; }, 600);
                }
            }).catch(e => {
                console.warn('Failed to fetch full graph:', e);
                if (loader) setTimeout(() => { loader.style.display = 'none'; }, 600);
            });
            
            console.log('Graph data loaded successfully');
        }
    } catch (error) {
        console.error('Error loading graph data:', error);
        showError('Failed to load map data');
    }
}

// Get color based on safety score (blue = safe, red = dangerous)
function getSafetyColor(score) {
    // score: 0-150 (lower is safer)
    // 0-50: blue (safe)
    // 50-100: yellow (medium)
    // 100-150: red (dangerous)
    
    if (score <= 50) {
        return '#0066ff'; // Blue
    } else if (score <= 100) {
        return '#ffcc00'; // Yellow
    } else {
        return '#ff0000'; // Red
    }
}

// Set start point
function setStartPoint(lat, lon, preserveInput = false) {
    // Validate bounds
    if (!isWithinBounds(lat, lon)) {
        showError(`Start point (${lat.toFixed(4)}, ${lon.toFixed(4)}) is outside the service area. Please select a location within the boundary.`);
        return false;
    }
    
    // Only update input box if not preserving original text
    if (!preserveInput) {
        document.getElementById('startInput').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
    
    if (startMarker) {
        map.removeLayer(startMarker);
    }
    
    startMarker = L.marker([lat, lon], {
        icon: L.icon({
            iconUrl: getMarkerIcon('green'),
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        })
    }).addTo(map).bindPopup('Start Point');
    return true;
}

// Set end point
function setEndPoint(lat, lon, preserveInput = false) {
    // Validate bounds
    if (!isWithinBounds(lat, lon)) {
        showError(`End point (${lat.toFixed(4)}, ${lon.toFixed(4)}) is outside the service area. Please select a location within the boundary.`);
        return false;
    }
    
    // Only update input box if not preserving original text
    if (!preserveInput) {
        document.getElementById('endInput').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
    
    if (endMarker) {
        map.removeLayer(endMarker);
    }
    
    endMarker = L.marker([lat, lon], {
        icon: L.icon({
            iconUrl: getMarkerIcon('purple'),
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        })
    }).addTo(map).bindPopup('End Point');
    return true;
}

// Create simple marker icons using SVG
function getMarkerIcon(color) {
    const colors = {
        'green': '#00ff00',
        'purple': '#a200ffff'
    };
    const svgIcon = `
        <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" fill="${colors[color]}" stroke="white" stroke-width="2"/>
        </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(svgIcon);
}

// Routes to nodes - convert route nodes to LatLng
function routeNodesToLatLng(geojson, G) {
    // This is handled by the backend returning GeoJSON directly
    return L.geoJSON(geojson, {
        style: { color: 'blue', weight: 3 }
    });
}

// Compute routes
async function computeRoutes() {
    const startInput = document.getElementById('startInput').value.trim();
    const endInput = document.getElementById('endInput').value.trim();
    
    if (!startInput || !endInput) {
        showError('Please enter both start and end locations');
        return;
    }
    
    // Show loading indicator and visibly disable the button
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('resultsPanel').style.display = 'none';
    const computeBtn = document.getElementById('computeBtn');
    const prevBtnHTML = computeBtn ? computeBtn.innerHTML : null;
    if (computeBtn) {
        computeBtn.disabled = true;
        computeBtn.innerHTML = '⏳ Computing…';
        computeBtn.style.opacity = '0.75';
        computeBtn.style.cursor = 'wait';
    }
    
    try {
        // Parse coordinates from input if they look like coordinates
        const start = parseInput(startInput);
        const end = parseInput(endInput);

        const response = await fetch('/api/routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                start: start,
                end: end
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Set markers (they have bounds validation built in)
            // Pass true to preserve original input text (address or coordinates)
            const startSet = setStartPoint(data.start.lat, data.start.lon, true);
            const endSet = setEndPoint(data.end.lat, data.end.lon, true);
            
            // If markers couldn't be set due to bounds, stop here
            if (!startSet || !endSet) {
                return;
            }
            
            // Remove old route layers
            if (fastestRouteLayer) map.removeLayer(fastestRouteLayer);
            if (safestRouteLayer) map.removeLayer(safestRouteLayer);
            
            // Add routes with different colors
            // Safest route: cyan, solid
            if (data.safest.geojson) {
                const halo = L.geoJSON(data.safest.geojson, {
                    style: {
                        color: '#ffffff',
                        weight: 10,
                        opacity: 0.9
                    }
                });
                const cyanLine = L.geoJSON(data.safest.geojson, {
                    style: {
                        color: '#00FFFF',
                        weight: 6,
                        opacity: 0.9
                    }
                }).bindPopup('<b>🛡️ Safest Route</b>');
                safestRouteLayer = L.layerGroup([halo, cyanLine]).addTo(map);
            }

            // Fastest route: magenta, dashed
            if (data.fastest.geojson) {
                fastestRouteLayer = L.geoJSON(data.fastest.geojson, {
                    style: {
                        color: '#FF00FF',
                        weight: 4,
                        opacity: 1.0,
                        dashArray: '8,6'
                    }
                }).addTo(map).bindPopup('<b>⚡ Fastest Route</b>');
            }
            
            // Display results
            displayResults(data.fastest.data, data.safest.data);
            
            // Fit map to show all routes
            if (fastestRouteLayer || safestRouteLayer || startMarker || endMarker) {
                // gather all candidate layers
                const candidates = [];
                if (startMarker) candidates.push(startMarker);
                if (endMarker) candidates.push(endMarker);
                if (fastestRouteLayer) candidates.push(fastestRouteLayer);
                if (safestRouteLayer) candidates.push(safestRouteLayer);

                // compute aggregate bounds
                let bounds = null;
                candidates.forEach(layer => {
                    try {
                        if (typeof layer.getBounds === 'function') {
                            const b = layer.getBounds();
                            if (b && b.isValid && b.isValid()) {
                                bounds = bounds ? bounds.extend(b) : b;
                            }
                        } else if (typeof layer.getLatLng === 'function') {
                            const ll = layer.getLatLng();
                            const b = L.latLngBounds(ll, ll);
                            bounds = bounds ? bounds.extend(b) : b;
                        } else if (typeof layer.getLayers === 'function') {
                            // LayerGroup or FeatureGroup: iterate its layers
                            layer.getLayers().forEach(sub => {
                                try {
                                    if (typeof sub.getBounds === 'function') {
                                        const sb = sub.getBounds();
                                        if (sb && sb.isValid && sb.isValid()) {
                                            bounds = bounds ? bounds.extend(sb) : sb;
                                        }
                                    } else if (typeof sub.getLatLng === 'function') {
                                        const ll = sub.getLatLng();
                                        const sb = L.latLngBounds(ll, ll);
                                        bounds = bounds ? bounds.extend(sb) : sb;
                                    }
                                } catch (e) { /* ignore malformed sub-layers */ }
                            });
                        }
                    } catch (e) {
                        // ignore problematic layer
                    }
                });

                if (bounds && bounds.isValid && bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50] });
                }
            }
            
        } else {
            showError(data.message || 'Failed to compute routes');
        }
    } catch (error) {
        console.error('Error computing routes:', error);
        showError('Error computing routes: ' + error.message);
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        const computeBtn = document.getElementById('computeBtn');
        if (computeBtn) {
            computeBtn.disabled = false;
            if (prevBtnHTML !== null) computeBtn.innerHTML = prevBtnHTML;
            computeBtn.style.opacity = '';
            computeBtn.style.cursor = '';
        }
    }

}

// Parse input - could be address or coordinates
function parseInput(input) {
    // Check if it looks like coordinates (lat, lon)
    const coordMatch = input.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
        return [parseFloat(coordMatch[1]), parseFloat(coordMatch[2])];
    }
    // Otherwise treat as address
    return input;
}

// Display results
function displayResults(fastestData, safestData) {
    const resultsPanel = document.getElementById('resultsPanel');
    
    // Fastest route
    if (fastestData.distance_m > 0) {
        document.getElementById('fastestDistance').textContent = 
            (fastestData.distance_m / 1609.34).toFixed(2) + ' mi';
        document.getElementById('fastestTime').textContent = 
            formatTime(fastestData.travel_time_s);
        document.getElementById('fastestScore').textContent =
            (fastestData.safety_score ? fastestData.safety_score.toFixed(1) : 'N/A');
    } else {
        document.getElementById('fastestDistance').textContent = 'N/A';
        document.getElementById('fastestTime').textContent = 'N/A';
        document.getElementById('fastestScore').textContent = 'N/A';
    }
    
    // Safest route
    if (safestData.distance_m > 0) {
        document.getElementById('safestDistance').textContent = 
            (safestData.distance_m / 1609.34).toFixed(2) + ' mi';
        document.getElementById('safestTime').textContent = 
            formatTime(safestData.travel_time_s);
        document.getElementById('safestScore').textContent = 
            safestData.safety_score.toFixed(1);
    } else {
        document.getElementById('safestDistance').textContent = 'N/A';
        document.getElementById('safestTime').textContent = 'N/A';
        document.getElementById('safestScore').textContent = 'N/A';
    }
    
    resultsPanel.style.display = 'block';
}

// Format time in seconds to readable format
function formatTime(seconds) {
    if (seconds < 60) {
        return Math.round(seconds) + ' sec';
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${minutes}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

// Show error message
function showError(message) {
    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const controlsPanel = document.querySelector('.controls-panel');
    controlsPanel.insertBefore(errorDiv, controlsPanel.firstChild);
    
    // Remove error after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Clear results
function clearResults() {
    document.getElementById('startInput').value = '';
    document.getElementById('endInput').value = '';
    document.getElementById('resultsPanel').style.display = 'none';
    
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    if (fastestRouteLayer) map.removeLayer(fastestRouteLayer);
    if (safestRouteLayer) map.removeLayer(safestRouteLayer);
    
    startMarker = null;
    endMarker = null;
    fastestRouteLayer = null;
    safestRouteLayer = null;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    initMap();
    
    // Compute button
    document.getElementById('computeBtn').addEventListener('click', computeRoutes);
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearResults);
    
    // Map click buttons
    document.getElementById('startMapBtn').addEventListener('click', function() {
        mapClickMode = mapClickMode === 'start' ? null : 'start';
        this.style.background = mapClickMode === 'start' ? '#667eea' : '';
        this.style.color = mapClickMode === 'start' ? 'white' : '';
    });
    
    document.getElementById('endMapBtn').addEventListener('click', function() {
        mapClickMode = mapClickMode === 'end' ? null : 'end';
        this.style.background = mapClickMode === 'end' ? '#667eea' : '';
        this.style.color = mapClickMode === 'end' ? 'white' : '';
    });
    
    // Allow Enter key to submit
    document.getElementById('startInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') computeRoutes();
    });
    document.getElementById('endInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') computeRoutes();
    });
});
