import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCKKLY_tzJeJ3IXzQQjDpCHnLE5P3x4PfA",
  authDomain: "live-tracking-843ca.firebaseapp.com",
  projectId: "live-tracking-843ca",
  storageBucket: "live-tracking-843ca.appspot.com",
  messagingSenderId: "273472689918",
  appId: "1:273472689918:web:cb2174eaf98264187777af",
};

const app = initializeApp(firebaseConfig);

const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});


enableIndexedDbPersistence(firestore)
  .then(() => {
    console.log("✅ Offline persistence enabled");
  })
  .catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("❌ Offline persistence failed: multiple tabs open");
    } else if (err.code === "unimplemented") {
      console.warn("❌ Offline persistence not supported by browser");
    } else {
      console.error("❌ Offline persistence error:", err);
    }
  });

const auth = getAuth(app);

export {
  firestore,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
};

