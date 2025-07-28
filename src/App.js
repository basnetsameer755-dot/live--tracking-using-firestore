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
  const [currentPosition, setCurrentPosition] = useState(null);
  const [userPaths, setUserPaths] = useState({});
  const [userId, setUserId] = useState(null);
  const lastLocation = useRef(null);
  const locationUnsubscribes = useRef({}); // Track unsubscribe functions per user

  // Auth and user online status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);

        const statusDocRef = doc(firestore, "status", user.uid);

        // Set user online status
        await setDoc(statusDocRef, {
          online: true,
          email: user.email,
          lastOnline: serverTimestamp(),
        });

        // Remove async/await here to avoid issues on unload
        window.addEventListener("beforeunload", () => {
          setDoc(statusDocRef, {
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

  // Track GPS and save to Firestore
  useEffect(() => {
    if (!userId) return;

    const MIN_MOVEMENT_DISTANCE = 2; // meters
    const MIN_TIME_BETWEEN_UPDATES = 1000; // ms

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (
          !position ||
          !position.coords ||
          typeof position.coords.latitude !== "number" ||
          typeof position.coords.longitude !== "number"
        ) {
          console.warn("Invalid GPS data, skipping");
          return;
        }

        const { latitude, longitude } = position.coords;
        const now = Date.now();

        if (lastLocation.current) {
          const dist = getDistance(lastLocation.current, { lat: latitude, lng: longitude });
          const timeDiff = lastLocation.current.localTime
            ? now - lastLocation.current.localTime
            : Infinity;

          if (dist < MIN_MOVEMENT_DISTANCE && timeDiff < MIN_TIME_BETWEEN_UPDATES) return;
        }

        lastLocation.current = {
          lat: latitude,
          lng: longitude,
          localTime: now,
        };

        try {
          const locationsColRef = collection(firestore, "livePaths", userId, "locations");
          await addDoc(locationsColRef, {
            lat: latitude,
            lng: longitude,
            timestamp: serverTimestamp(),
          });
        } catch (error) {
          console.error("Error writing location to Firestore:", error);
        }

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

  // Listen for live location updates for all users from Firestore
  useEffect(() => {
    const livePathsColRef = collection(firestore, "livePaths");
    const unsubscribeUsers = onSnapshot(livePathsColRef, (usersSnapshot) => {
      usersSnapshot.docChanges().forEach((change) => {
        const uid = change.doc.id;

        if (change.type === "added" || change.type === "modified") {
          // Unsubscribe previous listener if exists to avoid duplicates
          if (locationUnsubscribes.current[uid]) {
            locationUnsubscribes.current[uid]();
          }

          const locationsColRef = collection(firestore, "livePaths", uid, "locations");
          const q = query(locationsColRef, orderBy("timestamp"));

          locationUnsubscribes.current[uid] = onSnapshot(q, (locationsSnapshot) => {
            const userTrail = [];
            locationsSnapshot.forEach((doc) => {
              userTrail.push(doc.data());
            });
            setUserPaths((prev) => ({ ...prev, [uid]: userTrail }));
          });
        }

        if (change.type === "removed") {
          // Clean up listener and state when user is removed
          if (locationUnsubscribes.current[uid]) {
            locationUnsubscribes.current[uid]();
            delete locationUnsubscribes.current[uid];
          }
          setUserPaths((prev) => {
            const newPaths = { ...prev };
            delete newPaths[uid];
            return newPaths;
          });
        }
      });
    });

    return () => {
      unsubscribeUsers();
      Object.values(locationUnsubscribes.current).forEach((unsub) => unsub());
    };
  }, []);

  if (!currentPosition) {
    return <div style={{ padding: 20 }}>Waiting for GPS...</div>;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer
        center={currentPosition}
        zoom={16}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {Object.entries(userPaths).map(([uid, trail]) => {
          if (trail.length === 0) return null;
          const last = trail[trail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={blueIcon}>
                <Popup>
                  🧍 User ID: <b>{uid}</b>
                  <br />
                  🕒 Time:{" "}
                  {last.timestamp && typeof last.timestamp.toDate === "function"
                    ? last.timestamp.toDate().toLocaleString()
                    : "Loading..."}
                </Popup>
              </Marker>
              {trail.length > 1 && (
                <Polyline
                  positions={trail.map((p) => [p.lat, p.lng])}
                  color="red"
                  weight={3}
                  opacity={0.8}
                />
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default App;





