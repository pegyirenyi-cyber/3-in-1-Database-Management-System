import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  getDocFromServer
} from 'firebase/firestore';
import {
  SchoolInfo,
  Student,
  Teacher,
  AttendanceRecord,
  StudentAssessment,
  UserAccount,
  UserRole,
  ClassType,
  AcademicYearType,
  TermType,
  SubjectType,
  ThemeType,
  StudentFeeBill,
  FeePayment
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firebaseAuth = getAuth(firebaseApp);
    const dbId = (firebaseConfig as any).firestoreDatabaseId || "ai-studio-a2d8d304-855b-466a-8f1a-47e69bbb165b";
    firestoreDb = getFirestore(firebaseApp, dbId);
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
      await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
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
  circuit: ''
};

// Local storage key constants
const STORAGE_KEYS = {
  USER: 'sms_user',
  USERS_LIST: 'sms_users_list',
  SCHOOL: 'sms_school_info',
  STUDENTS: 'sms_students',
  TEACHERS: 'sms_teachers',
  ATTENDANCE: 'sms_attendance',
  ASSESSMENTS: 'sms_assessments',
  SETTINGS: 'sms_settings',
  FEES: 'sms_fees'
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

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    
    if (!isOnline) {
      this.enqueueOfflineOperation(colName, docId, type, data);
      return;
    }

    try {
      if (type === 'set') {
        const docRef = doc(firestoreDb, colName, docId);
        await setDoc(docRef, data);
      } else if (type === 'delete') {
        const docRef = doc(firestoreDb, colName, docId);
        await deleteDoc(docRef);
      }
      console.log(`[Offline Sync] Successfully synced ${type} on ${colName}/${docId} with Firestore.`);
    } catch (error) {
      console.warn(`[Offline Sync] Firestore write failed for ${colName}/${docId}, queueing offline:`, error);
      this.enqueueOfflineOperation(colName, docId, type, data);
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
        if (item.type === 'set') {
          const docRef = doc(firestoreDb, item.collection, item.docId);
          await setDoc(docRef, item.data);
        } else if (item.type === 'delete') {
          const docRef = doc(firestoreDb, item.collection, item.docId);
          await deleteDoc(docRef);
        }
        syncedCount++;
        console.log(`[Offline Sync] Replay success: ${item.type} on ${item.collection}/${item.docId}`);
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
          email: 'admin@ges.edu',
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
    return list;
  }

  static login(email: string, role: UserRole): UserAccount {
    // Find or bootstrap user account (for offline fallback)
    const users = this.getRegisteredUsers();
    let user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role);
    if (!user) {
      // Create user
      user = {
        uid: 'user_' + Math.random().toString(36).substring(2, 9),
        email: email,
        name: email.split('@')[0].toUpperCase(),
        role: role,
        createdAt: new Date().toISOString()
      };
      users.push(user);
      setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    }
    setStorageItem(STORAGE_KEYS.USER, user);
    return user;
  }

  static register(name: string, email: string, role: UserRole): UserAccount {
    const users = this.getRegisteredUsers();
    const newUser: UserAccount = {
      uid: 'user_' + Math.random().toString(36).substring(2, 9),
      email: email,
      name: name,
      role: role,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    return newUser;
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
      
      const profile: UserAccount = {
        uid,
        email,
        name,
        role,
        createdAt: new Date().toISOString()
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

      // Retrieve user profile data
      const userDoc = await getDoc(doc(firestoreDb, 'users', uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserAccount;
        setStorageItem(STORAGE_KEYS.USER, profile);
        
        const users = this.getRegisteredUsers();
        if (!users.some(u => u.uid === uid)) {
          users.push(profile);
          setStorageItem(STORAGE_KEYS.USERS_LIST, users);
        }
        return profile;
      } else {
        // Create user profile document if missing
        const profile: UserAccount = {
          uid,
          email,
          name: email.split('@')[0].toUpperCase(),
          role: 'Headteacher', // Default fallback
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(firestoreDb, 'users', uid), profile);
        setStorageItem(STORAGE_KEYS.USER, profile);
        return profile;
      }
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
      
      // Check if user profile already exists in Firestore
      const userDocSnapshot = await getDoc(doc(firestoreDb, 'users', user.uid));
      if (userDocSnapshot.exists()) {
        const profile = userDocSnapshot.data() as UserAccount;
        setStorageItem(STORAGE_KEYS.USER, profile);
        return { user: profile, isNew: false };
      } else {
        const tempProfile: UserAccount = {
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || user.email?.split('@')[0] || 'Google User',
          role: 'Headteacher', // placeholder, will confirm in UI
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
    if (isFirebaseActive && firestoreDb) {
      await setDoc(doc(firestoreDb, 'users', profile.uid), profile);
    }
    setStorageItem(STORAGE_KEYS.USER, profile);
    const users = this.getRegisteredUsers();
    if (!users.some(u => u.uid === profile.uid)) {
      users.push(profile);
      setStorageItem(STORAGE_KEYS.USERS_LIST, users);
    }
    return profile;
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
      console.error("Error in getFirebaseUserProfile:", e);
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
      const schoolsSnap = await getDocs(collection(firestoreDb, 'schools'));
      if (!schoolsSnap.empty) {
        const schoolDoc = schoolsSnap.docs[0];
        if (schoolDoc) {
          setStorageItem(STORAGE_KEYS.SCHOOL, schoolDoc.data() as SchoolInfo);
        }
      }

      // 2. Students
      const studentsSnap = await getDocs(collection(firestoreDb, 'students'));
      const studentsList = studentsSnap.docs.map(d => d.data() as Student);
      setStorageItem(STORAGE_KEYS.STUDENTS, studentsList);

      // 3. Teachers
      const teachersSnap = await getDocs(collection(firestoreDb, 'teachers'));
      const teachersList = teachersSnap.docs.map(d => d.data() as Teacher);
      setStorageItem(STORAGE_KEYS.TEACHERS, teachersList);

      // 4. Attendance Registers
      const attendanceSnap = await getDocs(collection(firestoreDb, 'attendance'));
      const attendanceList = attendanceSnap.docs.map(d => d.data() as AttendanceRecord);
      setStorageItem(STORAGE_KEYS.ATTENDANCE, attendanceList);

      // 5. Assessments Registers
      const assessmentsSnap = await getDocs(collection(firestoreDb, 'assessments'));
      const assessmentsList = assessmentsSnap.docs.map(d => d.data() as StudentAssessment);
      setStorageItem(STORAGE_KEYS.ASSESSMENTS, assessmentsList);

      // 6. Fees Bills
      const feesSnap = await getDocs(collection(firestoreDb, 'fees'));
      const feesList = feesSnap.docs.map(d => d.data() as StudentFeeBill);
      setStorageItem(STORAGE_KEYS.FEES, feesList);

      console.log("Database sync from Firestore successfully synced.");
    } catch (e) {
      console.error("Database sync from Firestore aborted:", e);
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
          status: 'Present' // Default status
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
        // Construct clean template
        const emptyAssessment: StudentAssessment = {
          id: compoundId,
          studentId: st.id,
          studentName: `${st.firstName} ${st.middleName ? st.middleName + ' ' : ''}${st.lastName}`,
          class: className,
          academicYear,
          term,
          subject,
          exercises: [0, 0, 0, 0], // 4 exercises (0-10)
          tests: [0, 0], // 2 tests (0-20)
          projectWork: 0, // 0-10
          groupWork: 0, // 0-10
          classScoreTotal: 0,
          classScore50: 0,
          examScore100: 0,
          examScore50: 0,
          totalScore: 0,
          gradeLevel: 'L5',
          remarks: 'Emerging'
        };
        return emptyAssessment;
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
    const studentGrades = assessments.filter(
      a => a.studentId === studentId && a.academicYear === academicYear && a.term === term
    );

    // Calculate general average score
    const totalScoreSum = studentGrades.reduce((sum, item) => sum + item.totalScore, 0);
    const averageScore = studentGrades.length > 0 
      ? parseFloat((totalScoreSum / studentGrades.length).toFixed(2)) 
      : 0;

    return {
      student,
      grades: studentGrades,
      averageScore,
      totalSubjects: studentGrades.length
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
    setStorageItem(STORAGE_KEYS.FEES, []);
    
    // Deleting from Firebase if accessible
    if (isFirebaseActive && firestoreDb) {
      // Best-effort local cleanup, for mass-delete they can clear local.
    }
  }

  // System settings customization
  static getSystemSettings() {
    return getStorageItem(STORAGE_KEYS.SETTINGS, {
      theme: 'Classic' as ThemeType,
      autoSave: true,
      term: 'Term 1' as TermType,
      academicYear: '2025/2026' as AcademicYearType,
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
      const hasSchool = typeof data.school_info === 'object' && data.school_info !== null;

      if (!hasStudents && !hasTeachers && !hasAttendance && !hasAssessments && !hasFees && !hasSchool) {
        throw new Error("The selected file is not a valid backup of this application system database.");
      }

      // Restore elements selectively if present
      if (hasSchool) setStorageItem(STORAGE_KEYS.SCHOOL, data.school_info);
      if (hasStudents) setStorageItem(STORAGE_KEYS.STUDENTS, data.students);
      if (hasTeachers) setStorageItem(STORAGE_KEYS.TEACHERS, data.teachers);
      if (hasAttendance) setStorageItem(STORAGE_KEYS.ATTENDANCE, data.attendance);
      if (hasAssessments) setStorageItem(STORAGE_KEYS.ASSESSMENTS, data.assessments);
      if (hasFees) setStorageItem(STORAGE_KEYS.FEES, data.fees);
      if (data.settings) setStorageItem(STORAGE_KEYS.SETTINGS, data.settings);
      if (Array.isArray(data.users_list)) setStorageItem(STORAGE_KEYS.USERS_LIST, data.users_list);

      // Perform selective background replication to Firebase if active
      if (isFirebaseActive && firestoreDb) {
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
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  }

  static clearAllData(): void {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.USERS_LIST);
    localStorage.removeItem(STORAGE_KEYS.STUDENTS);
    localStorage.removeItem(STORAGE_KEYS.TEACHERS);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
    localStorage.removeItem(STORAGE_KEYS.ASSESSMENTS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.FEES);

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
      circuit: ''
    };
    localStorage.setItem(STORAGE_KEYS.SCHOOL, JSON.stringify(blankSchool));
  }
}
