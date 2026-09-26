import dotenv from "dotenv";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

dotenv.config();

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!privateKey) {
  throw new Error("FIREBASE_PRIVATE_KEY is missing from backend .env");
}

const firebaseConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
};

const firebaseApp =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

export { firebaseApp, db, auth };