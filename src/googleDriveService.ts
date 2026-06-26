import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const configWithAuthDomain = firebaseConfig.projectId ? {
  ...firebaseConfig,
  authDomain: `${firebaseConfig.projectId}.firebaseapp.com`
} : firebaseConfig;

const app = getApps().length === 0 ? initializeApp(configWithAuthDomain) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = (typeof window !== 'undefined') ? localStorage.getItem('google_drive_access_token') : null;
let currentGoogleUser: User | null = null;

// Track state listeners
const authStateListeners: ((user: User | null, token: string | null) => void)[] = [];

// Call on startup
export const initGoogleAuth = (
  onAuthChanged?: (user: User | null, token: string | null) => void
) => {
  if (onAuthChanged) {
    if (!authStateListeners.includes(onAuthChanged)) {
      authStateListeners.push(onAuthChanged);
    }
    // Call immediately with existing values
    onAuthChanged(currentGoogleUser, cachedAccessToken);
  }

  return onAuthStateChanged(auth, async (user) => {
    currentGoogleUser = user;
    if (!user) {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('google_drive_access_token');
      }
    } else {
      const storedToken = (typeof window !== 'undefined') ? localStorage.getItem('google_drive_access_token') : null;
      if (storedToken) {
        cachedAccessToken = storedToken;
      }
    }
    authStateListeners.forEach(listener => {
      try {
        listener(currentGoogleUser, cachedAccessToken);
      } catch (err) {
        console.error('Error in auth listener:', err);
      }
    });
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) {
    console.warn('Google sign-in is already in progress. Ignoring redundant trigger.');
    return null;
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth');
    }

    cachedAccessToken = credential.accessToken;
    currentGoogleUser = result.user;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('google_drive_access_token', credential.accessToken);
    }
    
    // Notify list
    authStateListeners.forEach(listener => {
      try {
        listener(currentGoogleUser, cachedAccessToken);
      } catch (err) {
        console.error('Error in auth listener:', err);
      }
    });

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const googleSignOut = async () => {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Firebase Auth signOut error:', error);
  }
  cachedAccessToken = null;
  currentGoogleUser = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('google_drive_access_token');
  }
  authStateListeners.forEach(listener => {
    try {
      listener(null, null);
    } catch (err) {
      console.error('Error in auth listener custom trigger:', err);
    }
  });
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const isGoogleAuthenticated = (): boolean => {
  return !!cachedAccessToken && !!auth.currentUser;
};

/**
 * Upload a PDF blob to Google Drive
 */
export const uploadPdfToDrive = async (filename: string, pdfBlob: Blob): Promise<string> => {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('User is not authenticated with Google Drive.');
  }

  // 1. Create file metadata
  const metadataResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: filename,
      mimeType: 'application/pdf',
    }),
  });

  if (!metadataResponse.ok) {
    const errText = await metadataResponse.text();
    console.error('Failed metadata response:', errText);
    throw new Error(`Failed to create file metadata: ${metadataResponse.statusText}`);
  }

  const file = await metadataResponse.json();
  const fileId = file.id;

  // 2. Upload file media content
  const mediaResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/pdf',
    },
    body: pdfBlob,
  });

  if (!mediaResponse.ok) {
    const errText = await mediaResponse.text();
    console.error('Failed media response:', errText);
    throw new Error(`Failed to upload file content: ${mediaResponse.statusText}`);
  }

  return fileId;
};
