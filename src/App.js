import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db, onAuthStateChanged, serverTimestamp } from "./firebase";
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
  const [currentPosition, setCurrentPosition] = useState(null);
  const [userPaths, setUserPaths] = useState({});
  const [userId, setUserId] = useState(null);
  const lastLocation = useRef(null);

  // Auth + online status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);

        // Mark user online in Firestore
        const statusRef = doc(db, "status", user.uid);
        await setDoc(statusRef, {
          online: true,
          email: user.email,
          timestamp: serverTimestamp(),
        });

        // Remove status on page close/unload
        window.addEventListener("beforeunload", async () => {
          await deleteDoc(statusRef);
        });
      } else {
        window.location.href = "/login";
      }
    });

    return () => unsubscribe();
  }, []);

  // GPS tracking and Firestore writes
  useEffect(() => {
    if (!userId) return;

    const MIN_MOVEMENT_DISTANCE = 2; // meters
    const MIN_TIME_BETWEEN_UPDATES = 1000; // ms

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const now = Date.now();

        if (lastLocation.current) {
          const dist = getDistance(lastLocation.current, { lat: latitude, lng: longitude });
          const timeDiff = now - lastLocation.current.localTime;
          if (dist < MIN_MOVEMENT_DISTANCE && timeDiff < MIN_TIME_BETWEEN_UPDATES)
            return;
        }

        lastLocation.current = {
          lat: latitude,
          lng: longitude,
          localTime: now,
        };

        const userPathRef = collection(db, `livePaths/${userId}/points`);
        await addDoc(userPathRef, {
          lat: latitude,
          lng: longitude,
          timestamp: serverTimestamp(),
        });

        setCurrentPosition([latitude, longitude]);
      },
      (err) => console.error("GPS Error:", err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId]);

  // Listen to all live paths in Firestore
  useEffect(() => {
    const unsubscribeSnapshots = [];

    const unsubscribe = onSnapshot(collection(db, "livePaths"), (usersSnapshot) => {
      usersSnapshot.forEach((userDoc) => {
        const uid = userDoc.id;
        const pointsColRef = collection(db, `livePaths/${uid}/points`);
        const q = query(pointsColRef, orderBy("timestamp"));

        const unsub = onSnapshot(q, (pointSnap) => {
          const trail = [];
          pointSnap.forEach((doc) => {
            const data = doc.data();
            if (data.lat && data.lng && data.timestamp) trail.push(data);
          });
          setUserPaths((prev) => ({ ...prev, [uid]: trail }));
        });

        unsubscribeSnapshots.push(unsub);
      });
    });

    return () => {
      unsubscribe();
      unsubscribeSnapshots.forEach((unsub) => unsub());
    };
  }, []);

  if (!currentPosition) {
    return <div style={{ padding: 20 }}>Waiting for GPS...</div>;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={currentPosition} zoom={16} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {Object.entries(userPaths).map(([uid, trail]) => {
          const last = trail[trail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={blueIcon}>
                <Popup>
                  🧍 User ID: <b>{uid}</b>
                  <br />
                  🕒 Time: {last.timestamp?.toDate().toLocaleString() || "Loading..."}
                </Popup>
              </Marker>
              {trail.length > 1 && (
                <Polyline positions={trail.map((p) => [p.lat, p.lng])} color="red" weight={3} opacity={0.8} />
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default App;


