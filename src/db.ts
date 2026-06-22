import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  OAuthProvider
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  getDocFromServer,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import {
  SchoolInfo,
  Student,
  Teacher,
  AttendanceRecord,
  StaffAttendanceRecord,
  StudentAssessment,
  UserAccount,
  UserRole,
  ClassType,
  AcademicYearType,
  TermType,
  SubjectType,
  SUBJECTS,
  ThemeType,
  StudentFeeBill,
  FeePayment,
  AcademicCalendarConfig,
  EmisData,
  PaystackPayment
} from './types';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase using the provisioned config
let firebaseApp;
let firebaseAuth: any = null;
let firestoreDb: any = null;
let isFirebaseActive = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth?.currentUser?.uid || null,
      email: firebaseAuth?.currentUser?.email || null,
      emailVerified: firebaseAuth?.currentUser?.emailVerified || null,
      isAnonymous: firebaseAuth?.currentUser?.isAnonymous || null,
      tenantId: firebaseAuth?.currentUser?.tenantId || null,
      providerInfo: firebaseAuth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firebaseAuth = getAuth(firebaseApp);
    const dbId = (firebaseConfig as any).firestoreDatabaseId || "ai-studio-a2d8d304-855b-466a-8f1a-47e69bbb165b";
    firestoreDb = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true
    }, dbId);
    isFirebaseActive = true;
    console.log("Firebase initialized successfully with live database ID:", dbId);
  }
} catch (e) {
  console.log("Firebase is not initialized; running securely in offline LocalStorage mode.", e);
}

// Validate Connection to Firestore (Prerequisite check)
async function testConnection() {
  if (isFirebaseActive && firestoreDb) {
    try {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!isOnline) {
        console.warn("Device is offline. Placing Firestore in offline cache mode immediately.");
        await disableNetwork(firestoreDb);
        return;
      }
      
      const connectionPromise = getDocFromServer(doc(firestoreDb, 'test', 'connection'));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Firestore connection handshake timed out after 3000ms")), 3000)
      );

      await Promise.race([connectionPromise, timeoutPromise]);
      console.log("Firestore connection check completed successfully. Online mode activated.");
    } catch (error) {
      console.warn("Firestore connection check failed or timed out. Placing Firestore in offline mode immediately to prevent blocking/latency issues.", error);
      try {
        await disableNetwork(firestoreDb);
      } catch (networkError) {
        console.warn("Error disabling Firestore network mode:", networkError);
      }
    }
  }
}
testConnection();

// Default system configurations
const DEFAULT_SCHOOL_INFO: SchoolInfo = {
  id: 'school_default',
  name: '',
  motto: '',
  logoUrl: '',
  schoolNumber: '',
  emisCode: '',
  gpsAddress: '',
  schoolType: 'Public',
  headteacherName: '',
  telephone: '',
  email: '',
  qualifications: '',
  highestAcademicQualifications: '',
  district: '',
  circuit: '',
  reopeningDate: '',
  signatureUrl: '',
  stampUrl: ''
};

export const DEFAULT_CALENDAR: AcademicCalendarConfig = {
  activeAcademicYear: '2026/2027',
  activeTerm: 'Term 1',
  years: {
    '2025/2026': {
      academicYear: '2025/2026',
      startDate: '2025-09-01',
      endDate: '2026-07-31',
      terms: {
        'Term 1': { startDate: '2025-09-01', endDate: '2025-12-19' },
        'Term 2': { startDate: '2026-01-08', endDate: '2026-04-10' },
        'Term 3': { startDate: '2026-05-04', endDate: '2026-07-31' }
      }
    },
    '2026/2027': {
      academicYear: '2026/2027',
      startDate: '2026-09-01',
      endDate: '2027-07-31',
      terms: {
        'Term 1': { startDate: '2026-09-01', endDate: '2026-12-18' },
        'Term 2': { startDate: '2027-01-07', endDate: '2027-04-09' },
        'Term 3': { startDate: '2027-05-03', endDate: '2027-07-30' }
      }
    },
    '2027/2028': {
      academicYear: '2027/2028',
      startDate: '2027-09-01',
      endDate: '2028-07-31',
      terms: {
        'Term 1': { startDate: '2027-09-01', endDate: '2027-12-17' },
        'Term 2': { startDate: '2028-01-06', endDate: '2028-04-07' },
        'Term 3': { startDate: '2028-05-02', endDate: '2028-07-31' }
      }
    },
    '2028/2029': {
      academicYear: '2028/2029',
      startDate: '2028-09-01',
      endDate: '2029-07-31',
      terms: {
        'Term 1': { startDate: '2028-09-01', endDate: '2028-12-15' },
        'Term 2': { startDate: '2029-01-05', endDate: '2029-04-06' },
        'Term 3': { startDate: '2029-05-04', endDate: '2029-07-31' }
      }
    },
    '2029/2030': {
      academicYear: '2029/2030',
      startDate: '2029-09-01',
      endDate: '2030-07-31',
      terms: {
        'Term 1': { startDate: '2029-09-01', endDate: '2029-12-21' },
        'Term 2': { startDate: '2030-01-07', endDate: '2030-04-12' },
        'Term 3': { startDate: '2030-05-06', endDate: '2030-07-31' }
      }
    },
    '2030/2031': {
      academicYear: '2030/2031',
      startDate: '2030-09-01',
      endDate: '2031-07-31',
      terms: {
        'Term 1': { startDate: '2030-09-01', endDate: '2030-12-20' },
        'Term 2': { startDate: '2031-01-07', endDate: '2031-04-11' },
        'Term 3': { startDate: '2031-05-05', endDate: '2031-07-31' }
      }
    },
    '2031/2032': {
      academicYear: '2031/2032',
      startDate: '2031-09-01',
      endDate: '2032-07-31',
      terms: {
        'Term 1': { startDate: '2031-09-01', endDate: '2031-12-19' },
        'Term 2': { startDate: '2032-01-08', endDate: '2032-04-09' },
        'Term 3': { startDate: '2032-05-03', endDate: '2032-07-30' }
      }
    },
    '2032/2033': {
      academicYear: '2032/2033',
      startDate: '2032-09-01',
      endDate: '2033-07-31',
      terms: {
        'Term 1': { startDate: '2032-09-01', endDate: '2032-12-17' },
        'Term 2': { startDate: '2033-01-07', endDate: '2033-04-08' },
        'Term 3': { startDate: '2033-05-02', endDate: '2033-07-29' }
      }
    },
    '2033/2034': {
      academicYear: '2033/2034',
      startDate: '2033-09-01',
      endDate: '2034-07-31',
      terms: {
        'Term 1': { startDate: '2033-09-01', endDate: '2033-12-16' },
        'Term 2': { startDate: '2034-01-06', endDate: '2034-04-07' },
        'Term 3': { startDate: '2034-05-01', endDate: '2034-07-28' }
      }
    },
    '2034/2035': {
      academicYear: '2034/2035',
      startDate: '2034-09-01',
      endDate: '2035-07-31',
      terms: {
        'Term 1': { startDate: '2034-09-01', endDate: '2034-12-15' },
        'Term 2': { startDate: '2035-01-05', endDate: '2035-04-06' },
        'Term 3': { startDate: '2035-05-04', endDate: '2035-07-31' }
      }
    },
    '2035/2036': {
      academicYear: '2035/2036',
      startDate: '2035-09-01',
      endDate: '2036-07-31',
      terms: {
        'Term 1': { startDate: '2035-09-01', endDate: '2035-12-21' },
        'Term 2': { startDate: '2036-01-04', endDate: '2036-04-11' },
        'Term 3': { startDate: '2036-05-02', endDate: '2036-07-31' }
      }
    },
    '2036/2037': {
      academicYear: '2036/2037',
      startDate: '2036-09-01',
      endDate: '2037-07-31',
      terms: {
        'Term 1': { startDate: '2036-09-01', endDate: '2036-12-19' },
        'Term 2': { startDate: '2037-01-08', endDate: '2037-04-10' },
        'Term 3': { startDate: '2037-05-04', endDate: '2037-07-31' }
      }
    },
    '2037/2038': {
      academicYear: '2037/2038',
      startDate: '2037-09-01',
      endDate: '2038-07-31',
      terms: {
        'Term 1': { startDate: '2037-09-01', endDate: '2037-12-18' },
        'Term 2': { startDate: '2038-01-07', endDate: '2038-04-09' },
        'Term 3': { startDate: '2038-05-03', endDate: '2038-07-30' }
      }
    },
    '2038/2039': {
      academicYear: '2038/2039',
      startDate: '2038-09-01',
      endDate: '2039-07-31',
      terms: {
        'Term 1': { startDate: '2038-09-01', endDate: '2038-12-17' },
        'Term 2': { startDate: '2039-01-06', endDate: '2039-04-08' },
        'Term 3': { startDate: '2039-05-02', endDate: '2039-07-29' }
      }
    },
    '2039/2040': {
      academicYear: '2039/2040',
      startDate: '2039-09-01',
      endDate: '2040-07-31',
      terms: {
        'Term 1': { startDate: '2039-09-01', endDate: '2039-12-16' },
        'Term 2': { startDate: '2040-01-05', endDate: '2040-04-12' },
        'Term 3': { startDate: '2040-05-03', endDate: '2040-07-31' }
      }
    }
  }
};

// Local storage key constants
const STORAGE_KEYS = {
  USER: 'sms_user',
  USERS_LIST: 'sms_users_list',
  SCHOOL: 'sms_school_info',
  STUDENTS: 'sms_students',
  TEACHERS: 'sms_teachers',
  ATTENDANCE: 'sms_attendance',
  STAFF_ATTENDANCE: 'sms_staff_attendance',
  ASSESSMENTS: 'sms_assessments',
  SETTINGS: 'sms_settings',
  FEES: 'sms_fees',
  CALENDAR: 'sms_academic_calendar',
  EMIS: 'sms_emis_reports',
  PAYSTACK_LOGS: 'sms_paystack_logs'
};

// Help helper to deep copy or get storage
function getStorageItem<T>(key: string, defaultValue: T): T {
  const item = localStorage.getItem(key);
  if (!item) return defaultValue;
  try {
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
}

function setStorageItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export interface OfflineQueueItem {
  id: string;
  collection: string;
  docId: string;
  type: 'set' | 'delete';
  data?: any;
  timestamp: number;
}

// -----------------------------------------------------------------------------
// CORE DB CONTROLLER (Handles seamless firebase vs local storage persistence)
// -----------------------------------------------------------------------------
export class DbController {
  private static _isSyncing = false;

  static isFirebaseEnabled(): boolean {
    return isFirebaseActive;
  }

  static getAuthInstance(): any {
    return firebaseAuth;
  }

  // Helper to handle safe write operations with offline queuing
  static async performFirestoreWrite(
    colName: string,
    docId: string,
    type: 'set' | 'delete',
    data?: any
  ): Promise<void> {
    if (!isFirebaseActive || !firestoreDb) return;

    // Sanitize docId to prevent sub-collection routing issues (e.g., forward slashes in academic years)
    const safeDocId = docId.replace(/\//g, '-');
    let safeData = data;
    if (safeData && safeData.id) {
      safeData = { ...safeData, id: safeDocId };
    }

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    
    if (!isOnline) {
      this.enqueueOfflineOperation(colName, safeDocId, type, safeData);
      return;
    }

    try {
      if (type === 'set') {
        const docRef = doc(firestoreDb, colName, safeDocId);
        await setDoc(docRef, safeData);
      } else if (type === 'delete') {
        const docRef = doc(firestoreDb, colName, safeDocId);
        await deleteDoc(docRef);
      }
      console.log(`[Offline Sync] Successfully synced ${type} on ${colName}/${safeDocId} with Firestore.`);
    } catch (error) {
      console.warn(`[Offline Sync] Firestore write failed for ${colName}/${safeDocId}, queueing offline:`, error);
      this.enqueueOfflineOperation(colName, safeDocId, type, safeData);
    }
  }

  // Enqueue a fallback write operation
  static enqueueOfflineOperation(
    colName: string,
    docId: string,
    type: 'set' | 'delete',
    data?: any
  ): void {
    const queue = getStorageItem<OfflineQueueItem[]>('sms_offline_queue', []);
    
    // To minimize redundancy: overwrite or merge operations on the exact same document
    const existingIdx = queue.findIndex(item => item.collection === colName && item.docId === docId);
    
    const newItem: OfflineQueueItem = {
      id: 'op_' + Math.random().toString(36).substring(2, 9),
      collection: colName,
      docId,
      type,
      data,
      timestamp: Date.now()
    };

    if (existingIdx >= 0) {
      queue[existingIdx] = newItem;
    } else {
      queue.push(newItem);
    }
    
    setStorageItem('sms_offline_queue', queue);
    console.log(`[Offline Sync] Enqueued ${type} operation for offline document ${colName}/${docId}. Queue size: ${queue.length}`);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sms_sync_status_changed'));
    }
  }

  static getOfflineQueueSize(): number {
    return getStorageItem<OfflineQueueItem[]>('sms_offline_queue', []).length;
  }

  // Auto-synchronize pending local writes with Firestore once online
  static async syncOfflineQueue(): Promise<{ success: boolean; syncedCount: number }> {
    if (!isFirebaseActive || !firestoreDb) return { success: false, syncedCount: 0 };
    if (this._isSyncing) return { success: false, syncedCount: 0 };
    
    const queue = getStorageItem<OfflineQueueItem[]>('sms_offline_queue', []);
    if (queue.length === 0) return { success: true, syncedCount: 0 };

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) {
      return { success: false, syncedCount: 0 };
    }

    this._isSyncing = true;
    console.log(`[Offline Sync] Active. Replaying ${queue.length} pending writes on Firestore...`);
    
    const remainingQueue: OfflineQueueItem[] = [];
    let syncedCount = 0;

    for (const item of queue) {
      try {
        const safeDocId = item.docId.replace(/\//g, '-');
        let safeData = item.data;
        if (safeData && safeData.id) {
          safeData = { ...safeData, id: safeDocId };
        }

        if (item.type === 'set') {
          const docRef = doc(firestoreDb, item.collection, safeDocId);
          await setDoc(docRef, safeData);
        } else if (item.type === 'delete') {
          const docRef = doc(firestoreDb, item.collection, safeDocId);
          await deleteDoc(docRef);
        }
        syncedCount++;
        console.log(`[Offline Sync] Replay success: ${item.type} on ${item.collection}/${safeDocId}`);
      } catch (e) {
        console.error(`[Offline Sync] Replay failed for item ${item.id}:`, e);
        remainingQueue.push(item);
      }
    }

    setStorageItem('sms_offline_queue', remainingQueue);
    this._isSyncing = false;
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sms_sync_status_changed'));
    }

    return {
      success: remainingQueue.length === 0,
      syncedCount
    };
  }

  // Account / Role-based Authentication state
  static getCurrentUser(): UserAccount | null {
    return getStorageItem<UserAccount | null>(STORAGE_KEYS.USER, null);
  }

  static getRegisteredUsers(): UserAccount[] {
    const list = getStorageItem<UserAccount[]>(STORAGE_KEYS.USERS_LIST, []);
    // Populate default accounts if empty
    if (list.length === 0) {
      const defaults: UserAccount[] = [
        {
          uid: 'admin_default',
          email: 'pegyirenyi@gmail.com',
          name: 'Administrator',
          role: 'Admin',
          createdAt: new Date().toISOString()
        },
        {
          uid: 'headteacher_default',
          email: 'headteacher@ges.edu',
          name: 'Paul Egyirenyi',
          role: 'Headteacher',
          createdAt: new Date().toISOString()
        }
      ];
      setStorageItem(STORAGE_KEYS.USERS_LIST, defaults);
      return defaults;
    }
    // Dynamic enforcement: ensure only pegyirenyi@gmail.com has Admin role, others have Headteacher
    let changed = false;
    const coerced = list.map(user => {
      const targetRole: UserRole = user.email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
      if (user.role !== targetRole) {
        changed = true;
        return { ...user, role: targetRole };
      }
      return user;
    });
    if (changed) {
      setStorageItem(STORAGE_KEYS.USERS_LIST, coerced);
      return coerced;
    }
    return list;
  }

  static login(email: string, role: UserRole): UserAccount {
    // Find or bootstrap user account (for offline fallback)
    const users = this.getRegisteredUsers();
    const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
    
    let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      if (user.role !== assignedRole) {
        user.role = assignedRole;
        setStorageItem(STORAGE_KEYS.USERS_LIST, users);
      }
      // Fill missing licensing info if existing
      let changed = false;
      if (!user.licenseType) {
        user.licenseType = 'trial';
        changed = true;
      }
      if (!user.registeredOn) {
        user.registeredOn = user.createdAt;
        changed = true;
      }
      if (!user.requestCode) {
        const prefix = user.email.split('@')[0].substring(0, 4).toUpperCase();
        user.requestCode = `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
        changed = true;
      }
      if (changed) {
        setStorageItem(STORAGE_KEYS.USERS_LIST, users);
      }
    } else {
      // Create user
      const createdNow = new Date().toISOString();
      const prefix = email.split('@')[0].substring(0, 4).toUpperCase();
      user = {
        uid: 'user_' + Math.random().toString(36).substring(2, 9),
        email: email,
        name: email.split('@')[0].toUpperCase(),
        role: assignedRole,
        createdAt: createdNow,
        licenseType: 'trial',
        registeredOn: createdNow,
        requestCode: `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`
      };
      users.push(user);
      setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    }
    setStorageItem(STORAGE_KEYS.USER, user);
    return user;
  }

  static register(name: string, email: string, role: UserRole): UserAccount {
    const users = this.getRegisteredUsers();
    const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
    const createdNow = new Date().toISOString();
    const prefix = email.split('@')[0].substring(0, 4).toUpperCase();
    const newUser: UserAccount = {
      uid: 'user_' + Math.random().toString(36).substring(2, 9),
      email: email,
      name: name,
      role: assignedRole,
      createdAt: createdNow,
      licenseType: 'trial',
      registeredOn: createdNow,
      requestCode: `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`
    };
    users.push(newUser);
    setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    return newUser;
  }

  static async updateUserLicense(
    uid: string, 
    licenseType: 'trial' | 'activated', 
    lastActivatedOn: string, 
    activationCode: string, 
    requestCode: string
  ): Promise<UserAccount> {
    const users = this.getRegisteredUsers();
    const idx = users.findIndex(u => u.uid === uid);
    if (idx < 0) {
      throw new Error("User account not found");
    }
    
    const updated = {
      ...users[idx],
      licenseType,
      registeredOn: users[idx].registeredOn || users[idx].createdAt || new Date().toISOString(),
      lastActivatedOn,
      activationCode,
      requestCode
    };
    
    users[idx] = updated;
    setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.uid === uid) {
      setStorageItem(STORAGE_KEYS.USER, updated);
    }
    
    if (isFirebaseActive && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'users', uid), updated);
      } catch (err) {
        console.warn("Could not sync license status to firestore: ", err);
      }
    }
    
    return updated;
  }

  static logout() {
    localStorage.removeItem(STORAGE_KEYS.USER);
    if (isFirebaseActive && firebaseAuth) {
      try {
        signOut(firebaseAuth).catch(err => console.error("Firebase Auth SignOut error:", err));
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Real full-stack Firebase register method
  static async firebaseRegister(name: string, email: string, password: string, role: UserRole): Promise<UserAccount> {
    if (!isFirebaseActive || !firebaseAuth || !firestoreDb) {
      // Fallback
      return this.register(name, email, role);
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      const uid = userCredential.user.uid;
      const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
      const createdNow = new Date().toISOString();
      const prefix = email.split('@')[0].substring(0, 4).toUpperCase();
      
      const profile: UserAccount = {
        uid,
        email,
        name,
        role: assignedRole,
        createdAt: createdNow,
        licenseType: 'trial',
        registeredOn: createdNow,
        requestCode: `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`
      };

      // Store in users collection
      await setDoc(doc(firestoreDb, 'users', uid), profile);
      
      // Store in local storage
      setStorageItem(STORAGE_KEYS.USER, profile);
      const users = this.getRegisteredUsers();
      if (!users.some(u => u.uid === uid)) {
        users.push(profile);
        setStorageItem(STORAGE_KEYS.USERS_LIST, users);
      }

      return profile;
    } catch (e) {
      throw e;
    }
  }

  // Real full-stack Firebase email/password Login method
  static async firebaseLogin(email: string, password: string): Promise<UserAccount> {
    if (!isFirebaseActive || !firebaseAuth || !firestoreDb) {
      throw new Error("Firebase Authentication is offline. Please verify config or use Local bypass mode.");
    }

    try {
      const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const uid = userCredential.user.uid;
      const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';

      // Retrieve user profile data
      const userDoc = await getDoc(doc(firestoreDb, 'users', uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserAccount;
        let profileChanged = false;
        
        if (profile.role !== assignedRole) {
          profile.role = assignedRole;
          profileChanged = true;
        }
        if (!profile.licenseType) {
          profile.licenseType = 'trial';
          profileChanged = true;
        }
        if (!profile.registeredOn) {
          profile.registeredOn = profile.createdAt || new Date().toISOString();
          profileChanged = true;
        }
        if (!profile.requestCode) {
          const prefix = profile.email.split('@')[0].substring(0, 4).toUpperCase();
          profile.requestCode = `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
          profileChanged = true;
        }
        
        if (profileChanged) {
          await setDoc(doc(firestoreDb, 'users', uid), profile);
        }
        
        setStorageItem(STORAGE_KEYS.USER, profile);
        
        const users = this.getRegisteredUsers();
        const existingIdx = users.findIndex(u => u.uid === uid);
        if (existingIdx >= 0) {
          users[existingIdx] = profile;
        } else {
          users.push(profile);
        }
        setStorageItem(STORAGE_KEYS.USERS_LIST, users);
        return profile;
      } else {
        // Create user profile document if missing
        const createdNow = new Date().toISOString();
        const prefix = email.split('@')[0].substring(0, 4).toUpperCase();
        const profile: UserAccount = {
          uid,
          email,
          name: email.split('@')[0].toUpperCase(),
          role: assignedRole,
          createdAt: createdNow,
          licenseType: 'trial',
          registeredOn: createdNow,
          requestCode: `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`
        };
        await setDoc(doc(firestoreDb, 'users', uid), profile);
        setStorageItem(STORAGE_KEYS.USER, profile);
        return profile;
      }
    } catch (e) {
      throw e;
    }
  }

  // Real full-stack Firebase sendPasswordResetEmail method
  static async firebaseSendPasswordResetEmail(email: string): Promise<void> {
    if (!isFirebaseActive || !firebaseAuth) {
      throw new Error("Firebase Authentication is offline. Please verify config or use Local bypass mode.");
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
    } catch (e) {
      throw e;
    }
  }

  // Real full-stack Firebase Google Login method
  static async firebaseGoogleLogin(): Promise<{ user: UserAccount; isNew: boolean }> {
    if (!isFirebaseActive || !firebaseAuth || !firestoreDb) {
      throw new Error("Firebase is offline. Google sign in requires an active Firebase instance.");
    }

    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    try {
      const result = await signInWithPopup(firebaseAuth, provider);
      const user = result.user;
      const email = user.email || '';
      const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
      
      // Check if user profile already exists in Firestore
      const userDocSnapshot = await getDoc(doc(firestoreDb, 'users', user.uid));
      if (userDocSnapshot.exists()) {
        const profile = userDocSnapshot.data() as UserAccount;
        if (profile.role !== assignedRole) {
          profile.role = assignedRole;
          await setDoc(doc(firestoreDb, 'users', user.uid), profile);
        }
        setStorageItem(STORAGE_KEYS.USER, profile);
        return { user: profile, isNew: false };
      } else {
        const tempProfile: UserAccount = {
          uid: user.uid,
          email: email,
          name: user.displayName || email.split('@')[0] || 'Google User',
          role: assignedRole,
          createdAt: new Date().toISOString()
        };
        return { user: tempProfile, isNew: true };
      }
    } catch (e) {
      throw e;
    }
  }

  // Real full-stack Firebase Microsoft Login method
  static async firebaseMicrosoftLogin(): Promise<{ user: UserAccount; isNew: boolean }> {
    if (!isFirebaseActive || !firebaseAuth || !firestoreDb) {
      throw new Error("Firebase is offline. Microsoft sign in requires an active Firebase instance.");
    }

    try {
      const provider = new OAuthProvider('microsoft.com');
      const result = await signInWithPopup(firebaseAuth, provider);
      const user = result.user;
      const email = user.email || '';
      const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
      
      const userDocSnapshot = await getDoc(doc(firestoreDb, 'users', user.uid));
      if (userDocSnapshot.exists()) {
        const profile = userDocSnapshot.data() as UserAccount;
        if (profile.role !== assignedRole) {
          profile.role = assignedRole;
          await setDoc(doc(firestoreDb, 'users', user.uid), profile);
        }
        setStorageItem(STORAGE_KEYS.USER, profile);
        return { user: profile, isNew: false };
      } else {
        const tempProfile: UserAccount = {
          uid: user.uid,
          email: email,
          name: user.displayName || email.split('@')[0] || 'Microsoft User',
          role: assignedRole,
          createdAt: new Date().toISOString()
        };
        return { user: tempProfile, isNew: true };
      }
    } catch (e) {
      throw e;
    }
  }

  // Real full-stack Firebase Apple Login method
  static async firebaseAppleLogin(): Promise<{ user: UserAccount; isNew: boolean }> {
    if (!isFirebaseActive || !firebaseAuth || !firestoreDb) {
      throw new Error("Firebase is offline. Apple sign in requires an active Firebase instance.");
    }

    try {
      const provider = new OAuthProvider('apple.com');
      const result = await signInWithPopup(firebaseAuth, provider);
      const user = result.user;
      const email = user.email || '';
      const assignedRole: UserRole = email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
      
      const userDocSnapshot = await getDoc(doc(firestoreDb, 'users', user.uid));
      if (userDocSnapshot.exists()) {
        const profile = userDocSnapshot.data() as UserAccount;
        if (profile.role !== assignedRole) {
          profile.role = assignedRole;
          await setDoc(doc(firestoreDb, 'users', user.uid), profile);
        }
        setStorageItem(STORAGE_KEYS.USER, profile);
        return { user: profile, isNew: false };
      } else {
        const tempProfile: UserAccount = {
          uid: user.uid,
          email: email,
          name: user.displayName || email.split('@')[0] || 'Apple User',
          role: assignedRole,
          createdAt: new Date().toISOString()
        };
        return { user: tempProfile, isNew: true };
      }
    } catch (e) {
      throw e;
    }
  }

  // Create or confirm Google User Profile
  static async saveGoogleProfile(profile: UserAccount): Promise<UserAccount> {
    const assignedRole: UserRole = profile.email.toLowerCase() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
    const createdNow = profile.createdAt || new Date().toISOString();
    const prefix = profile.email.split('@')[0].substring(0, 4).toUpperCase();
    const updatedProfile = {
      ...profile,
      role: assignedRole,
      licenseType: profile.licenseType || 'trial',
      registeredOn: profile.registeredOn || createdNow,
      requestCode: profile.requestCode || `REQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`
    };
    if (isFirebaseActive && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'users', updatedProfile.uid), updatedProfile);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `users/${updatedProfile.uid}`);
        throw e;
      }
    }
    setStorageItem(STORAGE_KEYS.USER, updatedProfile);
    const users = this.getRegisteredUsers();
    const existingIdx = users.findIndex(u => u.uid === updatedProfile.uid);
    if (existingIdx >= 0) {
      users[existingIdx] = updatedProfile;
    } else {
      users.push(updatedProfile);
    }
    setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    return updatedProfile;
  }

  // Retrieve user profile data by UID directly
  static async getFirebaseUserProfile(uid: string): Promise<UserAccount | null> {
    if (!isFirebaseActive || !firestoreDb) return null;
    try {
      const userDoc = await getDoc(doc(firestoreDb, 'users', uid));
      if (userDoc.exists()) {
        return userDoc.data() as UserAccount;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `users/${uid}`);
      throw e;
    }
    return null;
  }

  // Full cross-device background sync of all Firestore assets
  static async syncAllDataFromFirebase(): Promise<void> {
    if (!isFirebaseActive || !firestoreDb) return;
    if (firebaseAuth && !firebaseAuth.currentUser) {
      console.warn("Database sync from Firestore skipped: No currently authenticated user.");
      return;
    }
    try {
      console.log("Beginning full database sync from Firestore...");
      
      // 1. School Profile Info
      let schoolsSnap;
      try {
        schoolsSnap = await getDocs(collection(firestoreDb, 'schools'));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'schools');
        throw e;
      }
      if (!schoolsSnap.empty) {
        const schoolDoc = schoolsSnap.docs[0];
        if (schoolDoc) {
          setStorageItem(STORAGE_KEYS.SCHOOL, schoolDoc.data() as SchoolInfo);
        }
      }

      // 2. Students
      let studentsSnap;
      try {
        studentsSnap = await getDocs(collection(firestoreDb, 'students'));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'students');
        throw e;
      }
      const studentsList = studentsSnap.docs.map(d => d.data() as Student);
      setStorageItem(STORAGE_KEYS.STUDENTS, studentsList);

      // 3. Teachers
      let teachersSnap;
      try {
        teachersSnap = await getDocs(collection(firestoreDb, 'teachers'));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'teachers');
        throw e;
      }
      const teachersList = teachersSnap.docs.map(d => d.data() as Teacher);
      setStorageItem(STORAGE_KEYS.TEACHERS, teachersList);

      // 4. Attendance Registers
      let attendanceSnap;
      try {
        attendanceSnap = await getDocs(collection(firestoreDb, 'attendance'));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'attendance');
        throw e;
      }
      const attendanceList = attendanceSnap.docs.map(d => d.data() as AttendanceRecord);
      setStorageItem(STORAGE_KEYS.ATTENDANCE, attendanceList);

      // 5. Assessments Registers
      let assessmentsSnap;
      try {
        assessmentsSnap = await getDocs(collection(firestoreDb, 'assessments'));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'assessments');
        throw e;
      }
      const assessmentsList = assessmentsSnap.docs.map(d => d.data() as StudentAssessment);
      setStorageItem(STORAGE_KEYS.ASSESSMENTS, assessmentsList);

      // 6. Fees Bills
      let feesSnap;
      try {
        feesSnap = await getDocs(collection(firestoreDb, 'fees'));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'fees');
        throw e;
      }
      const feesList = feesSnap.docs.map(d => d.data() as StudentFeeBill);
      setStorageItem(STORAGE_KEYS.FEES, feesList);

      // 7. Academic Calendar Settings
      try {
        const settingsSnap = await getDoc(doc(firestoreDb, 'settings', 'academic_calendar'));
        if (settingsSnap.exists()) {
          setStorageItem(STORAGE_KEYS.CALENDAR, settingsSnap.data() as AcademicCalendarConfig);
        }
      } catch (e) {
        console.warn("Could not sync academic calendar settings:", e);
      }

      // 8. EMIS Reports (GES aligned)
      try {
        const emisSnap = await getDocs(collection(firestoreDb, 'emis'));
        const emisList = emisSnap.docs.map(d => d.data() as EmisData);
        setStorageItem(STORAGE_KEYS.EMIS, emisList);
      } catch (e) {
        console.warn("Could not sync EMIS reports:", e);
      }

      console.log("Database sync from Firestore successfully synced.");
    } catch (e) {
      console.warn("Database sync from Firestore aborted (running in offline LocalStorage backup mode):", e);
    }
  }

  // -------------------------
  // SCHOOL PROFILE
  // -------------------------
  static getSchoolInfo(): SchoolInfo {
    return getStorageItem<SchoolInfo>(STORAGE_KEYS.SCHOOL, DEFAULT_SCHOOL_INFO);
  }

  static saveSchoolInfo(info: SchoolInfo): void {
    setStorageItem(STORAGE_KEYS.SCHOOL, info);
    this.performFirestoreWrite('schools', info.id, 'set', info);
  }

  // -------------------------
  // ACADEMIC CALENDAR MANAGEMENT
  // -------------------------
  static getAcademicCalendar(): AcademicCalendarConfig {
    return getStorageItem<AcademicCalendarConfig>(STORAGE_KEYS.CALENDAR, DEFAULT_CALENDAR);
  }

  static saveAcademicCalendar(calendar: AcademicCalendarConfig): void {
    setStorageItem(STORAGE_KEYS.CALENDAR, calendar);
    this.performFirestoreWrite('settings', 'academic_calendar', 'set', calendar);
  }

  // -------------------------
  // EMIS DATA MANAGEMENT (Ghana Education Service aligned)
  // -------------------------
  static getEmisReports(): EmisData[] {
    return getStorageItem<EmisData[]>(STORAGE_KEYS.EMIS, []);
  }

  static getEmisReportByYear(year: AcademicYearType): EmisData | null {
    const list = this.getEmisReports();
    return list.find(r => r.academicYear === year) || null;
  }

  static saveEmisReport(report: EmisData): void {
    const list = this.getEmisReports();
    const idx = list.findIndex(r => r.academicYear === report.academicYear);
    if (idx >= 0) {
      list[idx] = report;
    } else {
      list.push(report);
    }
    setStorageItem(STORAGE_KEYS.EMIS, list);
    this.performFirestoreWrite('emis', report.id, 'set', report);
  }

  static deleteEmisReport(year: AcademicYearType): void {
    const list = this.getEmisReports();
    const filtered = list.filter(r => r.academicYear !== year);
    setStorageItem(STORAGE_KEYS.EMIS, filtered);
    this.performFirestoreWrite('emis', year, 'delete');
  }

  // -------------------------
  // STUDENTS PROFILE REGISTRY
  // -------------------------
  static getStudents(): Student[] {
    return getStorageItem<Student[]>(STORAGE_KEYS.STUDENTS, []);
  }

  static saveStudent(student: Student): void {
    const students = this.getStudents();
    const idx = students.findIndex(s => s.id === student.id);
    if (idx >= 0) {
      students[idx] = student;
    } else {
      students.push(student);
    }
    setStorageItem(STORAGE_KEYS.STUDENTS, students);
    this.performFirestoreWrite('students', student.id, 'set', student);
  }

  static deleteStudent(studentId: string): void {
    const students = this.getStudents();
    const filtered = students.filter(s => s.id !== studentId);
    setStorageItem(STORAGE_KEYS.STUDENTS, filtered);

    // Also cascade delete assessments and attendance for this student locally
    const assessments = this.getAssessments();
    const filteredAssessments = assessments.filter(a => a.studentId !== studentId);
    setStorageItem(STORAGE_KEYS.ASSESSMENTS, filteredAssessments);

    const attendanceList = getStorageItem<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const filteredAttendance = attendanceList.filter(a => a.studentId !== studentId);
    setStorageItem(STORAGE_KEYS.ATTENDANCE, filteredAttendance);

    this.performFirestoreWrite('students', studentId, 'delete');
  }

  // -------------------------
  // TEACHERS PROFILE REGISTRY
  // -------------------------
  static getTeachers(): Teacher[] {
    return getStorageItem<Teacher[]>(STORAGE_KEYS.TEACHERS, []);
  }

  static saveTeacher(teacher: Teacher): void {
    const teachers = this.getTeachers();
    const idx = teachers.findIndex(t => t.id === teacher.id);
    if (idx >= 0) {
      teachers[idx] = teacher;
    } else {
      teachers.push(teacher);
    }
    setStorageItem(STORAGE_KEYS.TEACHERS, teachers);
    this.performFirestoreWrite('teachers', teacher.id, 'set', teacher);
  }

  static deleteTeacher(teacherId: string): void {
    const teachers = this.getTeachers();
    const filtered = teachers.filter(t => t.id !== teacherId);
    setStorageItem(STORAGE_KEYS.TEACHERS, filtered);
    this.performFirestoreWrite('teachers', teacherId, 'delete');
  }

  // -------------------------
  // ATTENDANCE MANAGEMENT
  // -------------------------
  static getAttendance(date: string, className: ClassType): AttendanceRecord[] {
    const list = getStorageItem<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    // Get all students enrolled in this class
    const students = this.getStudents().filter(s => s.class === className);
    
    // Build attendance records ensuring every currently enrolled student has an entry for this class/date
    return students.map(student => {
      const idKey = `${date}_${student.id}`;
      const existing = list.find(r => r.id === idKey);
      if (existing) {
        return existing;
      } else {
        return {
          id: idKey,
          date,
          studentId: student.id,
          studentName: `${student.firstName} ${student.middleName ? student.middleName + ' ' : ''}${student.lastName}`,
          class: className,
          status: 'Unmarked' // Default status
        };
      }
    });
  }

  static saveAttendanceBatch(records: AttendanceRecord[]): void {
    const list = getStorageItem<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    records.forEach(rec => {
      const idx = list.findIndex(r => r.id === rec.id);
      if (idx >= 0) {
        list[idx] = rec;
      } else {
        list.push(rec);
      }
      this.performFirestoreWrite('attendance', rec.id, 'set', rec);
    });
    setStorageItem(STORAGE_KEYS.ATTENDANCE, list);
  }

  static getAttendanceStats(className: ClassType, date: string) {
    const records = getStorageItem<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const classRecords = records.filter(r => r.class === className && r.date === date);
    
    const present = classRecords.filter(r => r.status === 'Present').length;
    const holiday = classRecords.filter(r => r.status === 'Holiday').length;
    const absent = classRecords.filter(r => r.status === 'Absent').length;
    
    return {
      totalEnrolled: this.getStudents().filter(s => s.class === className).length,
      present,
      holiday,
      absent,
      totalMarked: classRecords.length
    };
  }

  static getStudentAttendanceStats(studentId: string) {
    const records = getStorageItem<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const studentRecords = records.filter(r => r.studentId === studentId);
    
    const present = studentRecords.filter(r => r.status === 'Present').length;
    const absent = studentRecords.filter(r => r.status === 'Absent').length;
    const schoolOpen = present + absent;
    
    return {
      present,
      schoolOpen
    };
  }

  // -------------------------
  // STAFF ATTENDANCE MANAGEMENT
  // -------------------------
  static getStaffAttendance(date: string): StaffAttendanceRecord[] {
    const list = getStorageItem<StaffAttendanceRecord[]>(STORAGE_KEYS.STAFF_ATTENDANCE, []);
    const teachers = this.getTeachers();

    return teachers.map(teacher => {
      const idKey = `${date}_${teacher.id}`;
      const existing = list.find(r => r.id === idKey);
      if (existing) {
        return existing;
      } else {
        return {
          id: idKey,
          date,
          teacherId: teacher.id,
          teacherName: `${teacher.firstName} ${teacher.middleName ? teacher.middleName + ' ' : ''}${teacher.lastName}`,
          status: 'Unmarked',
          arrivalTime: '',
          departureTime: '',
          remarks: ''
        };
      }
    });
  }

  static saveStaffAttendanceBatch(records: StaffAttendanceRecord[]): void {
    const list = getStorageItem<StaffAttendanceRecord[]>(STORAGE_KEYS.STAFF_ATTENDANCE, []);
    records.forEach(rec => {
      const idx = list.findIndex(r => r.id === rec.id);
      if (idx >= 0) {
        list[idx] = rec;
      } else {
        list.push(rec);
      }
      this.performFirestoreWrite('staff_attendance', rec.id, 'set', rec);
    });
    setStorageItem(STORAGE_KEYS.STAFF_ATTENDANCE, list);
  }

  static getAllStaffAttendance(): StaffAttendanceRecord[] {
    return getStorageItem<StaffAttendanceRecord[]>(STORAGE_KEYS.STAFF_ATTENDANCE, []);
  }

  // -------------------------
  // SCHOOL ASSESSMENT SYSTEM
  // -------------------------
  static getAssessments(): StudentAssessment[] {
    const list = getStorageItem<StudentAssessment[]>(STORAGE_KEYS.ASSESSMENTS, []);
    let updated = false;
    const sanitized = list.map(item => {
      if (item.id && item.id.includes('/')) {
        item.id = item.id.replace(/\//g, '-');
        updated = true;
      }
      return item;
    });
    if (updated) {
      setStorageItem(STORAGE_KEYS.ASSESSMENTS, sanitized);
    }
    return sanitized;
  }

  // Load or construct assessment sheets for a class, year, term, and subject
  static getAssessmentsSheet(
    className: ClassType,
    academicYear: AcademicYearType,
    term: TermType,
    subject: SubjectType
  ): StudentAssessment[] {
    const allAssessments = this.getAssessments();
    const students = this.getStudents().filter(s => s.class === className);

    // Build assessment row for each student
    const sheet = students.map(st => {
      const compoundId = `${st.id}_${academicYear}_${term}_${subject.replace(/\s+/g, '')}`.replace(/\//g, '-');
      const found = allAssessments.find(a => a.id === compoundId);
      
      if (found) {
        // Enforce the student name check in case it was renamed in database
        found.studentName = `${st.firstName} ${st.middleName ? st.middleName + ' ' : ''}${st.lastName}`;
        return found;
      } else {
        // Empty default template with no automatically input/pre-populated scores or values
        const getSimScore = (type: 'ex1' | 'ex2' | 'ex3' | 'ex4' | 't1' | 't2' | 'proj' | 'group' | 'exam') => {
          return 0;
        };

        const emptyAssessment: StudentAssessment = {
          id: compoundId,
          studentId: st.id,
          studentName: `${st.firstName} ${st.middleName ? st.middleName + ' ' : ''}${st.lastName}`,
          class: className,
          academicYear,
          term,
          subject,
          exercises: [getSimScore('ex1'), getSimScore('ex2'), getSimScore('ex3'), getSimScore('ex4')],
          tests: [getSimScore('t1'), getSimScore('t2')],
          projectWork: getSimScore('proj'),
          groupWork: getSimScore('group'),
          classScoreTotal: 0,
          classScore50: 0,
          examScore100: getSimScore('exam'),
          examScore50: 0,
          totalScore: 0,
          gradeLevel: 'L5',
          remarks: 'Emerging'
        };
        return this.calculateScoreDetails(emptyAssessment);
      }
    });

    // Calculate rankings dynamically for this specific sheet
    return this.calculatePositions(sheet);
  }

  // Recalculates scoring results for a given assessment and ranks the entire cohort
  static calculateScoreDetails(item: StudentAssessment): StudentAssessment {
    // 1. Constrain individual inputs defensively
    const exercises = item.exercises.map(m => Math.min(10, Math.max(0, Number(m) || 0)));
    const tests = item.tests.map(m => Math.min(20, Math.max(0, Number(m) || 0)));
    const projectWork = Math.min(10, Math.max(0, Number(item.projectWork) || 0));
    const groupWork = Math.min(10, Math.max(0, Number(item.groupWork) || 0));
    const examScore100 = Math.min(100, Math.max(0, Number(item.examScore100) || 0));

    // 2. Class Assessment Total: 4 Exercises (40) + 2 Tests (40) + Project (10) + Group (10) = 100 marks maximum
    const sumExercises = exercises.reduce((a, b) => a + b, 0);
    const sumTests = tests.reduce((a, b) => a + b, 0);
    const classScoreTotal = sumExercises + sumTests + projectWork + groupWork;

    // Convert class assessment to 50%
    const classScore50 = parseFloat((classScoreTotal * 0.50).toFixed(2));
    
    // Exam score to 50%
    const examScore50 = parseFloat((examScore100 * 0.50).toFixed(2));

    // Total score = Class Assessment 50% + Examination 50%
    const totalScore = parseFloat((classScore50 + examScore50).toFixed(2));

    // Determine GES new curriculum grading levels
    // L5 (0%-39%) - Emerging
    // L4 (40%-53%) - Developing
    // L3 (54% - 67%) - Approaching Proficiency
    // L2 (68%-79%) - Proficient
    // L1 (80%-100%) - Highly Proficient
    let gradeLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' = 'L5';
    let remarks = 'Emerging';

    if (totalScore >= 80) {
      gradeLevel = 'L1';
      remarks = 'Highly Proficient';
    } else if (totalScore >= 68) {
      gradeLevel = 'L2';
      remarks = 'Proficient';
    } else if (totalScore >= 54) {
      gradeLevel = 'L3';
      remarks = 'Approaching Proficiency';
    } else if (totalScore >= 40) {
      gradeLevel = 'L4';
      remarks = 'Developing';
    } else {
      gradeLevel = 'L5';
      remarks = 'Emerging';
    }

    return {
      ...item,
      exercises,
      tests,
      projectWork,
      groupWork,
      classScoreTotal,
      classScore50,
      examScore100,
      examScore50,
      totalScore,
      gradeLevel,
      remarks
    };
  }

  // Assign position ranks to students based on total scores (Descending)
  static calculatePositions(sheet: StudentAssessment[]): StudentAssessment[] {
    const rawScores = sheet.map(s => this.calculateScoreDetails(s));
    
    // Sort descending by total score
    const sorted = [...rawScores].sort((a, b) => b.totalScore - a.totalScore);
    
    // Assign position ranks supporting tied scores
    return rawScores.map(item => {
      const positionIndex = sorted.findIndex(s => s.totalScore === item.totalScore);
      return {
        ...item,
        position: positionIndex + 1
      };
    });
  }

  static saveAssessmentsSheet(sheet: StudentAssessment[]): void {
    const allAssessments = this.getAssessments();
    const updatedSheet = this.calculatePositions(sheet);

    updatedSheet.forEach(item => {
      const idx = allAssessments.findIndex(a => a.id === item.id);
      if (idx >= 0) {
        allAssessments[idx] = item;
      } else {
        allAssessments.push(item);
      }
      this.performFirestoreWrite('assessments', item.id, 'set', item);
    });

    setStorageItem(STORAGE_KEYS.ASSESSMENTS, allAssessments);
  }

  // Get report cards for an individual student across multiple subjects for a given term
  static getStudentTermReportCard(
    studentId: string,
    academicYear: AcademicYearType,
    term: TermType
  ) {
    const assessments = this.getAssessments();
    const student = this.getStudents().find(s => s.id === studentId);
    if (!student) return null;

    // Find all assessment entries for this student, year, and term
    const explicitGrades = assessments.filter(
      a => a.studentId === studentId && a.academicYear === academicYear && a.term === term
    );

    // We only use explicit assessment grades entered with data
    const studentGrades = explicitGrades;

    // Calculate general average score
    const totalScoreSum = studentGrades.reduce((sum, item) => sum + item.totalScore, 0);
    const averageScore = studentGrades.length > 0 
      ? parseFloat((totalScoreSum / studentGrades.length).toFixed(2)) 
      : 0;

    const attStats = this.getStudentAttendanceStats(studentId);

    // Compute dynamic rank inside the student's primary academic class
    const targetClass = student.class;
    const classStudents = this.getStudents().filter(s => s.class === targetClass);
    const rankings = classStudents.map(cs => {
      const gList = assessments.filter(
        a => a.studentId === cs.id && a.academicYear === academicYear && a.term === term
      );
      const sum = gList.reduce((acc, item) => acc + item.totalScore, 0);
      const avg = gList.length > 0 ? parseFloat((sum / gList.length).toFixed(2)) : 0;
      return {
        studentId: cs.id,
        average: avg,
        hasGrades: gList.length > 0
      };
    });

    const studentMetric = rankings.find(r => r.studentId === studentId);
    let classRankStr = "N/A";
    let gradedClassCount = 0;
    if (studentMetric && studentMetric.hasGrades) {
      const strictlyHigherCount = rankings.filter(r => r.hasGrades && r.average > studentMetric.average).length;
      gradedClassCount = rankings.filter(r => r.hasGrades).length;
      classRankStr = `${strictlyHigherCount + 1} of ${gradedClassCount}`;
    }

    return {
      student,
      grades: studentGrades,
      averageScore,
      totalSubjects: studentGrades.length,
      attendancePresent: attStats.present,
      schoolOpenDays: attStats.schoolOpen,
      classRank: classRankStr,
      gradedCount: gradedClassCount
    };
  }

  // -------------------------
  // SCHOOL FEES MANAGEMENT
  // -------------------------
  static getStudentFeeBills(): StudentFeeBill[] {
    return getStorageItem<StudentFeeBill[]>(STORAGE_KEYS.FEES, []);
  }

  static saveStudentFeeBill(bill: StudentFeeBill): void {
    const bills = this.getStudentFeeBills();
    const idx = bills.findIndex(b => b.id === bill.id);
    if (idx >= 0) {
      bills[idx] = bill;
    } else {
      bills.push(bill);
    }
    setStorageItem(STORAGE_KEYS.FEES, bills);
    this.performFirestoreWrite('fees', bill.id, 'set', bill);
  }

  static deleteStudentFeeBill(billId: string): void {
    const bills = this.getStudentFeeBills();
    const filtered = bills.filter(b => b.id !== billId);
    setStorageItem(STORAGE_KEYS.FEES, filtered);
    this.performFirestoreWrite('fees', billId, 'delete');
  }

  static clearAllStudentFeeBills(): void {
    const bills = this.getStudentFeeBills();
    bills.forEach(b => {
      if (b.id) this.performFirestoreWrite('fees', b.id, 'delete');
    });
    setStorageItem(STORAGE_KEYS.FEES, []);
    localStorage.removeItem('school_fees_bills');
  }

  // -------------------------
  // PAYSTACK TRANSACTIONS MANAGEMENT
  // -------------------------
  static async getPaystackPaymentsAsync(): Promise<PaystackPayment[]> {
    if (isFirebaseActive && firestoreDb) {
      try {
        const qSnap = await getDocs(collection(firestoreDb, 'paystack_payments'));
        const list = qSnap.docs.map(doc => {
          const d = doc.data();
          return {
            id: d.id || doc.id,
            reference: d.reference || d.id || doc.id,
            studentId: d.studentId || '',
            studentName: d.studentName || '',
            billId: d.billId || '',
            component: d.component || 'School Fees',
            amount: typeof d.amount === 'number' ? d.amount : (d.amount?.doubleValue || Number(d.amount) || 0),
            academicYear: d.academicYear || '',
            term: d.term || '',
            status: d.status || 'ongoing',
            paidAt: d.paidAt || '',
            createdAt: d.createdAt || ''
          } as PaystackPayment;
        });
        setStorageItem(STORAGE_KEYS.PAYSTACK_LOGS, list);
        return list;
      } catch (error) {
        console.warn("Could not fetch Paystack logs from Firestore:", error);
      }
    }
    return getStorageItem<PaystackPayment[]>(STORAGE_KEYS.PAYSTACK_LOGS, []);
  }

  static getLocalPaystackPayments(): PaystackPayment[] {
    return getStorageItem<PaystackPayment[]>(STORAGE_KEYS.PAYSTACK_LOGS, []);
  }

  static savePaystackPayment(payment: PaystackPayment): void {
    const list = this.getLocalPaystackPayments();
    const idx = list.findIndex(p => p.id === payment.id);
    if (idx >= 0) {
      list[idx] = payment;
    } else {
      list.push(payment);
    }
    setStorageItem(STORAGE_KEYS.PAYSTACK_LOGS, list);
    this.performFirestoreWrite('paystack_payments', payment.id, 'set', payment);
  }

  static deletePaystackPayment(paymentId: string): void {
    const list = this.getLocalPaystackPayments();
    const filtered = list.filter(p => p.id !== paymentId);
    setStorageItem(STORAGE_KEYS.PAYSTACK_LOGS, filtered);
    this.performFirestoreWrite('paystack_payments', paymentId, 'delete');
  }

  static clearAllPaystackPayments(): void {
    const payments = this.getLocalPaystackPayments();
    payments.forEach(p => {
      if (p.id) this.performFirestoreWrite('paystack_payments', p.id, 'delete');
    });
    setStorageItem(STORAGE_KEYS.PAYSTACK_LOGS, []);
  }

  // System settings customization
  static getSystemSettings() {
    return getStorageItem(STORAGE_KEYS.SETTINGS, {
      theme: 'Classic' as ThemeType,
      autoSave: true,
      term: 'Term 1' as TermType,
      academicYear: '2026/2027' as AcademicYearType,
      schoolSystemName: 'GEETECH SMS & ASSESSMENT CENTER'
    });
  }

  static saveSystemSettings(settings: any) {
    setStorageItem(STORAGE_KEYS.SETTINGS, settings);
  }

  // -------------------------
  // BACKUP & RESTORE
  // -------------------------
  static exportAllData(): string {
    const backup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      school_info: getStorageItem<SchoolInfo | null>(STORAGE_KEYS.SCHOOL, null),
      students: getStorageItem<Student[]>(STORAGE_KEYS.STUDENTS, []),
      teachers: getStorageItem<Teacher[]>(STORAGE_KEYS.TEACHERS, []),
      attendance: getStorageItem<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []),
      assessments: getStorageItem<StudentAssessment[]>(STORAGE_KEYS.ASSESSMENTS, []),
      fees: getStorageItem<StudentFeeBill[]>(STORAGE_KEYS.FEES, []),
      settings: getStorageItem<any>(STORAGE_KEYS.SETTINGS, null),
      calendar: getStorageItem<any>(STORAGE_KEYS.CALENDAR, null),
      emis_reports: getStorageItem<EmisData[]>(STORAGE_KEYS.EMIS, []),
      users_list: getStorageItem<UserAccount[]>(STORAGE_KEYS.USERS_LIST, [])
    };
    return JSON.stringify(backup, null, 2);
  }

  static importAllData(jsonString: string): { success: boolean; error?: string } {
    try {
      const data = JSON.parse(jsonString);
      if (!data) {
        throw new Error("Invalid or empty backup data file.");
      }
      
      // We validate that at least one recognizable core array exists or school info
      const hasStudents = Array.isArray(data.students);
      const hasTeachers = Array.isArray(data.teachers);
      const hasAttendance = Array.isArray(data.attendance);
      const hasAssessments = Array.isArray(data.assessments);
      const hasFees = Array.isArray(data.fees);
      const hasEmis = Array.isArray(data.emis_reports);
      const hasSchool = typeof data.school_info === 'object' && data.school_info !== null;

      if (!hasStudents && !hasTeachers && !hasAttendance && !hasAssessments && !hasFees && !hasSchool && !hasEmis) {
        throw new Error("The selected file is not a valid backup of this application system database.");
      }

      // Restore elements selectively if present
      if (hasSchool) setStorageItem(STORAGE_KEYS.SCHOOL, data.school_info);
      if (hasStudents) setStorageItem(STORAGE_KEYS.STUDENTS, data.students);
      if (hasTeachers) setStorageItem(STORAGE_KEYS.TEACHERS, data.teachers);
      if (hasAttendance) setStorageItem(STORAGE_KEYS.ATTENDANCE, data.attendance);
      if (hasAssessments) setStorageItem(STORAGE_KEYS.ASSESSMENTS, data.assessments);
      if (hasFees) setStorageItem(STORAGE_KEYS.FEES, data.fees);
      if (hasEmis) setStorageItem(STORAGE_KEYS.EMIS, data.emis_reports);
      if (data.settings) setStorageItem(STORAGE_KEYS.SETTINGS, data.settings);
      if (data.calendar) setStorageItem(STORAGE_KEYS.CALENDAR, data.calendar);
      if (Array.isArray(data.users_list)) setStorageItem(STORAGE_KEYS.USERS_LIST, data.users_list);

      // Perform selective background replication to Firebase if active
      if (isFirebaseActive && firestoreDb) {
        if (data.calendar) {
          setDoc(doc(firestoreDb, 'settings', 'academic_calendar'), data.calendar).catch(e => console.error("Firebase Sync settings error:", e));
        }
        if (hasSchool && data.school_info.id) {
          setDoc(doc(firestoreDb, 'schools', data.school_info.id), data.school_info).catch(e => console.error("Firebase Sync error:", e));
        }
        if (hasStudents) {
          data.students.forEach((st: Student) => {
            if (st.id) setDoc(doc(firestoreDb, 'students', st.id), st).catch(e => console.error(e));
          });
        }
        if (hasTeachers) {
          data.teachers.forEach((t: Teacher) => {
            if (t.id) setDoc(doc(firestoreDb, 'teachers', t.id), t).catch(e => console.error(e));
          });
        }
        if (hasAttendance) {
          data.attendance.forEach((r: AttendanceRecord) => {
            if (r.id) setDoc(doc(firestoreDb, 'attendance', r.id), r).catch(e => console.error(e));
          });
        }
        if (hasAssessments) {
          data.assessments.forEach((item: StudentAssessment) => {
            if (item.id) {
              const safeId = item.id.replace(/\//g, '-');
              setDoc(doc(firestoreDb, 'assessments', safeId), { ...item, id: safeId }).catch(e => console.error(e));
            }
          });
        }
        if (hasFees) {
          data.fees.forEach((f: StudentFeeBill) => {
            if (f.id) {
              setDoc(doc(firestoreDb, 'fees', f.id), f).catch(e => console.error(e));
            }
          });
        }
        if (hasEmis) {
          data.emis_reports.forEach((e: EmisData) => {
            if (e.id) {
              setDoc(doc(firestoreDb, 'emis', e.id), e).catch(err => console.error("Firebase Sync EMIS error:", err));
            }
          });
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  }

  static clearAllStudents(): void {
    const students = this.getStudents();
    students.forEach(s => {
      this.performFirestoreWrite('students', s.id, 'delete');
    });
    setStorageItem(STORAGE_KEYS.STUDENTS, []);
    localStorage.removeItem('school_students');
  }

  static clearAllTeachers(): void {
    const teachers = this.getTeachers();
    teachers.forEach(t => {
      this.performFirestoreWrite('teachers', t.id, 'delete');
    });
    setStorageItem(STORAGE_KEYS.TEACHERS, []);
    localStorage.removeItem('school_teachers');
  }

  static clearAllAssessments(): void {
    const assessments = this.getAssessments();
    assessments.forEach(a => {
      if (a.id) this.performFirestoreWrite('assessments', a.id, 'delete');
    });
    setStorageItem(STORAGE_KEYS.ASSESSMENTS, []);
    localStorage.removeItem('school_assessments');
  }

  static clearAllData(): void {
    // 1. If Firebase is active, cleanly clear active Firestore records
    if (isFirebaseActive && firestoreDb) {
      try {
        const students = this.getStudents();
        students.forEach(s => {
          deleteDoc(doc(firestoreDb, 'students', s.id)).catch(e => console.error(e));
        });

        const teachers = this.getTeachers();
        teachers.forEach(t => {
          deleteDoc(doc(firestoreDb, 'teachers', t.id)).catch(e => console.error(e));
        });

        const attendance = getStorageItem<any[]>(STORAGE_KEYS.ATTENDANCE, []);
        attendance.forEach(a => {
          if (a.id) deleteDoc(doc(firestoreDb, 'attendance', a.id)).catch(e => console.error(e));
        });

        const staffAttendance = getStorageItem<any[]>(STORAGE_KEYS.STAFF_ATTENDANCE, []);
        staffAttendance.forEach(sa => {
          if (sa.id) deleteDoc(doc(firestoreDb, 'staff_attendance', sa.id)).catch(e => console.error(e));
        });

        const assessments = getStorageItem<any[]>(STORAGE_KEYS.ASSESSMENTS, []);
        assessments.forEach(ass => {
          if (ass.id) deleteDoc(doc(firestoreDb, 'assessments', ass.id)).catch(e => console.error(e));
        });

        const fees = getStorageItem<any[]>(STORAGE_KEYS.FEES, []);
        fees.forEach(f => {
          if (f.id) deleteDoc(doc(firestoreDb, 'fees', f.id)).catch(e => console.error(e));
        });

        const emis = getStorageItem<any[]>(STORAGE_KEYS.EMIS, []);
        emis.forEach(e => {
          if (e.id) deleteDoc(doc(firestoreDb, 'emis', e.id)).catch(err => console.error(err));
        });

        // Format/clear school doc on firestore as well
        const defaultSchool: SchoolInfo = {
          id: 'school_default',
          name: '',
          motto: '',
          logoUrl: '',
          schoolNumber: '',
          emisCode: '',
          gpsAddress: '',
          schoolType: 'Public',
          headteacherName: '',
          telephone: '',
          email: '',
          qualifications: '',
          highestAcademicQualifications: '',
          district: '',
          circuit: '',
          reopeningDate: '',
          signatureUrl: '',
          stampUrl: ''
        };
        setDoc(doc(firestoreDb, 'schools', 'school_default'), defaultSchool).catch(e => console.error(e));
      } catch (err) {
        console.error("Error clearing Cloud Firestore data during format:", err);
      }
    }

    // 2. Erase all cache & registry records from LocalStorage
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.USERS_LIST);
    localStorage.removeItem(STORAGE_KEYS.STUDENTS);
    localStorage.removeItem(STORAGE_KEYS.TEACHERS);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
    localStorage.removeItem(STORAGE_KEYS.STAFF_ATTENDANCE);
    localStorage.removeItem(STORAGE_KEYS.ASSESSMENTS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.FEES);
    localStorage.removeItem(STORAGE_KEYS.EMIS);
    localStorage.removeItem(STORAGE_KEYS.CALENDAR);
    localStorage.removeItem('sms_offline_queue');

    // Make sure we purge legacy keys that some old client tab code might read/write
    localStorage.removeItem('school_students');
    localStorage.removeItem('school_teachers');
    localStorage.removeItem('school_assessments');
    localStorage.removeItem('school_fees_bills');

    // Write a fully blank SchoolInfo template so that any new login starts with completely blank input data
    const blankSchool: SchoolInfo = {
      id: 'school_default',
      name: '',
      motto: '',
      logoUrl: '',
      schoolNumber: '',
      emisCode: '',
      gpsAddress: '',
      schoolType: 'Public',
      headteacherName: '',
      telephone: '',
      email: '',
      qualifications: '',
      highestAcademicQualifications: '',
      district: '',
      circuit: '',
      reopeningDate: '',
      signatureUrl: '',
      stampUrl: ''
    };
    localStorage.setItem(STORAGE_KEYS.SCHOOL, JSON.stringify(blankSchool));
  }
}
