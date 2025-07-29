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
  getDoc,
  updateDoc,
  Timestamp,
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
  const [userStatus, setUserStatus] = useState({});
  const [authChecked, setAuthChecked] = useState(false);
  const lastLocation = useRef(null);
  const appStartTime = useRef(Date.now());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);

        const statusRef = doc(firestore, "status", user.uid);
        try {
          await setDoc(
            statusRef,
            {
              email: user.email,
              online: true,
              lastOnline: serverTimestamp(),
              lastSeen: serverTimestamp(),
            },
            { merge: true }
          );

          // Mark offline on unload
          const handleUnload = async () => {
            await setDoc(
              statusRef,
              {
                online: false,
                lastOnline: serverTimestamp(),
              },
              { merge: true }
            );
          };
          window.addEventListener("beforeunload", handleUnload);

          // Clean up event listener on unmount
          return () => {
            window.removeEventListener("beforeunload", handleUnload);
          };
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

  // Heartbeat to update lastSeen every 15 seconds
  useEffect(() => {
    if (!userId) return;

    const statusRef = doc(firestore, "status", userId);

    const intervalId = setInterval(async () => {
      try {
        await updateDoc(statusRef, {
          lastSeen: serverTimestamp(),
          online: true,
        });
      } catch (error) {
        console.error("Error updating lastSeen:", error);
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [userId]);

  useEffect(() => {
    if (!userId || !authChecked) return;

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

  // Listen to all locations after app start time
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

          // Filter points client-side by app start time
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
          });
        });
        setUserPaths(paths);
      },
      (error) => {
        console.error("Firestore error:", error);
      }
    );

    return unsubscribe;
  }, [authChecked]);

  // Listen to all user statuses
  useEffect(() => {
    if (!authChecked) return;

    const statusCol = collection(firestore, "status");

    const unsubscribe = onSnapshot(statusCol, (snapshot) => {
      const statuses = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        statuses[doc.id] = {
          online: data.online,
          lastSeen: data.lastSeen?.toDate() || null,
          email: data.email || null,
        };
      });
      setUserStatus(statuses);
    });

    return unsubscribe;
  }, [authChecked]);

  if (!authChecked) {
    return <div style={{ padding: 20 }}>Checking authentication...</div>;
  }

  if (!currentPosition) {
    return <div style={{ padding: 20 }}>Waiting for GPS location...</div>;
  }

  // Time in ms to consider user "online"
  const ONLINE_TIMEOUT = 30000; // 30 seconds

  const now = Date.now();

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={currentPosition} zoom={16} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {Object.entries(userPaths).map(([uid, trail]) => {
          // Show only if user is online recently
          const status = userStatus[uid];
          if (!status) return null;

          if (!status.online || !status.lastSeen || now - status.lastSeen.getTime() > ONLINE_TIMEOUT) {
            // User offline or timed out
            return null;
          }

          const validTrail = trail.filter((p) => p.lat && p.lng);
          if (validTrail.length < 1) return null;

          const last = validTrail[validTrail.length - 1];
          const isCurrentUser = uid === userId;

          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={userIcon}>
                <Popup>
                  🧍 {status.email || "User ID"}: <b>{uid}</b>
                  <br />
                  🕒 Time: {last.timestamp?.toLocaleString() || "Loading..."}
                </Popup>
              </Marker>
              {validTrail.length > 1 && (
                <Polyline positions={validTrail.map((p) => [p.lat, p.lng])} color="red" weight={3} opacity={0.8} />
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default App;











