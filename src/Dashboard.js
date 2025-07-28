import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase"; 

function Dashboard() {
  const [users, setUsers] = useState({});

  useEffect(() => {
    const statusColRef = collection(db, "status");

    const unsubscribe = onSnapshot(statusColRef, (snapshot) => {
      const usersData = {};
      snapshot.forEach((doc) => {
        usersData[doc.id] = doc.data();
      });
      setUsers(usersData);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>📋 Online Users Dashboard</h2>
      <p><b>Total Online:</b> {Object.keys(users).length}</p>
      <ul>
        {Object.entries(users).map(([uid, info]) => (
          <li key={uid}>👤 <b>{info.email || uid}</b></li>
        ))}
      </ul>
    </div>
  );
}

export default Dashboard;

