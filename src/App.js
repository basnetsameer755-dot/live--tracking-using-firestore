import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const currentUserIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/64/64113.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function getDistance(loc1, loc2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLng = toRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(loc1.lat)) * Math.cos(toRad(loc2.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function App() {
  const [currentPosition, setCurrentPosition] = useState(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(null);
  const [manualTrail, setManualTrail] = useState([]);
  const [inputLat, setInputLat] = useState("");
  const [inputLng, setInputLng] = useState("");
  const lastLocation = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    const MIN_DISTANCE = 2;
    const MIN_TIME = 1000;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();

        if (lastLocation.current) {
          const dist = getDistance(lastLocation.current, { lat: latitude, lng: longitude });
          const timeDiff = now - lastLocation.current.time;
          if (dist < MIN_DISTANCE && timeDiff < MIN_TIME) return;
        }

        lastLocation.current = { lat: latitude, lng: longitude, time: now };
        setCurrentPosition([latitude, longitude]);
        setCurrentTimestamp(new Date(now));
      },
      (err) => {
        console.error(err);
        alert("Error getting location");
      },
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  function handleAddLocation() {
    const lat = parseFloat(inputLat);
    const lng = parseFloat(inputLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid latitude and longitude");
      return;
    }

    setManualTrail((prev) => [
      ...prev,
      { lat, lng, timestamp: new Date() }
    ]);
    setInputLat("");
    setInputLng("");
  }

  // Handle dragging manual markers to update their location and timestamp
  function onManualMarkerDrag(index, event) {
    const { lat, lng } = event.target.getLatLng();
    setManualTrail((prev) => {
      const updated = [...prev];
      updated[index] = { lat, lng, timestamp: new Date() };
      return updated;
    });
  }

  const mapCenter =
    currentPosition ||
    (manualTrail.length > 0
      ? [manualTrail[manualTrail.length - 1].lat, manualTrail[manualTrail.length - 1].lng]
      : [27.7, 85.3]);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <div style={{ padding: 10, backgroundColor: "#eee" }}>
        <input
          placeholder="Latitude"
          value={inputLat}
          onChange={(e) => setInputLat(e.target.value)}
          style={{ marginRight: 5 }}
        />
        <input
          placeholder="Longitude"
          value={inputLng}
          onChange={(e) => setInputLng(e.target.value)}
          style={{ marginRight: 5 }}
        />
        <button onClick={handleAddLocation}>Add Location</button>
      </div>

      <MapContainer center={mapCenter} zoom={16} style={{ height: "90%", width: "100%" }} scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Current position marker */}
        {currentPosition && currentTimestamp && (
          <Marker position={currentPosition} icon={currentUserIcon} draggable={false}>
            <Popup>
              Latitude: {currentPosition[0].toFixed(6)}
              <br />
              Longitude: {currentPosition[1].toFixed(6)}
              <br />
              Time: {currentTimestamp.toLocaleString()}
            </Popup>
          </Marker>
        )}

        {/* Manual markers - draggable and update on move */}
        {manualTrail.map((pos, idx) => (
          <Marker
            key={idx}
            position={[pos.lat, pos.lng]}
            icon={userIcon}
            draggable={true}
            eventHandlers={{
              dragend: (event) => onManualMarkerDrag(idx, event),
            }}
          >
            <Popup>
              Latitude: {pos.lat.toFixed(6)}
              <br />
              Longitude: {pos.lng.toFixed(6)}
              <br />
              Time: {pos.timestamp.toLocaleString()}
            </Popup>
          </Marker>
        ))}

        {/* Draw polyline connecting manual markers */}
        {manualTrail.length > 1 && (
          <Polyline
            positions={manualTrail.map((p) => [p.lat, p.lng])}
            color="red"
            weight={3}
            opacity={0.8}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default App;









