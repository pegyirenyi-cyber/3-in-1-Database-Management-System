import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { ThemeType, UserRole } from '../types';
import { DbController } from '../db';
import { THEME_CONFIGS, ThemeStyles } from './ThemeWrapper';
import { 
  Palette, Smartphone, Save, CheckCircle2, ShieldCheck, UserPlus, FileSliders, Laptop, Lock, Mail,
  Database, Download, Upload, AlertTriangle, Trash2, ShieldAlert, X
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

  // User registration forms
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('Headteacher');
  const [regSuccess, setRegSuccess] = useState('');

  const [registeredAccounts, setRegisteredAccounts] = useState(DbController.getRegisteredUsers());

  // Backup and restore UI states
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

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

    DbController.register(regName, regEmail, regRole);
    setRegisteredAccounts(DbController.getRegisteredUsers());
    onRefresh();

    setRegSuccess(`Account for ${regName} (${regRole}) created successfully!`);
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
      
      {/* 2 Grid Partition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Column 1: Appearance Themes and Save Behaviors */}
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

          {/* Database Synchronization Policy */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Save size={17} className={theme.accentText} />
              Database Storage Policy
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">Toggle real-time persistence. Auto-save triggers on any cell change; manual save requires explicit saves before session expirations.</p>

            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200/60 mt-3">
              <div>
                <strong className="block text-slate-700 text-xs text-left">Real-time Auto Saving</strong>
                <span className="text-[10px] text-slate-400 mt-1 block">Saves gradesheets and student profiles instantly on updates.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAutoSave(true)}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-xs cursor-pointer transition ${autoSaveActive ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs' : 'bg-white text-slate-600'}`}
                >
                  Enabled (Auto)
                </button>
                <button
                  onClick={() => handleToggleAutoSave(false)}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-xs cursor-pointer transition ${!autoSaveActive ? 'bg-amber-600 border-amber-700 text-white shadow-xs' : 'bg-white text-slate-600'}`}
                >
                  Disabled
                </button>
              </div>
            </div>
          </div>

          {saveStatus && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>Appearance and persistent configurations successfully locked-in!</span>
            </div>
          )}

        </div>

        {/* Column 2: User Account registries & role registry */}
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
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none"
                    placeholder="e.g. head_ama@ges.edu"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 bg-slate-50 p-2 rounded-lg border border-slate-200/40">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-slate-400" />
                  <span>Assign System Permissions:</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRegRole('Admin')}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition ${regRole === 'Admin' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                  >
                    Admin Role
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegRole('Headteacher')}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition ${regRole === 'Headteacher' ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                  >
                    Headteacher Role
                  </button>
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

        </div>

      </div>

      {/* Recovery, Backup & Restore Section */}
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
              <ul className="list-disc pl-4 space-y-1 text-slate-500 font-semibold">
                <li>Purge all registered students rosters</li>
                <li>Wipe all teacher profiles and qualifications data</li>
                <li>Erase all active term assessments and grade registers</li>
                <li>Reset the current institution info & login sessions</li>
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
