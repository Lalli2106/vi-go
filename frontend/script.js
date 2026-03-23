// Vi-Go Dashboard Script
const API = '';
let currentUser = null;
let selectedRoute = null;
let map = null;
let busMarker = null;
let stopMarkers = [];
let routeLine = null;
let sharingLocation = false;
let watchId = null;
let pollInterval = null;
let statuses = [];
let busLocation = null;

const STATUS_COLORS = { ready: '#22c55e', onway: '#f59e0b', absent: '#ef4444' };

// ===== Haversine =====
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatETA(distKm) {
    const mins = Math.round((distKm / 25) * 60);
    if (mins < 1) return '< 1 min';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins/60)}h ${mins%60}m`;
}

// ===== Map Icons =====
function createStopIcon(order, stopStatuses) {
    let dotsHtml = '';
    if (stopStatuses.length > 0) {
        const dots = stopStatuses.map(s => {
            const color = STATUS_COLORS[s.status];
            return `<span class="status-token" style="background:${color}"><span class="token-tooltip">${s.userName}</span></span>`;
        });
        dotsHtml = `<span class="status-dots-container">${dots.join('')}</span>`;
    }
    return L.divIcon({
        className: 'custom-stop-icon',
        html: `<span class="stop-marker"><span class="stop-circle">${order}</span>${dotsHtml}</span>`,
        iconSize: [120, 28],
        iconAnchor: [14, 14]
    });
}

const busIcon = L.divIcon({
    className: 'custom-bus-icon',
    html: '<span class="bus-marker">🚌</span>',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
});

// ===== OSRM Road Route =====
async function fetchRoadRoute(stops) {
    const allCoords = [];
    for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i], to = stops[i + 1];
        const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
        try {
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
            const data = await res.json();
            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                const segCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                if (i > 0 && segCoords.length > 0) segCoords.shift();
                allCoords.push(...segCoords);
                continue;
            }
        } catch (e) {
            console.warn(`OSRM segment ${i} failed`, e);
        }
        if (allCoords.length === 0) allCoords.push([from.lat, from.lng]);
        allCoords.push([to.lat, to.lng]);
    }
    return allCoords.length > 0 ? allCoords : stops.map(s => [s.lat, s.lng]);
}

// ===== Init =====
async function init() {
    try {
        const userRes = await fetch(API + '/me', { credentials: 'include' });
        if (!userRes.ok) { window.location.href = '/login.html'; return; }
        currentUser = await userRes.json();

        const routeId = sessionStorage.getItem('selectedRouteId');
        if (!routeId) { window.location.href = '/routes.html'; return; }

        const routesRes = await fetch(API + '/routes', { credentials: 'include' });
        const routes = await routesRes.json();
        selectedRoute = routes.find(r => r.id === routeId);
        if (!selectedRoute) { window.location.href = '/routes.html'; return; }

        renderSidebar();
        initMap();
        startPolling();
    } catch {
        window.location.href = '/login.html';
    }
}

// ===== Map Init =====
function initMap() {
    const bounds = L.latLngBounds(selectedRoute.stops.map(s => [s.lat, s.lng]));
    map = L.map('map', { zoomControl: true, attributionControl: false }).fitBounds(bounds, { padding: [40, 40] });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    selectedRoute.stops.forEach(stop => {
        const marker = L.marker([stop.lat, stop.lng], { icon: createStopIcon(stop.order, []) })
            .addTo(map)
            .bindPopup(`<b>${stop.name}</b><br>Stop #${stop.order}`);
        stopMarkers.push(marker);
    });

    fetchRoadRoute(selectedRoute.stops).then(roadCoords => {
        if (!map) return;
        routeLine = L.polyline(roadCoords, {
            color: '#2563eb', weight: 5, opacity: 0.7, lineJoin: 'round', lineCap: 'round'
        }).addTo(map);
    });

    // Resize handling
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(document.getElementById('map'));
}

// ===== Sidebar Render =====
function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isDriver = currentUser.role === 'driver';

    let html = `
        <div class="sidebar-header">
            <div>
                <h2>${selectedRoute.name}</h2>
                <div class="user-info">${currentUser.display_name} • ${isDriver ? 'Driver' : 'Student'}</div>
            </div>
            <button class="back-btn" onclick="goBack()" title="Back to routes">←</button>
        </div>

        <div class="section">
            <button class="share-btn ${sharingLocation ? 'stop' : 'start'}" onclick="toggleSharing()">
                📍 ${sharingLocation ? 'Stop Sharing Location' : 'Share Live Location'}
            </button>
            <div id="sharingInfo"></div>
        </div>
    `;

    if (isDriver) {
        html += `
            <div class="section">
                <h3>Stop Summary</h3>
                <div class="driver-summary" id="driverSummary"></div>
            </div>
        `;
    } else {
        html += `
            <div class="section">
                <h3>Your Stop</h3>
                <select class="stop-select" id="stopSelect" onchange="handleStopChange(this.value)">
                    <option value="">Select your stop</option>
                    ${selectedRoute.stops.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
            </div>
            <div class="section" id="statusSection" style="display:none">
                <h3>Your Status</h3>
                <div class="status-buttons" id="statusButtons"></div>
                <button class="reset-btn" onclick="resetStatus()">🔄 Reset</button>
            </div>
        `;
    }

    html += `
        <div class="section">
            <h3>Stops & ETA</h3>
            <div class="stops-list" id="stopsList"></div>
        </div>
    `;

    sidebar.innerHTML = html;
    updateStopsList();
    if (isDriver) updateDriverSummary();
}

// ===== Polling =====
function startPolling() {
    pollData();
    pollInterval = setInterval(pollData, 1500);
}

async function pollData() {
    try {
        // Fetch statuses
        const statusRes = await fetch(`${API}/get-statuses?route_id=${selectedRoute.id}`, { credentials: 'include' });
        if (statusRes.ok) statuses = await statusRes.json();

        // Fetch bus location
        const locRes = await fetch(`${API}/get-location?route_id=${selectedRoute.id}`, { credentials: 'include' });
        if (locRes.ok) {
            const loc = await locRes.json();
            busLocation = loc;
        }

        updateMap();
        updateStopsList();
        updateSharingInfo();
        if (currentUser.role === 'driver') updateDriverSummary();
        updateStatusButtons();
    } catch (e) {
        console.warn('Poll error', e);
    }
}

// ===== Map Updates =====
function updateMap() {
    // Update bus marker
    if (busLocation && busLocation.route_id === selectedRoute.id) {
        const latlng = L.latLng(busLocation.lat, busLocation.lng);
        if (busMarker) {
            busMarker.setLatLng(latlng);
        } else {
            busMarker = L.marker(latlng, { icon: busIcon, zIndexOffset: 1000 })
                .addTo(map)
                .bindPopup(`<b>Bus Location</b><br>Shared by: ${busLocation.shared_by}`);
        }
    } else if (busMarker) {
        busMarker.remove();
        busMarker = null;
    }

    // Update stop icons with status dots
    selectedRoute.stops.forEach((stop, i) => {
        const marker = stopMarkers[i];
        if (!marker) return;
        const stopStatuses = statuses.filter(s => s.stopId === stop.id && s.routeId === selectedRoute.id);
        marker.setIcon(createStopIcon(stop.order, stopStatuses));

        const readyCount = stopStatuses.filter(s => s.status === 'ready').length;
        const onwayCount = stopStatuses.filter(s => s.status === 'onway').length;
        const absentCount = stopStatuses.filter(s => s.status === 'absent').length;

        let etaHtml = '';
        if (busLocation && busLocation.route_id === selectedRoute.id) {
            const dist = haversine(busLocation.lat, busLocation.lng, stop.lat, stop.lng);
            etaHtml = `<br><b>ETA:</b> ${formatETA(dist)}`;
        } else {
            etaHtml = '<br>ETA not available';
        }

        let statusHtml = '';
        if (stopStatuses.length > 0) {
            statusHtml = `<br>🟢 ${readyCount} 🟠 ${onwayCount} 🔴 ${absentCount}`;
        }

        marker.setPopupContent(`<b>${stop.name}</b><br>Stop #${stop.order}${etaHtml}${statusHtml}`);
    });
}

// ===== Stops List =====
function updateStopsList() {
    const list = document.getElementById('stopsList');
    if (!list) return;

    list.innerHTML = selectedRoute.stops.map(stop => {
        let eta = 'No ETA';
        if (busLocation && busLocation.route_id === selectedRoute.id) {
            const dist = haversine(busLocation.lat, busLocation.lng, stop.lat, stop.lng);
            const mins = Math.round((dist / 25) * 60);
            eta = mins < 1 ? '< 1 min' : mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
        }
        const ss = statuses.filter(s => s.stopId === stop.id);
        return `
            <div class="stop-item">
                <span class="stop-order">${stop.order}</span>
                <div class="stop-details">
                    <div class="stop-name">${stop.name}</div>
                    <div class="stop-eta">${eta}</div>
                </div>
                <div class="stop-status-dots">
                    🟢${ss.filter(s=>s.status==='ready').length}
                    🟠${ss.filter(s=>s.status==='onway').length}
                    🔴${ss.filter(s=>s.status==='absent').length}
                </div>
            </div>
        `;
    }).join('');
}

// ===== Driver Summary =====
function updateDriverSummary() {
    const summary = document.getElementById('driverSummary');
    if (!summary) return;

    const routeStatuses = statuses.filter(s => s.routeId === selectedRoute.id);
    summary.innerHTML = selectedRoute.stops.map(stop => {
        const ss = routeStatuses.filter(s => s.stopId === stop.id);
        const ready = ss.filter(s => s.status === 'ready').length;
        const onway = ss.filter(s => s.status === 'onway').length;
        const absent = ss.filter(s => s.status === 'absent').length;
        if (ready + onway + absent === 0) return '';
        return `
            <div class="summary-item">
                <span class="name">${stop.name}</span>
                <div class="summary-counts">
                    🟢${ready} 🟠${onway} 🔴${absent}
                </div>
            </div>
        `;
    }).join('');
}

// ===== Sharing Info =====
function updateSharingInfo() {
    const info = document.getElementById('sharingInfo');
    if (!info) return;

    if (busLocation && busLocation.route_id === selectedRoute.id && busLocation.shared_by !== currentUser.display_name) {
        info.innerHTML = `<div class="sharing-info"><span class="pulse-dot"></span>${busLocation.shared_by} is sharing location</div>`;
    } else {
        info.innerHTML = '';
    }
}

// ===== Status Buttons =====
function updateStatusButtons() {
    const section = document.getElementById('statusSection');
    const btns = document.getElementById('statusButtons');
    if (!section || !btns) return;

    const stopSelect = document.getElementById('stopSelect');
    if (!stopSelect || !stopSelect.value) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    const currentStatus = statuses.find(s => s.userName === currentUser.display_name && s.routeId === selectedRoute.id);
    const activeStatus = currentStatus ? currentStatus.status : null;

    const statusDefs = [
        { status: 'ready', label: 'Ready', emoji: '🟢', activeClass: 'active-ready' },
        { status: 'onway', label: 'On the way', emoji: '🟠', activeClass: 'active-onway' },
        { status: 'absent', label: 'Absent', emoji: '🔴', activeClass: 'active-absent' },
    ];

    btns.innerHTML = statusDefs.map(d => `
        <button class="status-btn ${activeStatus === d.status ? d.activeClass : ''}" onclick="updateStatus('${d.status}')">
            <span class="emoji">${d.emoji}</span>
            ${d.label}
        </button>
    `).join('');
}

// ===== Actions =====
function handleStopChange(stopId) {
    const section = document.getElementById('statusSection');
    if (stopId) {
        section.style.display = 'block';
        updateStatusButtons();
    } else {
        section.style.display = 'none';
    }
}

async function updateStatus(status) {
    const stopSelect = document.getElementById('stopSelect');
    if (!stopSelect || !stopSelect.value) return;

    await fetch(API + '/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stop_id: stopSelect.value, route_id: selectedRoute.id, status })
    });
    pollData();
}

async function resetStatus() {
    await fetch(API + '/reset-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ route_id: selectedRoute.id })
    });
    pollData();
}

function toggleSharing() {
    if (sharingLocation) {
        // Stop sharing
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        sharingLocation = false;
        fetch(API + '/stop-sharing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ route_id: selectedRoute.id })
        });
        renderSidebar();
        return;
    }

    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }

    sharingLocation = true;
    renderSidebar();

    // Get immediate position
    navigator.geolocation.getCurrentPosition(pos => {
        sendLocation(pos.coords.latitude, pos.coords.longitude);
    }, () => {}, { enableHighAccuracy: true, timeout: 5000 });

    // Watch for updates
    watchId = navigator.geolocation.watchPosition(pos => {
        sendLocation(pos.coords.latitude, pos.coords.longitude);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 2000 });
}

async function sendLocation(lat, lng) {
    await fetch(API + '/update-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lng, route_id: selectedRoute.id })
    });
}

function goBack() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    sharingLocation = false;
    if (pollInterval) clearInterval(pollInterval);
    window.location.href = '/routes.html';
}

// ===== Start =====
init();
