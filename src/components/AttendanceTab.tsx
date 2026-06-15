import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AttendanceRecord, ClassType, CLASSES, AttendanceStatus } from '../types';
import { DbController } from '../db';
import { ThemeStyles } from './ThemeWrapper';
import { CalendarCheck, Users, ToggleLeft, ToggleRight, CheckSquare, Coffee, ClipboardList, CalendarDays, Printer, FileDown, ShieldAlert, Trash2, RotateCcw, Eraser } from 'lucide-react';
import { DefaultCrest } from './SchoolProfileTab';
import GoogleDriveExportControl from './GoogleDriveExportControl';

interface Props {
  theme: ThemeStyles;
  isAutoSave: boolean;
  onManualSave: () => void;
}

export default function AttendanceTab({ theme, isAutoSave, onManualSave }: Props) {
  const schoolInfo = DbController.getSchoolInfo();
  const [printBlocked, setPrintBlocked] = useState(false);
  const [showPdfGuide, setShowPdfGuide] = useState(false);

  const handlePrintRegister = () => {
    try {
      window.print();
    } catch (e) {
      console.warn("Direct print restricted inside sandbox iframe:", e);
      setPrintBlocked(true);
    }
  };

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to current system date (2026-06-12 as per context)
    return '2026-06-12';
  });
  const [selectedClass, setSelectedClass] = useState<ClassType>('Class 1');
  const [attendanceSheet, setAttendanceSheet] = useState<AttendanceRecord[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Fetch student roll roster whenever class or date changes
  useEffect(() => {
    const sheet = DbController.getAttendance(selectedDate, selectedClass);
    setAttendanceSheet(sheet);
    setSaveStatus('');
  }, [selectedDate, selectedClass]);

  const handleStatusChange = (studentId: string, newStatus: AttendanceStatus) => {
    const updated = attendanceSheet.map(item => {
      if (item.studentId === studentId) {
        return { ...item, status: newStatus };
      }
      return item;
    });
    setAttendanceSheet(updated);

    if (isAutoSave) {
      DbController.saveAttendanceBatch(updated);
      setSaveStatus('Auto-saved successfully!');
      setTimeout(() => setSaveStatus(''), 2000);
    } else {
      setSaveStatus('Modified - Click Save Session');
    }
  };

  const handleSaveAll = () => {
    DbController.saveAttendanceBatch(attendanceSheet);
    onManualSave();
    setSaveStatus('Session saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const markAllStatus = (status: AttendanceStatus) => {
    const updated = attendanceSheet.map(item => ({ ...item, status }));
    setAttendanceSheet(updated);

    if (isAutoSave) {
      DbController.saveAttendanceBatch(updated);
      setSaveStatus('Auto-saved all as ' + status);
      setTimeout(() => setSaveStatus(''), 2000);
    } else {
      setSaveStatus('All status set - Click Save');
    }
  };

  // Perform calculations for "Present", "Holiday", and "Absent"
  const presentCount = attendanceSheet.filter(item => item.status === 'Present').length;
  const holidayCount = attendanceSheet.filter(item => item.status === 'Holiday').length;
  const absentCount = attendanceSheet.filter(item => item.status === 'Absent').length;
  const totalRosterCount = attendanceSheet.length;

  const handleClearInputs = () => {
    const cleared = attendanceSheet.map(item => ({ ...item, status: 'Absent' as AttendanceStatus }));
    setAttendanceSheet(cleared);
    if (isAutoSave) {
      DbController.saveAttendanceBatch(cleared);
    }
    alert("Resetted all current attendance sheet states to Absent.");
  };

  const handleDeleteActiveSelection = () => {
    if (window.confirm(`Are you sure you want to delete/clear all recorded attendance for class "${selectedClass}" on ${selectedDate}?`)) {
      const cleared = attendanceSheet.map(item => ({ ...item, status: 'Absent' as AttendanceStatus }));
      setAttendanceSheet(cleared);
      DbController.saveAttendanceBatch(cleared);
      alert(`Deleted active attendance inputs for ${selectedClass} on ${selectedDate}.`);
    }
  };

  const handleDeleteAllAttendance = () => {
    if (window.confirm("Are you sure you want to completely erase and delete all historical attendance records from the system database? This cannot be undone.")) {
      localStorage.setItem('school_attendance', JSON.stringify([]));
      setAttendanceSheet([]);
      onManualSave();
      alert("Successfully purged all attendance records from database.");
    }
  };

  return (
    <div className="space-y-6 fade-in text-xs">
      
      {/* Configuration Header Control Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marking Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as ClassType)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 font-semibold text-xs focus:outline-none"
            >
              {CLASSES.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Setter controls and Print button */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-slate-500 font-medium">Bulk Mark Class:</div>
            <button
              onClick={() => markAllStatus('Present')}
              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-semibold cursor-pointer transition"
            >
              All Present
            </button>
            <button
              onClick={() => markAllStatus('Holiday')}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold cursor-pointer transition"
            >
              All Holiday
            </button>
            <button
              onClick={() => markAllStatus('Absent')}
              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded text-xs font-semibold cursor-pointer transition"
            >
              All Absent
            </button>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200 mx-1" />

          <button
            onClick={() => setShowPdfGuide(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 active:translate-y-0.5 transition text-xs font-semibold rounded-lg cursor-pointer"
          >
            <FileDown size={14} /> Save PDF
          </button>
        </div>

      </div>

      {/* Grid: Stat Summary on Left, Roster Table on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
        
        {/* STATS AGGREGATES CARDS */}
        <div className="lg:col-span-1 space-y-4">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-1.5">
              <ClipboardList className={theme.accentText} size={18} />
              Session Summary
            </h3>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              
              <div className="border border-slate-100 bg-slate-50/50 p-3 rounded-lg text-center lg:text-left">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Enrolled on Roll</span>
                <strong className="text-xl text-slate-800 font-display">{totalRosterCount}</strong>
                <span className="text-[10px] block text-slate-400">active class students</span>
              </div>

              <div className="border border-emerald-100 bg-emerald-50/20 p-3 rounded-lg text-center lg:text-left">
                <span className="text-[10px] text-emerald-600 uppercase font-mono block">Present Count</span>
                <strong className="text-xl text-emerald-700 font-display">{presentCount}</strong>
                <span className="text-[10px] block text-emerald-500">attendance marked</span>
              </div>

              <div className="border border-amber-100 bg-amber-50/20 p-3 rounded-lg text-center lg:text-left">
                <span className="text-[10px] text-amber-600 uppercase font-mono block">Holiday Leave</span>
                <strong className="text-xl text-amber-700 font-display">{holidayCount}</strong>
                <span className="text-[10px] block text-amber-500 font-sans font-medium">marked off</span>
              </div>

              <div className="border border-red-100 bg-red-50/20 p-3 rounded-lg text-center lg:text-left">
                <span className="text-[10px] text-red-600 uppercase font-mono block">Absent Lockouts</span>
                <strong className="text-xl text-red-700 font-display">{absentCount}</strong>
                <span className="text-[10px] block text-red-500">truances flagged</span>
              </div>

            </div>

            {/* Manual preservation notice */}
            {!isAutoSave && (
              <button
                onClick={handleSaveAll}
                className={`w-full py-2.5 rounded-lg text-xs font-bold shadow-xs active:translate-y-0.5 transition cursor-pointer text-center ${theme.btnColors}`}
              >
                Save Attendance Session
              </button>
            )}

            {saveStatus && (
              <div className={`text-center font-semibold text-[11px] py-1.5 px-3 rounded text-slate-700 ${saveStatus.includes('success') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 border border-slate-200 animate-pulse'}`}>
                {saveStatus}
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-[11px] text-slate-500 leading-relaxed font-sans">
            <Users size={16} className="text-slate-400 mb-1" />
            <span>Attendance totals automatically roll into student catalogs. Check academic rosters to verify presence ratios of day/boarder sections correctly.</span>
          </div>

        </div>

        {/* ROSTER DATA GRID WORKPAD */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-700 text-xs">Digital Attendance Class Register</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">{selectedClass} level roster logs on {selectedDate}</p>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Present: {presentCount} | Absent: {absentCount}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {attendanceSheet.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <CalendarCheck size={32} className="text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-600">No Enrolled Students In {selectedClass}</p>
                  <p className="max-w-sm mx-auto text-slate-400 text-[10px]">Enroll student profiles to {selectedClass} under the primary Databases module to enable attendance register checkmarks.</p>
                </div>
              ) : (
                attendanceSheet.map((item, index) => (
                  <div 
                    key={item.studentId}
                    className="p-3 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition duration-150"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate-300 font-bold w-4">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800 text-xs">{item.studentName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {item.studentId}</div>
                      </div>
                    </div>

                    {/* Radio Select Checks */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStatusChange(item.studentId, 'Present')}
                        className={`px-3 py-1.5 rounded-lg border font-semibold tracking-wide cursor-pointer transition text-[11px] ${item.status === 'Present' ? 'bg-emerald-500 border-emerald-600 text-white shadow-xs' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.studentId, 'Holiday')}
                        className={`px-3 py-1.5 rounded-lg border font-semibold tracking-wide cursor-pointer transition text-[11px] ${item.status === 'Holiday' ? 'bg-amber-500 border-amber-600 text-white shadow-xs' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        Holiday
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.studentId, 'Absent')}
                        className={`px-3 py-1.5 rounded-lg border font-semibold tracking-wide cursor-pointer transition text-[11px] ${item.status === 'Absent' ? 'bg-red-500 border-red-600 text-white shadow-xs' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        Absent
                      </button>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-50/80 px-5 py-3 border-t border-slate-100 text-[10px] font-mono text-slate-400 text-center flex items-center justify-center gap-1">
            <CheckSquare size={12} className="text-slate-400" />
            <span>Registers must represent true daily attendance logs. Double check truancy lists before printing academic profiles.</span>
          </div>
        </div>

      </div>

      {/* PRINT-ONLY COHESIVE DAILY REGISTER LOG */}
      <div className="hidden print:block font-serif max-w-5xl mx-auto p-12 bg-white text-black border-4 border-double border-slate-800 rounded-none shadow-none mt-10">
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-6">
          <div className="mx-auto w-16 h-16 mb-3 flex items-center justify-center overflow-hidden border border-slate-300 rounded-full bg-slate-50">
            {schoolInfo.logoUrl ? (
              <img src={schoolInfo.logoUrl} className="w-full h-full object-contain" alt="School logo" />
            ) : (
              <DefaultCrest className="h-10 w-10 text-slate-800" />
            )}
          </div>
          <h1 className="text-2xl font-bold uppercase font-display tracking-tight">{schoolInfo.name}</h1>
          <p className="text-xs italic font-serif mt-0.5">Motto: "{schoolInfo.motto}"</p>
          <p className="text-xs font-mono mt-1">EMIS: {schoolInfo.emisCode} | REG NO: {schoolInfo.schoolNumber}</p>
        </div>

        <div className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-200 mb-6 text-xs font-mono">
          <div><strong>CLASS NAME:</strong> {selectedClass}</div>
          <div><strong>DATE OF REGISTER:</strong> {selectedDate}</div>
          <div><strong>TOTAL ROLL:</strong> {totalRosterCount}</div>
        </div>

        <h2 className="text-base font-bold uppercase text-center tracking-widest border-b border-slate-400 pb-2 mb-4">
          Daily Class Attendance Register Log
        </h2>

        <table className="w-full text-left text-xs border-collapse border border-slate-400">
          <thead>
            <tr className="bg-slate-50 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-2 border border-slate-400 w-12 text-center">No.</th>
              <th className="p-2 border border-slate-400 w-32">Student ID</th>
              <th className="p-2 border border-slate-400">Full Name</th>
              <th className="p-2 border border-slate-400 w-32 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {attendanceSheet.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center border border-slate-400 italic">No students registered in this class.</td>
              </tr>
            ) : (
              attendanceSheet.map((item, index) => (
                <tr key={item.studentId} className="border-b border-slate-300">
                  <td className="p-2 border border-slate-400 text-center font-mono">{index + 1}</td>
                  <td className="p-2 border border-slate-400 font-mono">{item.studentId}</td>
                  <td className="p-2 border border-slate-400 font-bold">{item.studentName}</td>
                  <td className="p-2 border border-slate-400 text-center">
                    <span className="font-mono font-bold text-xs">
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Statistical Summary Row */}
        <div className="grid grid-cols-3 gap-4 border border-slate-400 p-3 bg-slate-50 font-mono text-[11px] mt-6 leading-6">
          <div><strong>Present Summary:</strong> {presentCount} students</div>
          <div><strong>Holiday Leave:</strong> {holidayCount} students</div>
          <div><strong>Absent Summary:</strong> {absentCount} students</div>
        </div>

        <div className="mt-16 flex justify-between text-xs font-serif pt-6 border-t border-slate-300">
          <div className="text-center">
            <div className="h-10 w-44 border-b border-slate-400"></div>
            <p className="mt-2 font-semibold">{schoolInfo.headteacherName}</p>
            <p className="text-slate-500 italic text-[10px]">Headteacher Signature</p>
          </div>
          <div className="text-center">
            <div className="h-10 w-44 border-b border-slate-400"></div>
            <p className="mt-2 font-semibold">Class Overseer / Teacher</p>
            <p className="text-slate-500 italic text-[10px]">Official Stamp / Signature</p>
          </div>
        </div>
      </div>

      {/* SANDBOX PRINT CAPTURE ALERT OVERLAY */}
      {printBlocked && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full text-center space-y-4 text-slate-800">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mx-auto">
              <Printer size={24} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-slate-950 font-display">Print Dialog Intercepted</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Your browser blocks direct print triggers from inside the preview iframe. To print this daily register log, please click the <strong className="text-slate-800 font-bold">"Open in a new tab" ↗</strong> button at the top right of the application workspace first.
              </p>
            </div>
            <button
              onClick={() => setPrintBlocked(false)}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer active:translate-y-0.5 transition"
            >
              Recognized, Dismiss
            </button>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE PDF GENERATION / PRINTING MANUAL OVERLAY WITH LIVE INTERACTIVE VISUAL PRINT PREVIEW */}
      <AnimatePresence>
        {showPdfGuide && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPdfGuide(false);
            }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 no-print overflow-y-auto cursor-pointer"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ ease: "easeOut", duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-100 rounded-[24px] border border-slate-200/50 shadow-2xl max-w-5xl w-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200/80 overflow-hidden my-8 max-h-[90vh] cursor-default"
            >
            
            {/* Left: Document Live Preview */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-700 flex flex-col justify-between items-center space-y-4">
              <span className="text-white text-xs font-mono tracking-widest uppercase opacity-70">Interactive Page Print Draft Preview</span>
              
              <div id="attendance-register-preview-card" className="w-full max-w-[450px] aspect-[1/1.414] bg-white p-8 text-black border-4 border-double border-slate-800 shadow-2xl text-[9px] space-y-3 font-serif rounded-none overflow-y-auto">
                <div className="text-center border-b-2 border-slate-800 pb-2 mb-3">
                  <div className="mx-auto w-12 h-12 mb-2 flex items-center justify-center overflow-hidden border border-slate-200 rounded-full bg-slate-50">
                    {schoolInfo.logoUrl ? (
                      <img src={schoolInfo.logoUrl} className="w-full h-full object-contain" alt="School logo" />
                    ) : (
                      <DefaultCrest className="h-8 w-8 text-slate-800" />
                    )}
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-tight font-sans text-stone-900">{schoolInfo.name}</h3>
                  <p className="text-[9px] italic mt-0.5 text-stone-600">Motto: "{schoolInfo.motto}"</p>
                  <p className="text-[8px] font-mono mt-1 text-stone-500">EMIS: {schoolInfo.emisCode} | REG NO: {schoolInfo.schoolNumber}</p>
                </div>

                <div className="flex justify-between items-center bg-stone-50 p-2 rounded border border-stone-200 mb-3 text-[8px] font-mono text-stone-700">
                  <div><strong>CLASS:</strong> {selectedClass}</div>
                  <div><strong>DATE:</strong> {selectedDate}</div>
                  <div><strong>COUNT:</strong> {totalRosterCount}</div>
                </div>

                <h4 className="text-[10px] font-bold uppercase text-center tracking-widest border-b border-stone-300 pb-1 mb-2 text-stone-900">
                  Daily Class Attendance Register Log
                </h4>

                <table className="w-full text-left text-[8px] border-collapse border border-stone-400">
                  <thead>
                    <tr className="bg-stone-100 font-bold uppercase text-stone-800">
                      <th className="p-1 border border-stone-400 text-center">No.</th>
                      <th className="p-1 border border-stone-400">Full Name</th>
                      <th className="p-1 border border-stone-400 text-center w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceSheet.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-2 text-center border border-stone-400 italic">No student attendance logs to preview.</td>
                      </tr>
                    ) : (
                      attendanceSheet.slice(0, 8).map((item, index) => (
                        <tr key={item.studentId} className="border-b border-stone-300">
                          <td className="p-1 border border-stone-400 text-center font-mono">{index + 1}</td>
                          <td className="p-1 border border-stone-400 font-bold text-stone-950">{item.studentName}</td>
                          <td className="p-1 border border-stone-400 text-center">
                            <span className={`px-1.5 py-0.5 font-bold font-sans text-[7px] border rounded ${
                              item.status === 'present' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : item.status === 'absent' 
                                ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {item.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                    {attendanceSheet.length > 8 && (
                      <tr>
                        <td colSpan={3} className="p-1 border border-stone-400 text-center font-mono text-indigo-600 italic">
                          ... and {attendanceSheet.length - 8} more students listed in Daily Register sheet ...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <span className="text-[10px] text-slate-300 font-mono tracking-wide">Standard Portrait A4 Format Draft Miniature</span>
            </div>

            {/* Right: Setup Manual & Control */}
            <div className="w-full md:w-[400px] p-6 bg-white flex flex-col justify-between overflow-y-auto max-h-none md:max-h-[90vh]">
              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <FileDown size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-950">Save PDF & Print Controller</h4>
                    <p className="text-[10px] text-slate-400">Review register print parameters</p>
                  </div>
                </div>

                <GoogleDriveExportControl 
                  elementId="attendance-register-preview-card" 
                  defaultFilename={`${selectedClass.replace(/\s+/g, '_')}_Register_${selectedDate}.pdf`}
                  isLandscape={false} 
                />

                <div className="p-3 bg-teal-50 border border-teal-100/70 rounded-xl space-y-1 text-teal-800 text-[11px]">
                  <span className="font-bold">✨ Portrait Optimized Layout</span>
                  <p className="text-[10px] text-teal-700/90 leading-relaxed">
                    Class Attendance Register sheets are beautifully scaled for vertical PDF A4 standards. Keep layout as Portrait.
                  </p>
                </div>

                <div className="space-y-3 text-xs text-slate-700 font-sans">
                  <span className="font-bold text-slate-900 border-b border-slate-100 pb-1 block">How to Export to PDF Checklist:</span>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="font-bold text-[10px] text-slate-600 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                      <p className="text-[11px] leading-relaxed">
                        Click the <strong className="text-indigo-600 font-bold">Trigger Print Engine</strong> button down below to configure layout.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="font-bold text-[10px] text-slate-600 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                      <p className="text-[11px] leading-relaxed">
                        Under the <strong>Destination</strong> list selector, choose <strong className="text-slate-900 font-bold">Save as PDF</strong> as your target.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="font-bold text-[10px] text-slate-600 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                      <p className="text-[11px] leading-relaxed">
                        Ensure layout/orientation is set to <strong>Portrait</strong>, paper size <strong>A4</strong>, tick <strong>Background Graphics</strong>, and untick headers.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200/60 text-[10px] text-amber-800 leading-relaxed space-y-1">
                  <strong>💡 Tip for Sandbox Environments:</strong>
                  <p className="leading-normal">
                    Some browsers limit script popups within frame sandboxes. If the trigger fails, please click the <strong className="font-bold">"Open in a new tab" ↗</strong> button on the top right, then trigger print.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-6 border-t border-slate-100 mt-6 font-sans bg-white">
                <button
                  type="button"
                  onClick={() => setShowPdfGuide(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold rounded-xl transition cursor-pointer text-[12px] flex-shrink-0"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePrintRegister();
                  }}
                  className="flex-1 px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-xl shadow-xs transition cursor-pointer text-[12px] text-center flex items-center justify-center gap-1.5 active:translate-y-0.5"
                >
                  <Printer size={14} /> Trigger Print Engine
                </button>
              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* SECTION DATA CONTROLS */}
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3 no-print mt-6">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
        <ShieldAlert className="text-indigo-500" size={14} /> Section Attendance Controls
      </h4>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Manage local attendance logs, clear input registers of active grids, and purge historical log records for this module.
      </p>
      <div className="flex flex-wrap gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleClearInputs}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-850 hover:bg-slate-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs"
        >
          <Eraser size={13} /> Clear All Inputs (Mark Absent)
        </button>
        <button
          type="button"
          onClick={handleDeleteActiveSelection}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 hover:text-amber-850 hover:bg-amber-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs"
        >
          <RotateCcw size={13} /> Delete Present Grid Day Input
        </button>
        <button
          type="button"
          onClick={handleDeleteAllAttendance}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:text-rose-850 hover:bg-rose-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs sm:ml-auto"
        >
          <Trash2 size={13} /> Delete All Section Data
        </button>
      </div>
    </div>

    </div>
  );
}
