import { useState, useEffect, FormEvent } from 'react';
import { 
  SchoolInfo, Student, Teacher, UserAccount, UserRole, ThemeType,
  AcademicYearType, TermType
} from './types';
import { DbController } from './db';
import { onAuthStateChanged } from 'firebase/auth';
import { THEME_CONFIGS, ThemeStyles } from './components/ThemeWrapper';
import DeveloperStatus from './components/DeveloperStatus';
// @ts-ignore
import developerLogo from './assets/images/developer_logo_1781333279532.jpg';
import SchoolProfileTab from './components/SchoolProfileTab';
import ParentPortal from './components/ParentPortal';
import { generateSecureToken } from './utils';
import StudentsTab from './components/StudentsTab';
import TeachersTab from './components/TeachersTab';
import AttendanceTab from './components/AttendanceTab';
import AssessmentTab from './components/AssessmentTab';
import SettingsTab from './components/SettingsTab';
import SchoolFeesTab from './components/SchoolFeesTab';
import DashboardSummaryTab from './components/DashboardSummaryTab';
import CommunicationsTab from './components/CommunicationsTab';
import AcademicCalendarTab from './components/AcademicCalendarTab';
import EmisTab from './components/EmisTab';
import PaystackManagementTab from './components/PaystackManagementTab';
import { evaluateSubscription } from './subscription';
import SubscriptionLockModal from './components/SubscriptionLockModal';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Landmark, Users, UserCheck, CalendarCheck, FileSpreadsheet, Settings, 
  LogOut, ShieldAlert, Lock, Mail, User, BookOpen, GraduationCap, Sparkles, Coins, RotateCcw,
  ChevronDown, MoreHorizontal, TrendingUp, Power, Smartphone, CalendarDays, Menu, X, ClipboardCheck,
  CreditCard
} from 'lucide-react';

const AVAILABLE_TABS = [
  { id: 'dashboard', label: 'Dashboard Summary', icon: TrendingUp, refresh: true },
  { id: 'school_profile', label: 'School Profile', icon: Landmark, refresh: false },
  { id: 'calendar', label: 'Academic Calendar', icon: CalendarDays, refresh: false },
  { id: 'students', label: 'Student Profiles', icon: Users, refresh: false },
  { id: 'teachers', label: 'Teacher Profiles', icon: UserCheck, refresh: false },
  { id: 'attendance', label: 'Class Attendance Roster', icon: CalendarCheck, refresh: false },
  { id: 'assessments', label: 'Academic Assessments', icon: FileSpreadsheet, refresh: true },
  { id: 'fees', label: 'School Fees Ledger', icon: Coins, refresh: true },
  { id: 'paystack', label: 'Paystack Ledger', icon: CreditCard, refresh: true },
  { id: 'communications', label: 'Parent Messages', icon: Smartphone, refresh: false },
  { id: 'emis', label: 'GES EMIS Census', icon: ClipboardCheck, refresh: false },
  { id: 'settings', label: 'System Controls', icon: Settings, refresh: false }
];

export default function App() {
  // Global Session Identity State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(DbController.getCurrentUser());
  
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.email.toLowerCase().trim() === 'pegyirenyi@gmail.com';
  const visibleTabs = AVAILABLE_TABS.filter(tab => {
    if (tab.id === 'paystack') return isAdmin;
    return true;
  });

  const subscriptionStatus = currentUser ? evaluateSubscription(currentUser) : null;
  const [isFirebaseChecking, setIsFirebaseChecking] = useState(DbController.isFirebaseEnabled());

  // Parent Access Portal State
  const [parentPortalState, setParentPortalState] = useState<{
    isActive: boolean;
    studentId: string;
    year: string;
    term: string;
    token: string;
  }>(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const studentId = q.get('studentId') || '';
      const year = q.get('year') || '';
      const term = q.get('term') || '';
      const token = q.get('token') || '';
      const isParentMode = q.get('parentMode') === 'true' || (!!studentId && !!year && !!term && !!token);
      
      return {
        isActive: !!isParentMode,
        studentId,
        year,
        term,
        token
      };
    } catch (e) {
      return { isActive: false, studentId: '', year: '', term: '', token: '' };
    }
  });
  
  // Database datasets loaded from DbController
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(DbController.getSchoolInfo());
  const [students, setStudents] = useState<Student[]>(DbController.getStudents());
  const [teachers, setTeachers] = useState<Teacher[]>(DbController.getTeachers());

  // Settings & Customization
  const [activeTheme, setActiveTheme] = useState<ThemeType>('Sophisticated Dark');
  const [isAutoSave, setIsAutoSave] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedYear, setSelectedYear] = useState<AcademicYearType>('2026/2027');
  const [selectedTerm, setSelectedTerm] = useState<TermType>('Term 1');
  const [isMoreDropdownOpen, setIsMoreDropdownOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const currentActiveTab = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];
  const CurrentActiveIcon = currentActiveTab.icon;

  // Login & Registration state for both Local and secure full-stack Firebase Authentication
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<UserRole>('Headteacher');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('Headteacher');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [googleNewUser, setGoogleNewUser] = useState<UserAccount | null>(null);
  const [googleSelectedRole, setGoogleSelectedRole] = useState<UserRole>('Headteacher');
  const [wipeSuccessMessage, setWipeSuccessMessage] = useState<string | null>(null);
  const [isExited, setIsExited] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  // Password Reset modal states
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [printNotification, setPrintNotification] = useState<string | null>(null);

  // Connection status & offline sync queue monitors
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        handleManualSync();
      }
    };
    const updateSyncCount = () => {
      setPendingSyncCount(DbController.getOfflineQueueSize());
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener('sms_sync_status_changed', updateSyncCount);

    // Bootstrap local sync count checks
    setPendingSyncCount(DbController.getOfflineQueueSize());

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('sms_sync_status_changed', updateSyncCount);
    };
  }, []);

  const handleManualSync = async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await DbController.syncOfflineQueue();
      if (result.syncedCount > 0) {
        refreshAllLogs();
      }
    } catch (err) {
      console.warn("Manual background sync error during retry:", err);
    } finally {
      setIsSyncing(false);
      setPendingSyncCount(DbController.getOfflineQueueSize());
    }
  };

  // Global keyboard shortcut (Ctrl+P) specifically for report cards & record sheets
  useEffect(() => {
    if (!currentUser) return;

    const handleGlobalPrintShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        
        // Let user know print operation was captured and layout is being aligned
        setPrintNotification("Formatting A4 printable report cards & record sheets...");
        setTimeout(() => setPrintNotification(null), 3000);

        if (activeTab !== 'assessments') {
          setActiveTab('assessments');
          // Wait for state transition to complete so correct DOM is rendered for print stylesheets
          setTimeout(() => {
            try {
              window.print();
            } catch (err) {
              console.warn("Direct window.print() error inside sandboxed iframe:", err);
            }
          }, 450);
        } else {
          try {
            window.print();
          } catch (err) {
            console.warn("Direct window.print() error inside sandboxed iframe:", err);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalPrintShortcut);
    return () => {
      window.removeEventListener('keydown', handleGlobalPrintShortcut);
    };
  }, [currentUser, activeTab]);

  // Sync state settings on boot
  useEffect(() => {
    const config = DbController.getSystemSettings();
    setActiveTheme(config.theme || 'Sophisticated Dark');
    setIsAutoSave(true);
    if (config.academicYear) setSelectedYear(config.academicYear);
    if (config.term) setSelectedTerm(config.term);
  }, []);

  const handleYearChange = (yr: AcademicYearType) => {
    setSelectedYear(yr);
    const config = DbController.getSystemSettings();
    DbController.saveSystemSettings({ ...config, academicYear: yr });
  };

  const handleTermChange = (tm: TermType) => {
    setSelectedTerm(tm);
    const config = DbController.getSystemSettings();
    DbController.saveSystemSettings({ ...config, term: tm });
  };

  // Listen to Firebase auth changes to coordinate secure syncs
  useEffect(() => {
    if (!DbController.isFirebaseEnabled()) {
      setIsFirebaseChecking(false);
      return;
    }

    const auth = DbController.getAuthInstance();
    if (!auth) {
      setIsFirebaseChecking(false);
      return;
    }

    // Subscribe to Firebase Auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          console.log("Firebase Auth found active session for", firebaseUser.email);
          let localProfile = DbController.getCurrentUser();
          
          if (!localProfile || localProfile.uid !== firebaseUser.uid) {
            const remoteProfile = await DbController.getFirebaseUserProfile(firebaseUser.uid);
            if (remoteProfile) {
              setCurrentUser(remoteProfile);
              localStorage.setItem('sms_user', JSON.stringify(remoteProfile));
            } else {
              // Create default fallback profile
              const fallback: UserAccount = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                role: 'Headteacher',
                createdAt: new Date().toISOString()
              };
              await DbController.saveGoogleProfile(fallback);
              setCurrentUser(fallback);
            }
          }
          
          // Now that auth is fully initialized and authenticated, do a secure background sync
          console.log("Syncing database with authenticated Firebase Auth credentials...");
          DbController.syncAllDataFromFirebase().then(() => {
            refreshAllLogs();
          }).catch(err => {
            console.warn("Background sync error on startup:", err);
          });
        } else {
          console.log("Firebase Auth: No active session.");
        }
      } catch (err) {
        console.error("Error in Firebase Auth observer:", err);
      } finally {
        setIsFirebaseChecking(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Background-sync Firestore ledger data if user state changes after auth ready
  useEffect(() => {
    if (currentUser && DbController.isFirebaseEnabled() && !isFirebaseChecking) {
      const auth = DbController.getAuthInstance();
      if (auth?.currentUser) {
        DbController.syncAllDataFromFirebase().then(() => {
          refreshAllLogs();
        });
      }
    }
  }, [currentUser, isFirebaseChecking]);

  const refreshAllLogs = () => {
    setSchoolInfo(DbController.getSchoolInfo());
    setStudents(DbController.getStudents());
    setTeachers(DbController.getTeachers());
    const config = DbController.getSystemSettings();
    setActiveTheme(config.theme || 'Sophisticated Dark');
    setIsAutoSave(true);
  };

  const handleResetAndClear = () => {
    // Clear all fields State
    setLoginEmail('');
    setLoginPassword('');
    setLoginRole('Headteacher');
    setIsRegisterMode(false);
    setRegName('');
    setRegEmail('');
    setRegPassword('');
    setRegRole('Headteacher');
    setAuthError(null);
    setGoogleNewUser(null);
    
    // Clear the active session and trigger storage wipe
    DbController.clearAllData();
    setCurrentUser(null);
    
    // Set datasets to blank / initial fallback states
    setStudents([]);
    setTeachers([]);
    
    // Refresh school metadata and trigger visual updates in UI components
    setSchoolInfo(DbController.getSchoolInfo());
    
    // Set validation message
    setWipeSuccessMessage("Successfully reset all fields and wiped the database for a clean new login.");
    setTimeout(() => {
      setWipeSuccessMessage(null);
    }, 6000);
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginEmail) return;
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (DbController.isFirebaseEnabled()) {
        const account = await DbController.firebaseLogin(loginEmail, loginPassword);
        setCurrentUser(account);
        DbController.syncAllDataFromFirebase().then(() => {
          refreshAllLogs();
        }).catch(err => {
          console.warn("Post-login sync error:", err);
        });
      } else {
        const account = DbController.login(loginEmail, loginRole);
        setCurrentUser(account);
      }
      refreshAllLogs();
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Invalid credentials. Please verify your email and password.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      await DbController.firebaseSendPasswordResetEmail(resetEmail.trim());
      setResetSuccess("A secure password reset link has been dispatched to your email address.");
      setResetEmail("");
    } catch (err: any) {
      console.error(err);
      setResetError(err.message || "An unexpected error occurred during password reset dispatch.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail) return;
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (DbController.isFirebaseEnabled()) {
        const passwordToUse = regPassword || "defaultPass123";
        const account = await DbController.firebaseRegister(regName, regEmail, passwordToUse, regRole);
        setCurrentUser(account);
        DbController.syncAllDataFromFirebase().then(() => {
          refreshAllLogs();
        }).catch(err => {
          console.warn("Post-register sync error:", err);
        });
      } else {
        const account = DbController.register(regName, regEmail, regRole);
        setCurrentUser(account);
      }
      setIsRegisterMode(false);
      refreshAllLogs();
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Failed to register new account. Minimum password length is 6 characters.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await DbController.firebaseGoogleLogin();
      if (result.isNew) {
        setGoogleNewUser(result.user);
      } else {
        setCurrentUser(result.user);
        DbController.syncAllDataFromFirebase().then(() => {
          refreshAllLogs();
        }).catch(err => {
          console.warn("Post-Google sync error:", err);
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(
        err.message || 
        "Sign in with Google cancelled. If inside a sandboxed preview frame, please try again or click the popups key symbol."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await DbController.firebaseMicrosoftLogin();
      if (result.isNew) {
        setGoogleNewUser(result.user);
      } else {
        setCurrentUser(result.user);
        DbController.syncAllDataFromFirebase().then(() => {
          refreshAllLogs();
        }).catch(err => {
          console.warn("Post-Microsoft sync error:", err);
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(
        err.message || 
        "Sign in with Microsoft cancelled. If inside a sandboxed preview frame, please try again or click the popups key symbol."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await DbController.firebaseAppleLogin();
      if (result.isNew) {
        setGoogleNewUser(result.user);
      } else {
        setCurrentUser(result.user);
        DbController.syncAllDataFromFirebase().then(() => {
          refreshAllLogs();
        }).catch(err => {
          console.warn("Post-Apple sync error:", err);
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(
        err.message || 
        "Sign in with Apple cancelled. If inside a sandboxed preview frame, please try again or click the popups key symbol."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmGoogleRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!googleNewUser) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const assignedRole: UserRole = googleNewUser.email.toLowerCase().trim() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';
      const finalizedUser = {
        ...googleNewUser,
        role: assignedRole
      };
      const account = await DbController.saveGoogleProfile(finalizedUser);
      setCurrentUser(account);
      setGoogleNewUser(null);
      DbController.syncAllDataFromFirebase().then(() => {
        refreshAllLogs();
      }).catch(err => {
        console.warn("Post-confirm-role sync error:", err);
      });
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Failed to provision Google account details.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    DbController.logout();
    setCurrentUser(null);
  };

  // Get active branding styles
  const themeStyles = THEME_CONFIGS[activeTheme];

  if (isExited) {
    return (
      <div className="min-h-screen bg-slate-950 font-sans flex items-center justify-center p-4 relative overflow-hidden">
        {/* Abstract background gradient accent flares */}
        <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-rose-900/10 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-orange-900/10 blur-3xl" />

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 text-center space-y-6 text-slate-100">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Power size={32} />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-display font-black tracking-tight text-rose-400 uppercase">SYSTEM EXITED</h1>
            <p className="text-xs text-slate-400">Your secure database session has been disconnected cleanly.</p>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-[11px] text-slate-400 leading-relaxed font-mono">
            All transient memory has been purged. You may now close this browser tab safely.
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsExited(false)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Re-Launch Platform
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Parent Access Secure Portal override
  if (parentPortalState.isActive) {
    return (
      <ParentPortal 
        studentId={parentPortalState.studentId}
        year={parentPortalState.year}
        term={parentPortalState.term}
        token={parentPortalState.token}
        onExit={() => {
          setParentPortalState({ isActive: false, studentId: '', year: '', term: '', token: '' });
          if (typeof window !== 'undefined') {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }}
      />
    );
  }

  // Secure Authorization Gate (Renders login panel if not authenticated)
  if (!currentUser) {
    return (
      <div className={`min-h-screen bg-slate-950 font-sans flex items-center justify-center p-4 relative overflow-hidden`}>
        {/* Abstract background gradient accent flares */}
        <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-indigo-900/10 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-violet-900/10 blur-3xl" />

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6 fade-in text-slate-100">
          
          <div className="text-center space-y-1.5">
            <div className="relative w-20 h-20 rounded-2xl border border-slate-700/85 overflow-hidden mx-auto mb-3.5 bg-slate-850 flex items-center justify-center shadow-lg">
              <img 
                src={developerLogo} 
                alt="GEETECH MULTIMEDIA Logo" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' fill='%230f172a' stroke='%2338bdf8' stroke-width='2' rx='16'/><text x='40' y='46' font-size='24' text-anchor='middle' fill='%2338bdf8' font-family='monospace'>GT</text></svg>";
                }}
              />
            </div>
            <h1 className="text-lg font-display font-black tracking-tight uppercase text-amber-400">GEETECH MULTIMEDIA</h1>
            <p className="text-xs text-slate-400 font-mono">All in 1 School Database & Assessment Center</p>
          </div>

          {authError && (
            <div className="p-3.5 bg-red-950/50 border border-red-900/60 rounded-xl text-red-400 text-xs leading-relaxed font-sans space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <ShieldAlert size={14} /> Authentication Notice
              </div>
              <div>{authError}</div>
            </div>
          )}

          {wipeSuccessMessage && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-900/40 rounded-xl text-emerald-400 text-xs leading-relaxed font-sans space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <Sparkles size={14} className="text-emerald-400 animate-pulse" /> Reset Status
              </div>
              <div>{wipeSuccessMessage}</div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {googleNewUser ? (
              // STEP: Google Role Assignment Form
              <motion.form
                key="google-role-form"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                onSubmit={handleConfirmGoogleRole}
                className="space-y-4 text-xs"
              >
                <div className="space-y-2">
                  <div className="p-3.5 bg-indigo-950/20 border border-indigo-900/30 rounded-xl space-y-1">
                    <div className="text-[10px] text-indigo-400 font-mono tracking-wider uppercase font-bold">Google Session Authenticated</div>
                    <div className="text-sm font-bold text-slate-100">{googleNewUser.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{googleNewUser.email}</div>
                  </div>
                  
                  <div className="text-slate-300 leading-relaxed">
                    Welcome! To provision your account credentials and initialize synchronization, your access role has been configured automatically:
                  </div>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="block text-[10px] text-slate-400 uppercase font-mono mb-1">Administrative Access Role</span>
                  {googleNewUser.email.toLowerCase().trim() === 'pegyirenyi@gmail.com' ? (
                    <div className="text-indigo-400 font-bold text-sm">System Administrator Level</div>
                  ) : (
                    <div className="text-teal-400 font-bold text-sm">Headteacher Level Role</div>
                  )}
                </div>

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold rounded-xl transition shadow-md cursor-pointer active:translate-y-0.5 disabled:opacity-50 text-xs"
                >
                  {authLoading ? "Initializing Sync..." : "Confirm & Launch System Setup"}
                </button>

                <div className="text-center pt-1">
                  <button 
                    type="button" 
                    onClick={() => setGoogleNewUser(null)}
                    className="text-slate-500 hover:text-slate-300 transition underline text-[11px]"
                  >
                    Cancel Setup
                  </button>
                </div>
              </motion.form>
            ) : !isRegisterMode ? (
              // STEP: Standard / Firebase Login form
              <motion.div 
                key="login-form"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-4 text-xs"
              >
                {!showEmailLogin ? (
                  /* Standard / Professional View: Google Login is Primary */
                  <div className="space-y-5">
                    <div className="text-center text-slate-400 pb-2 text-[11px] leading-relaxed">
                      Select a professional authentication method to securely manage your school profiles, grades, and fee records.
                    </div>

                    <button 
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={authLoading}
                      className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 font-bold text-xs cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                    >
                      <svg className="w-4.5 h-4.5 flex-shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.06-1.19-.28-1.68-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53 z"/>
                      </svg>
                      <span>Login from Google Account</span>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        type="button"
                        onClick={handleMicrosoftLogin}
                        disabled={authLoading}
                        className="py-2.5 bg-[#252526] hover:bg-[#2d2d30] text-slate-100 border border-slate-800 rounded-xl transition-all flex items-center justify-center gap-2 font-semibold text-xs cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 23 23">
                          <path fill="#F25022" d="M1 1h10v10H1z"/>
                          <path fill="#7FBA00" d="M12 1h10v10H12z"/>
                          <path fill="#00A4EF" d="M1 12h10v10H1z"/>
                          <path fill="#FFB900" d="M12 12h10v10H12z"/>
                        </svg>
                        <span>Microsoft</span>
                      </button>

                      <button 
                        type="button"
                        onClick={handleAppleLogin}
                        disabled={authLoading}
                        className="py-2.5 bg-black hover:bg-zinc-900 text-white border border-zinc-850 rounded-xl transition-all flex items-center justify-center gap-2 font-semibold text-xs cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.51 12.06 1.01 1.454 2.187 3.078 3.766 3.017 1.524-.06 2.099-.982 3.937-.982 1.829 0 2.355.982 3.937.95 1.612-.027 2.651-1.464 3.634-2.9 1.137-1.656 1.61-3.255 1.636-3.337-.035-.013-3.14-1.201-3.175-4.786-.03-2.985 2.444-4.417 2.557-4.482-1.4-2.047-3.56-2.277-4.327-2.333-1.879-.153-3.754 1.149-4.708 1.149V6.896zm2.348-4.815c.8-1.002 1.341-2.08 1.189-3.081-.883.037-1.954.588-2.587 1.334-.541.62-.997 1.72-.818 2.709.98.077 1.979-.475 2.416-.962z"/>
                        </svg>
                        <span>Apple ID</span>
                      </button>
                    </div>

                    <div className="relative flex items-center justify-center py-2">
                      <div className="absolute inset-x-0 h-px bg-slate-800/60" />
                      <span className="relative px-3 bg-slate-900 text-slate-500 font-mono text-[9px] uppercase tracking-widest leading-none">or</span>
                    </div>

                    <button 
                      type="button"
                      onClick={() => setShowEmailLogin(true)}
                      className="w-full py-3 bg-slate-950 hover:bg-slate-900 text-slate-200 border border-slate-800/80 rounded-xl transition flex items-center justify-center gap-2 font-medium text-xs cursor-pointer active:scale-[0.99]"
                    >
                      <Mail size={14} className="text-slate-400" />
                      <span>Login in with other Email Account</span>
                    </button>

                    <div className="flex justify-center pt-2">
                      <button 
                        type="button"
                        onClick={() => setIsExited(true)}
                        className="py-2 px-4 bg-rose-950/20 hover:bg-rose-950/30 text-rose-400 hover:text-rose-350 border border-rose-900/30 rounded-xl transition font-semibold flex items-center justify-center gap-1.5 cursor-pointer text-[10px]"
                      >
                        <Power size={11} />
                        <span>Exit Platform</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Secondary View: Clean email login inputs */
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 text-slate-600" size={15} />
                        <input 
                          type="email" 
                          required
                          placeholder="e.g. name@domain.com"
                          value={loginEmail}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLoginEmail(val);
                            if (val.toLowerCase().trim() === 'pegyirenyi@gmail.com') {
                              setLoginRole('Admin');
                            } else {
                              setLoginRole('Headteacher');
                            }
                          }}
                          className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                        />
                      </div>
                    </div>

                    {DbController.isFirebaseEnabled() && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-slate-400 font-semibold">Password</label>
                          <button
                            type="button"
                            onClick={() => {
                              setResetEmail(loginEmail);
                              setResetError(null);
                              setResetSuccess(null);
                              setIsResetModalOpen(true);
                            }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline font-bold transition cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-2.5 text-slate-600" size={15} />
                          <input 
                            type="password" 
                            required
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button 
                        type="submit"
                        disabled={authLoading}
                        className="py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold rounded-xl transition shadow-md cursor-pointer active:translate-y-0.5 disabled:opacity-50 text-xs"
                      >
                        {authLoading ? "Initializing..." : "Confirm Login"}
                      </button>

                      <button 
                        type="button"
                        onClick={() => setShowEmailLogin(false)}
                        className="py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-350 hover:text-white border border-slate-850 rounded-xl transition font-medium flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                      >
                        <span>Back to Google</span>
                      </button>
                    </div>
                  </form>
                )}

                <div className="text-center pt-2">
                  <span className="text-slate-500">Need another administrative account? </span>
                  <button 
                    type="button" 
                    onClick={() => { setIsRegisterMode(true); setAuthError(null); }}
                    className="text-indigo-400 hover:underline font-bold"
                  >
                    Register here
                  </button>
                </div>
              </motion.div>
            ) : (
              // STEP: Registration Form
              <motion.form 
                key="register-form"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                onSubmit={handleRegisterSubmit} 
                className="space-y-4 text-xs"
              >
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Account Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 text-slate-600" size={15} />
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Paul Egyirenyi"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Access Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 text-slate-600" size={15} />
                    <input 
                      type="email" 
                      required
                      placeholder="e.g. pegyirenyi@gmail.com"
                      value={regEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRegEmail(val);
                        if (val.toLowerCase().trim() === 'pegyirenyi@gmail.com') {
                          setRegRole('Admin');
                        } else {
                          setRegRole('Headteacher');
                        }
                      }}
                      className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                {DbController.isFirebaseEnabled() && (
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Set Secure Password (Min 6 chars)</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 text-slate-600" size={15} />
                      <input 
                        type="password" 
                        required
                        placeholder="••••••••"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <button 
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-50"
                  >
                    {authLoading ? "Provisioning System Setup..." : "Create and Provision Account"}
                  </button>

                  {DbController.isFirebaseEnabled() && (
                    <button 
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={authLoading}
                      className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-100 hover:text-white border border-slate-850 rounded-xl transition flex items-center justify-center gap-2 font-bold cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.06-1.19-.28-1.68-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53 z"/>
                      </svg>
                      Sign Up with Google
                    </button>
                  )}
                </div>

                <div className="text-center pt-2">
                  <span className="text-slate-500">Already registered? </span>
                  <button 
                    type="button" 
                    onClick={() => { setIsRegisterMode(false); setAuthError(null); }}
                    className="text-indigo-400 hover:underline font-bold"
                  >
                    Login here
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="pt-4 border-t border-slate-800 text-center font-mono text-[10px] text-slate-500">
            <div>
              <p>EGYIRENYI PAUL | GEETECH MULTIMEDIA</p>
              <p>pegiyrenyi@gmail.com | 0544052717</p>
            </div>
          </div>
        </div>

        {/* Password Reset Modal Overlay */}
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100 relative"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Lock size={16} />
                  </div>
                  <h3 className="font-bold text-slate-200">Reset Password</h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="text-slate-500 hover:text-slate-300 transition text-sm font-bold border-0 bg-transparent cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {resetError && (
                <div className="p-3 bg-red-950/40 border border-red-900/40 rounded-xl text-red-400 text-xs">
                  {resetError}
                </div>
              )}

              {resetSuccess ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-950/40 border border-emerald-900/40 rounded-xl text-emerald-400 text-xs leading-relaxed font-sans">
                    {resetSuccess}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition text-xs cursor-pointer"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordResetSubmit} className="space-y-4 text-xs">
                  <p className="text-slate-400 leading-normal font-sans">
                    Enter your registered administrative email address below. We'll send you a password reset link automatically.
                  </p>
                  <div className="space-y-1 text-left">
                    <label className="block text-slate-400 font-semibold mb-1">User Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 text-slate-600" size={14} />
                      <input 
                        type="email"
                        required
                        placeholder="e.g. pegyirenyi@gmail.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2.5 justify-end pt-2 font-sans">
                    <button
                      type="button"
                      onClick={() => setIsResetModalOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                      {resetLoading ? "Sending Link..." : "Send Reset Link"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  // License Authorization & Renewal Check Gate (locks app if subscription expired/expiring)
  if (subscriptionStatus && subscriptionStatus.isLocked) {
    return (
      <SubscriptionLockModal 
        user={currentUser}
        onUnlocked={(updatedUser) => {
          setCurrentUser(updatedUser);
        }}
        onLogout={handleLogout}
      />
    );
  }

  // -------------------------
  // CORE DASHBOARD WORKSPACE
  // -------------------------
  return (
    <div className={`min-h-screen flex flex-col justify-between font-sans transition duration-300 theme-${activeTheme.toLowerCase().replace(/\s+/g, '-')} ${activeTheme === 'Sophisticated Dark' ? 'bg-[#020617] text-slate-200' : `${themeStyles.heroBg} bg-slate-100`}`}>
      
      {/* Toast banner overlay on active keyboard trigger capture */}
      <AnimatePresence>
        {printNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-indigo-600/95 backdrop-blur-md text-white font-sans text-xs px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-indigo-500/30 select-none no-print"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-amber-300 flex-shrink-0">
              <Sparkles size={12} className="animate-spin" />
            </div>
            <div>
              <p className="font-bold tracking-wide">Command Triggered: Print & Export Mode</p>
              <p className="text-[10px] text-indigo-200">{printNotification}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Institutional Board Header */}
      <header className={`bg-gradient-to-r ${themeStyles.gradientHeader} text-white shadow-md py-4 px-6 no-print`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center text-amber-300 overflow-hidden">
              {schoolInfo.logoUrl ? (
                <img src={schoolInfo.logoUrl} className="w-full h-full object-cover" alt="School logo" referrerPolicy="no-referrer" />
              ) : (
                <BookOpen size={22} className="animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-display font-black tracking-tight uppercase">{schoolInfo.name}</h1>
                <span className="bg-amber-400 text-slate-900 text-[9px] px-1.5 py-0.5 rounded font-black font-mono">EMIS: {schoolInfo.emisCode}</span>
              </div>
              <p className="text-[11px] opacity-80 italic font-serif">Motto: "{schoolInfo.motto}"</p>
            </div>
          </div>

          {/* Identity & Navigation Profile Control */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Real-time Connection & Sync Monitor */}
            <div className="flex items-center gap-2.5 bg-white/10 hover:bg-white/15 transition py-1.5 px-3 rounded-lg border border-white/10 text-white font-sans text-xs">
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-semibold">{isOnline ? 'Cloud Sync Online' : 'Offline Mode Active'}</span>
              </div>
              
              {pendingSyncCount > 0 && (
                <div className="flex items-center gap-2 border-l border-white/20 pl-2.5">
                  <span className="font-mono font-bold bg-amber-400 text-slate-950 text-[10px] px-2 py-0.5 rounded-full animate-bounce">
                    {pendingSyncCount} pending
                  </span>
                  {isOnline && (
                    <button
                      onClick={handleManualSync}
                      disabled={isSyncing}
                      className="bg-indigo-600 hover:bg-indigo-500 active:translate-y-0.5 text-white text-[9px] font-black px-2 py-0.5 rounded transition uppercase tracking-wider cursor-pointer disabled:opacity-50"
                    >
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="text-right">
              <span className="text-slate-200 block text-[10px] uppercase font-mono tracking-wider font-semibold">Logged-in User</span>
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <User size={13} className="text-amber-300" />
                {currentUser?.name} ({currentUser?.role})
              </span>
            </div>
            
            <button
              onClick={handleLogout}
              className="bg-white/10 hover:bg-white/20 active:translate-y-0.5 transition px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 cursor-pointer flex items-center gap-1 font-bold"
              title="Sign out of panel"
            >
              <LogOut size={13} /> Log out
            </button>
          </div>

        </div>
      </header>

      {/* Primary Workspace container */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-grow space-y-6">
        
        {/* DESIGN RIBBONS Navigation Buttons / Mobile Drawer (no-print) */}
        <nav id="module-tabs-ribbon" className="no-print">
          {/* Desktop version: horizontal button ribbon */}
          <div className="hidden md:flex bg-white border border-slate-200 p-2 rounded-xl shadow-xs flex-wrap gap-1 items-center w-full">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                refreshAllLogs();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'dashboard' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <TrendingUp size={15} /> Dashboard Summary
            </button>
            <button
              onClick={() => setActiveTab('school_profile')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'school_profile' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Landmark size={15} /> School Profile
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'calendar' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <CalendarDays size={15} /> Academic Calendar
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'students' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Users size={15} /> Student Profiles
            </button>
            <button
              onClick={() => setActiveTab('teachers')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'teachers' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <UserCheck size={15} /> Teacher Profiles
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'attendance' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <CalendarCheck size={15} /> Class Attendance Roster
            </button>
            <button
              onClick={() => {
                setActiveTab('assessments');
                refreshAllLogs();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'assessments' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <FileSpreadsheet size={15} /> Academic Assessments
            </button>
            <button
              onClick={() => {
                setActiveTab('fees');
                refreshAllLogs();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'fees' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Coins size={15} /> School Fees Ledger
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('paystack');
                  refreshAllLogs();
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'paystack' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <CreditCard size={15} /> Paystack Ledger
              </button>
            )}
            <button
              onClick={() => setActiveTab('communications')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'communications' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Smartphone size={15} /> Parent Messages
            </button>
            <button
              onClick={() => setActiveTab('emis')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'emis' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <ClipboardCheck size={15} /> GES EMIS Census
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'settings' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Settings size={15} /> System Controls
            </button>
          </div>

          {/* Mobile version: Hamburger triggers the drawer navigation list */}
          <div className="flex md:hidden bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${themeStyles.primaryBg} text-white`}>
                <CurrentActiveIcon size={16} />
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 font-bold block leading-none mb-0.5">Current Workspace</span>
                <span className="text-xs font-black text-slate-800 uppercase leading-none block">
                  {currentActiveTab.label}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-700 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <Menu size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Menu</span>
            </button>
          </div>

          {/* Slide-out Mobile Drawer */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                key="drawer-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 md:hidden"
              />
            )}
            {isMobileMenuOpen && (
              <motion.div
                key="drawer-sidebar"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-900 text-white shadow-2xl z-50 flex flex-col md:hidden border-r border-slate-800"
              >
                {/* Drawer Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="text-amber-400" size={24} />
                    <div>
                      <h2 className="text-sm font-black tracking-wider uppercase font-display">GTM Systems</h2>
                      <p className="text-[10px] text-slate-400 font-mono">School Portal</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Content - Module Links */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider font-mono font-bold text-slate-500 px-3 mb-2">
                    Portal Sections
                  </p>
                  {visibleTabs.map((tab) => {
                    const IconComponent = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          if (tab.refresh) {
                            refreshAllLogs();
                          }
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                          isActive 
                            ? 'bg-amber-400 text-slate-950 font-black shadow-lg' 
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <IconComponent size={18} className={isActive ? 'text-slate-950' : 'text-slate-400'} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Drawer Footer info */}
                <div className="p-5 border-t border-slate-800 bg-slate-950/40 space-y-3">
                  {currentUser && (
                    <div className="flex items-center gap-3 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-amber-400">
                        {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
                        <p className="text-[9px] text-slate-400 font-mono truncate">{currentUser.role}</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      DbController.logout();
                      setCurrentUser(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition cursor-pointer"
                  >
                    <LogOut size={14} /> Log Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Dynamic sub-tab workspace rendering */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'dashboard' && (
              <DashboardSummaryTab 
                theme={themeStyles} 
                students={students}
                onRefresh={refreshAllLogs}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'school_profile' && (
              <SchoolProfileTab 
                theme={themeStyles} 
                schoolInfo={schoolInfo} 
                onUpdate={setSchoolInfo}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(false)}
              />
            )}

            {activeTab === 'calendar' && (
              <AcademicCalendarTab 
                themeStyles={themeStyles} 
                onConfigChanged={() => {
                  const updatedUser = DbController.getCurrentUser();
                  setCurrentUser(updatedUser);
                  refreshAllLogs();
                }}
              />
            )}

            {activeTab === 'students' && (
              <StudentsTab 
                theme={themeStyles} 
                students={students} 
                onRefresh={refreshAllLogs}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(true)}
                selectedYear={selectedYear}
                setSelectedYear={handleYearChange}
                selectedTerm={selectedTerm}
                setSelectedTerm={handleTermChange}
              />
            )}

            {activeTab === 'teachers' && (
              <TeachersTab 
                theme={themeStyles} 
                teachers={teachers} 
                onRefresh={refreshAllLogs}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(true)}
              />
            )}

            {activeTab === 'attendance' && (
              <AttendanceTab 
                theme={themeStyles} 
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(false)}
              />
            )}

            {activeTab === 'assessments' && (
              <AssessmentTab 
                theme={themeStyles} 
                students={students}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(false)}
                selectedYear={selectedYear}
                setSelectedYear={handleYearChange}
                selectedTerm={selectedTerm}
                setSelectedTerm={handleTermChange}
              />
            )}

            {activeTab === 'fees' && (
              <SchoolFeesTab 
                theme={themeStyles} 
                students={students}
                schoolInfo={schoolInfo}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(true)}
                selectedAcademicYear={selectedYear}
                setSelectedAcademicYear={handleYearChange}
                selectedTerm={selectedTerm}
                setSelectedTerm={handleTermChange}
              />
            )}

            {activeTab === 'paystack' && isAdmin && (
              <PaystackManagementTab 
                themeStyles={themeStyles} 
              />
            )}

            {activeTab === 'communications' && (
              <CommunicationsTab 
                theme={themeStyles} 
                students={students} 
              />
            )}

            {activeTab === 'emis' && (
              <EmisTab 
                theme={themeStyles} 
              />
            )}

            {activeTab === 'settings' && (
              <SettingsTab 
                theme={themeStyles} 
                onThemeChange={setActiveTheme} 
                isAutoSave={isAutoSave}
                onAutoSaveToggle={setIsAutoSave}
                onRefresh={refreshAllLogs}
              />
            )}
          </motion.div>
        </AnimatePresence>

      </main>

      {/* Developer status footer */}
      <DeveloperStatus 
        isAutoSaveActive={isAutoSave} 
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={() => setHasUnsavedChanges(false)}
      />

    </div>
  );
}
