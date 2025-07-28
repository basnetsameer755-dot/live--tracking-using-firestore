import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";


const firebaseConfig = {
  apiKey: "AIzaSyCKKLY_tzJeJ3IXzQQjDpCHnLE5P3x4PfA",
  authDomain: "live-tracking-843ca.firebaseapp.com",
  databaseURL: "https://live-tracking-843ca-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "live-tracking-843ca",
  storageBucket: "live-tracking-843ca.appspot.com",
  messagingSenderId: "273472689918",
  appId: "1:273472689918:web:cb2174eaf98264187777af",
};


const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

export {
  database,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
};
