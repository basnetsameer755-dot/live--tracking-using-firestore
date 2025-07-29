import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { firestore, auth, onAuthStateChanged } from "./firebase";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Haversine distance in meters
function getDistance(loc1, loc2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLng = toRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(loc1.lat)) *
      Math.cos(toRad(loc2.lat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Reverse geocode: lat,lng → address string
async function getAddress(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await res.json();
    return data.display_name || "Unknown location";
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return "Address not found";
  }
}

function App() {
  const [userId, setUserId] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [userPaths, setUserPaths] = useState({});
  const [authChecked, setAuthChecked] = useState(false);
  const lastLocation = useRef(null);
  const appStartTime = useRef(Date.now());

  // Manual lat/lng input state
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualMarker, setManualMarker] = useState(null);

  // Auth state listener + status update
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        try {
          const statusRef = doc(firestore, "status", user.uid);
          await setDoc(
            statusRef,
            {
              email: user.email,
              online: true,
              lastOnline: serverTimestamp(),
            },
            { merge: true }
          );

          window.addEventListener("beforeunload", () => {
            setDoc(
              statusRef,
              {
                online: false,
                lastOnline: serverTimestamp(),
              },
              { merge: true }
            );
          });
        } catch (error) {
          console.error("Error updating status:", error);
        }
        setAuthChecked(true);
      } else {
        window.location.href = "/login";
      }
    });
    return unsubscribe;
  }, []);

  // Watch device GPS and push location updates
  useEffect(() => {
    if (!userId || !authChecked) return;

    const MIN_DISTANCE = 2; // meters
    const MIN_TIME = 1000; // ms

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();

        if (lastLocation.current) {
          const dist = getDistance(lastLocation.current, {
            lat: latitude,
            lng: longitude,
          });
          const timeDiff = now - lastLocation.current.time;
          if (dist < MIN_DISTANCE && timeDiff < MIN_TIME) return;
        }

        lastLocation.current = { lat: latitude, lng: longitude, time: now };
        setCurrentPosition([latitude, longitude]);

        try {
          await addDoc(collection(firestore, "locations"), {
            userId,
            lat: latitude,
            lng: longitude,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Error adding location:", error);
        }
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId, authChecked]);

  // Listen to locations and build paths, then get addresses for last points
  useEffect(() => {
    if (!authChecked) return;

    const q = query(collection(firestore, "locations"), orderBy("timestamp"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const paths = {};
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (!data.userId) return;

          if (data.timestamp?.toDate) {
            const ts = data.timestamp.toDate().getTime();
            if (ts < appStartTime.current) return;
          }

          if (!paths[data.userId]) {
            paths[data.userId] = [];
          }

          paths[data.userId].push({
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp?.toDate() || new Date(),
            address: null,
          });
        });

        const fetchAddresses = async () => {
          const updatedPaths = { ...paths };
          for (const uid in updatedPaths) {
            const trail = updatedPaths[uid];
            const last = trail[trail.length - 1];
            if (last && !last.address) {
              last.address = await getAddress(last.lat, last.lng);
            }
          }
          setUserPaths(updatedPaths);
        };

        fetchAddresses();
      },
      (error) => {
        console.error("Firestore error:", error);
      }
    );

    return unsubscribe;
  }, [authChecked]);

  if (!authChecked) {
    return <div style={{ padding: 20 }}>Checking authentication...</div>;
  }

  if (!currentPosition) {
    return <div style={{ padding: 20 }}>Waiting for GPS location...</div>;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* Manual Lat/Lng Input */}
      <div
        style={{
          padding: "10px",
          background: "#f0f0f0",
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          borderRadius: 8,
          boxShadow: "0 0 5px rgba(0,0,0,0.2)",
        }}
      >
        <label>Latitude: </label>
        <input
          type="text"
          value={manualLat}
          onChange={(e) => setManualLat(e.target.value)}
          style={{ marginRight: "10px", width: "100px" }}
        />
        <label>Longitude: </label>
        <input
          type="text"
          value={manualLng}
          onChange={(e) => setManualLng(e.target.value)}
          style={{ marginRight: "10px", width: "100px" }}
        />
        <button
          onClick={async () => {
            const lat = parseFloat(manualLat);
            const lng = parseFloat(manualLng);
            if (isNaN(lat) || isNaN(lng)) {
              alert("Please enter valid numbers for latitude and longitude");
              return;
            }
            const address = await getAddress(lat, lng);
            setManualMarker({ lat, lng, address });
          }}
        >
          Show Location
        </button>
      </div>

      <MapContainer
        center={currentPosition}
        zoom={16}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Existing tracked users */}
        {Object.entries(userPaths).map(([uid, trail]) => {
          const validTrail = trail.filter((p) => p.lat && p.lng);
          if (validTrail.length < 1) return null;

          const last = validTrail[validTrail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={userIcon}>
                <Popup>
                  🧍 User ID: <b>{uid}</b>
                  <br />
                  🕒 Time: {last.timestamp?.toLocaleString() || "Loading..."}
                  <br />
                  📍 Address: {last.address || "Loading address..."}
                </Popup>
              </Marker>
              {validTrail.length > 1 && (
                <Polyline
                  positions={validTrail.map((p) => [p.lat, p.lng])}
                  color="red"
                  weight={3}
                  opacity={0.8}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Manual marker from input */}
        {manualMarker && (
          <Marker position={[manualMarker.lat, manualMarker.lng]} icon={userIcon}>
            <Popup>
              📍 Manually entered location:
              <br />
              {manualMarker.address}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default App;









