import { initializeApp } from "firebase/app";
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistence
const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Authentication
const auth = getAuth(app);

export {
  firestore,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
};