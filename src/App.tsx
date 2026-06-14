import { useState, useEffect, FormEvent } from 'react';
import { 
  SchoolInfo, Student, Teacher, UserAccount, UserRole, ThemeType 
} from './types';
import { DbController } from './db';
import { THEME_CONFIGS, ThemeStyles } from './components/ThemeWrapper';
import DeveloperStatus from './components/DeveloperStatus';
import SchoolProfileTab from './components/SchoolProfileTab';
import StudentsTab from './components/StudentsTab';
import TeachersTab from './components/TeachersTab';
import AttendanceTab from './components/AttendanceTab';
import AssessmentTab from './components/AssessmentTab';
import SettingsTab from './components/SettingsTab';
import SchoolFeesTab from './components/SchoolFeesTab';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Landmark, Users, UserCheck, CalendarCheck, FileSpreadsheet, Settings, 
  LogOut, ShieldAlert, Lock, Mail, User, BookOpen, GraduationCap, Sparkles, Coins 
} from 'lucide-react';

export default function App() {
  // Global Session Identity State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(DbController.getCurrentUser());
  
  // Database datasets loaded from DbController
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(DbController.getSchoolInfo());
  const [students, setStudents] = useState<Student[]>(DbController.getStudents());
  const [teachers, setTeachers] = useState<Teacher[]>(DbController.getTeachers());

  // Settings & Customization
  const [activeTheme, setActiveTheme] = useState<ThemeType>('Sophisticated Dark');
  const [isAutoSave, setIsAutoSave] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('school_profile');

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

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [printNotification, setPrintNotification] = useState<string | null>(null);

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
    setIsAutoSave(config.autoSave !== false);
  }, []);

  // Background-sync Firestore ledger data on boot if already authenticated
  useEffect(() => {
    if (currentUser && DbController.isFirebaseEnabled()) {
      DbController.syncAllDataFromFirebase().then(() => {
        refreshAllLogs();
      });
    }
  }, [currentUser]);

  const refreshAllLogs = () => {
    setSchoolInfo(DbController.getSchoolInfo());
    setStudents(DbController.getStudents());
    setTeachers(DbController.getTeachers());
    const config = DbController.getSystemSettings();
    setActiveTheme(config.theme || 'Sophisticated Dark');
    setIsAutoSave(config.autoSave !== false);
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
        await DbController.syncAllDataFromFirebase();
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
        await DbController.syncAllDataFromFirebase();
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
        await DbController.syncAllDataFromFirebase();
        refreshAllLogs();
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

  const handleConfirmGoogleRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!googleNewUser) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const finalizedUser = {
        ...googleNewUser,
        role: googleSelectedRole
      };
      const account = await DbController.saveGoogleProfile(finalizedUser);
      setCurrentUser(account);
      setGoogleNewUser(null);
      await DbController.syncAllDataFromFirebase();
      refreshAllLogs();
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

  // Secure Authorization Gate (Renders login panel if not authenticated)
  if (!currentUser) {
    return (
      <div className={`min-h-screen bg-slate-950 font-sans flex items-center justify-center p-4 relative overflow-hidden`}>
        {/* Abstract background gradient accent flares */}
        <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-indigo-900/10 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-violet-900/10 blur-3xl" />

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6 fade-in text-slate-100">
          
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-2">
              <GraduationCap size={28} />
            </div>
            <h1 className="text-lg font-display font-black tracking-tight uppercase text-amber-400">GEETECH COGNITIVE CENTER</h1>
            <p className="text-xs text-slate-400 font-mono">2-in-1 School Database & Assessment Center</p>
          </div>

          {authError && (
            <div className="p-3.5 bg-red-950/50 border border-red-900/60 rounded-xl text-red-400 text-xs leading-relaxed font-sans space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <ShieldAlert size={14} /> Authentication Notice
              </div>
              <div>{authError}</div>
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
                    Welcome! To provision your account credentials and initialize synchronization, please select your official administrative authority role:
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Select Access Role</label>
                  <select 
                    value={googleSelectedRole}
                    onChange={(e) => setGoogleSelectedRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer text-xs"
                  >
                    <option value="Headteacher">Headteacher Role Permissions</option>
                    <option value="Admin">System Administrator Permissions</option>
                  </select>
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
              <motion.form 
                key="login-form"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                onSubmit={handleLoginSubmit} 
                className="space-y-4 text-xs"
              >
                {!DbController.isFirebaseEnabled() && (
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Select Access Role</label>
                    <select 
                      value={loginRole}
                      onChange={(e) => setLoginRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-slate-600 font-semibold cursor-pointer"
                    >
                      <option value="Headteacher">Headteacher Access Mode</option>
                      <option value="Admin">System Administrator Mode</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Account Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 text-slate-600" size={15} />
                    <input 
                      type="email" 
                      required
                      placeholder="e.g. pegyirenyi@gmail.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                {DbController.isFirebaseEnabled() && (
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Secure Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 text-slate-600" size={15} />
                      <input 
                        type="password" 
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-[10px] leading-relaxed text-slate-400 mt-1 flex items-start gap-1.5 font-sans">
                  <span className="text-emerald-500 font-bold block select-none">🛡️</span>
                  <div>
                    <strong className="text-slate-200">Expert Secure Notice:</strong> Sign in using your verified credentials to synchronize. For maximum audit integrity and protection, the use of shared public demo accounts is restricted.
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button 
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold rounded-xl transition shadow-md cursor-pointer active:translate-y-0.5 disabled:opacity-50"
                  >
                    {authLoading ? "Initializing Environment..." : "Confirm Secure Login"}
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
                      Login from Google Account
                    </button>
                  )}
                </div>

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
              </motion.form>
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
                      onChange={(e) => setRegEmail(e.target.value)}
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

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Select Access Role</label>
                  <select 
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="Headteacher">Headteacher Role Permissions</option>
                    <option value="Admin">System Administrator Permissions</option>
                  </select>
                </div>

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

          <div className="pt-4 border-t border-slate-800 text-center font-mono text-[10px] text-slate-500 space-y-1">
            <p>EGYIRENYI PAUL | GEETECH MULTIMEDIA</p>
            <p>pegiyrenyi@gmail.com | 0544052717</p>
          </div>
        </div>
      </div>
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
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <span className="text-slate-200 block text-[10px] uppercase font-mono tracking-wider font-semibold">Logged-in User</span>
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <User size={13} className="text-amber-300" />
                {currentUser.name} ({currentUser.role})
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
        
        {/* DESIGN RIBBONS Navigation Buttons (no-print) */}
        <nav id="module-tabs-ribbon" className="bg-white border border-slate-200 p-2 rounded-xl shadow-xs flex flex-wrap gap-1 no-print">
          <button
            onClick={() => setActiveTab('school_profile')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'school_profile' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Landmark size={15} /> School Profile
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
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition text-xs cursor-pointer ${activeTab === 'settings' ? `${themeStyles.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Settings size={15} /> System Controls
          </button>
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
            {activeTab === 'school_profile' && (
              <SchoolProfileTab 
                theme={themeStyles} 
                schoolInfo={schoolInfo} 
                onUpdate={setSchoolInfo}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(false)}
              />
            )}

            {activeTab === 'students' && (
              <StudentsTab 
                theme={themeStyles} 
                students={students} 
                onRefresh={refreshAllLogs}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(true)}
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
              />
            )}

            {activeTab === 'fees' && (
              <SchoolFeesTab 
                theme={themeStyles} 
                students={students}
                schoolInfo={schoolInfo}
                isAutoSave={isAutoSave}
                onManualSave={() => setHasUnsavedChanges(true)}
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
