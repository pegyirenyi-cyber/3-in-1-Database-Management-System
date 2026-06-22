import { useState, useEffect, useMemo } from 'react';
import { 
  Smartphone, Send, AlertTriangle, Search, Trash2, CheckCircle, RefreshCw, 
  MessageSquare, Sliders, Users
} from 'lucide-react';
import { Student, CLASSES, AcademicYearType, ACADEMIC_YEARS } from '../types';
import { DbController } from '../db';
import { ThemeStyles } from './ThemeWrapper';
import { generateSecureToken } from '../utils';

interface Props {
  theme: ThemeStyles;
  students: Student[];
}

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  enabled: boolean;
}

interface DispatchLog {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  guardianName: string;
  phoneNumber: string;
  message: string;
  channel: 'Twilio API' | 'Native Carrier';
  status: 'Delivered' | 'Failed' | 'Initiated' | 'Pending';
  errorDetails?: string;
  class: string;
}

// Predefined communication templates
const TEMPLATES = [
  {
    id: 'report_link',
    label: 'Academic Report Link Notice',
    text: 'Dear {guardianName}, the Term Report Card for {firstName} {lastName} ({class}) is now ready. Click here to securely view/download the full official grades and fee statement anytime: {reportLink}'
  },
  {
    id: 'fee_reminder',
    label: 'Outstanding Fees Reminder',
    text: 'Dear {guardianName}, this is a gentle reminder that {firstName} {lastName} ({class}) has an outstanding school fee balance of GHS {feeBalance}. Please arrange for settlement. - {schoolName}'
  },
  {
    id: 'attendance_alert',
    label: 'Student Absence Alert',
    text: 'Urgent: Dear {guardianName}, {firstName} {lastName} ({class}) was recorded as ABSENT during today\'s morning registration call. Please contact the administration if you are unaware of this absence.'
  },
  {
    id: 'general_broadcast',
    label: 'General PTA & School Broadcast',
    text: 'Dear {guardianName}, please be informed that our upcoming general PTA congress will take place this Sunday at 2:00 PM in the main assembly hall. Agenda: Fee revisions and academic calendar. Thank you. - {schoolName}'
  }
];

export default function CommunicationsTab({ theme, students }: Props) {
  const [selectedClass, setSelectedClass] = useState<string>('All Classes');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('All Academic Years');
  const [targetFilter, setTargetFilter] = useState<'all' | 'outstanding_fees' | 'no_phone' | 'has_phone'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom SMS template state
  const [templateText, setTemplateText] = useState(TEMPLATES[0].text);
  const [selectedTemplateId, setSelectedTemplateId] = useState('report_link');

  // Dynamic system configs (fetched from DB custom parameters)
  const systemSettings = useMemo(() => DbController.getSystemSettings(), []);
  const schoolInfo = useMemo(() => DbController.getSchoolInfo(), []);
  const activeYear = systemSettings.academicYear || '2026/2027';
  const activeTerm = systemSettings.term || 'Term 1';

  // Retrieve Twilio configurations stored on local machine/DB settings
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig>(() => {
    const saved = localStorage.getItem('geetech_twilio_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return { accountSid: '', authToken: '', fromNumber: '', enabled: false };
  });

  // SMS logs list 
  const [smsLogs, setSmsLogs] = useState<DispatchLog[]>(() => {
    const saved = localStorage.getItem('sms_communication_sent_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [];
  });

  // Selected recipient IDs (individual student IDs to send to)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  
  // Bulk dispatch state
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStatusText, setBulkStatusText] = useState('');
  const [bulkSuccessCount, setBulkSuccessCount] = useState(0);
  const [bulkFailedCount, setBulkFailedCount] = useState(0);
  const [cancelBulkSignal, setCancelBulkSignal] = useState(false);

  // Fetch outstanding fee bills mapping for efficient lookups
  const feeBillsMap = useMemo(() => {
    const list = DbController.getStudentFeeBills();
    const map: Record<string, number> = {};
    const yearToUse = selectedAcademicYear === 'All Academic Years' ? activeYear : selectedAcademicYear;
    list.forEach(bill => {
      // We look for active term bill
      if (bill.academicYear === yearToUse && bill.term === activeTerm) {
        const totalBilled = (bill.schoolFees || 0) + (bill.utilityBill || 0) + (bill.sportsFees || 0) + (bill.ptaDues || 0) + (bill.otherFee || 0);
        const totalPaid = (bill.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
        map[bill.studentId] = Math.max(0, totalBilled - totalPaid);
      }
    });
    return map;
  }, [activeYear, activeTerm, selectedAcademicYear]);

  // Handle template selection
  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tmpl = TEMPLATES.find(t => t.id === id);
    if (tmpl) {
      setTemplateText(tmpl.text);
    }
  };

  // Helper insertion helper 
  const insertVariableTag = (tag: string) => {
    setTemplateText(prev => prev + tag);
  };

  // Compile individual sms content dynamically
  const compileMessage = (student: Student, template: string) => {
    const yearToUse = selectedAcademicYear === 'All Academic Years' ? activeYear : selectedAcademicYear;
    const token = generateSecureToken(student.id, yearToUse, activeTerm);
    const portalUrl = `${window.location.origin}/?studentId=${student.id}&year=${encodeURIComponent(yearToUse)}&term=${encodeURIComponent(activeTerm)}&token=${token}`;
    const feeBalanceVal = feeBillsMap[student.id] !== undefined ? feeBillsMap[student.id] : 0;

    return template
      .replace(/{guardianName}/g, student.guardianName || `${student.firstName} ${student.lastName} Parent`)
      .replace(/{firstName}/g, student.firstName || '')
      .replace(/{lastName}/g, student.lastName || '')
      .replace(/{class}/g, student.class || '')
      .replace(/{feeBalance}/g, feeBalanceVal.toString())
      .replace(/{schoolName}/g, schoolInfo.name || 'GEETECH School Center')
      .replace(/{reportLink}/g, portalUrl);
  };

  // Filter students to send communications to
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      // 1. Class filter
      if (selectedClass !== 'All Classes' && s.class !== selectedClass) return false;

      // 2. Academic Year filter
      if (selectedAcademicYear !== 'All Academic Years' && s.academicYear !== selectedAcademicYear) return false;

      // 3. Target specific rules
      const hasTelephone = s.guardianTelephone && s.guardianTelephone.trim().length > 3;
      const feeVal = feeBillsMap[s.id] || 0;

      if (targetFilter === 'outstanding_fees' && feeVal <= 0) return false;
      if (targetFilter === 'no_phone' && hasTelephone) return false;
      if (targetFilter === 'has_phone' && !hasTelephone) return false;

      // 4. Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const fullMatches = `${s.firstName} ${s.lastName} ${s.guardianName} ${s.id} ${s.guardianTelephone}`.toLowerCase();
        if (!fullMatches.includes(q)) return false;
      }

      return true;
    });
  }, [students, selectedClass, selectedAcademicYear, targetFilter, searchQuery, feeBillsMap]);

  // Auto-select all matching filtered students when filter or class updates
  useEffect(() => {
    setSelectedStudentIds(filteredStudents.filter(s => s.guardianTelephone && s.guardianTelephone.trim().length > 3).map(s => s.id));
  }, [filteredStudents]);

  // Mass toggle selections
  const handleToggleAll = () => {
    const validRecipients = filteredStudents.filter(s => s.guardianTelephone && s.guardianTelephone.trim().length > 3);
    if (selectedStudentIds.length === validRecipients.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(validRecipients.map(s => s.id));
    }
  };

  const handleToggleOne = (id: string) => {
    setSelectedStudentIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Construct standard cellular Native SMS App dispatch URI
  const getNativeSmsHref = (student: Student) => {
    const phone = (student.guardianTelephone || '').trim().replace(/[\s\-\(\)]/g, '');
    const textMsg = compileMessage(student, templateText);
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    return isIOS ? `sms:${phone}&body=${encodeURIComponent(textMsg)}` : `sms:${phone}?body=${encodeURIComponent(textMsg)}`;
  };

  const logNativeSmsDispatch = (student: Student) => {
    const textMsg = compileMessage(student, templateText);
    const newLog: DispatchLog = {
      id: `SMS_${Date.now()}_${student.id}`,
      timestamp: new Date().toISOString(),
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      guardianName: student.guardianName || 'Guardian',
      phoneNumber: student.guardianTelephone || '',
      message: textMsg,
      channel: 'Native Carrier',
      status: 'Initiated',
      class: student.class
    };

    setSmsLogs(prev => {
      const updatedLogs = [newLog, ...prev];
      localStorage.setItem('sms_communication_sent_logs', JSON.stringify(updatedLogs));
      return updatedLogs;
    });
  };

  // Perform integrated Real API Twilio HTTP Dispatch REST query directly
  const runRealTwilioSend = async (phone: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> => {
    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.fromNumber) {
      return { success: false, error: 'Twilio API credential block fields are incomplete.' };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;
      const basicAuth = btoa(`${twilioConfig.accountSid}:${twilioConfig.authToken}`);

      const requestBody = new URLSearchParams();
      requestBody.append('To', phone.trim());
      requestBody.append('From', twilioConfig.fromNumber.trim());
      requestBody.append('Body', message);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: requestBody.toString()
      });

      const parsed = await res.json();
      if (res.ok) {
        return { success: true, sid: parsed.sid };
      } else {
        return { success: false, error: parsed.message || `HTTP ${res.status}: ${JSON.stringify(parsed)}` };
      }
    } catch (e: any) {
      return { success: false, error: e.message || 'Networking handshake failed' };
    }
  };

  // Execute sequential bulk messaging queue
  const handleBulkDispatch = async () => {
    const count = selectedStudentIds.length;
    if (count === 0) return;

    if (!twilioConfig.enabled) {
      alert("Twilio API Gateway integration is currently toggled OFF in client settings. Please scroll down to the 'Twilio API Gateway' card to enable real API dispatching, or execute individual device dispatches via the cellular icon in the table below.");
      return;
    }

    if (window.confirm(`BROADCAST PROPOSAL: Are you sure you want to sequential dispatch ${count} real automated SMS notifications via the Twilio API network?`)) {
      setIsBulkSending(true);
      setBulkProgress(0);
      setBulkSuccessCount(0);
      setBulkFailedCount(0);
      setCancelBulkSignal(false);
      setBulkStatusText('Booting cellular queue transmitter...');

      const recipientList = students.filter(s => selectedStudentIds.includes(s.id));
      let currentLogs = [...smsLogs];

      for (let i = 0; i < recipientList.length; i++) {
        // Yield to allow UI refresh or cancel
        if (cancelBulkSignal) {
          setBulkStatusText('Broadcast cancelled by administrator.');
          break;
        }

        const student = recipientList[i];
        setBulkStatusText(`Sending to guardian of ${student.firstName} ${student.lastName} (${i + 1}/${count})...`);
        setBulkProgress(Math.round(((i + 1) / count) * 100));

        const msgText = compileMessage(student, templateText);
        const parentPhone = student.guardianTelephone || '';

        // API dispatch 
        const result = await runRealTwilioSend(parentPhone, msgText);

        const newLog: DispatchLog = {
          id: `SMS_${Date.now()}_${student.id}_bulk`,
          timestamp: new Date().toISOString(),
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          guardianName: student.guardianName,
          phoneNumber: parentPhone,
          message: msgText,
          channel: 'Twilio API',
          status: result.success ? 'Delivered' : 'Failed',
          errorDetails: result.error,
          class: student.class
        };

        if (result.success) {
          setBulkSuccessCount(p => p + 1);
        } else {
          setBulkFailedCount(p => p + 1);
        }

        currentLogs = [newLog, ...currentLogs];
        setSmsLogs(currentLogs);
        localStorage.setItem('sms_communication_sent_logs', JSON.stringify(currentLogs));

        // Cellular API interval pacing
        await new Promise(r => setTimeout(r, 600));
      }

      setIsBulkSending(false);
      setBulkStatusText(`Broadcast process finalized! successfully transmitted: ${bulkSuccessCount} | Faulty: ${bulkFailedCount}`);
    }
  };

  // Clean communication history logs safely
  const handleClearLogs = () => {
    if (window.confirm("Are you sure you want to permanently clear the dispatch transaction log ledger? This will erase all audit trails.")) {
      setSmsLogs([]);
      localStorage.removeItem('sms_communication_sent_logs');
    }
  };

  // Handle saving Twilio fields
  const handleSaveTwilioSetting = (field: keyof TwilioConfig, value: any) => {
    const updated = { ...twilioConfig, [field]: value };
    setTwilioConfig(updated);
    localStorage.setItem('geetech_twilio_config', JSON.stringify(updated));
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* HEADER BAR */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse">
            <Smartphone size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950 font-display uppercase tracking-tight">Parental Broadcast & SMS Center</h2>
            <p className="text-xs text-slate-500 font-medium">Draft dynamic templates, personalization-merge parent metrics and dispatch bulk updates instantly.</p>
          </div>
        </div>
        
        {/* Gateway connection indicator badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-600">
          <span className={`inline-block w-2 h-2 rounded-full ${twilioConfig.enabled && twilioConfig.accountSid ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
          <span>Active Service: {twilioConfig.enabled && twilioConfig.accountSid ? 'Twilio Automated Cloud API' : 'Personal Device Carrier Redirect (E.164)'}</span>
        </div>
      </div>

      {/* THREE SECTION BENTO GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: TEMPLATE EDITOR & DRAFT CONTROLLER (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5 font-display">
              <Sliders className="text-indigo-600" size={14} /> 1. Configure Template Content
            </h3>

            {/* QUICK PRE-SET SELECTOR */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fast Presets</label>
              <div className="grid grid-cols-1 gap-2">
                {TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={`px-3 py-2 text-left text-xs font-bold rounded-xl border transition flex items-center justify-between ${selectedTemplateId === tmpl.id ? 'bg-indigo-50 border-indigo-200 text-indigo-950' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-650'}`}
                  >
                    <span>{tmpl.label}</span>
                    <span className="text-[9px] font-mono text-slate-400">{selectedTemplateId === tmpl.id ? 'Active' : 'Select'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DRAFTING ENGINE CONTAINER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Custom SMS Message Template:</span>
                <span className="text-[9.5px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold">
                  Chars: {templateText.length} ({Math.ceil(templateText.length / 160)} SMS Parts)
                </span>
              </div>
              
              <textarea
                rows={5}
                value={templateText}
                onChange={(e) => {
                  setTemplateText(e.target.value);
                  setSelectedTemplateId('custom');
                }}
                className="w-full text-xs p-3.5 border border-slate-200 rounded-xl bg-slate-50 font-medium text-slate-700 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Compose custom template body here..."
              />

              {/* DYNAMIC MERGE SHORTCUT CHIPS */}
              <div className="space-y-1.5">
                <span className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-widest block">Insert Personalization Token Helpers:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { tag: '{guardianName}', label: 'Parent Name' },
                    { tag: '{firstName}', label: 'Student First Name' },
                    { tag: '{lastName}', label: 'Student Last Name' },
                    { tag: '{class}', label: 'Class' },
                    { tag: '{feeBalance}', label: 'Fee Balance' },
                    { tag: '{reportLink}', label: 'Report Portal URL' },
                    { tag: '{schoolName}', label: 'School Name' }
                  ].map(item => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => insertVariableTag(item.tag)}
                      className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-950 font-bold font-mono text-[9.5px] rounded-lg transition"
                    >
                      {item.tag}
                    </button>
                  ))}
                </div>
                <p className="text-[9.5px] text-slate-400 italic mt-1 font-medium leading-normal">Variables are dynamically replaced with real-time student indexes at transmission.</p>
              </div>
            </div>

            {/* SEND CONSOLE CONTROL */}
            {isBulkSending ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 animate-pulse flex items-center gap-1.5">
                    <RefreshCw size={12} className="animate-spin" /> Batch Transmission Launching
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">{bulkProgress}%</span>
                </div>
                
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${bulkProgress}%` }} />
                </div>
                
                <p className="text-[10px] font-medium text-slate-500 font-mono text-center">{bulkStatusText}</p>
                
                <div className="flex justify-between items-center text-[10.5px] bg-white p-2 border border-slate-100 rounded-lg">
                  <span className="text-emerald-700 font-black">✔ Delivered: {bulkSuccessCount}</span>
                  <span className="text-rose-600 font-black">☎ Faulty: {bulkFailedCount}</span>
                  <button
                    onClick={() => setCancelBulkSignal(true)}
                    className="px-2 py-0.5 text-[9px] bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold rounded cursor-pointer"
                  >
                    Abort Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={selectedStudentIds.length === 0}
                  onClick={handleBulkDispatch}
                  className={`w-full py-3 rounded-xl font-bold text-xs shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer transition active:translate-y-0.5 ${selectedStudentIds.length === 0 ? 'bg-slate-100 border border-slate-200 text-slate-450 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                >
                  <Send size={15} /> Core Emit Automated Broadcast ({selectedStudentIds.length} Recipients selected)
                </button>
                <div className="text-[9.5px] text-slate-400 text-center font-medium leading-relaxed">
                  Bulk dispatching uses standard local/cloud pipelines. Only parents with verified telephone numbers are listed.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: AUDIENCE BUILDER & ACTIVE LIVE-MERGE LIST (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col min-h-[400px]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-150 pb-4">
              <div>
                <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <Users className="text-indigo-600" size={14} /> 2. Audience Selection & Live Merge Preview
                </h3>
                <p className="text-[11px] text-slate-400">Personalized outputs based on current template content and databases.</p>
              </div>

              {/* SECTIONS / CLASSES FILTERS */}
              <div className="flex flex-wrap gap-1.5">
                <select
                  value={selectedAcademicYear}
                  onChange={(e) => setSelectedAcademicYear(e.target.value)}
                  className="bg-white px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="All Academic Years">All Academic Years</option>
                  {ACADEMIC_YEARS.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>

                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="bg-white px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="All Classes">All Classes</option>
                  {CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>

                <select
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value as any)}
                  className="bg-white px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">No Sub-Filters</option>
                  <option value="outstanding_fees">Outstanding Fees Only</option>
                  <option value="has_phone">With Phone Numbers</option>
                  <option value="no_phone">Missing Phone Numbers</option>
                </select>
              </div>
            </div>

            {/* AUDIENCE SEARCH AND STATS HEADER */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-8 relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search students, parents, guardians, or phones..."
                  className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-750 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-4 text-right">
                <span className="text-[10px] font-black uppercase text-indigo-700 font-mono bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100/50">
                  Target Match: {selectedStudentIds.length}/{filteredStudents.filter(s => s.guardianTelephone && s.guardianTelephone.trim().length > 3).length}
                </span>
              </div>
            </div>

            {/* LIVE PREVIEW TABLE */}
            <div className="flex-1 overflow-x-auto border border-slate-200 rounded-xl max-h-[300px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.length > 0 && selectedStudentIds.length === filteredStudents.filter(s => s.guardianTelephone && s.guardianTelephone.trim().length > 3).length}
                        onChange={handleToggleAll}
                        className="rounded accent-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3 w-32">Student / Parent</th>
                    <th className="py-2.5 px-3 w-1/2">Personalized Merge Message Live Preview</th>
                    <th className="py-2.5 px-3 text-right pr-4 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-slate-405 italic font-medium">
                        No students fit the demographic criteria or sub-filter targets.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(student => {
                      const hasPhone = student.guardianTelephone && student.guardianTelephone.trim().length > 3;
                      const activeFeeBal = feeBillsMap[student.id] || 0;
                      const isSelected = selectedStudentIds.includes(student.id);
                      const parsedMsg = compileMessage(student, templateText);

                      return (
                        <tr 
                          key={student.id} 
                          className={`hover:bg-slate-50/50 transition ${!isSelected && hasPhone ? 'bg-slate-50/20' : ''} ${!hasPhone ? 'bg-rose-50/20 opacity-80' : ''}`}
                        >
                          {/* CHECKBOX */}
                          <td className="py-2.5 px-3 text-center">
                            {hasPhone ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleOne(student.id)}
                                className="rounded accent-indigo-600 focus:ring-0 cursor-pointer"
                              />
                            ) : (
                              <span className="text-rose-500 block text-[9.5px] font-bold">☠</span>
                            )}
                          </td>

                          {/* RECIPIENT INFORMATION */}
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 leading-tight">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="text-[10px] text-slate-450 flex flex-col font-medium space-y-0.5 mt-0.5">
                              <span>Parent: {student.guardianName || 'Unspecified'}</span>
                              <span>Class: {student.class}</span>
                              {activeFeeBal > 0 && (
                                <span className="text-[9.5px] text-orange-600 font-extrabold font-mono">Bal: GHS {activeFeeBal}</span>
                              )}
                            </div>
                          </td>

                          {/* RENDERED MESSAGE PREVIEW */}
                          <td className="py-2.5 px-3 leading-relaxed font-sans text-[10.5px] text-slate-650 max-w-[280px]">
                            <div className="border border-slate-100/50 bg-slate-50/30 p-2 rounded-lg font-medium text-slate-600 block leading-normal line-clamp-3">
                              {parsedMsg}
                            </div>
                          </td>

                          {/* ROW ACTIONS */}
                          <td className="py-2.5 px-3 text-right pr-4">
                            {hasPhone ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Free Local SMS via applet redirect */}
                                <a
                                  href={getNativeSmsHref(student)}
                                  onClick={() => logNativeSmsDispatch(student)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 border border-slate-250 bg-white hover:bg-slate-100 text-slate-700 font-black rounded-lg text-xs transition cursor-pointer flex items-center justify-center shadow-7xs"
                                  title="Dispatch individually through device mobile network"
                                >
                                  <Smartphone size={13} className="text-indigo-650" />
                                </a>

                                {/* Instant API dispatch */}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm(`Dispatched real Twilio API SMS directly to ${student.guardianName}?`)) {
                                      const res = await runRealTwilioSend(student.guardianTelephone, parsedMsg);
                                      if (res.success) {
                                        alert("Individual SMS successfully processed via Twilio network!");
                                        setSmsLogs(prev => [
                                          {
                                            id: `SMS_${Date.now()}_single`,
                                            timestamp: new Date().toISOString(),
                                            studentId: student.id,
                                            studentName: `${student.firstName} ${student.lastName}`,
                                            guardianName: student.guardianName,
                                            phoneNumber: student.guardianTelephone,
                                            message: parsedMsg,
                                            channel: 'Twilio API',
                                            status: 'Delivered',
                                            class: student.class
                                          },
                                          ...prev
                                        ]);
                                      } else {
                                        alert(`Transmission Failure: ${res.error}`);
                                      }
                                    }
                                  }}
                                  className="p-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 text-emerald-800 rounded-lg text-xs transition cursor-pointer"
                                  title="Manual API Instant dispatch"
                                >
                                  <Send size={13} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-rose-500 font-bold block bg-rose-50 border border-rose-100 p-1 rounded-md text-center max-w-[100px] shadow-8xs">
                                Missing Mobile
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* TWILIO AND API GATEWAY CONTROLS CARD */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5 font-display">
          <Sliders className="text-indigo-600" size={14} /> Twilio API Gateway Credentials Config Layer
        </h3>
        <p className="text-xs text-slate-500 leading-normal font-medium max-w-4xl">
          Integrate a dedicated global Twilio cellular platform here! Entering authentic API credentials allows the systems bulk sender to make outbound internet telemetry transfers directly to real smartphones. Stored credentials remain strictly protected inside your local workspace.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          
          {/* Account SID */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Account SID:</label>
            <input
              type="text"
              value={twilioConfig.accountSid}
              onChange={(e) => handleSaveTwilioSetting('accountSid', e.target.value)}
              placeholder="e.g. AC8fb180..."
              className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-left"
            />
          </div>

          {/* Auth Token */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Auth Token:</label>
            <input
              type="password"
              value={twilioConfig.authToken}
              onChange={(e) => handleSaveTwilioSetting('authToken', e.target.value)}
              placeholder="••••••••••••••••••••••••••••"
              className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-left"
            />
          </div>

          {/* Sender From Phone */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">From Twilio Number (E.164):</label>
            <input
              type="text"
              value={twilioConfig.fromNumber}
              onChange={(e) => handleSaveTwilioSetting('fromNumber', e.target.value)}
              placeholder="e.g. +18146447281"
              className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-850 font-mono text-left"
            />
          </div>

          {/* Gateway toggle */}
          <div className="space-y-1 select-none">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Integrity State:</label>
            <div className="flex items-center gap-2 h-[41px]">
              <input
                type="checkbox"
                id="twilio_enabled_flag"
                checked={twilioConfig.enabled}
                onChange={(e) => handleSaveTwilioSetting('enabled', e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
              <label htmlFor="twilio_enabled_flag" className="text-xs font-bold text-slate-700 cursor-pointer">
                Enable Twilio API Outbound Send
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* DISPATCH HISTORY LOG TABLE */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5 font-display">
              <MessageSquare className="text-indigo-600" size={14} /> Outbound Communications Transaction & Logs Ledger
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">Verify cellular delivery callbacks, timestamps and payloads.</p>
          </div>
          <button
            type="button"
            onClick={handleClearLogs}
            disabled={smsLogs.length === 0}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold cursor-pointer transition select-none flex items-center gap-1 active:translate-y-0.5"
          >
            <Trash2 size={13} /> Clear Historic logs
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-[250px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black uppercase tracking-wider text-slate-550">
                <th className="py-2 px-3">Date / Time</th>
                <th className="py-2 px-3">Recipient Name (Phone)</th>
                <th className="py-2 px-3">Student Affected</th>
                <th className="py-2 px-3">Communication Content Payload</th>
                <th className="py-2 px-3">Protocol</th>
                <th className="py-2 px-3 text-right pr-4">Delivery Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {smsLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 italic">No communication logs recorded during the current workspace session.</td>
                </tr>
              ) : (
                smsLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition font-sans">
                    {/* TIMESTAMP */}
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-500 font-semibold">
                      {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>

                    {/* GUARDIAN */}
                    <td className="py-2 px-3 font-bold text-slate-800">
                      <div>{log.guardianName}</div>
                      <div className="font-mono text-[9px] text-slate-400 mt-0.5">{log.phoneNumber}</div>
                    </td>

                    {/* STUDENT */}
                    <td className="py-2 px-3">
                      <div className="font-semibold text-slate-900">{log.studentName}</div>
                      <div className="text-[9.5px] text-slate-400 font-semibold">{log.class}</div>
                    </td>

                    {/* MSG BODY */}
                    <td className="py-2 px-3 text-slate-500 font-medium max-w-[240px] truncate leading-normal" title={log.message}>
                      {log.message}
                    </td>

                    {/* DRIVER */}
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black ${log.channel === 'Twilio API' ? 'bg-indigo-50 border border-indigo-100 text-indigo-750' : 'bg-slate-100 border border-slate-205 text-slate-650'}`}>
                        {log.channel}
                      </span>
                    </td>

                    {/* DELIVERED OR INITIATED STATUS */}
                    <td className="py-2 px-3 text-right pr-4 font-black">
                      {log.status === 'Delivered' ? (
                        <span className="text-emerald-700 flex items-center justify-end gap-1 font-black text-[10px]">
                          <CheckCircle size={10} /> DELIVERED
                        </span>
                      ) : log.status === 'Initiated' ? (
                        <span className="text-sky-700 flex items-center justify-end gap-1 font-black text-[10px]">
                          <Smartphone size={10} /> INITIATED
                        </span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="text-rose-600 flex items-center justify-end gap-1 font-black text-[10px]">
                            <AlertTriangle size={10} /> DISPATCH ERROR
                          </span>
                          {log.errorDetails && <span className="text-[8px] text-rose-500 font-mono font-medium max-w-[150px] truncate mt-0.5">{log.errorDetails}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
