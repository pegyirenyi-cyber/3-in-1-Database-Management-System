import React, { useState } from 'react';
import { Student, ClassType, CLASSES, AcademicYearType, ACADEMIC_YEARS, AttendanceRecord, StudentFeeBill, TermType, TERMS, SubjectType } from '../types';
import { DbController } from '../db';
import { ThemeStyles } from './ThemeWrapper';
import { motion } from 'motion/react';
import { evaluateSubscription } from '../subscription';
import { 
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, Users, Calendar, Coins, Percent, Award, Landmark, AlertCircle,
  FileCheck, Download, CreditCard, ChevronRight, CheckCircle2, CircleDollarSign,
  Clock, ShieldAlert, Key, ShieldCheck
} from 'lucide-react';

interface Props {
  theme: ThemeStyles;
  students: Student[];
  onRefresh: () => void;
  setActiveTab?: (tab: string) => void;
}

// ----------------------------------------------------
// BEAUTIFUL INTERACTIVE CUSTOM TOOLTIP MODULES
// ----------------------------------------------------

const EnrollmentTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    const maleVal = payload.find(p => p.dataKey === 'Male')?.value || 0;
    const femaleVal = payload.find(p => p.dataKey === 'Female')?.value || 0;
    const total = maleVal + femaleVal;
    const malePercent = total > 0 ? ((maleVal / total) * 100).toFixed(0) : 0;
    const femalePercent = total > 0 ? ((femaleVal / total) * 100).toFixed(0) : 0;

    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3.5 rounded-xl shadow-xl max-w-xs font-sans text-xs space-y-2">
        <div className="border-b border-slate-800 pb-1.5 flex justify-between items-center gap-4">
          <span className="font-bold text-[12px] text-white uppercase tracking-wide">{label}</span>
          <span className="bg-indigo-500/25 text-indigo-300 font-bold px-2 py-0.5 rounded-md font-mono text-[10px]">
            Total: {total}
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-300 font-medium">Male Students:</span>
            </div>
            <span className="font-bold text-white font-mono">{maleVal} <span className="text-[10px] text-slate-400 font-normal">({malePercent}%)</span></span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
              <span className="text-slate-300 font-medium">Female Students:</span>
            </div>
            <span className="font-bold text-white font-mono">{femaleVal} <span className="text-[10px] text-slate-400 font-normal">({femalePercent}%)</span></span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const GrowthTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const isSimulated = payload[0].payload.isSimulated;
    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3.5 rounded-xl shadow-xl font-sans text-xs space-y-2">
        <div className="border-b border-slate-800 pb-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Academic Season</span>
          <span className="text-xs font-bold text-white">{label}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-300 font-medium">Enrolled Students:</span>
          <span className="font-black text-white text-sm font-mono">{value}</span>
        </div>
        {isSimulated && (
          <div className="text-[9px] text-amber-400 font-medium italic pt-1 border-t border-slate-800 leading-normal">
            * Projected reference projection
          </div>
        )}
      </div>
    );
  }
  return null;
};

const AttendanceTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const rate = data.rate;
    const hasActual = data.hasActual;
    const present = data.presentCount;
    const absent = data.absentCount;

    let statusLabel = 'Needs Attention';
    let statusColorClass = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (rate >= 95) {
      statusLabel = 'Outstanding';
      statusColorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (rate >= 93) {
      statusLabel = 'Good Standing';
      statusColorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3.5 rounded-xl shadow-xl max-w-xs font-sans text-xs space-y-2">
        <div className="border-b border-slate-800 pb-1.5 flex justify-between items-center gap-4">
          <span className="font-bold text-[12px] text-white uppercase tracking-wide">{label || data.className}</span>
          <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] border ${statusColorClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-6">
            <span className="text-slate-300 font-medium">Session Attendance:</span>
            <span className="font-mono text-sm font-black text-white">{rate}%</span>
          </div>

          {hasActual ? (
            <div className="border-t border-slate-800 pt-1.5 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Marked Present:</span>
                <span className="font-mono text-emerald-400 font-bold">{present} students</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Marked Absent:</span>
                <span className="font-mono text-rose-400 font-bold">{absent} students</span>
              </div>
            </div>
          ) : (
            <div className="text-[9px] text-slate-400 leading-normal pt-1.5 border-t border-slate-800 italic font-medium">
              Showing standard historical average
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const FeesTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    const rawData = payload[0].payload;
    const billed = rawData.Billed || 0;
    const paid = rawData.Paid || 0;
    const outstanding = rawData.Outstanding || 0;
    const payRate = billed > 0 ? ((paid / billed) * 100).toFixed(1) : '0';

    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3.5 rounded-xl shadow-xl max-w-xs font-sans text-xs space-y-2">
        <div className="border-b border-slate-800 pb-1.5 flex justify-between items-center gap-4">
          <span className="font-bold text-[12px] text-white uppercase tracking-wide">{label || rawData.name}</span>
          <span className="bg-indigo-500/25 text-indigo-300 font-bold px-2 py-0.5 rounded-md font-mono text-[10px]">
            Paid: {payRate}%
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-300 font-medium">Total Billed:</span>
            </div>
            <span className="font-bold text-white font-mono">GH¢{billed.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-300 font-medium">Total Paid:</span>
            </div>
            <span className="font-bold text-emerald-450 text-emerald-400 font-mono">GH¢{paid.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-300 font-medium">Outstanding:</span>
            </div>
            <span className="font-bold text-rose-455 text-rose-400 font-mono">GH¢{outstanding.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const RatioTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3.5 rounded-xl shadow-xl font-sans text-xs space-y-2">
        <div className="pb-1 border-b border-slate-800">
          <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Portion Segment</span>
          <div className="flex items-center gap-1.5 font-bold text-white text-xs mt-0.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: data.color }} />
            {data.name}
          </div>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-300 font-medium">Segment Amount:</span>
          <span className="font-black text-white font-mono">GH¢{data.value.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  return null;
};

const PerformanceTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    const isSimulated = payload[0].payload.isSimulated;
    return (
      <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3.5 rounded-xl shadow-xl max-w-xs font-sans text-xs space-y-2">
        <div className="border-b border-slate-800 pb-1.5 flex justify-between items-center gap-4">
          <span className="font-bold text-[12px] text-white uppercase tracking-wide">{label}</span>
          {isSimulated && (
            <span className="bg-amber-500/25 text-amber-300 font-bold px-2 py-0.5 rounded-md font-mono text-[9px]">
              Demo Mode
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {payload.map((p, idx) => (
            <div key={idx} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.stroke || p.color }} />
                <span className="text-slate-300 font-medium">{p.name}:</span>
              </div>
              <span className="font-bold text-white font-mono">{p.value}%</span>
            </div>
          ))}
        </div>
        {isSimulated && (
          <div className="text-[9px] text-amber-400 font-medium italic pt-1 border-t border-slate-800 leading-normal">
            * Standard curriculum average baseline
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function DashboardSummaryTab({ theme, students, onRefresh, setActiveTab }: Props) {
  const teachers = DbController.getTeachers();
  const bills = DbController.getStudentFeeBills();

  // Selected period controls for deeper analytics focus
  const [selectedDashboardYear, setSelectedDashboardYear] = useState<AcademicYearType>('2026/2027');

  // Load and parse Attendance from local storage safely
  const getLocalStorageAttendance = (): AttendanceRecord[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('sms_attendance');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Error parsing attendance ledger:", e);
      return [];
    }
  };

  const attendanceRecords = getLocalStorageAttendance();

  // Get active HEX color code for charts based on theme selection
  const getThemeHexColor = (): string => {
    switch (theme.name) {
      case 'Classic': return '#2563eb'; // blue-600
      case 'Emerald': return '#059669'; // emerald-600
      case 'Ruby': return '#e11d48'; // rose-600
      case 'Cosmic': return '#9333ea'; // purple-600
      case 'Gold': return '#d97706'; // amber-600
      case 'Crystal Glass': return '#0284c7'; // sky-600
      case 'Sophisticated Dark': return '#6366f1'; // indigo-600
      default: return '#3b82f6';
    }
  };

  const themeHex = getThemeHexColor();

  // ----------------------------------------------------
  // DATA PIECE 1: Student Enrollment Trends & Breakdown
  // ----------------------------------------------------
  
  // Aggregate students count by Class and Gender
  const classCountMap: Record<string, { male: number; female: number; total: number }> = {};
  CLASSES.forEach(c => {
    classCountMap[c] = { male: 0, female: 0, total: 0 };
  });

  students.forEach(s => {
    if (classCountMap[s.class]) {
      if (s.gender === 'Female') {
        classCountMap[s.class].female++;
      } else {
        classCountMap[s.class].male++;
      }
      classCountMap[s.class].total++;
    }
  });

  const enrollmentByClassData = CLASSES.map(c => ({
    name: c,
    Male: classCountMap[c].male,
    Female: classCountMap[c].female,
    Total: classCountMap[c].total,
  })).filter(item => item.Total > 0 || students.length === 0); // show all if empty, otherwise filter empty classes for clean charts

  // If no students are in the database, present clean representation values
  const finalEnrollmentChartData = students.length > 0 ? enrollmentByClassData : [
    { name: 'Class 1', Male: 14, Female: 16, Total: 30 },
    { name: 'Class 2', Male: 18, Female: 12, Total: 30 },
    { name: 'Class 3', Male: 15, Female: 17, Total: 32 },
    { name: 'Class 4', Male: 11, Female: 19, Total: 30 },
    { name: 'Class 5', Male: 16, Female: 15, Total: 31 },
    { name: 'Class 6', Male: 20, Female: 14, Total: 34 }
  ];

  // Enrollment Growth Trend Line over academic years
  const yearCounts: Record<string, number> = {};
  ACADEMIC_YEARS.forEach(y => {
    yearCounts[y] = 0;
  });
  students.forEach(s => {
    const yr = s.academicYear || '2026/2027';
    if (yearCounts[yr] !== undefined) {
      yearCounts[yr]++;
    }
  });

  const enrollmentGrowthData = ACADEMIC_YEARS.map((yr, idx) => {
    const actualCount = yearCounts[yr] || 0;
    // Elegant base scaling for historical simulation so charts are styled with real progression
    const simulatedBase = 75 + idx * 38 + (idx % 2 === 0 ? 12 : -8);
    return {
      year: yr,
      Students: actualCount > 0 ? actualCount : Math.round(simulatedBase),
      isSimulated: actualCount === 0
    };
  });

  // ----------------------------------------------------
  // DATA PIECE 2: Class Attendance Percentages
  // ----------------------------------------------------
  const classAttendanceData = CLASSES.map((className, idx) => {
    const classRecords = attendanceRecords.filter(r => r.class === className);
    const present = classRecords.filter(r => r.status === 'Present').length;
    const absent = classRecords.filter(r => r.status === 'Absent').length;
    
    let rate = 0;
    let hasActualData = false;
    if (present + absent > 0) {
      rate = Math.round((present / (present + absent)) * 100);
      hasActualData = true;
    } else {
      rate = 0;
      hasActualData = false;
    }
    
    return {
      className,
      rate,
      hasActual: hasActualData,
      presentCount: present,
      absentCount: absent
    };
  }).filter(item => item.className !== 'Nursery 1' || students.length === 0);

  // Overall attendance rate average
  const actualAttendanceRecords = attendanceRecords.filter(r => r.status === 'Present' || r.status === 'Absent');
  const overallAttendanceRate = actualAttendanceRecords.length > 0
    ? Math.round((attendanceRecords.filter(r => r.status === 'Present').length / actualAttendanceRecords.length) * 100)
    : 0; // Default to 0 reference if no data is set

  // ----------------------------------------------------
  // DATA PIECE 3: Fee Payment Status Aggregation
  // ----------------------------------------------------
  let totalBilledGlobal = 0;
  let totalPaidGlobal = 0;

  const classFeesMap: Record<string, { billed: number; paid: number; outstanding: number }> = {};
  CLASSES.forEach(c => {
    classFeesMap[c] = { billed: 0, paid: 0, outstanding: 0 };
  });

  bills.forEach(b => {
    const totalBilled = b.schoolFees + b.utilityBill + b.sportsFees + b.ptaDues + b.otherFee;
    const totalPaid = b.payments ? b.payments.reduce((sum, p) => sum + p.amount, 0) : 0;
    const outstanding = Math.max(0, totalBilled - totalPaid);

    totalBilledGlobal += totalBilled;
    totalPaidGlobal += totalPaid;

    if (classFeesMap[b.class]) {
      classFeesMap[b.class].billed += totalBilled;
      classFeesMap[b.class].paid += totalPaid;
      classFeesMap[b.class].outstanding += outstanding;
    }
  });

  const totalOutstandingGlobal = Math.max(0, totalBilledGlobal - totalPaidGlobal);
  const collectionRate = totalBilledGlobal > 0 ? parseFloat(((totalPaidGlobal / totalBilledGlobal) * 100).toFixed(1)) : 0;

  // Formatting class fees dataset
  const classFeesChartData = CLASSES.map(c => ({
    name: c,
    Billed: classFeesMap[c].billed,
    Paid: classFeesMap[c].paid,
    Outstanding: classFeesMap[c].outstanding
  })).filter(item => item.Billed > 0 || bills.length === 0);

  // Fallback fees demo metrics if empty school fees ledger
  const hasBillingData = bills.length > 0;
  
  const finalFeesChartData = hasBillingData ? classFeesChartData : [];

  const demoPaymentRatioData = [
    { name: 'Collected / Paid Fees', value: hasBillingData ? totalPaidGlobal : 0, color: '#10b981' },
    { name: 'Outstanding Balance', value: hasBillingData ? totalOutstandingGlobal : 0, color: '#ef4444' }
  ];

  // Statistics summaries
  const totalEnrolledCounter = students.length;
  const femaleEnrolledCounter = students.filter(s => s.gender === 'Female').length;
  const maleEnrolledCounter = students.filter(s => s.gender === 'Male').length;
  const boarderEnrolledCounter = students.filter(s => s.status === 'Boarder').length;
  const dayEnrolledCounter = students.filter(s => s.status === 'Day').length;

  // ACADEMIC PERFORMANCE DATA COMPUTATION
  const assessments = DbController.getAssessments();
  const topSubjects: SubjectType[] = ['Mathematics', 'English Language', 'Integrated Science'];

  const termSubjectScoresMap: Record<TermType, Record<string, { total: number; count: number }>> = {
    'Term 1': {},
    'Term 2': {},
    'Term 3': {}
  };

  TERMS.forEach(t => {
    termSubjectScoresMap[t]['Overall'] = { total: 0, count: 0 };
    topSubjects.forEach(s => {
      termSubjectScoresMap[t][s] = { total: 0, count: 0 };
    });
  });

  assessments.forEach(ass => {
    if (ass.academicYear === selectedDashboardYear) {
      const term = ass.term;
      if (termSubjectScoresMap[term]) {
        // Overall
        termSubjectScoresMap[term]['Overall'].total += ass.totalScore;
        termSubjectScoresMap[term]['Overall'].count += 1;

        // Subject specific
        if (topSubjects.includes(ass.subject)) {
          termSubjectScoresMap[term][ass.subject].total += ass.totalScore;
          termSubjectScoresMap[term][ass.subject].count += 1;
        }
      }
    }
  });

  const hasAssessments = assessments.some(ass => ass.academicYear === selectedDashboardYear);

  const performanceTrendData = TERMS.map(term => {
    const item: any = { term };
    
    // Overall
    const overallData = termSubjectScoresMap[term]['Overall'];
    item['Overall'] = overallData.count > 0 
      ? parseFloat((overallData.total / overallData.count).toFixed(1)) 
      : 0; // Fallback

    // Subjects
    topSubjects.forEach(s => {
      const sData = termSubjectScoresMap[term][s];
      item[s] = sData.count > 0
        ? parseFloat((sData.total / sData.count).toFixed(1))
        : 0; // Fallback
    });

    item.isSimulated = !hasAssessments;
    return item;
  });

  // Dynamic grade level distribution
  let l1Count = 0; // Highly Proficient
  let l2Count = 0; // Proficient
  let l3Count = 0; // Approaching
  let l4Count = 0; // Developing
  let l5Count = 0; // Emerging

  assessments.forEach(ass => {
    if (ass.academicYear === selectedDashboardYear) {
      if (ass.gradeLevel === 'L1') l1Count++;
      else if (ass.gradeLevel === 'L2') l2Count++;
      else if (ass.gradeLevel === 'L3') l3Count++;
      else if (ass.gradeLevel === 'L4') l4Count++;
      else if (ass.gradeLevel === 'L5') l5Count++;
    }
  });

  const totalGrades = l1Count + l2Count + l3Count + l4Count + l5Count;
  const gradeDistributionSimulated = [
    { name: 'Highly Proficient (L1)', value: totalGrades > 0 ? l1Count : 0, pct: totalGrades > 0 ? Math.round((l1Count / totalGrades) * 100) : 0, color: '#10b981' },
    { name: 'Proficient (L2)', value: totalGrades > 0 ? l2Count : 0, pct: totalGrades > 0 ? Math.round((l2Count / totalGrades) * 100) : 0, color: '#3b82f6' },
    { name: 'Approaching (L3)', value: totalGrades > 0 ? l3Count : 0, pct: totalGrades > 0 ? Math.round((l3Count / totalGrades) * 100) : 0, color: '#f59e0b' },
    { name: 'Developing (L4)', value: totalGrades > 0 ? l4Count : 0, pct: totalGrades > 0 ? Math.round((l4Count / totalGrades) * 100) : 0, color: '#ef4444' },
    { name: 'Emerging (L5)', value: totalGrades > 0 ? l5Count : 0, pct: totalGrades > 0 ? Math.round((l5Count / totalGrades) * 100) : 0, color: '#94a3b8' },
  ];

  const currentUser = DbController.getCurrentUser();
  const subStatus = currentUser ? evaluateSubscription(currentUser) : null;

  return (
    <div className="space-y-6">
      
      {/* SUBSCRIPTION STATUS LEVEL */}
      {subStatus && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl border ${
            subStatus.isTrial 
              ? 'bg-amber-50/70 border-amber-200 text-amber-900' 
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
          } flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs no-print`}
        >
          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 flex items-center justify-center ${
              subStatus.isTrial 
                ? 'bg-amber-100 text-amber-700' 
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {subStatus.isTrial ? <Clock size={20} className="animate-pulse" /> : <ShieldCheck size={20} />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider font-mono">
                  {subStatus.licenseType === 'trial' ? 'System Trial Mode' : 'Annual School License'}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold uppercase font-mono ${
                  subStatus.isTrial 
                    ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {subStatus.remainingDays} Days Remaining
                </span>
              </div>
              <p className="text-xs text-slate-600 max-w-4xl font-medium leading-relaxed">
                {subStatus.message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
            <div className="text-right hidden sm:block">
              <span className="text-[9px] text-slate-400 block uppercase font-mono font-bold">Expiration Boundary</span>
              <span className="text-xs font-black text-slate-700">
                {subStatus.expiryDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
            {setActiveTab && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black shadow-xs transition active:translate-y-0.5 cursor-pointer flex items-center gap-1.5 ${
                  subStatus.isTrial 
                    ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Key size={13} />
                {subStatus.isTrial ? 'Renew License' : 'Manage License'}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* 4 CORE KPI HERO BLOCKS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        
        {/* KPI 1: Active Enrollment */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">Total Active Enrollment</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {totalEnrolledCounter || 185}
              </span>
              {!totalEnrolledCounter && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-100 font-mono">Simulated</span>
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 font-medium">
              Male: <strong className="text-slate-700">{totalEnrolledCounter ? maleEnrolledCounter : 95}</strong> • Female: <strong className="text-slate-700">{totalEnrolledCounter ? femaleEnrolledCounter : 90}</strong>
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={20} />
          </div>
        </motion.div>

        {/* KPI 2: Teacher Cadre */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">Instructional Staff</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {teachers.length || 14}
              </span>
              {!teachers.length && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-100 font-mono">Simulated</span>
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 font-medium">
              GES Certified Staff Roster Logs
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Award size={20} />
          </div>
        </motion.div>

        {/* KPI 3: Global Attendance Rate */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">Avg. Session Attendance</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {overallAttendanceRate}%
              </span>
              {attendanceRecords.length === 0 && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-100 font-mono">Standard</span>
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 font-medium">
              Active Term Daily Attendance Rate
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Percent size={20} />
          </div>
        </motion.div>

        {/* KPI 4: Bill Collection Rate */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">Fee Settlement Rate</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {hasBillingData ? `${collectionRate}%` : "84.1%"}
              </span>
              {!hasBillingData && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-100 font-mono">Mock</span>
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 font-medium truncate">
              Paid: <strong className="text-slate-700">GH¢{hasBillingData ? totalPaidGlobal.toLocaleString() : "25,000"}</strong>
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Coins size={20} />
          </div>
        </motion.div>

      </div>

      {/* WARNING NOTIFICATION AREA */}
      {!totalEnrolledCounter && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-slate-700 text-xs no-print shadow-2xs">
          <AlertCircle className="text-amber-600 mt-0.5 flex-shrink-0" size={16} />
          <div className="space-y-1">
            <h5 className="font-bold text-slate-900">Demonstration Context Active:</h5>
            <p className="text-slate-600 leading-normal">
              No students or fee bills have been logged in the system yet. The statistics dashboard below presents structured demonstration data based on school averages. Once you populate students, mark daily attendance, and publish school fee invoices, this dashboard will update automatically with live metrics.
            </p>
          </div>
        </div>
      )}

      {/* REQUIREMENT 1: Student Enrollment Trends Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Class Enrollment breakdown chart (Bar) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="text-blue-600" size={16} />
                Student Enrollment Breakdown by Class
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Segmented counts of male vs female active enrollments</p>
            </div>
          </div>

          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
              <BarChart data={finalEnrollmentChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<EnrollmentTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Male" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={16} />
                <Bar dataKey="Female" stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Growth line chart over time */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="text-indigo-600" size={16} />
                Historical Enrollment Growth
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Progression trend across academic seasons</p>
            </div>
          </div>

          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
              <AreaChart data={enrollmentGrowthData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={themeHex} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={themeHex} stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip content={<GrowthTooltip />} />
                <Area type="monotone" dataKey="Students" stroke={themeHex} strokeWidth={2.5} fillOpacity={1} fill="url(#growthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Performance Summary KPI Row above Performance Trends */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* KPI Card 1: Total Enrolled Students */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">
              Total Enrolled Students
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {totalEnrolledCounter || 185}
              </span>
              {!totalEnrolledCounter && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-mono">Demo</span>
              )}
            </div>
            <p className="text-[9.5px] text-slate-500 font-medium">
              Registered learner entries in {selectedDashboardYear}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={18} />
          </div>
        </motion.div>

        {/* KPI Card 2: Current Attendance % */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">
              Current Attendance %
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {actualAttendanceRecords.length > 0 ? `${overallAttendanceRate}%` : '94.2%'}
              </span>
              {actualAttendanceRecords.length === 0 && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-mono">Demo</span>
              )}
            </div>
            <p className="text-[9.5px] text-slate-500 font-medium">
              Average presence rate across classes
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Percent size={18} />
          </div>
        </motion.div>

        {/* KPI Card 3: Outstanding Fees */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block">
              Outstanding Fees
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                GH¢{hasBillingData ? totalOutstandingGlobal.toLocaleString() : '4,700'}
              </span>
              {!hasBillingData && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-mono">Demo</span>
              )}
            </div>
            <p className="text-[9.5px] text-slate-500 font-medium">
              Awaiting settlement balance logs
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
            <CircleDollarSign size={18} />
          </div>
        </motion.div>
      </div>

      {/* REQUIREMENT: Academic Performance Trends Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Academic Performance Trends Line Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="text-blue-600" style={{ color: themeHex }} size={16} />
                Performance Trends Across Terms
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Average academic achievements grouped by school terms</p>
            </div>
            <div className="flex items-center gap-1.5">
              {!hasAssessments && (
                <span className="text-[9.5px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-mono uppercase tracking-wider">Demo Data Active</span>
              )}
            </div>
          </div>

          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
              <LineChart data={performanceTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="term" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<PerformanceTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="Overall" stroke={themeHex} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Overall Average" />
                <Line type="monotone" dataKey="Mathematics" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3 }} name="Mathematics" />
                <Line type="monotone" dataKey="English Language" stroke="#10b981" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3 }} name="English Language" />
                <Line type="monotone" dataKey="Integrated Science" stroke="#06b6d4" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3 }} name="Integrated Science" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grade Level Distribution Summary Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="pb-2 border-b border-slate-100">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="text-indigo-600" size={16} />
              Grade Distribution
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">GES Curriculum Grading Level Mix ({selectedDashboardYear})</p>
          </div>

          <div className="space-y-3 pt-1">
            {gradeDistributionSimulated.map((g, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">{g.name}</span>
                  <span className="font-mono font-bold text-slate-800">{g.pct}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ 
                      backgroundColor: g.color,
                      width: `${g.pct}%` 
                    }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* REQUIREMENT 2, 3 & 4: Sovereign Fee Payments and Class Attendance Rate Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Global fee settlement ratio visual donut */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="text-indigo-650" size={16} />
                Sovereign Fees Settlement
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Proportionate ratio of settled bills globally</p>
            </div>
          </div>

          <div className="h-44 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
              <PieChart>
                <Pie
                  data={demoPaymentRatioData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {demoPaymentRatioData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                  <Tooltip content={<RatioTooltip />} />
                </PieChart>
            </ResponsiveContainer>

            {/* Absolute settlement percent circle value overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
              <span className="text-[10px] uppercase font-bold text-slate-405 font-mono">Settled</span>
              <span className="text-xl font-black text-slate-800">
                {hasBillingData ? `${collectionRate}%` : "0.0%"}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1 font-sans text-left">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block" /> Paid / Collected:
              </span>
              <strong className="text-slate-800 font-mono">
                GH¢{hasBillingData ? totalPaidGlobal.toLocaleString() : "0"}
              </strong>
            </div>
            
            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block" /> Remaining Debt:
              </span>
              <strong className="text-rose-600 font-mono">
                GH¢{hasBillingData ? totalOutstandingGlobal.toLocaleString() : "0"}
              </strong>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-slate-500 font-semibold">Total Revenue Invoiced:</span>
              <strong className="text-slate-800 font-mono">
                GH¢{hasBillingData ? totalBilledGlobal.toLocaleString() : "0"}
              </strong>
            </div>
          </div>
        </div>

        {/* Class-by-Class Attendance Analysis Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="text-emerald-600" size={16} />
                Class-by-Class Attendance Performance
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Average attendance rate percentage across active class grades</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-650 text-emerald-600 font-bold uppercase">Term Avg: {overallAttendanceRate}%</span>
            </div>
          </div>

          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
              <BarChart data={classAttendanceData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="className" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<AttendanceTooltip />} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={18} name="Attendance Rate (%)">
                  {classAttendanceData.map((entry, index) => {
                    let barColor = '#10b981'; // Outstanding: emerald-500
                    if (entry.rate === 0) {
                      barColor = '#cbd5e1'; // Empty / Reset state: slate-300
                    } else if (entry.rate < 93) {
                      barColor = '#ef4444'; // Needs Attention: rose-500
                    } else if (entry.rate < 95) {
                      barColor = '#f59e0b'; // Good Standing: amber-500
                    }
                    return <Cell key={`cell-${index}`} fill={barColor} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* REQUIREMENT 3 CONTINUED: Fee Payment Status breakdown by class */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <CircleDollarSign className="text-indigo-600" size={16} />
              Term Fees Payment Status Breakdown by Class (GH¢)
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Comparing invoice totals, collected payments, and remaining balances per class</p>
          </div>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
            <BarChart data={finalFeesChartData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<FeesTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Bar dataKey="Billed" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} name="Total Invoiced / Billed" />
              <Bar dataKey="Paid" fill="#10b981" radius={[4, 4, 0, 0]} barSize={14} name="Total Paid / Settled" />
              <Bar dataKey="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={14} name="Total Outstanding Balance" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
