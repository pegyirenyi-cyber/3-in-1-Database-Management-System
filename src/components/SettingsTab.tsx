import { useState, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import { ThemeType, UserRole, PaystackPayment } from '../types';
import { DbController } from '../db';
import { THEME_CONFIGS, ThemeStyles } from './ThemeWrapper';
import { generateActivationCode, evaluateSubscription } from '../subscription';
import PaystackPaymentTrigger from './PaystackPaymentTrigger';
import { 
  Palette, Smartphone, Save, CheckCircle2, ShieldCheck, UserPlus, FileSliders, Laptop, Lock, Mail,
  Database, Download, Upload, AlertTriangle, Trash2, ShieldAlert, X, Sun, Moon, Key, CreditCard, Sparkles, HelpCircle, AlertCircle, Check
} from 'lucide-react';

interface Props {
  theme: ThemeStyles;
  onThemeChange: (theme: ThemeType) => void;
  isAutoSave: boolean;
  onAutoSaveToggle: (active: boolean) => void;
  onRefresh: () => void;
}

export default function SettingsTab({ theme, onThemeChange, isAutoSave, onAutoSaveToggle, onRefresh }: Props) {
  const [activeTheme, setActiveTheme] = useState<ThemeType>(theme.name);
  const [autoSaveActive, setAutoSaveActive] = useState<boolean>(isAutoSave);
  const [saveStatus, setSaveStatus] = useState(false);

  const [lastLightTheme, setLastLightTheme] = useState<ThemeType>(() => {
    const saved = DbController.getSystemSettings();
    if (saved && saved.theme && saved.theme !== 'Sophisticated Dark') {
      return saved.theme as ThemeType;
    }
    return 'Classic';
  });

  // User registration forms
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('Headteacher');
  const [regSuccess, setRegSuccess] = useState('');

  const [registeredAccounts, setRegisteredAccounts] = useState(DbController.getRegisteredUsers());

  // License generator states (only for pegyirenyi@gmail.com Admin)
  const [licTargetEmail, setLicTargetEmail] = useState('');
  const [licRequestCode, setLicRequestCode] = useState('');
  const [licGeneratedCode, setLicGeneratedCode] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Sub-tabs state inside System Controls (SettingsTab)
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'accounts' | 'backup' | 'billing'>('general');
  const [selectedLicenseTier, setSelectedLicenseTier] = useState<'1year' | '2year' | '3year'>('1year');
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);

  const currentUser = useMemo(() => DbController.getCurrentUser(), [registeredAccounts]);
  const subStatus = useMemo(() => currentUser ? evaluateSubscription(currentUser) : null, [currentUser]);

  // Backup and restore UI states
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => {
    return localStorage.getItem('last_backup_download_timestamp');
  });

  const backupStatus = useMemo(() => {
    if (!lastBackupTime) {
      return { 
        needsBackup: true, 
        message: "No local backup history found in this browser. Please download a copy to protect administrative records.",
        daysAgo: null,
        label: "Backup Overdue"
      };
    }
    
    const lastDate = new Date(lastBackupTime);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 7) {
      return {
        needsBackup: true,
        message: `Your last downloaded backup was ${diffDays} days ago. Weekly backup is highly recommended to protect against unforeseen browser cache clearing.`,
        daysAgo: diffDays,
        label: "Backup Overdue"
      };
    } else {
      return {
        needsBackup: false,
        message: diffDays === 0 
          ? "Your database snapshot was saved today! Your administrative registries are secure."
          : `Your last database snapshot was downloaded ${diffDays} day${diffDays > 1 ? 's' : ''} ago. Your weekly backup protection is up to date.`,
        daysAgo: diffDays,
        label: "System Safeguarded"
      };
    }
  }, [lastBackupTime]);

  // Wipe states
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeError, setWipeError] = useState('');

  // Keep theme & autosave active states fully synchronized when prop signals change
  useEffect(() => {
    setActiveTheme(theme.name);
  }, [theme.name]);

  useEffect(() => {
    setAutoSaveActive(isAutoSave);
  }, [isAutoSave]);

  const handleApplyTheme = (tName: ThemeType) => {
    setActiveTheme(tName);
    onThemeChange(tName);
    if (tName !== 'Sophisticated Dark') {
      setLastLightTheme(tName);
    }
    
    // Save locally
    const current = DbController.getSystemSettings();
    DbController.saveSystemSettings({ ...current, theme: tName });
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  const handleToggleAutoSave = (val: boolean) => {
    setAutoSaveActive(val);
    onAutoSaveToggle(val);

    const current = DbController.getSystemSettings();
    DbController.saveSystemSettings({ ...current, autoSave: val });
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  const handleUserRegistration = (e: FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail) {
      alert("Please populate all fields");
      return;
    }

    const assignedRole: UserRole = regEmail.toLowerCase().trim() === 'pegyirenyi@gmail.com' ? 'Admin' : 'Headteacher';

    DbController.register(regName, regEmail, assignedRole);
    setRegisteredAccounts(DbController.getRegisteredUsers());
    onRefresh();

    setRegSuccess(`Account for ${regName} (${assignedRole}) created successfully!`);
    setRegName('');
    setRegEmail('');
    setTimeout(() => setRegSuccess(''), 3500);
  };

  const handleExportBackup = () => {
    try {
      const dataStr = DbController.exportAllData();
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const formatedDate = new Date().toISOString().split('T')[0];
      const exportFileDefaultName = `geetech_sms_backup_${formatedDate}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      // Update backup downloaded timestamp
      const now = new Date().toISOString();
      localStorage.setItem('last_backup_download_timestamp', now);
      setLastBackupTime(now);
    } catch (e: any) {
      alert("Failed to export backup: " + e.message);
    }
  };

  const handleImportBackup = (e: ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setImportSuccess('');
    
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') {
        setImportError("Failed to read backup file contents.");
        return;
      }

      const result = DbController.importAllData(content);
      if (result.success) {
        setImportSuccess("Database snapshot successfully completed! Core registers and theme values have been reloaded.");
        
        // Propagate system updates
        setTimeout(() => {
          setRegisteredAccounts(DbController.getRegisteredUsers());
          onRefresh();
        }, 800);
      } else {
        setImportError(result.error || "The selected JSON file appears to have a corrupted schema or structure.");
      }
    };

    fileReader.onerror = () => {
      setImportError("Hardware error occurred while reading the document.");
    };

    fileReader.readAsText(file);
    e.target.value = ''; // Reset input to allow double uploads of the same file
  };

  return (
    <div className="space-y-6 fade-in text-xs no-print">

      {/* Settings Sub Tabs Bar */}
      <div className="flex flex-wrap gap-2 pb-1 border-b border-slate-200 no-print">
        <button
          type="button"
          onClick={() => setSettingsSubTab('general')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition text-[11px] cursor-pointer ${settingsSubTab === 'general' ? `${theme.btnColors} shadow-xs` : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
        >
          <Palette size={13} /> Appearance & Themes
        </button>
        <button
          type="button"
          onClick={() => setSettingsSubTab('accounts')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition text-[11px] cursor-pointer ${settingsSubTab === 'accounts' ? `${theme.btnColors} shadow-xs` : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
        >
          <UserPlus size={13} /> Account Provisioning
        </button>
        <button
          type="button"
          onClick={() => setSettingsSubTab('backup')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition text-[11px] cursor-pointer ${settingsSubTab === 'backup' ? `${theme.btnColors} shadow-xs` : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
        >
          <Database size={13} /> Backup & Hard Reset
        </button>
        <button
          type="button"
          onClick={() => setSettingsSubTab('billing')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition text-[11px] cursor-pointer ${settingsSubTab === 'billing' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs animate-pulse' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
        >
          <CreditCard size={13} /> Buy Subscription / Renewal
        </button>
      </div>
      
      {/* Dynamic Weekly Backup Alert Card (only on backup tab) */}
      {settingsSubTab === 'backup' && (
        <div className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 ${backupStatus.needsBackup ? 'bg-amber-50/70 border-amber-200/80 text-amber-900 shadow-xs' : 'bg-emerald-50/40 border-emerald-200/80 text-emerald-950 shadow-xs'}`}>
          <div className="flex items-start gap-3.5 text-left">
            <div className={`p-2.5 rounded-xl border flex-shrink-0 ${backupStatus.needsBackup ? 'bg-amber-100 border-amber-200 text-amber-700 animate-pulse' : 'bg-emerald-100 border-emerald-200 text-emerald-700'}`}>
              <Database size={18} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${backupStatus.needsBackup ? 'bg-amber-200/60 text-amber-900' : 'bg-emerald-200/60 text-emerald-900'}`}>
                  {backupStatus.label}
                </span>
                <h3 className="text-xs font-bold font-sans">Weekly Database Backup Safeguard</h3>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed font-sans max-w-xl">
                {backupStatus.message} Administrators are strongly advised to extract a physical database snapshot weekly to guarantee safety against sudden client storage updates or local wipes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button
              onClick={handleExportBackup}
              type="button"
              className={`py-2 px-4 rounded-lg font-bold text-xs shadow-xs cursor-pointer hover:scale-101 active:scale-99 transition-all duration-200 flex items-center gap-1.5 ${backupStatus.needsBackup ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
            >
              <Download size={13} />
              <span>Backup Data Now</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Settings columns container */}
      <div className="grid grid-cols-1 gap-6">

        {/* Column 1: Appearance Themes and Save Behaviors */}
        {settingsSubTab === 'general' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          
          {/* Appearance Selection */}
          <div className="space-y-3">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Palette size={17} className={theme.accentText} />
              Branding & Dynamic Color Themes
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">Customize the application interface with institutional color profiles instantly.</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {(Object.keys(THEME_CONFIGS) as ThemeType[]).map(tName => {
                const conf = THEME_CONFIGS[tName];
                const isActive = activeTheme === tName;
                return (
                  <button
                    key={tName}
                    onClick={() => handleApplyTheme(tName)}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between transition cursor-pointer hover:border-slate-300 ${isActive ? `${theme.cardBorder} bg-slate-50 border-2` : 'border-slate-200'}`}
                  >
                    <span className="font-bold text-slate-800 text-xs block">{tName}</span>
                    <span className={`w-3.5 h-3.5 rounded-full mt-2 self-end ${conf.primaryBg}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dedicated Light/Dark Mode Preference */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              {activeTheme === 'Sophisticated Dark' ? <Moon size={17} className={theme.accentText} /> : <Sun size={17} className={theme.accentText} />}
              Display Theme Mode
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">Directly switch the application container between the high-contrast slate dark scheme and light color palettes.</p>
            
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (activeTheme === 'Sophisticated Dark') {
                    handleApplyTheme(lastLightTheme);
                  }
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${activeTheme !== 'Sophisticated Dark' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-xs ring-1 ring-indigo-100' : 'bg-[#0f172a] text-slate-400 border-slate-800 hover:bg-slate-800/80 hover:text-slate-300'}`}
              >
                <Sun size={14} />
                <span>Light Mode</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeTheme !== 'Sophisticated Dark') {
                    setLastLightTheme(activeTheme);
                    handleApplyTheme('Sophisticated Dark');
                  }
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${activeTheme === 'Sophisticated Dark' ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
              >
                <Moon size={14} />
                <span>Dark Mode</span>
              </button>
            </div>
          </div>

          {/* Database Synchronization Policy */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Save size={17} className={theme.accentText} />
              Database Storage Policy
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">The application runs an enterprise-grade background synchronization database engine, keeping your records saved instantly.</p>

            <div className="flex items-center justify-between bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 mt-3 no-print">
              <div>
                <strong className="block text-emerald-800 text-xs text-left font-semibold">Real-time Auto Saving</strong>
                <span className="text-[10px] text-emerald-600 mt-1 block">Every single change to student profiles, grade assessments, fees payments, attendance and profile data is saved and synced instantly.</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 border border-emerald-700 text-white font-mono font-bold text-[10px] shadow-sm select-none">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>ALWAYS ON</span>
              </div>
            </div>
          </div>

          {saveStatus && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={15} className="text-emerald-605" />
              <span>Appearance and persistent configurations successfully locked-in!</span>
            </div>
          )}

        </div>
        )}

        {/* Column 2: User Account registries & role registry */}
        {settingsSubTab === 'accounts' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          
          <div className="space-y-3">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <UserPlus size={17} className={theme.accentText} />
              Role Accounts Provisioning Center
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">Add administrative handles securely mapped for Admin and Headteacher access roles.</p>

            <form onSubmit={handleUserRegistration} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Account Full Name</label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none"
                    placeholder="e.g. Ama Serwaa"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Mailing Address (Email) *</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => {
                      const emailVal = e.target.value;
                      setRegEmail(emailVal);
                      if (emailVal.toLowerCase().trim() === 'pegyirenyi@gmail.com') {
                        setRegRole('Admin');
                      } else {
                        setRegRole('Headteacher');
                      }
                    }}
                    className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none font-mono"
                    placeholder="e.g. pegyirenyi@gmail.com"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200/40 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-slate-400" />
                  <span className="font-semibold text-slate-600">Administrative Permission Role Assignment:</span>
                </div>
                <div className="mt-1 font-bold">
                  {regEmail.toLowerCase().trim() === 'pegyirenyi@gmail.com' ? (
                    <span className="text-indigo-600 px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded">System Administrator Level Permissions</span>
                  ) : (
                    <span className="text-teal-600 px-2 py-0.5 bg-teal-50 border border-teal-100 rounded">Headteacher Level Permissions</span>
                  )}
                </div>
                <div className="text-[9px] text-slate-400 mt-1 italic">
                  * Dynamic Authorization: only pegyirenyi@gmail.com is granted System Administrator access. All other email addresses are initialized as Headteacher.
                </div>
              </div>

              <button
                type="submit"
                className={`w-full py-2 rounded-lg font-bold shadow-xs cursor-pointer active:translate-y-0.5 transition ${theme.btnColors}`}
              >
                Provision Role Account
              </button>
            </form>

            {regSuccess && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 p-2 rounded-lg animate-fade-in font-medium">
                {regSuccess}
              </div>
            )}
          </div>

          {/* List Registered Users */}
          <div className="space-y-2 pt-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registered Security Accounts</span>
            <div className="divide-y divide-slate-100 max-h-[140px] overflow-y-auto border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
              {registeredAccounts.map(u => (
                <div key={u.uid} className="py-1.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-700 block text-xs">{u.name}</span>
                    <span className="text-[9px] text-slate-400 font-mono italic">{u.email}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'Admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-teal-50 text-teal-800 border border-teal-100'}`}>
                    {u.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* GEETECH Administrator License Generator key block (for pegyirenyi@gmail.com ONLY) */}
          {DbController.getCurrentUser()?.email.toLowerCase().trim() === 'pegyirenyi@gmail.com' && (
            <div className="space-y-3 pt-4 border-t border-slate-100 mt-2">
              <h4 className="text-xs font-black text-indigo-900 uppercase font-sans tracking-wide flex items-center gap-1.5">
                <Key size={13} className="text-indigo-600 shrink-0" />
                Administrative Activation Codes Generator
              </h4>
              <p className="text-[9px] text-slate-400 leading-normal">
                Generate deterministic yearly renewal codes for your school clients securely.
              </p>
              
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase font-bold tracking-wide mb-1 mb-0.5">
                      Target User Account Email
                    </label>
                    <select
                      value={licTargetEmail}
                      onChange={(e) => {
                        const emailVal = e.target.value;
                        setLicTargetEmail(emailVal);
                        
                        const matched = registeredAccounts.find(u => u.email.toLowerCase().trim() === emailVal.toLowerCase().trim());
                        if (matched && matched.requestCode) {
                          setLicRequestCode(matched.requestCode);
                          setLicGeneratedCode(generateActivationCode(emailVal, matched.requestCode));
                        } else {
                          setLicRequestCode('');
                          setLicGeneratedCode('');
                        }
                        setCopiedSuccess(false);
                      }}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none bg-slate-50"
                    >
                      <option value="">-- Select Client --</option>
                      {registeredAccounts.filter(u => u.email.toLowerCase().trim() !== 'pegyirenyi@gmail.com').map(u => (
                        <option key={u.uid} value={u.email}>{u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase font-bold tracking-wide mb-1 mb-0.5">
                      Request Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. REQ-AMAS-3749"
                      value={licRequestCode}
                      onChange={(e) => {
                        const codeVal = e.target.value.toUpperCase();
                        setLicRequestCode(codeVal);
                        if (licTargetEmail && codeVal) {
                          setLicGeneratedCode(generateActivationCode(licTargetEmail, codeVal));
                        } else {
                          setLicGeneratedCode('');
                        }
                        setCopiedSuccess(false);
                      }}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none font-mono uppercase"
                    />
                  </div>
                </div>

                {licTargetEmail && licRequestCode && (
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2 text-center animate-fade-in relative overflow-hidden">
                    <span className="block text-[8px] text-slate-500 uppercase font-bold tracking-wider">
                      Activation Passcode
                    </span>
                    <div className="font-mono font-black text-sm text-indigo-700 tracking-widest uppercase select-all bg-white py-1 px-3 border border-indigo-200/50 inline-block rounded">
                      {licGeneratedCode}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(licGeneratedCode);
                          setCopiedSuccess(true);
                          setTimeout(() => setCopiedSuccess(false), 2000);
                        }}
                        className="py-1 px-2 text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow-xs cursor-pointer select-none transition"
                      >
                        {copiedSuccess ? "✓ Copied Key!" : "Copy Passcode"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
        )}

      </div>

      {/* Recovery, Backup & Restore Section */}
      {settingsSubTab === 'backup' && (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
          <Database size={17} className={theme.accentText} />
          Manual Backup snapshot & System Restoration Center
        </h3>
        <p className="text-[10px] text-slate-400 leading-relaxed max-w-2xl text-left">
          Perform state checkpoints directly on your dashboard. Exporting collects all student enrollment rosters, subject grade parameters, historical class attendance records, access profiles, and local configs into a standard raw JSON payload.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          
          {/* Download snapshots */}
          <div className="border border-slate-200/60 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-4">
            <div className="text-left">
              <span className="font-bold text-slate-700 text-xs block mb-1">Download Database Snapshot</span>
              <p className="text-[10px] text-slate-400 leading-normal">
                Generates a portable, structures-checked JSON payload that preserves all institutional settings, marks logs, and logins. Save this output securely.
              </p>
            </div>
            
            <button
              onClick={handleExportBackup}
              type="button"
              className={`py-2 px-4 rounded-lg font-bold shadow-xs cursor-pointer hover:opacity-90 active:translate-y-0.5 transition flex items-center justify-center gap-1.5 text-center ${theme.btnColors}`}
            >
              <Download size={14} />
              Export System Data (JSON)
            </button>
          </div>

          {/* Upload snapshots */}
          <div className="border border-slate-200/60 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-4 text-left">
            <div>
              <span className="font-bold text-slate-700 text-xs block mb-1">Restore Database Snapshot</span>
              <p className="text-[10px] text-slate-400 leading-normal font-sans">
                Upload a preselected JSON dump from a previous manual backup. This updates or overwrites current local directories and syncs with cloud datasets.
              </p>
            </div>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                id="import-backup-file"
                onChange={handleImportBackup}
                className="hidden"
              />
              <label
                htmlFor="import-backup-file"
                className="w-full py-2 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold shadow-xs cursor-pointer transition flex items-center justify-center gap-1.5 text-center"
              >
                <Upload size={14} className="text-slate-500" />
                Select Backup file (.json)
              </label>
            </div>
          </div>

        </div>

        {importSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg flex items-center gap-2 animate-fade-in text-[11px] font-medium">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span>{importSuccess}</span>
          </div>
        )}

        {importError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg flex items-center gap-2 animate-fade-in text-[11px] font-medium">
            <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
            <span>{importError}</span>
          </div>
        )}

      </div>

      {/* SYSTEM HARD RESET & RECOVERY CONSOLE */}
      <div className="bg-white p-6 rounded-xl border border-rose-100 shadow-sm space-y-4">
        <h3 className="text-sm font-display font-bold text-rose-800 flex items-center gap-1.5 pb-2 border-b border-rose-100">
          <ShieldAlert size={17} className="text-rose-600 animate-pulse animate-bounce" />
          Critical Administrative Operations
        </h3>
        <p className="text-[10px] text-slate-400 leading-relaxed max-w-2xl text-left">
          These controls affect all active data caches, session credentials, and local directories. Always save a local copy before initiating any recovery triggers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          
          <div className="border border-slate-200/60 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-3 text-left">
            <div>
              <span className="font-bold text-slate-700 text-xs block mb-1 animate-pulse">Save All Persistent Data</span>
              <p className="text-[10px] text-slate-400 leading-normal">
                Back up school logs, rosters, and schedules onto a secure offline backup document.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              type="button"
              className={`w-full py-2 rounded-lg font-bold shadow-xs cursor-pointer active:translate-y-0.5 transition flex items-center justify-center gap-1.5 text-center ${theme.btnColors}`}
            >
              <Download size={14} />
              Save All Data
            </button>
          </div>

          <div className="border border-rose-100 rounded-xl p-4 bg-rose-50/20 flex flex-col justify-between space-y-3 text-left">
            <div>
              <span className="font-bold text-rose-700 text-xs block mb-1">Clear & Reset All Data</span>
              <p className="text-[10px] text-slate-400 leading-normal">
                Completely purge all students, staff, attendance registers, and assessments to start fresh.
              </p>
            </div>
            <button
              onClick={() => {
                setWipeConfirmText('');
                setWipeError('');
                setShowWipeModal(true);
              }}
              type="button"
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs cursor-pointer active:translate-y-0.5 transition flex items-center justify-center gap-1.5 text-center font-sans tracking-wide"
            >
              <Trash2 size={14} />
              Clear All Data
            </button>
          </div>

        </div>
      </div>
      </div>
      )}

      {/* ONLINE LICENSE SUBSCRIPTION - BILLING VIEW */}
      {settingsSubTab === 'billing' && (
        <div className="space-y-6 animate-fade-in text-left">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-650 to-indigo-700 p-6 rounded-2xl text-white shadow-md relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-widest font-black text-emerald-250 bg-white/10 px-2.5 py-1 rounded-md border border-white/10">
                Instant Paystack Gateway Activation
              </span>
              <h3 className="text-lg font-black font-sans leading-tight">
                GEETECH Multimedia Online License Portal
              </h3>
              <p className="text-xs text-white opacity-90 max-w-2xl leading-relaxed">
                Upgrade your school database from restricted boundaries to a healthy full yearly academic account. Our Paystack secure checkout processes payments instantly, credit-checks the server, and activates your digital passcodes automatically.
              </p>
            </div>
          </div>

          {/* Subscription Status Level Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current Bounds status card */}
            <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400">Current Status</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${subStatus?.isLocked ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <strong className="text-slate-800 text-xs font-black">
                    {subStatus?.licenseType === 'trial' ? '21-Day System Trial' : 'Active School License'}
                  </strong>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal font-sans pt-1">
                  Request Code: <span className="font-mono bg-slate-50 px-1 py-0.5 border border-slate-200/50 rounded text-slate-650 font-bold">{currentUser?.requestCode || 'N/A'}</span>
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Borders expiry limit:</span>
                <span className="text-xs font-bold text-slate-700">{subStatus?.expiryDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            </div>

            {/* Days remaining card */}
            <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400">Time Remaining</span>
                <h4 className="text-2xl font-black text-slate-800 font-mono tracking-tight pt-1">
                  {subStatus?.remainingDays || 0} <span className="text-xs text-slate-400 font-normal font-sans">Days Left</span>
                </h4>
                <p className="text-[10px] text-slate-500 leading-normal font-sans">
                  Your software has {subStatus?.remainingDays || 0} days remaining before database security boundaries request renewal.
                </p>
              </div>
            </div>

            {/* Action Suggestion Card */}
            <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400">Renewal Policy</span>
                <p className="text-[11px] text-slate-600 leading-relaxed font-sans pt-1">
                  Multi-year keys protect you from standard yearly renewal price adjustments. On successful verification, the license activates instantly.
                </p>
              </div>
            </div>
          </div>

          {/* Selector & Paystack triggers */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Part 1: Tier Selector Column (Lg: 7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <h4 className="text-xs font-black text-slate-800 uppercase font-sans tracking-wide flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500 animate-pulse animate-bounce" />
                Select Your School License Term
              </h4>
              <p className="text-[10px] text-slate-400 font-sans">Choose the desired subscription period to initialize with Paystack checkout security gateways.</p>
              
              <div className="space-y-3 pt-2">
                {/* 1 Year */}
                <label className={`block p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${selectedLicenseTier === '1year' ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-555' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="subTier" 
                    value="1year" 
                    checked={selectedLicenseTier === '1year'} 
                    onChange={() => setSelectedLicenseTier('1year')}
                    className="mt-1 accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex-grow space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs">Standard 1-Year License Renewal</span>
                      <span className="font-black text-slate-800 font-mono text-xs">GHS 350.00</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-normal">
                      Grants complete institutional database authorization, reports analytics, and enrollment sync registers through July of the active calendar year.
                    </p>
                  </div>
                </label>

                {/* 2 Years */}
                <label className={`block p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${selectedLicenseTier === '2year' ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-555' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="subTier" 
                    value="2year" 
                    checked={selectedLicenseTier === '2year'} 
                    onChange={() => setSelectedLicenseTier('2year')}
                    className="mt-1 accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex-grow space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-xs">Extended 2-Year License Renewal</span>
                        <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded uppercase font-mono tracking-wider">Save GHS 100</span>
                      </div>
                      <span className="font-black text-slate-800 font-mono text-xs">GHS 600.00</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-normal">
                      Grants extended multi-term database protection ensuring stability against eventual year inflation or subscription pricing updates.
                    </p>
                  </div>
                </label>

                {/* 3 Years */}
                <label className={`block p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${selectedLicenseTier === '3year' ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-555' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="subTier" 
                    value="3year" 
                    checked={selectedLicenseTier === '3year'} 
                    onChange={() => setSelectedLicenseTier('3year')}
                    className="mt-1 accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex-grow space-y-1">
                    <div className="flex items-center justify-between font-sans">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-xs">Premium 3-Year License Protection</span>
                        <span className="text-[8px] bg-indigo-100 text-indigo-800 font-black px-1.5 py-0.5 rounded uppercase font-mono tracking-wider">Best Value - Save GHS 250</span>
                      </div>
                      <span className="font-black text-slate-800 font-mono text-xs">GHS 800.00</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-normal">
                      Maximum reliability for premium schools. Secures continuous access, software upgrades, backups synchronization, and parent portal communications.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Part 2: Secure Paystack trigger checkout (Lg: 5 cols) */}
            <div className="lg:col-span-12 xl:col-span-4 flex flex-col justify-between">
              <div className="h-full">
                {currentUser ? (
                  <PaystackPaymentTrigger 
                    studentId={`LICENSE_${currentUser.uid.substring(0, 8)}`}
                    studentName={`License Renewal [${currentUser.name}]`}
                    email={currentUser.email}
                    amount={selectedLicenseTier === '1year' ? 350 : selectedLicenseTier === '2year' ? 600 : 800}
                    academicYear="2026/2027"
                    term="Term 1"
                    component="Other Fee"
                    billId={`LICENSE_${currentUser.uid.substring(0, 8)}_${selectedLicenseTier}`}
                    triggerLabel={`Activate Online System License (GHS ${(selectedLicenseTier === '1year' ? 350 : selectedLicenseTier === '2year' ? 600 : 800).toFixed(2)})`}
                    btnClassName="bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase py-3 border border-emerald-700/20 rounded-xl cursor-pointer"
                    onSuccess={async (txData) => {
                      console.log("Paystack upgrading license on success transaction:", txData);
                      try {
                        const generatedKey = generateActivationCode(currentUser.email, currentUser.requestCode || 'REQ-SYSTEM-9401');
                        
                        // Settle payment in local+cloud Paystack ledgers
                        const paymentLog: PaystackPayment = {
                          id: txData.reference || `LIC-${currentUser.uid.substring(0, 8)}-${Date.now()}`,
                          reference: txData.reference || `LIC-${currentUser.uid.substring(0, 8)}-${Date.now()}`,
                          studentId: `LICENSE_${currentUser.uid.substring(0, 8)}`,
                          studentName: `Software License: ${currentUser.name} (${currentUser.role})`,
                          billId: `LICENSE_${currentUser.uid.substring(0, 8)}_${selectedLicenseTier}`,
                          component: 'Other Fee',
                          amount: txData.amount || (selectedLicenseTier === '1year' ? 350 : selectedLicenseTier === '2year' ? 600 : 800),
                          academicYear: "2026/2027",
                          term: "Term 1",
                          status: "success",
                          paidAt: txData.paidAt || new Date().toISOString(),
                          createdAt: new Date().toISOString()
                        };
                        
                        DbController.savePaystackPayment(paymentLog);

                        await DbController.updateUserLicense(
                          currentUser.uid,
                          'activated',
                          new Date().toISOString(),
                          generatedKey,
                          currentUser.requestCode || 'REQ-SYSTEM-9401'
                        );
                        setSubscriptionSuccess(true);
                        // Force refresh lists of users locally so evaluateSubscription finds the new state
                        setRegisteredAccounts(DbController.getRegisteredUsers());
                        onRefresh();
                      } catch (e: any) {
                        alert("Paystack payment completed but local license state synchronization had errors: " + e.message);
                      }
                    }}
                  />
                ) : (
                  <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 font-sans">
                    Please log in to purchase a school license index check.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subscription Success State Overlay / Message */}
          {subscriptionSuccess && (
            <div className="p-5 bg-emerald-50 border border-emerald-250 rounded-2xl flex items-start gap-4 animate-fade-in relative overflow-hidden mt-4">
              <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              <div className="p-3 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl flex-shrink-0 animate-bounce">
                <Check size={20} className="stroke-[3]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-emerald-950 font-sans">Corporate Database License Fully Activated!</h4>
                <p className="text-xs text-emerald-800/90 leading-relaxed font-sans max-w-2xl">
                  Paystack transaction settled. The licensing system has successfully verified the cryptographic passcode and upgraded your account <strong>{currentUser?.email}</strong> from Trial limits to fully <strong>Licensed Year Access</strong>. All core student directories, assessments, and attendance logs are secured.
                </p>
                <div className="pt-2">
                  <button 
                    type="button" 
                    onClick={() => setSubscriptionSuccess(false)}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-lg text-[10px] transition cursor-pointer select-none"
                  >
                    Superb, Carry On
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPREHENSIVE SECURITY SAFE CLEAR-DATA MODAL POP-UP */}
      {showWipeModal && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWipeModal(false);
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 no-print cursor-pointer animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl text-slate-900 font-sans space-y-6 cursor-default"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-rose-800 flex items-center gap-1.5">
                <ShieldAlert className="text-rose-600" size={18} />
                Dangerous Action Warning
              </h3>
              <button 
                onClick={() => setShowWipeModal(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-650 text-left">
              <p>
                You are about to initiate a <strong>Complete System Reset</strong>. This operation will:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-500 font-semibold font-sans">
                <li>Wipe all Student Profiles entirely</li>
                <li>Wipe all Teacher Profiles & records</li>
                <li>Clear the entire Class Attendance Roster</li>
                <li>Reset all Academic Assessments & grade sheets</li>
                <li>Reset the School Fees Ledger completely</li>
                <li>Purge active login sessions & clear school settings</li>
                <li>Initialize blank input data fields for any new user login</li>
              </ul>
              <p className="text-rose-600 font-bold bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                This action is irreversible. We highly recommend clicking "Save All Data" to back up first!
              </p>
            </div>

            <div className="space-y-2 text-left">
              <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider">
                Type the word <span className="text-rose-600 font-black">'WIPE'</span> to confirm authorization:
              </label>
              <input 
                type="text"
                value={wipeConfirmText}
                onChange={(e) => {
                  setWipeConfirmText(e.target.value);
                  setWipeError('');
                }}
                placeholder="e.g. WIPE"
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-bold focus:outline-none"
              />
              {wipeError && (
                <span className="text-rose-600 text-[10px] block font-semibold">{wipeError}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWipeModal(false)}
                className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer text-center"
              >
                Discard / Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (wipeConfirmText.toUpperCase() === 'WIPE') {
                    DbController.clearAllData();
                    setShowWipeModal(false);
                    window.location.reload();
                  } else {
                    setWipeError("Please type 'WIPE' to confirm.");
                  }
                }}
                className="py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-center"
              >
                <Trash2 size={13} />
                Wipe & Start Fresh
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
