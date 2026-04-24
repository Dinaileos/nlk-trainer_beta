import { initializeApp, getApps, FirebaseApp, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let database: Database;

if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
  console.warn('Firebase не настроен. Установите переменные окружения.');
  app = {} as FirebaseApp;
  auth = {} as Auth;
  database = {} as Database;
} else {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    database = getDatabase(app);
    console.log('Firebase инициализирован успешно');
  } catch (error) {
    console.error('Firebase initialization error:', error);
    app = {} as FirebaseApp;
    auth = {} as Auth;
    database = {} as Database;
  }
}

export { app, auth, database };

// Check if Firebase is properly configured
export const isFirebaseConfigured = () => {
  return !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;
};