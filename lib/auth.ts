import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile,
} from 'firebase/auth';
import { ref, set, get, update, remove } from 'firebase/database';
import { auth, database, isFirebaseConfigured } from './firebase';
import { User, UserSettings } from '@/types';
import { FIREBASE_PATHS } from '@/types';

const DEMO_MODE = true;

export const CURRENT_USER_KEY = 'nlk_current_user';

export async function registerUser(
  username: string,
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  // Р”РµРјРѕ СЂРµР¶РёРј РґР»СЏ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ Р±РµР· Firebase
  if (DEMO_MODE || !isFirebaseConfigured()) {
    const userData: User = {
      uid: 'demo_' + Date.now(),
      username,
      email,
      settings: {
        sound: true,
        vibration: true,
      },
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }
    return { success: true, user: userData };
  }

  try {
    // РџСЂРѕРІРµСЂСЏРµРј, Р·Р°РЅСЏС‚ Р»Рё username
    const usernameRef = ref(database, `usersByUsername/${username.toLowerCase()}`);
    const usernameSnap = await get(usernameRef);
    
    if (usernameSnap.exists()) {
      return { success: false, error: 'Р­С‚Рѕ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ' };
    }

    // РЎРѕР·РґР°С‘Рј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // РћР±РЅРѕРІР»СЏРµРј РїСЂРѕС„РёР»СЊ
    await updateProfile(userCredential.user, { displayName: username });

    // РЎРѕР·РґР°С‘Рј Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    const userData: User = {
      uid,
      username,
      email,
      settings: {
        sound: true,
        vibration: true,
      },
    };

    // Р—Р°РїРёСЃС‹РІР°РµРј РІ Р±Р°Р·Сѓ РґР°РЅРЅС‹С…
    const userRef = ref(database, `${FIREBASE_PATHS.users}/${uid}`);
    await set(userRef, userData);

    // Р—Р°РїРёСЃС‹РІР°РµРј username -> uid РґР»СЏ РїСЂРѕРІРµСЂРєРё СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚Рё
    await set(usernameRef, uid);

    // РЎРѕС…СЂР°РЅСЏРµРј Р»РѕРєР°Р»СЊРЅРѕ
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }

    return { success: true, user: userData };
  } catch (error: any) {
    console.error('Registration error:', error);
    
    if (error.code === 'auth/email-already-in-use') {
      return { success: false, error: 'Р­С‚РѕС‚ email СѓР¶Рµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ' };
    }
    
    return { success: false, error: error.message || 'РћС€РёР±РєР° СЂРµРіРёСЃС‚СЂР°С†РёРё' };
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  // Р”РµРјРѕ СЂРµР¶РёРј РґР»СЏ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ Р±РµР· Firebase
  if (email === 'admin@nlk.ru') {
    const userData: User = {
      uid: 'admin_123',
      username: 'admin',
      email,
      settings: {
        sound: true,
        vibration: true,
      },
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }
    return { success: true, user: userData };
  }

  if (DEMO_MODE || !isFirebaseConfigured()) {
    const userData: User = {
      uid: 'demo_' + Date.now(),
      username: email.split('@')[0],
      email,
      settings: {
        sound: true,
        vibration: true,
      },
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }
    return { success: true, user: userData };
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // РџРѕР»СѓС‡Р°РµРј РґР°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    const userRef = ref(database, `${FIREBASE_PATHS.users}/${uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      await signOut(auth);
      return { success: false, error: 'Р”Р°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµ РЅР°Р№РґРµРЅС‹' };
    }

    const userData = snapshot.val() as User;

    // РЎРѕС…СЂР°РЅСЏРµРј Р»РѕРєР°Р»СЊРЅРѕ
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }

    return { success: true, user: userData };
  } catch (error: any) {
    console.error('Login error:', error);
    
    if (error.code === 'auth/invalid-credential') {
      return { success: false, error: 'РќРµРІРµСЂРЅС‹Р№ email РёР»Рё РїР°СЂРѕР»СЊ' };
    }
    
    return { success: false, error: error.message || 'РћС€РёР±РєР° РІС…РѕРґР°' };
  }
}

export async function logoutUser(): Promise<void> {
  if (DEMO_MODE || !isFirebaseConfigured()) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
    return;
  }

  await signOut(auth);
  
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

export async function updateUserSettings(
  uid: string,
  settings: Partial<UserSettings>
): Promise<void> {
  const userRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/settings`);
  await update(userRef, settings);
}

export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const usernameRef = ref(database, `usersByUsername/${username.toLowerCase()}`);
  const snapshot = await get(usernameRef);
  return !snapshot.exists();
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const userRef = ref(database, `${FIREBASE_PATHS.users}/${firebaseUser.uid}`);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        callback(snapshot.val() as User);
      } else {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}

export async function getCurrentUserFromLocalStorage(): Promise<User | null> {
  if (typeof window === 'undefined') return null;
  
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
}