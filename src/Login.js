import React, { useState } from "react";
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "./firebase";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/";
    } catch {
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "/";
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Login or Sign Up</h2>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /><br />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><br />
      <button onClick={handleLogin}>Continue</button>
    </div>
  );
}

export default Login;

