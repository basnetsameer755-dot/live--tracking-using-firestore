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
  const lastLocation = useRef(null);
  const unsubscribes = useRef({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const statusRef = doc(firestore, "status", user.uid);
        await setDoc(statusRef, {
          email: user.email,
          online: true,
          lastOnline: new Date(),
        });
        window.addEventListener("beforeunload", () => {
          setDoc(statusRef, {
            online: false,
            lastOnline: new Date(),
          });
        });
      } else {
        window.location.href = "/login";
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!userId) return;

    const MIN_DISTANCE = 2;
    const MIN_TIME = 1000;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();

        if (lastLocation.current) {
          const dist = getDistance(lastLocation.current, { lat: latitude, lng: longitude });
          const timeDiff = now - lastLocation.current.time;
          if (dist < MIN_DISTANCE && timeDiff < MIN_TIME) return;
        }

        lastLocation.current = { lat: latitude, lng: longitude, time: now };
        setCurrentPosition([latitude, longitude]);

        const locRef = collection(firestore, "livePaths", userId, "locations");
        await addDoc(locRef, {
          lat: latitude,
          lng: longitude,
          timestamp: new Date(), // ✅ use local time to ensure it works
        });
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId]);

  useEffect(() => {
    const mainRef = collection(firestore, "livePaths");
    const unsubscribeMain = onSnapshot(mainRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const uid = change.doc.id;

        if (change.type === "removed") {
          if (unsubscribes.current[uid]) unsubscribes.current[uid]();
          delete unsubscribes.current[uid];
          setUserPaths((prev) => {
            const copy = { ...prev };
            delete copy[uid];
            return copy;
          });
          return;
        }

        const locQuery = query(
          collection(firestore, "livePaths", uid, "locations"),
          orderBy("timestamp")
        );

        if (unsubscribes.current[uid]) unsubscribes.current[uid]();
        unsubscribes.current[uid] = onSnapshot(locQuery, (locSnap) => {
          const path = [];
          locSnap.forEach((doc) => {
            const data = doc.data();
            if (data.timestamp) path.push(data); // ✅ skip invalid points
          });
          setUserPaths((prev) => ({ ...prev, [uid]: path }));
        });
      });
    });

    return () => {
      unsubscribeMain();
      Object.values(unsubscribes.current).forEach((fn) => fn());
    };
  }, []);

  if (!currentPosition) return <div style={{ padding: 20 }}>Waiting for GPS location...</div>;

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={currentPosition} zoom={16} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {Object.entries(userPaths).map(([uid, trail]) => {
          if (!trail.length) return null;
          const last = trail[trail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={userIcon}>
                <Popup>
                  <b>🧍 User ID:</b> {uid}
                  <br />
                  <b>🕒 Time:</b>{" "}
                  {last.timestamp?.toLocaleString?.() || "Loading..."}
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

        <Marker position={currentPosition} icon={userIcon}>
          <Popup>
            🧍 User ID: <b>{userId}</b>
            <br />
            🕒 Time: <b>{new Date().toLocaleString()}</b>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

export default App;












