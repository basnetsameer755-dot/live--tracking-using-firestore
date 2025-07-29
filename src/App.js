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

const blueIcon = new L.Icon({
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
    Math.cos(toRad(loc1.lat)) *
      Math.cos(toRad(loc2.lat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function App() {
  const [userId, setUserId] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [userPaths, setUserPaths] = useState({});
  const lastLocation = useRef(null);

  // Handle auth & online status
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

  // Watch user position and add to Firestore collection
  useEffect(() => {
    if (!userId) return;

    const MIN_DISTANCE = 2; // meters
    const MIN_TIME = 1000; // ms

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
          timestamp: serverTimestamp(),
        });
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId]);

  // Listen to all users’ location trails in Firestore
  useEffect(() => {
    const mainRef = collection(firestore, "livePaths");

    const unsubscribes = {};

    const unsubscribeMain = onSnapshot(mainRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const uid = change.doc.id;

        if (change.type === "removed") {
          if (unsubscribes[uid]) unsubscribes[uid]();
          delete unsubscribes[uid];
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

        if (unsubscribes[uid]) unsubscribes[uid]();
        unsubscribes[uid] = onSnapshot(locQuery, (locSnap) => {
          const trail = [];
          locSnap.forEach((doc) => {
            const data = doc.data();
            if (data.lat && data.lng && data.timestamp) {
              trail.push(data);
            }
          });
          setUserPaths((prev) => ({ ...prev, [uid]: trail }));
        });
      });
    });

    return () => {
      unsubscribeMain();
      Object.values(unsubscribes).forEach((fn) => fn());
    };
  }, []);

  if (!currentPosition) {
    return <div style={{ padding: 20 }}>Waiting for GPS location...</div>;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={currentPosition} zoom={16} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {Object.entries(userPaths).map(([uid, trail]) => {
          if (!trail.length) return null;
          const last = trail[trail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={blueIcon}>
                <Popup>
                  🧍 User ID: <b>{uid}</b>
                  <br />
                  🕒 Time:{" "}
                  {last.timestamp?.toDate
                    ? last.timestamp.toDate().toLocaleString()
                    : "Loading..."}
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

        <Marker position={currentPosition} icon={blueIcon}>
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










