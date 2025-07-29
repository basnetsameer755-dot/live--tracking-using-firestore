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
  serverTimestamp
} from "firebase/firestore";
import { firestore, auth, onAuthStateChanged } from "./firebase";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function App() {
  const [userId, setUserId] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [userPaths, setUserPaths] = useState({});
  const [authChecked, setAuthChecked] = useState(false);
  const lastLocation = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        try {
          const statusRef = doc(firestore, "status", user.uid);
          await setDoc(statusRef, {
            email: user.email,
            online: true,
            lastOnline: serverTimestamp(),
          }, { merge: true });
          
          window.addEventListener("beforeunload", () => {
            setDoc(statusRef, {
              online: false,
              lastOnline: serverTimestamp(),
            }, { merge: true });
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

  useEffect(() => {
    if (!userId || !authChecked) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurrentPosition([latitude, longitude]);

        try {
          await addDoc(collection(firestore, "locations"), {
            userId,
            lat: latitude,
            lng: longitude,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          console.error("Error adding location:", error);
        }
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId, authChecked]);

  useEffect(() => {
    if (!authChecked) return;

    const q = query(
      collection(firestore, "locations"),
      orderBy("timestamp")
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const paths = {};
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (!data.userId) return;
          
          if (!paths[data.userId]) {
            paths[data.userId] = [];
          }
          
          paths[data.userId].push({
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp?.toDate?.() || new Date()
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

  if (!authChecked) {
    return <div style={{ padding: 20 }}>Checking authentication...</div>;
  }

  if (!currentPosition) {
    return <div style={{ padding: 20 }}>Waiting for GPS location...</div>;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={currentPosition} zoom={16} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {Object.entries(userPaths).map(([uid, trail]) => {
          const validTrail = trail.filter(p => p.lat && p.lng);
          if (validTrail.length < 1) return null;
          
          const last = validTrail[validTrail.length - 1];
          return (
            <React.Fragment key={uid}>
              <Marker position={[last.lat, last.lng]} icon={userIcon}>
                <Popup>
                  <b>User ID:</b> {uid}
                  <br />
                  <b>Time:</b> {last.timestamp?.toLocaleString?.() || "Loading..."}
                </Popup>
              </Marker>
              {validTrail.length > 1 && (
                <Polyline
                  positions={validTrail.map((p) => [p.lat, p.lng])}
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
            User ID: <b>{userId}</b>
            <br />
            Time: <b>{new Date().toLocaleString()}</b>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

export default App;











