import React, { useEffect, useState } from "react";
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
  const [userId, setUserId] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [userPaths, setUserPaths] = useState({});
  const [lastLocation, setLastLocation] = useState(null);

  // Track user auth and status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const statusRef = doc(firestore, "status", user.uid);
        await setDoc(statusRef, {
          email: user.email,
          online: true,
          lastOnline: serverTimestamp(),
        });
        window.addEventListener("beforeunload", () => {
          setDoc(statusRef, {
            online: false,
            lastOnline: serverTimestamp(),
          });
        });
      } else {
        window.location.href = "/login";
      }
    });
    return unsubscribe;
  }, []);

  // Watch user GPS and save to Firestore
  useEffect(() => {
    if (!userId) return;

    const MIN_DISTANCE = 2; // meters
    const MIN_TIME = 1000; // ms

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();

        if (
          lastLocation &&
          getDistance(lastLocation, { lat: latitude, lng: longitude }) < MIN_DISTANCE &&
          now - lastLocation.time < MIN_TIME
        )
          return;

        setLastLocation({ lat: latitude, lng: longitude, time: now });
        setCurrentPosition([latitude, longitude]);

        const locRef = collection(firestore, "livePaths", userId, "locations");
        await addDoc(locRef, {
          lat: latitude,
          lng: longitude,
          timestamp: serverTimestamp(),
        });
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId, lastLocation]);

  // Listen to all users' location points with collectionGroup
  useEffect(() => {
    const locsRef = collectionGroup(firestore, "locations");
    const q = query(locsRef, orderBy("timestamp"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trails = {};

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.lat && data.lng && data.timestamp) {
          // Extract userId from path livePaths/{userId}/locations/{docId}
          const userIdFromPath = doc.ref.parent.parent.id;

          if (!trails[userIdFromPath]) trails[userIdFromPath] = [];
          trails[userIdFromPath].push(data);
        }
      });

      // Sort each user's trail by timestamp.seconds
      Object.keys(trails).forEach((uid) => {
        trails[uid].sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
      });

      setUserPaths(trails);
    });

    return () => unsubscribe();
  }, []);

  if (!currentPosition) return <div style={{ padding: 20 }}>Waiting for GPS location...</div>;

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={currentPosition} zoom={16} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {Object.entries(userPaths).map(([uid, trail]) => {
          if (trail.length === 0) return null;
          const last = trail[trail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={userIcon}>
                <Popup>
                  <b>🧍 User ID:</b> {uid}
                  <br />
                  <b>🕒 Time:</b>{" "}
                  {last.timestamp?.toDate
                    ? last.timestamp.toDate().toLocaleString()
                    : new Date().toLocaleString()}
                </Popup>
              </Marker>

              {trail.length > 1 && (
                <Polyline
                  positions={trail.map((p) => [p.lat, p.lng])}
                  color="red"
                  weight={3}
                  opacity={0.7}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Marker for current user position */}
        <Marker position={currentPosition} icon={userIcon}>
          <Popup>
            🧍 You (ID): <b>{userId}</b>
            <br />
            🕒 Time: <b>{new Date().toLocaleString()}</b>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

export default App;








