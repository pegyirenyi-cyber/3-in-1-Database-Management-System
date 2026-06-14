import { useState, useEffect, useMemo } from 'react';
import { 
  StudentAssessment, ClassType, CLASSES, AcademicYearType, ACADEMIC_YEARS, 
  TermType, TERMS, SubjectType, SUBJECTS, Student 
} from '../types';
import { DbController } from '../db';
import { ThemeStyles } from './ThemeWrapper';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Printer, Save, CheckSquare, RefreshCw, Layers, Award, FileText, LayoutGrid, BarChart3, HelpCircle, AlertCircle, Sparkles, FileDown,
  Eye, EyeOff
} from 'lucide-react';
import GoogleDriveExportControl from './GoogleDriveExportControl';

interface Props {
  theme: ThemeStyles;
  students: Student[];
  isAutoSave: boolean;
  onManualSave: () => void;
}

type AssessmentSubMode = 'Worksheet' | 'IndividualReport' | 'Broadsheet' | 'PerformanceAnalytics';

export default function AssessmentTab({ theme, students, isAutoSave, onManualSave }: Props) {
  // Top selector ribbon states
  const [selectedClass, setSelectedClass] = useState<ClassType>('Class 1');
  const [selectedYear, setSelectedYear] = useState<AcademicYearType>('2025/2026');
  const [selectedTerm, setSelectedTerm] = useState<TermType>('Term 1');
  const [selectedSubject, setSelectedSubject] = useState<SubjectType>('English Language');
  
  // Navigation states
  const [subMode, setSubMode] = useState<AssessmentSubMode>('Worksheet');
  const [activeWorksheet, setActiveWorksheet] = useState<StudentAssessment[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  // Save feedback states
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [reportCardPreviewMode, setReportCardPreviewMode] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);
  const [pdfFloatingMinimized, setPdfFloatingMinimized] = useState(false);

  // Fetch or construct worksheet records whenever filters update!
  useEffect(() => {
    const sheet = DbController.getAssessmentsSheet(selectedClass, selectedYear, selectedTerm, selectedSubject);
    setActiveWorksheet(sheet);
    setUnsavedChanges(false);
    
    // Set first student as default individual report target if none is active
    const classStd = students.filter(s => s.class === selectedClass);
    if (classStd.length > 0 && !selectedStudentId) {
      setSelectedStudentId(classStd[0].id);
    }
  }, [selectedClass, selectedYear, selectedTerm, selectedSubject, students]);

  // Set default student if search changes
  useEffect(() => {
    const classStd = students.filter(s => s.class === selectedClass);
    if (classStd.length > 0 && (!selectedStudentId || !classStd.some(s => s.id === selectedStudentId))) {
      setSelectedStudentId(classStd[0].id);
    }
  }, [selectedClass]);

  // Restricts data inputs precisely to required decimal bounds:
  // e.g. Exercises: 0-10, Tests: 0-20, Projects/Groups: 0-10, Exams: 0-100
  const handleScoreInput = (
    studentId: string, 
    field: 'exercises' | 'tests' | 'projectWork' | 'groupWork' | 'examScore100', 
    index: number, 
    valueStr: string
  ) => {
    const valueNum = valueStr === '' ? 0 : parseFloat(valueStr);
    
    // Define boundary checks according to prompt constraints:
    let maxLimit = 10;
    if (field === 'tests') maxLimit = 20;
    if (field === 'examScore100') maxLimit = 100;

    // Reject or clamp values outside boundaries
    const boundValue = Math.min(maxLimit, Math.max(0, valueNum));

    // Update state worksheet
    const updated = activeWorksheet.map(row => {
      if (row.studentId === studentId) {
        let updatedRow = { ...row };
        if (field === 'exercises') {
          const exps = [...row.exercises];
          exps[index] = boundValue;
          updatedRow.exercises = exps;
        } else if (field === 'tests') {
          const tsts = [...row.tests];
          tsts[index] = boundValue;
          updatedRow.tests = tsts;
        } else if (field === 'projectWork') {
          updatedRow.projectWork = boundValue;
        } else if (field === 'groupWork') {
          updatedRow.groupWork = boundValue;
        } else if (field === 'examScore100') {
          updatedRow.examScore100 = boundValue;
        }

        // Dynamically compute class totals and 50% ratios on-the-fly!
        return DbController.calculateScoreDetails(updatedRow);
      }
      return row;
    });

    const ranked = DbController.calculatePositions(updated);
    setActiveWorksheet(ranked);
    setUnsavedChanges(true);

    if (isAutoSave) {
      DbController.saveAssessmentsSheet(ranked);
      setUnsavedChanges(false);
      setSaveFeedback('Auto-saved changes!');
      setTimeout(() => setSaveFeedback(''), 1500);
    }
  };

  const handleManualSave = () => {
    DbController.saveAssessmentsSheet(activeWorksheet);
    onManualSave();
    setUnsavedChanges(false);
    setSaveFeedback('Gradesheet successfully saved!');
    setTimeout(() => setSaveFeedback(''), 3500);
  };

  const [printBlocked, setPrintBlocked] = useState(false);
  const [showPdfGuide, setShowPdfGuide] = useState(false);

  const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      console.warn("Direct print restricted inside sandbox iframe:", e);
      setPrintBlocked(true);
    }
  };

  // Compute individual student report card metrics across all subjects
  const compiledReport = useMemo(() => {
    if (!selectedStudentId) return null;
    return DbController.getStudentTermReportCard(selectedStudentId, selectedYear, selectedTerm);
  }, [selectedStudentId, selectedYear, selectedTerm, activeWorksheet]);

  // Compute broad sheet showing student ranks and score aggregates across key subjects
  const broadsheetData = useMemo(() => {
    const classStudents = students.filter(s => s.class === selectedClass);
    const allAssessments = DbController.getAssessments();

    return classStudents.map(st => {
      const studentGrades = allAssessments.filter(
        a => a.studentId === st.id && a.academicYear === selectedYear && a.term === selectedTerm
      );

      // Maps subjects into an easy dictionary lookup
      const subjectScores: Record<string, number> = {};
      studentGrades.forEach(g => {
        subjectScores[g.subject] = g.totalScore;
      });

      const totalOverallScore = studentGrades.reduce((sum, g) => sum + g.totalScore, 0);
      const subjectsCount = studentGrades.length;
      const averageOverallScore = subjectsCount > 0 
        ? parseFloat((totalOverallScore / subjectsCount).toFixed(2)) 
        : 0;

      return {
        student: st,
        subjectScores,
        subjectsCount,
        totalOverallScore,
        averageOverallScore
      };
    }).sort((a, b) => b.averageOverallScore - a.averageOverallScore); // Sort descending
  }, [students, selectedClass, selectedYear, selectedTerm, activeWorksheet]);

  // GES Class Remarks Breakdown stats for charts
  const gradeLevelsStats = useMemo(() => {
    const stats = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };
    activeWorksheet.forEach(w => {
      stats[w.gradeLevel] = (stats[w.gradeLevel] || 0) + 1;
    });

    return [
      { name: 'Highly Proficient (L1)', value: stats.L1, fill: '#10b981' },
      { name: 'Proficient (L2)', value: stats.L2, fill: '#3b82f6' },
      { name: 'Approaching (L3)', value: stats.L3, fill: '#f59e0b' },
      { name: 'Developing (L4)', value: stats.L4, fill: '#6366f1' },
      { name: 'Emerging (L5)', value: stats.L5, fill: '#ef4444' }
    ];
  }, [activeWorksheet]);

  // Dynamic real-time performance KPI metrics calculated efficiently
  const classPerformanceDetails = useMemo(() => {
    if (activeWorksheet.length === 0) {
      return { avgScore: 0, passRate: 0, highestScore: 0, lowestScore: 0, gradedCount: 0 };
    }
    const scores = activeWorksheet.map(w => w.totalScore);
    const sum = scores.reduce((a, b) => a + b, 0);
    const avgScore = parseFloat((sum / scores.length).toFixed(1));
    const passCount = activeWorksheet.filter(w => w.totalScore >= 50).length;
    const passRate = parseFloat(((passCount / activeWorksheet.length) * 100).toFixed(1));
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    return { avgScore, passRate, highestScore, lowestScore, gradedCount: activeWorksheet.length };
  }, [activeWorksheet]);

  // Academic Remediation Tracker for fragile cognitive status (< 54%)
  const remediationAlerts = useMemo(() => {
    return activeWorksheet
      .filter(w => w.totalScore < 54)
      .map(w => {
        const student = students.find(s => s.id === w.studentId);
        let actionPlan = "Schedule core academic remediation sessions and structured peer tutoring.";
        if (w.gradeLevel === 'L5') {
          actionPlan = "Critical support warning: Guardians should be phoned. Mandatory 1-to-1 staff diagnostic remediation recommended.";
        } else if (w.gradeLevel === 'L4') {
          actionPlan = "Fragile outcome: Deploy custom student homework worksheet study guide and seat re-arrangement.";
        }
        return {
          student,
          score: w.totalScore,
          gradeLevel: w.gradeLevel,
          actionPlan
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [activeWorksheet, students]);

  // Academic Honor Roll list celebrating high performers (>= 80%)
  const academicHonorsList = useMemo(() => {
    return activeWorksheet
      .filter(w => w.totalScore >= 80)
      .map(w => {
        const student = students.find(s => s.id === w.studentId);
        return {
          student,
          score: w.totalScore,
          gradeLevel: w.gradeLevel
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [activeWorksheet, students]);

  return (
    <div className="space-y-6 fade-in text-xs">
      
      {/* 1. FILTERING RIBBON CONTROL & NAVIGATION TABS */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 no-print">
        
        {/* Academic Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Academic Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value as AcademicYearType)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
            >
              {ACADEMIC_YEARS.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Academic Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value as TermType)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
            >
              {TERMS.map(tm => (
                <option key={tm} value={tm}>{tm}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as ClassType)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
            >
              {CLASSES.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subject Curriculum</label>
            <select
              value={selectedSubject}
              disabled={subMode === 'Broadsheet' || subMode === 'IndividualReport'}
              onChange={(e) => setSelectedSubject(e.target.value as SubjectType)}
              className="w-full px-3 py-2 border border-slate-100 rounded-lg bg-slate-50 font-semibold disabled:opacity-40"
            >
              {SUBJECTS.map(sb => (
                <option key={sb} value={sb}>{sb}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Component Dashboard Sub-Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setSubMode('Worksheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition text-[11px] cursor-pointer ${subMode === 'Worksheet' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <LayoutGrid size={14} /> Marks Input Sheet
            </button>
            <button
              onClick={() => setSubMode('IndividualReport')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition text-[11px] cursor-pointer ${subMode === 'IndividualReport' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <FileText size={14} /> Student Report Card
            </button>
            <button
              onClick={() => setSubMode('Broadsheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition text-[11px] cursor-pointer ${subMode === 'Broadsheet' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Layers size={14} /> Class Broadsheet
            </button>
            <button
              onClick={() => setSubMode('PerformanceAnalytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition text-[11px] cursor-pointer ${subMode === 'PerformanceAnalytics' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <BarChart3 size={14} /> Performance Charts
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setShowPdfGuide(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 transition font-bold rounded-lg cursor-pointer active:translate-y-0.5"
            >
              <FileDown size={14} /> Save PDF
            </button>
            
            {subMode === 'Worksheet' && (
              <button
                onClick={handleManualSave}
                className={`flex items-center gap-1 px-4 py-1.5 rounded-lg font-black shadow-sm cursor-pointer active:translate-y-0.5 transition ${theme.btnColors} ${unsavedChanges ? 'animate-pulse ring-2 ring-indigo-400' : ''}`}
                title={unsavedChanges ? 'You have unsaved gradesheet changes' : 'Save current academic assessment data'}
              >
                <Save size={14} /> Save Data
              </button>
            )}
          </div>
        </div>

        {saveFeedback && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] py-2 px-3 rounded-md flex items-center gap-1.5 animate-pulse">
            <Sparkles size={14} className="text-emerald-500" />
            <span>{saveFeedback}</span>
          </div>
        )}
      </div>

      {/* 2. SUB-MODE SUB-SCREEN MODULES */}

      {/* SUBMODE A: INTERACTIVE SPREADSHEET (MARKS ENTRY WORKSHEET) */}
      {subMode === 'Worksheet' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden no-print">
          
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                📊 Class Score-Sheets Input
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Input parameters are constrained: Exercises (0-10), Class Tests (0-20), Project Work/Group Work (0-10), Examination Exams (0-100)</p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                Class: {selectedClass}
              </span>
              <span className="text-[10px] bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">
                Subject: {selectedSubject}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeWorksheet.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <AlertCircle size={32} className="text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-600">No Student Rolls Available</h4>
                <p className="text-[10px] max-w-sm mx-auto text-slate-400">Please enroll student profiles to {selectedClass} to enable automatic loading of names inside this grades sheet registry.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse table-fixed min-w-[900px] text-[11px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <th className="py-2.5 px-2 font-black text-slate-500 w-12 text-center">No</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 w-48 truncate">Student Full Name</th>
                    {/* Exercises 4 Columns */}
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-blue-50/40 border-l border-slate-200">Ex 1 (10)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-blue-50/40">Ex 2 (10)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-blue-50/40">Ex 3 (10)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-blue-50/40">Ex 4 (10)</th>
                    {/* Class Test 2 Columns */}
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-teal-50/40 border-l border-slate-200">Ts 1 (20)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-teal-50/40">Ts 2 (20)</th>
                    {/* Project & Group */}
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-amber-50/40 border-l border-slate-200">Proj (10)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-600 text-center bg-amber-50/40">Grp (10)</th>
                    {/* Total & 50% */}
                    <th className="py-2.5 px-1 font-bold text-slate-700 text-center bg-slate-100 border-l border-slate-200">Class 50%</th>
                    {/* Exams */}
                    <th className="py-2.5 px-1.5 font-bold text-slate-600 text-center bg-indigo-50 border-l border-slate-200">Exam (100)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-700 text-center bg-indigo-50">Exam 50%</th>
                    {/* Combined Grade, Position */}
                    <th className="py-2.5 px-1 font-black text-slate-900 text-center border-l border-slate-200">Total (100)</th>
                    <th className="py-2.5 px-1 font-bold text-slate-700 text-center bg-emerald-50">Remark</th>
                    <th className="py-2.5 px-1 font-black text-indigo-700 text-center bg-purple-50">Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeWorksheet.map((row, index) => (
                    <tr key={row.studentId} className="hover:bg-slate-50/20 transition">
                      <td className="py-1 px-1.5 text-center font-mono text-slate-300 font-bold">{index + 1}</td>
                      <td className="py-1 px-2 font-semibold text-slate-800 truncate leading-tight font-sans">
                        <div>{row.studentName}</div>
                        <span className="text-[9px] text-slate-400 font-mono font-normal">ID: {row.studentId}</span>
                      </td>
                      
                      {/* Exercises 4 Columns input with constraints 0-10 */}
                      {[0, 1, 2, 3].map(exIdx => (
                        <td key={`ex-${exIdx}`} className="py-1 px-0.5 bg-blue-50/10 border-l border-slate-100">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.1"
                            value={row.exercises[exIdx] || 0}
                            onChange={(e) => handleScoreInput(row.studentId, 'exercises', exIdx, e.target.value)}
                            className="w-full text-center py-1 text-xs font-semibold bg-white border border-slate-200 rounded focus:bg-slate-50 focus:border-indigo-400 focus:outline-none"
                          />
                        </td>
                      ))}

                      {/* Class Test 2 Columns input with constraints 0-20 */}
                      {[0, 1].map(tsIdx => (
                        <td key={`ts-${tsIdx}`} className="py-1 px-0.5 bg-teal-50/10 border-l border-slate-100">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.1"
                            value={row.tests[tsIdx] || 0}
                            onChange={(e) => handleScoreInput(row.studentId, 'tests', tsIdx, e.target.value)}
                            className="w-full text-center py-1 text-xs font-semibold bg-white border border-slate-200 rounded focus:bg-slate-50"
                          />
                        </td>
                      ))}

                      {/* Project Work input constraint 0-10 */}
                      <td className="py-1 px-0.5 bg-amber-50/10 border-l border-slate-100">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={row.projectWork || 0}
                          onChange={(e) => handleScoreInput(row.studentId, 'projectWork', 0, e.target.value)}
                          className="w-full text-center py-1 text-xs font-semibold bg-white border border-slate-200 rounded focus:bg-slate-50"
                        />
                      </td>

                      {/* Group Work input constraint 0-10 */}
                      <td className="py-1 px-0.5 bg-amber-50/10">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={row.groupWork || 0}
                          onChange={(e) => handleScoreInput(row.studentId, 'groupWork', 0, e.target.value)}
                          className="w-full text-center py-1 text-xs font-semibold bg-white border border-slate-200 rounded"
                        />
                      </td>

                      {/* Class Score Total converted to 50% (Class Score 50%) */}
                      <td className="py-1 px-0.5 text-center font-bold text-slate-800 bg-slate-100 border-l border-slate-200 font-mono">
                        {row.classScore50} <span className="text-[9px] text-slate-400 block font-normal">/{row.classScoreTotal}</span>
                      </td>

                      {/* Exam Score input constraint 0-100 */}
                      <td className="py-1 px-0.5 bg-indigo-50/10 border-l border-slate-200">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={row.examScore100 || 0}
                          onChange={(e) => handleScoreInput(row.studentId, 'examScore100', 0, e.target.value)}
                          className="w-full text-center py-1 text-xs font-semibold bg-white border border-slate-200 rounded text-indigo-700 font-mono"
                        />
                      </td>

                      {/* Exam Score 50% */}
                      <td className="py-1 px-0.5 text-center font-bold text-slate-700 bg-indigo-50/30 font-mono">
                        {row.examScore50}
                      </td>

                      {/* Total Score 100% */}
                      <td className="py-1 px-0.5 text-center font-black text-rose-700 border-l border-slate-200 bg-slate-50 font-mono text-xs">
                        {row.totalScore}%
                      </td>

                      {/* GES Remark */}
                      <td className="py-1 px-0.5 text-center bg-emerald-50 text-[10px] truncate leading-none">
                        <strong className="text-emerald-800">{row.remarks}</strong>
                        <span className="text-[8px] text-slate-400 block font-mono mt-0.5">GES: {row.gradeLevel}</span>
                      </td>

                      {/* Position in Class */}
                      <td className="py-1 px-0.5 text-center bg-purple-50 text-indigo-800 font-black font-mono">
                        {row.position ? `${row.position}` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 font-mono flex items-center justify-between no-print">
            <span className="flex items-center gap-1">
              <CheckSquare size={13} className="text-slate-400" />
              <span>Rows represent current live enrollment rosters synced from core registers.</span>
            </span>
            <span className="text-slate-500 font-semibold uppercase">GES CURRICULUM COMPLIANT</span>
          </div>

        </div>
      )}

      {/* SUBMODE B: INDIVIDUAL REPORT CARD VIEW */}
      {subMode === 'IndividualReport' && (
        <div className="space-y-6">
          
          {/* Individual report card selectors */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium font-sans">Select Target Student:</span>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 font-semibold focus:outline-none"
                >
                  {students.filter(s => s.class === selectedClass).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              {compiledReport && compiledReport.grades.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReportCardPreviewMode(true)}
                  className={`py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black shadow-xs cursor-pointer transition flex items-center justify-center gap-1.5 active:translate-y-0.5`}
                >
                  <Eye size={14} /> Toggle Preview Mode
                </button>
              )}
            </div>
            
            <div id="print-guide" className="text-[11px] text-slate-400 flex items-center gap-1">
              <AlertCircle size={14} className="text-amber-500" />
              <span>Ready for Print. Clean layouts fit A4 dimensions seamlessly.</span>
            </div>
          </div>

          {!compiledReport || compiledReport.grades.length === 0 ? (
            <div className="bg-white p-12 border border-slate-200 text-center text-slate-400 rounded-xl space-y-2 no-print">
              <FileText size={36} className="text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-600">No Grades Marked Yet</h4>
              <p className="text-[10px] max-w-sm mx-auto text-slate-400">Please enter academic scores in the Primary Marks Worksheet across multiple subjects to generate this report card.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Report Card Page layout */}
              <div className="lg:col-span-2 bg-white p-8 border border-slate-200 rounded-xl shadow-xs print:m-0 print:border-none print:shadow-none print:p-0 col-span-full font-sans">
                
                {/* Professional School Profile Header with Crest, Logo & Info */}
                <div className="flex flex-col sm:flex-row items-center justify-between border-b-2 border-slate-900 pb-5 mb-6 gap-4 font-sans text-left">
                  {DbController.getSchoolInfo().logoUrl ? (
                    <img 
                      src={DbController.getSchoolInfo().logoUrl} 
                      alt="School Logo" 
                      className="w-16 h-16 object-contain flex-shrink-0" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-300 p-1 flex-shrink-0">
                      <div className="w-full h-full rounded-full border border-dashed border-slate-400 bg-white flex flex-col items-center justify-center text-[7px] text-slate-500 font-mono font-bold leading-normal">
                        <Award size={18} className="text-indigo-600 mb-0.5" />
                        <span className="scale-75 origin-center uppercase">CREST</span>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 text-center space-y-0.5">
                    <h2 className="text-xl font-black text-slate-950 tracking-tight leading-tight uppercase font-display">
                      {DbController.getSchoolInfo().name}
                    </h2>
                    <p className="text-[10px] italic font-serif text-slate-600">
                      Motto: "{DbController.getSchoolInfo().motto}"
                    </p>
                    <div className="text-[9px] text-slate-500 font-sans flex flex-wrap justify-center gap-x-3 gap-y-0.5 mt-0.5">
                      {DbController.getSchoolInfo().gpsAddress && <span>📍 {DbController.getSchoolInfo().gpsAddress}</span>}
                      {DbController.getSchoolInfo().telephone && <span>☎️ {DbController.getSchoolInfo().telephone}</span>}
                      {DbController.getSchoolInfo().email && <span>📧 {DbController.getSchoolInfo().email}</span>}
                    </div>
                    <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest font-semibold flex justify-center gap-3 mt-0.5">
                      {DbController.getSchoolInfo().emisCode && <span>EMIS: {DbController.getSchoolInfo().emisCode}</span>}
                      {DbController.getSchoolInfo().schoolNumber && <span>CODE: {DbController.getSchoolInfo().schoolNumber}</span>}
                    </div>
                    <p className="text-[9px] font-mono text-slate-800 font-bold uppercase tracking-wider bg-slate-100 px-3 py-0.5 rounded-full inline-block mt-1">
                      Official Student Progress Statement Card
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 p-1 flex-shrink-0 text-[6.5px] text-slate-400 font-mono text-center leading-normal select-none">
                    <div className="font-bold scale-90">PASSPORT</div>
                    <div className="scale-75">STAMP</div>
                  </div>
                </div>

                {/* Student Personal Data metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg text-xs leading-relaxed border border-slate-100 print:bg-white print:border-none">
                  <div>
                    <span className="text-[10px] uppercase text-slate-401 font-mono font-medium block">Student ID</span>
                    <strong className="text-slate-800 font-mono">{compiledReport.student.id}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-401 font-mono font-medium block">Full Name</span>
                    <strong className="text-slate-800">{compiledReport.student.firstName} {compiledReport.student.lastName}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-401 font-mono font-medium block">Academic Class</span>
                    <strong className="text-slate-800">{compiledReport.student.class} ({compiledReport.student.section})</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-401 font-mono font-medium block">Report Term</span>
                    <strong className="text-slate-800 font-mono">{selectedTerm} ({selectedYear})</strong>
                  </div>
                </div>

                {/* Registered Subjects grades table */}
                <table className="w-full text-left border-collapse border border-slate-200 text-xs mt-6">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-800">
                      <th className="py-2 px-2 border border-slate-200 font-bold">Subject Course</th>
                      <th className="py-2 px-1 border border-slate-200 font-bold text-center">Class 50%</th>
                      <th className="py-2 px-1 border border-slate-200 font-bold text-center">Exams 50%</th>
                      <th className="py-2 px-1 border border-slate-200 font-bold text-center">Total 100%</th>
                      <th className="py-2 px-2 border border-slate-200 font-bold text-center">Remarks</th>
                      <th className="py-2 px-1 border border-slate-200 font-bold text-center">Rank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {compiledReport.grades.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-2 border border-slate-200 font-bold text-slate-900">{item.subject}</td>
                        <td className="py-2.5 px-1 border border-slate-200 text-center font-mono font-semibold">{item.classScore50}</td>
                        <td className="py-2.5 px-1 border border-slate-200 text-center font-mono font-semibold">{item.examScore50}</td>
                        <td className="py-2.5 px-1 border border-slate-200 text-center font-mono font-black text-rose-700 bg-rose-50/20">{item.totalScore}%</td>
                        <td className="py-2.5 px-2 border border-slate-200 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${item.gradeLevel === 'L1' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : item.gradeLevel === 'L2' ? 'bg-blue-50 text-blue-800' : item.gradeLevel === 'L3' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>
                            {item.remarks} ({item.gradeLevel})
                          </span>
                        </td>
                        <td className="py-2.5 px-1 border border-slate-200 text-center font-mono font-black text-indigo-700">{item.position ? `${item.position}` : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Report Card Aggregates Footer summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-slate-200 pt-5 text-xs text-center font-mono leading-relaxed">
                  <div>
                    <span className="text-slate-400 font-sans block text-[10px] uppercase">Subjects Graded</span>
                    <strong className="text-slate-800 text-sm">{compiledReport.totalSubjects} courses</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans block text-[10px] uppercase">Term Average Score</span>
                    <strong className="text-slate-800 text-sm italic">{compiledReport.averageScore}%</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans block text-[10px] uppercase">Attendance Present</span>
                    <strong className="text-slate-800 text-sm">Present</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans block text-[10px] uppercase">Grade Rating</span>
                    <strong className="text-slate-805 text-sm uppercase">GES Certified</strong>
                  </div>
                </div>

                {/* Remarks & Signatures desk */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-16 border-t border-slate-100 pt-6">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-410 uppercase font-bold">Principal Headteacher Remarks</span>
                    <p className="text-[11px] italic text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200/50 leading-relaxed min-h-[60px] print:bg-white print:border-none">
                      {compiledReport.averageScore >= 80 
                        ? 'Excellent performance! The student reflects high mastery level standards on the GES curriculum benchmarks.' 
                        : compiledReport.averageScore >= 68 
                        ? 'Satisfactory progress. Proficient level achieved across most cognitive subject domains.' 
                        : compiledReport.averageScore >= 54 
                        ? 'An average term result. Needs more dedication and revision in quantitative sciences.' 
                        : 'Underperforming benchmarks. Urgent tutoring is recommended to foster remediation.'}
                    </p>
                  </div>

                  <div className="flex flex-col justify-end items-end space-y-2 pr-6">
                    <div className="w-40 border-b border-slate-900 h-10"></div>
                    <span className="text-[10px] text-slate-500 font-serif">Signature of Headteacher</span>
                  </div>
                </div>

              </div>

              {/* Subject Comparison Chart on Right (no-print) */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-4 no-print sm:col-span-full md:col-span-1 lg:col-span-1">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <BarChart3 size={15} className={theme.accentText} />
                  Academic Profile Chart
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">Comparative distribution of subject totals out of 100%.</p>
                
                <div className="h-64 bg-white rounded-lg border border-slate-100 p-2">
                  <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
                    <BarChart data={compiledReport.grades} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="subject" tick={{ fontSize: 8 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Tooltip wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="totalScore" name="Total 100%" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}

          {/* Immersive Fullscreen Preview Mode for Report Card */}
          {reportCardPreviewMode && compiledReport && (
            <div 
              onClick={(e) => {
                if (e.target === e.currentTarget) setReportCardPreviewMode(false);
              }}
              className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-50 overflow-y-auto flex flex-col items-center py-6 px-4 no-scrollbar font-sans text-xs cursor-pointer"
            >
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl flex flex-col items-center cursor-default">
              
              {/* Immersive Preview Header Controls Bar (no-print) */}
              <div className="w-full max-w-4xl bg-white border border-slate-200 p-4 rounded-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 no-print">
                <div className="flex flex-wrap items-center gap-4 text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="font-bold text-slate-900 font-display">PRISTINE REPORT CARD PREVIEW</span>
                  </div>
                  
                  <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                    <span className="text-slate-500 font-medium">Target Student:</span>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 font-bold focus:outline-none text-slate-900"
                    >
                      {students.filter(s => s.class === selectedClass).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} ({s.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowPdfGuide(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white transition font-bold rounded-lg cursor-pointer active:translate-y-0.5 text-xs text-center"
                  >
                    <FileDown size={14} /> Save PDF
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white transition font-bold rounded-lg cursor-pointer active:translate-y-0.5 text-xs text-center shadow-md"
                  >
                    <Printer size={14} /> Direct Print
                  </button>

                  <button
                    type="button"
                    onClick={() => setReportCardPreviewMode(false)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100/90 text-slate-750 transition font-bold rounded-lg cursor-pointer active:translate-y-0.5 text-xs text-center bg-slate-50"
                  >
                    <EyeOff size={14} className="text-slate-500" /> Exit Preview
                  </button>
                </div>
              </div>

              {/* Full-Scale A4 Visual Report Card Sheet (Target of print template) */}
              <div className="w-full max-w-4xl bg-white p-12 md:p-16 shadow-2xl rounded-2xl border border-slate-200 font-sans leading-relaxed text-black/90 text-left">
                
                {/* Professional School Profile Header with Crest, Logo & Info */}
                <div className="flex flex-col sm:flex-row items-center justify-between border-b-2 border-slate-900 pb-5 mb-8 gap-4 font-sans text-left">
                  {DbController.getSchoolInfo().logoUrl ? (
                    <img 
                      src={DbController.getSchoolInfo().logoUrl} 
                      alt="School Logo" 
                      className="w-20 h-20 object-contain flex-shrink-0" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center border border-slate-300 p-1 flex-shrink-0">
                      <div className="w-full h-full rounded-full border border-dashed border-slate-400 bg-white flex flex-col items-center justify-center text-[8px] text-slate-500 font-mono font-bold leading-normal">
                        <Award size={24} className="text-indigo-600 mb-1" />
                        <span className="scale-75 origin-center uppercase">CREST</span>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 text-center space-y-0.5">
                    <h2 className="text-2xl font-black text-slate-950 tracking-tight leading-tight uppercase font-display">
                      {DbController.getSchoolInfo().name}
                    </h2>
                    <p className="text-xs italic font-serif text-slate-600">
                      Motto: "{DbController.getSchoolInfo().motto}"
                    </p>
                    <div className="text-[10px] text-slate-500 font-sans flex flex-wrap justify-center gap-x-3 gap-y-0.5 mt-0.5">
                      {DbController.getSchoolInfo().gpsAddress && <span>📍 {DbController.getSchoolInfo().gpsAddress}</span>}
                      {DbController.getSchoolInfo().telephone && <span>☎️ {DbController.getSchoolInfo().telephone}</span>}
                      {DbController.getSchoolInfo().email && <span>📧 {DbController.getSchoolInfo().email}</span>}
                    </div>
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-semibold flex justify-center gap-3">
                      {DbController.getSchoolInfo().emisCode && <span>EMIS: {DbController.getSchoolInfo().emisCode}</span>}
                      {DbController.getSchoolInfo().schoolNumber && <span>CODE: {DbController.getSchoolInfo().schoolNumber}</span>}
                    </div>
                    <p className="text-[10px] font-mono text-slate-800 font-bold uppercase tracking-wider bg-slate-100 px-3.5 py-0.5 rounded-full inline-block mt-2">
                      Official Student Progress Statement Card
                    </p>
                  </div>
                  <div className="w-16 h-16 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 p-1 flex-shrink-0 text-[7px] text-slate-400 font-mono text-center leading-normal select-none">
                    <div className="font-bold scale-90">PASSPORT</div>
                    <div className="scale-75">STAMP</div>
                  </div>
                </div>

                {/* Student Personal Data metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-xl text-xs leading-relaxed border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-mono font-medium block">Student ID</span>
                    <strong className="text-slate-800 font-mono text-sm">{compiledReport.student.id}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-mono font-medium block">Full Name</span>
                    <strong className="text-slate-800 text-sm">{compiledReport.student.firstName} {compiledReport.student.lastName}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-mono font-medium block">Academic Class</span>
                    <strong className="text-slate-800 text-sm">{compiledReport.student.class} ({compiledReport.student.section})</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-mono font-medium block">Report Term</span>
                    <strong className="text-slate-800 text-sm font-mono">{selectedTerm} ({selectedYear})</strong>
                  </div>
                </div>

                {/* Registered Subjects grades table */}
                <table className="w-full text-left border-collapse border border-slate-200 text-xs mt-8">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-800">
                      <th className="py-3 px-3 border border-slate-200 font-bold uppercase tracking-wider">Subject Course</th>
                      <th className="py-3 px-2 border border-slate-200 font-bold text-center uppercase tracking-wider">Class 50%</th>
                      <th className="py-3 px-2 border border-slate-200 font-bold text-center uppercase tracking-wider">Exams 50%</th>
                      <th className="py-3 px-2 border border-slate-200 font-bold text-center uppercase tracking-wider">Total 100%</th>
                      <th className="py-3 px-3 border border-slate-200 font-bold text-center uppercase tracking-wider">Remarks</th>
                      <th className="py-3 px-2 border border-slate-200 font-bold text-center uppercase tracking-wider">Rank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {compiledReport.grades.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/40">
                        <td className="py-3 px-3 border border-slate-200 font-black text-slate-900 text-sm">{item.subject}</td>
                        <td className="py-3 px-2 border border-slate-200 text-center font-mono font-bold text-slate-700 text-sm">{item.classScore50}</td>
                        <td className="py-3 px-2 border border-slate-200 text-center font-mono font-bold text-slate-700 text-sm">{item.examScore50}</td>
                        <td className="py-3 px-2 border border-slate-200 text-center font-mono font-black text-rose-700 bg-rose-50/10 text-sm">{item.totalScore}%</td>
                        <td className="py-3 px-3 border border-slate-200 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${item.gradeLevel === 'L1' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : item.gradeLevel === 'L2' ? 'bg-blue-50 text-blue-800 border border-blue-100' : item.gradeLevel === 'L3' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                            {item.remarks} ({item.gradeLevel})
                          </span>
                        </td>
                        <td className="py-3 px-2 border border-slate-200 text-center font-mono font-black text-indigo-700 text-sm">{item.position ? `${item.position}` : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Report Card Aggregates Footer summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 border-t border-slate-200 pt-6 text-xs text-center font-mono leading-relaxed">
                  <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                    <span className="text-slate-400 font-sans block text-[10px] uppercase font-semibold">Subjects Graded</span>
                    <strong className="text-slate-800 text-sm">{compiledReport.totalSubjects} courses</strong>
                  </div>
                  <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                    <span className="text-slate-400 font-sans block text-[10px] uppercase font-semibold">Term Average Score</span>
                    <strong className="text-slate-800 text-sm italic">{compiledReport.averageScore}%</strong>
                  </div>
                  <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                    <span className="text-slate-400 font-sans block text-[10px] uppercase font-semibold">Attendance Present</span>
                    <strong className="text-slate-800 text-sm font-sans">Present</strong>
                  </div>
                  <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                    <span className="text-slate-400 font-sans block text-[10px] uppercase font-semibold">Grade Rating</span>
                    <strong className="text-slate-800 text-sm uppercase">GES Certified</strong>
                  </div>
                </div>

                {/* Remarks & Signatures desk */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16 border-t border-slate-100 pt-8 text-xs">
                  <div className="space-y-2 text-left">
                    <span className="text-[10px] font-mono text-slate-500 uppercase font-black">Principal Headteacher Remarks</span>
                    <p className="text-[11px] italic text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200/50 leading-relaxed min-h-[70px] print:bg-white print:border-none">
                      {compiledReport.averageScore >= 80 
                        ? 'Excellent performance! The student reflects high mastery level standards on the GES curriculum benchmarks.' 
                        : compiledReport.averageScore >= 68 
                        ? 'Satisfactory progress. Proficient level achieved across most cognitive subject domains.' 
                        : compiledReport.averageScore >= 54 
                        ? 'An average term result. Needs more dedication and revision in quantitative sciences.' 
                        : 'Underperforming benchmarks. Urgent tutoring is recommended to foster remediation.'}
                    </p>
                  </div>

                  <div className="flex flex-col justify-end items-end space-y-2 pr-6">
                    <div className="w-52 border-b-2 border-slate-900 h-12"></div>
                    <span className="text-[10px] text-slate-500 font-serif font-semibold">Signature of Headteacher</span>
                  </div>
                </div>

              </div>

              {/* Quick print guideline inside full preview */}
              <div className="w-full max-w-4xl text-center py-4 bg-slate-850 rounded-xl mt-6 text-[11px] text-slate-300 flex items-center justify-center gap-1.5 no-print border border-slate-800">
                <AlertCircle size={14} className="text-amber-400" />
                <span>Clean and pristine print layout environment.</span>
              </div>

            </div>
          </div>
        )}

        </div>
      )}

      {/* SUBMODE C: CLASS BROADSHEET */}
      {subMode === 'Broadsheet' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-700 text-sm">
              📋 Horizontal Class Broad Sheet Summary
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Overview of cumulative scores across active subjects for {selectedClass} | term: {selectedTerm}</p>
          </div>

          <div className="overflow-x-auto">
            {broadsheetData.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <AlertCircle size={32} className="text-slate-300 mx-auto mb-2" />
                <span>No grades found in class. Write curriculum scores to establish the roster broadsheet.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[11px] min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3 font-bold text-center w-12">Rank</th>
                    <th className="py-2 px-2 font-bold w-48">Student Name</th>
                    {/* List Subjects */}
                    {SUBJECTS.slice(0, 5).map(sub => (
                      <th key={sub} className="py-2 px-1 font-semibold text-center truncate" text-align="center">{sub.substring(0, 10)}...</th>
                    ))}
                    <th className="py-2 px-2 font-bold text-center bg-slate-100">Subjects</th>
                    <th className="py-2 px-2 font-bold text-center bg-indigo-50">Avg Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {broadsheetData.map((row, index) => (
                    <tr key={row.student.id} className="hover:bg-slate-50/20">
                      <td className="py-2 px-3 text-center font-bold font-mono text-purple-700 bg-purple-50">{index + 1}</td>
                      <td className="py-2 px-2 font-semibold text-slate-800 font-sans">{row.student.firstName} {row.student.lastName}</td>
                      {SUBJECTS.slice(0, 5).map(sub => {
                        const score = row.subjectScores[sub];
                        return (
                          <td key={sub} className="py-2 px-1 text-center font-mono font-medium border-l border-slate-100">
                            {score !== undefined ? `${score}%` : <span className="text-slate-300">-</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center text-slate-500 font-mono bg-slate-50">{row.subjectsCount} graded</td>
                      <td className="py-2 px-2 text-center font-black bg-indigo-50 text-indigo-800 font-mono">{row.averageOverallScore}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUBMODE D: ANALYTICS */}
      {subMode === 'PerformanceAnalytics' && (
        <div className="space-y-6 no-print">
          
          {/* Real-time KPI Statistics Ribbons */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Subject Class Average</span>
                <strong className="text-xl font-black text-slate-900 tracking-tight font-mono">
                  {classPerformanceDetails.avgScore}%
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">Updated on-the-fly</span>
              </div>
              <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-sans text-sm">
                📊
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Subject Pass Rate</span>
                <strong className="text-xl font-black text-slate-900 tracking-tight font-mono">
                  {classPerformanceDetails.passRate}%
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">Threshold Score ≥ 50%</span>
              </div>
              <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center font-sans text-sm animate-pulse">
                🎯
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Maximum / Minimum</span>
                <strong className="text-xs font-black text-slate-900 tracking-tight font-mono block">
                  MAX {classPerformanceDetails.highestScore}% / MIN {classPerformanceDetails.lowestScore}%
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">Student extreme outputs</span>
              </div>
              <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center font-sans text-sm">
                ⭐
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Graded Registry Pool</span>
                <strong className="text-xl font-black text-slate-900 tracking-tight font-mono">
                  {classPerformanceDetails.gradedCount} Students
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">Selected Class size</span>
              </div>
              <div className="w-9 h-9 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center font-sans text-sm">
                👥
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Chart Area */}
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                📊 Class Mastery Performance Distribution
              </h3>
              <p className="text-[10px] text-slate-400">Aggregated student counts grouped by GES cognitive performance levels (L1 - L5) for {selectedSubject}.</p>
              
              <div className="h-64 font-sans text-[10px]">
                <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
                  <BarChart data={gradeLevelsStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="value" name="Total Students" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GES Guidelines Map */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
              <h4 className="font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="text-amber-500" size={15} /> GES New Curriculum Guidelines
              </h4>
              <div className="space-y-2.5 text-[11px] leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded font-mono">L1</span>
                  <div>
                    <strong>Highly Proficient (80% - 100%)</strong>
                    <p className="text-[10px] text-slate-500">Student exceeds current expectations on all learning units.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded font-mono">L2</span>
                  <div>
                    <strong>Proficient (68% - 79%)</strong>
                    <p className="text-[10px] text-slate-500">Student understands curriculum concepts and performs well.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded font-mono">L3</span>
                  <div>
                    <strong>Approaching Proficiency (54% - 67%)</strong>
                    <p className="text-[10px] text-slate-500">Basic mastery levels achieved. Needs moderate remediation.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded font-mono">L4</span>
                  <div>
                    <strong>Developing (40% - 53%)</strong>
                    <p className="text-[10px] text-slate-500">Concept grasp is fragile. Progress and guidance required.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded font-mono">L5</span>
                  <div>
                    <strong>Emerging (0% - 39%)</strong>
                    <p className="text-[10px] text-slate-500">Critical struggle in outcomes. Strong tutoring required.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Academic Remediation & Intervention Tracker */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <AlertCircle className="text-rose-500" size={15} /> Academic Intervention Alert Center
                </h3>
                <span className="font-mono bg-rose-55 rounded px-2 py-0.5 text-[10.5px] font-bold text-rose-700">
                  {remediationAlerts.length} Flagged
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Immediate custom cognitive recovery actions recommended for students currently scoring below 54% (GES L4/L5 levels).
              </p>

              {remediationAlerts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-150">
                  🎉 Outstanding! Zero students require remediation in this subject cohort.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto pr-1">
                  {remediationAlerts.map(({ student, score, gradeLevel, actionPlan }, idx) => (
                    <div key={idx} className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-slate-700">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900 font-bold text-xs">
                            {student ? `${student.firstName} ${student.lastName}` : "Unknown Student"}
                          </strong>
                          <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${gradeLevel === 'L5' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'}`}>
                            {gradeLevel}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100/50 leading-relaxed">
                          {actionPlan}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 self-center">
                        <span className="text-xs font-black text-rose-605 block">{score}%</span>
                        <span className="text-[9px] text-slate-400 font-mono block">Score</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Performance Honour Roll */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Award className="text-amber-500" size={15} /> Academic Honors list (Honour Roll)
                </h3>
                <span className="font-mono bg-emerald-50 rounded px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                  {academicHonorsList.length} High Achievers
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                These students have achieved outstanding cognitive outcome masteries (scores of 80% or greater / Level L1).
              </p>

              {academicHonorsList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-150">
                  Keep working! No student achieves 80% score threshold in this worksheet yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto pr-1">
                  {academicHonorsList.map(({ student, score }, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-slate-700 border-b border-dashed border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-amber-100 text-amber-805 font-black rounded-full text-[10px] flex items-center justify-center select-none font-mono">
                          {idx + 1}
                        </div>
                        <div>
                          <strong className="text-slate-950 font-bold block">
                            {student ? `${student.firstName} ${student.lastName}` : "Unknown Student"}
                          </strong>
                          <span className="text-[8px] text-slate-400 font-sans block uppercase">GES Cognitive Stars Guild</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-600 block">{score}%</span>
                        <span className="text-[9px] text-slate-400 block font-mono">Level L1</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

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
                Your browser blocks direct print triggers from inside the preview iframe. To print this report card, please click the <strong className="text-slate-800 font-bold">"Open in a new tab" ↗</strong> button at the top right of the application workspace first.
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

      {/* COMPREHENSIVE FLOATING PRINT & EXPORT PORTAL */}
      {showPdfGuide && (
        <>
          {/* Always Render Print/PDF Target templates in a stable offscreen environment for jsPDF canvas engine */}
          <div className="fixed left-[-9999px] top-[-9999px] pointer-events-none z-[-100] no-print select-none opacity-0 bg-white" aria-hidden="true">
            {/* Target A: Portrait Report Card Template */}
            <div id="assessment-report-preview-portrait" className="w-[800px] bg-white p-12 text-black border-[8px] border-double border-slate-900 space-y-6 font-sans">
              {/* Professional Letterhead */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-5 gap-4">
                {DbController.getSchoolInfo().logoUrl ? (
                  <img 
                    src={DbController.getSchoolInfo().logoUrl} 
                    alt="School Logo" 
                    className="w-20 h-20 object-contain" 
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center border border-slate-300 p-1">
                    <div className="w-full h-full rounded-full border border-dashed border-slate-400 bg-white flex flex-col items-center justify-center text-[8px] text-slate-500 font-mono font-bold leading-none">
                      <Award size={24} className="text-indigo-600 mb-0.5" />
                      <span className="scale-75 origin-center uppercase">CREST</span>
                    </div>
                  </div>
                )}
                <div className="flex-1 text-center space-y-1">
                  <h2 className="text-xl font-black text-slate-950 tracking-tight leading-tight uppercase font-display">
                    {DbController.getSchoolInfo().name}
                  </h2>
                  <p className="text-xs italic font-serif text-slate-600">
                    Motto: "{DbController.getSchoolInfo().motto}"
                  </p>
                  <div className="text-[10px] text-slate-500 flex flex-wrap justify-center gap-x-3 gap-y-0.5">
                    {DbController.getSchoolInfo().gpsAddress && <span>📍 {DbController.getSchoolInfo().gpsAddress}</span>}
                    {DbController.getSchoolInfo().telephone && <span>☎️ {DbController.getSchoolInfo().telephone}</span>}
                    {DbController.getSchoolInfo().email && <span>📧 {DbController.getSchoolInfo().email}</span>}
                  </div>
                  <div className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-bold flex justify-center gap-3">
                    {DbController.getSchoolInfo().emisCode && <span>EMIS ID: {DbController.getSchoolInfo().emisCode}</span>}
                    {DbController.getSchoolInfo().schoolNumber && <span>SCHOOL NO: {DbController.getSchoolInfo().schoolNumber}</span>}
                  </div>
                </div>
                <div className="w-16 h-16 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 p-1 text-[7px] text-slate-400 font-mono text-center leading-normal">
                  <div className="font-bold scale-90">PASSPORT</div>
                  <div className="scale-75">STAMP</div>
                </div>
              </div>

              {/* Student Personal Data block */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 grid grid-cols-2 gap-3 leading-relaxed">
                <div><span className="text-[9px] text-slate-400 uppercase font-sans font-medium block">Student ID Number</span><strong>{compiledReport?.student.id || 'N/A'}</strong></div>
                <div><span className="text-[9px] text-slate-400 uppercase font-sans font-medium block">Full Legal Name</span><strong>{compiledReport ? `${compiledReport.student.firstName} ${compiledReport.student.lastName}` : 'Not Selected'}</strong></div>
                <div><span className="text-[9px] text-slate-400 uppercase font-sans font-medium block">Academic Class</span><strong>{compiledReport?.student.class || selectedClass} ({compiledReport?.student.section || 'N/A'})</strong></div>
                <div><span className="text-[9px] text-slate-400 uppercase font-sans font-medium block">Report Term & Year</span><strong>{selectedTerm} ({selectedYear})</strong></div>
              </div>

              <h3 className="text-sm font-black uppercase text-center tracking-wide py-1.5 bg-slate-100 text-slate-900 border-y border-slate-200">
                Official Student Progress Terminal Statement Card
              </h3>

              {/* Registered Subjects grades table */}
              <table className="w-full text-left text-xs border-collapse border border-slate-300 leading-normal font-sans">
                <thead>
                  <tr className="bg-slate-100 font-bold border-b-2 border-slate-900 text-slate-900 uppercase">
                    <th className="p-2 border border-slate-300">Subject Course Courseware</th>
                    <th className="p-2 border border-slate-300 text-center">Class Score (50%)</th>
                    <th className="p-2 border border-slate-300 text-center">Exam Score (50%)</th>
                    <th className="p-2 border border-slate-300 text-center">Total Cumulative (100)</th>
                    <th className="p-2 border border-slate-300 text-center">NTC Remarks & Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {!compiledReport || compiledReport.grades.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400 italic font-medium">No assessment summaries found to render.</td>
                    </tr>
                  ) : (
                    compiledReport.grades.map(g => (
                      <tr key={g.subject} className="border-b border-slate-200">
                        <td className="p-2.5 border border-slate-200 font-bold text-slate-950">{g.subject}</td>
                        <td className="p-2.5 border border-slate-200 text-center font-mono font-medium text-slate-700">{g.classScore50.toFixed(1)}</td>
                        <td className="p-2.5 border border-slate-200 text-center font-mono font-medium text-slate-700">{g.examScore50.toFixed(1)}</td>
                        <td className="p-2.5 border border-slate-200 text-center font-mono font-black text-rose-700 bg-rose-50/10">{g.totalScore.toFixed(1)}%</td>
                        <td className="p-2.5 border border-slate-200 text-center font-semibold text-slate-800">
                          {g.remarks} ({g.gradeLevel})
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Summary blocks */}
              {compiledReport && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Courses</span>
                    <strong className="text-sm text-slate-800">{compiledReport.totalSubjects} graded</strong>
                  </div>
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Average Score</span>
                    <strong className="text-sm text-indigo-700">{compiledReport.averageScore.toFixed(1)}%</strong>
                  </div>
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Grade Rating</span>
                    <strong className="text-sm text-emerald-800 uppercase">GES Standard</strong>
                  </div>
                </div>
              )}

              {/* Signature block */}
              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200 mt-6 font-sans">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Headteacher Remarks</span>
                  <p className="text-xs italic text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed border border-slate-150">
                    {compiledReport && compiledReport.averageScore >= 80 
                      ? 'Excellent performance! Reflected mastery on GES curriculum.' 
                      : compiledReport && compiledReport.averageScore >= 68 
                      ? 'Satisfactory progress. Proficient level achieved.' 
                      : 'Satisfactory performance. Continual tutoring encouraged.'}
                  </p>
                </div>
                <div className="flex flex-col justify-end items-end space-y-1.5 pr-4">
                  <div className="w-40 border-b border-slate-900 h-10"></div>
                  <span className="text-[10px] text-slate-400 uppercase block font-medium">Headteacher Signature</span>
                </div>
              </div>
            </div>

            {/* Target B: Landscape Cumulative Broadsheet / Ledger Template */}
            <div id="assessment-roster-preview-landscape" className="w-[1100px] bg-white p-12 text-black border-[8px] border-double border-slate-900 space-y-6 font-sans">
              {/* Professional Letterhead */}
              <div className="flex items-center justify-between border-b pb-4 gap-4 leading-normal">
                {DbController.getSchoolInfo().logoUrl ? (
                  <img 
                    src={DbController.getSchoolInfo().logoUrl} 
                    alt="School Logo" 
                    className="w-20 h-20 object-contain" 
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center border border-slate-300 p-1 flex-shrink-0">
                    <div className="w-full h-full rounded-full border border-dashed border-slate-400 bg-white flex flex-col items-center justify-center text-[7px] text-slate-500 font-mono font-bold leading-none">
                      <Award size={22} className="text-indigo-600 mb-0.5" />
                      <span className="scale-75 origin-center uppercase">CREST</span>
                    </div>
                  </div>
                )}
                <div className="flex-1 text-center space-y-1">
                  <h2 className="text-xl font-black text-slate-950 tracking-tight leading-tight uppercase font-display">
                    {DbController.getSchoolInfo().name}
                  </h2>
                  <p className="text-xs italic font-serif text-slate-600">
                    Motto: "{DbController.getSchoolInfo().motto}"
                  </p>
                  <div className="text-[10px] text-slate-500 flex flex-wrap justify-center gap-x-3 gap-y-0.5">
                    {DbController.getSchoolInfo().gpsAddress && <span>📍 {DbController.getSchoolInfo().gpsAddress}</span>}
                    {DbController.getSchoolInfo().telephone && <span>☎️ {DbController.getSchoolInfo().telephone}</span>}
                    {DbController.getSchoolInfo().email && <span>📧 {DbController.getSchoolInfo().email}</span>}
                  </div>
                </div>
                <div className="w-24 h-12 text-[8px] text-slate-400 border border-slate-300 bg-slate-50 rounded flex flex-col items-center justify-center font-mono font-bold select-none text-center leading-normal">
                  OFFICIAL
                  <span>REGISTRY RECORD</span>
                </div>
              </div>

              {/* parameters */}
              <div className="flex justify-between items-center text-xs bg-slate-50 px-4 py-2.5 rounded border border-slate-200 font-mono text-slate-800">
                <div><strong>OFFICIAL REGISTRY LEDGER:</strong> {subMode === 'Broadsheet' ? 'Official Academic Broadsheet Ledger' : `Subject Marks Ledger Worksheet - ${selectedSubject}`}</div>
                <div><strong>CLASS:</strong> {selectedClass} | <strong>ACADEMIC TERM:</strong> {selectedTerm} ({selectedYear})</div>
              </div>

              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-900 uppercase font-black">
                    {subMode === 'Broadsheet' ? (
                      <>
                        <th className="py-2.5 px-3 border border-slate-300">Registered Student Full Name</th>
                        <th className="py-2.5 px-3 border border-slate-300 text-center">Courses Graded</th>
                        <th className="py-2.5 px-3 border border-slate-300 text-center font-bold">Terminal Score Average Mean %</th>
                        <th className="py-2.5 px-3 border border-slate-300 text-center">Official Standings Rank</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-3 border border-slate-300">Registered Student Full Name</th>
                        <th className="py-2.5 px-3 border border-slate-300 text-center">Class score marks (50%)</th>
                        <th className="py-2.5 px-3 border border-slate-350 text-center">Exam score marks (50%)</th>
                        <th className="py-2.5 px-3 border border-slate-300 text-center font-bold">Overall total score (100)</th>
                        <th className="py-2.5 px-3 border border-slate-350 text-center">Qualified Letter Grade Remarks</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {subMode === 'Broadsheet' ? (
                    broadsheetData.map((row, idx) => (
                      <tr key={row.student.id} className="border-b border-slate-200 hover:bg-slate-50/40">
                        <td className="py-2 px-3 border border-slate-200 font-bold text-slate-950">{row.student.firstName} {row.student.lastName} ({row.student.id})</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-medium">{row.subjectsCount} registered courses</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-mono font-black text-indigo-700">{row.averageOverallScore.toFixed(1)}%</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-mono font-semibold">Rank Standings #{idx + 1}</td>
                      </tr>
                    ))
                  ) : (
                    activeWorksheet.map(row => (
                      <tr key={row.studentId} className="border-b border-slate-200 hover:bg-slate-50/40">
                        <td className="py-2 px-3 border border-slate-200 font-bold text-slate-950">{row.studentName} ({row.studentId})</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-mono text-slate-705">{row.classScore50.toFixed(1)}</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-mono text-slate-705">{row.examScore50.toFixed(1)}</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-mono font-black text-rose-700 bg-rose-50/10">{row.totalScore.toFixed(1)}%</td>
                        <td className="py-2 px-3 border border-slate-200 text-center font-semibold text-slate-800">{row.remarks} ({row.gradeLevel})</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="flex justify-between items-end pt-5 border-t border-slate-200 mt-5 text-[10px]">
                <div className="text-slate-400 font-mono uppercase tracking-wide">
                  SYSTEM STATUS: DATA PERSISTED & BACKED UP ON CLOUD FIRESTORE | DATE GENERATED: {new Date().toLocaleDateString()}
                </div>
                <div className="flex flex-col items-center space-y-2 pr-4">
                  <div className="w-44 border-b-2 border-slate-900 h-10"></div>
                  <span className="text-slate-400 uppercase font-mono tracking-wider font-semibold">Registry Certified seal / stamp line</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating UI Controller Window */}
          <div className={`fixed bottom-6 right-6 z-40 no-print flex flex-col bg-white rounded-2xl border border-slate-300 shadow-2xl transition-all duration-300 ${pdfFloatingMinimized ? 'w-80 h-14' : showPreviewPane ? 'w-full max-w-5xl h-[80vh] md:h-[620px]' : 'w-96 md:w-[440px] h-auto max-h-[85vh]'} overflow-hidden`}>
            
            {/* Header / Window Manager controls */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between cursor-move select-none flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <span className="font-bold text-xs font-display tracking-widest uppercase">Print & Export Center</span>
              </div>
              
              <div className="flex items-center gap-3">
                {!pdfFloatingMinimized && (
                  <button
                    onClick={() => setShowPreviewPane(!showPreviewPane)}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 font-bold px-2 py-1 rounded transition text-indigo-300 active:scale-95"
                    title={showPreviewPane ? "Collapse visual preview pane" : "Expand visual preview pane side-by-side"}
                  >
                    {showPreviewPane ? "Collapse Prev" : "Expand Preview 👁️"}
                  </button>
                )}

                <button
                  onClick={() => setPdfFloatingMinimized(!pdfFloatingMinimized)}
                  className="hover:text-slate-300 font-bold font-mono text-xs transition px-1.5 py-0.5 bg-slate-800 rounded text-indigo-300"
                  title={pdfFloatingMinimized ? "Restore to window" : "Minimize panel to corner pill"}
                >
                  {pdfFloatingMinimized ? "⬜ Expand" : "— Min"}
                </button>

                <button
                  onClick={() => {
                    setShowPdfGuide(false);
                    setPdfFloatingMinimized(false);
                  }}
                  className="hover:text-rose-400 font-bold font-mono text-sm leading-none transition"
                  title="Close Export Hub"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Core Window Contents (Dual Pane if previewPane is active, otherwise Single Pane) */}
            {pdfFloatingMinimized ? (
              // Empty minified pill layout handled in main wrapper styles, just keep it clean
              <div className="hidden"></div>
            ) : (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
                
                {/* Dual Pane Option -> Left Pane: Document Live Preview Mini clone */}
                {showPreviewPane && (
                  <div className="flex-1 p-6 overflow-y-auto bg-slate-700 flex flex-col justify-center items-center space-y-4">
                    <span className="text-white text-xs font-mono tracking-widest uppercase opacity-75">Document Layout Preview (A4 Scaled Draft)</span>
                    
                    {subMode === 'IndividualReport' ? (
                      /* Individual Portrait Student Report Card Visual Preview Clone */
                      <div className="w-[310px] aspect-[1/1.414] bg-white p-4 text-black border-2 border-double border-slate-800 shadow-2xl text-[6px] space-y-2 font-sans select-none overflow-y-auto rounded-none">
                        <div className="text-center border-b pb-1 mb-1 leading-normal">
                          <h3 className="text-[8px] font-black uppercase text-stone-900">{DbController.getSchoolInfo().name}</h3>
                          <p className="text-[6px] italic text-stone-600">"{DbController.getSchoolInfo().motto}"</p>
                          <p className="text-[6.5px] font-mono text-slate-800 font-black tracking-wider uppercase bg-slate-100 px-2 rounded-full inline-block mt-0.5">PROGRESS REPORT CARD</p>
                        </div>

                        <div className="bg-slate-50 p-1.5 rounded border border-slate-200 text-[6px] font-mono text-stone-800 grid grid-cols-2 gap-1 leading-normal">
                          <div><strong>ID:</strong> {compiledReport?.student.id || 'N/A'}</div>
                          <div><strong>STUDENT:</strong> {compiledReport ? `${compiledReport.student.firstName} ${compiledReport.student.lastName}` : 'Not Selected'}</div>
                          <div><strong>CLASS:</strong> {compiledReport?.student.class || selectedClass}</div>
                          <div><strong>TERM:</strong> {selectedTerm}</div>
                        </div>

                        <table className="w-full text-left text-[5.5px] border-collapse border border-slate-300 leading-normal">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-800 font-bold uppercase">
                              <th className="p-0.5 border border-slate-300">Course info</th>
                              <th className="p-0.5 border border-slate-300 text-center">Class (50)</th>
                              <th className="p-0.5 border border-slate-300 text-center">Exams (50)</th>
                              <th className="p-0.5 border border-slate-300 text-center font-bold">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {!compiledReport || compiledReport.grades.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-2 text-center text-slate-400 italic">No grade items to display.</td>
                              </tr>
                            ) : (
                              compiledReport.grades.slice(0, 5).map(g => (
                                <tr key={g.subject} className="border-b border-slate-150">
                                  <td className="p-0.5 border border-slate-150 font-bold">{g.subject}</td>
                                  <td className="p-0.5 border border-slate-150 text-center font-mono">{g.classScore50.toFixed(1)}</td>
                                  <td className="p-0.5 border border-slate-150 text-center font-mono">{g.examScore50.toFixed(1)}</td>
                                  <td className="p-0.5 border border-slate-150 text-center font-mono font-bold text-slate-900">{g.totalScore.toFixed(1)}%</td>
                                </tr>
                              ))
                            )}
                            {compiledReport && compiledReport.grades.length > 5 && (
                              <tr>
                                <td colSpan={4} className="p-0.5 text-center bg-slate-50 text-[5px] text-slate-400 italic">... of total {compiledReport.grades.length} courses compiled and printed inside high-res PDF output ...</td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                        {compiledReport && (
                          <div className="bg-indigo-50/50 p-1 rounded border border-indigo-100 text-center text-[5.5px] font-mono leading-relaxed text-indigo-950 font-bold flex justify-around">
                            <span>Courses Graded: {compiledReport.totalSubjects}</span>
                            <span>Average Term Grade: {compiledReport.averageScore.toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Broadsheet Roster Landscape Visual Preview Clone */
                      <div className="w-[370px] aspect-[1.414/1] bg-white p-4 text-black border-2 border-double border-slate-800 shadow-2xl text-[5.5px] space-y-2 font-sans select-none overflow-y-auto rounded-none">
                        <div className="text-center border-b pb-1 mb-1 leading-normal">
                          <h3 className="text-[7.5px] font-black uppercase text-stone-900">{DbController.getSchoolInfo().name}</h3>
                          <p className="text-[5.5px] font-mono mt-0.5 italic text-slate-600 bg-slate-100 rounded px-2 inline-block">
                            {subMode === 'Broadsheet' ? 'Cumulative Academy Broadsheet' : `Subject Marks Spreadsheet - ${selectedSubject}`}
                          </p>
                        </div>

                        <div className="text-[5px] font-mono bg-slate-50 p-1 rounded border border-slate-200 leading-normal flex justify-between">
                          <span>CLASS: {selectedClass}</span>
                          <span>TERM: {selectedTerm} ({selectedYear})</span>
                        </div>

                        <table className="w-full text-left border-collapse text-[5px] leading-normal font-sans">
                          <thead>
                            <tr className="bg-slate-105 border-b border-slate-800 font-bold uppercase cursor-default">
                              <th className="py-0.5 px-1 border border-slate-300">Student Name</th>
                              <th className="py-0.5 px-1 border border-slate-300 text-center">{subMode === 'Broadsheet' ? 'Term Average' : 'Overall Mark'}</th>
                              <th className="py-0.5 px-1 border border-slate-300 text-center">Standings</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subMode === 'Broadsheet' ? (
                              broadsheetData.slice(0, 4).map((row, idx) => (
                                <tr key={row.student.id} className="border-b border-slate-150">
                                  <td className="py-0.5 px-1 border border-slate-150 font-bold">{row.student.firstName} {row.student.lastName}</td>
                                  <td className="py-0.5 px-1 border border-slate-150 text-center font-mono text-indigo-700 font-bold">{row.averageOverallScore.toFixed(1)}%</td>
                                  <td className="py-0.5 px-1 border border-slate-150 text-center font-mono">Rank #{idx + 1}</td>
                                </tr>
                              ))
                            ) : (
                              activeWorksheet.slice(0, 4).map(row => (
                                <tr key={row.studentId} className="border-b border-slate-150">
                                  <td className="py-0.5 px-1 border border-slate-150 font-bold">{row.studentName}</td>
                                  <td className="py-0.5 px-1 border border-slate-150 text-center font-mono font-bold">{row.totalScore.toFixed(1)}</td>
                                  <td className="py-0.5 px-1 border border-slate-150 text-center font-mono">{row.remarks}</td>
                                </tr>
                              ))
                            )}
                            <tr>
                              <td colSpan={3} className="text-center py-0.5 bg-slate-50 text-[4.5px] text-indigo-600 font-mono italic">
                                ... continuous class register printed inside high-fidelity PDF output ...
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                    
                    <span className="text-[9px] text-slate-300 font-mono tracking-wide">
                      Miniature Draft Preview (Changes update instantly)
                    </span>
                  </div>
                )}

                {/* Right Pane: Controls and manual configurations */}
                <div className="w-full md:w-[400px] p-5 bg-white flex flex-col justify-between overflow-y-auto max-h-[80vh] md:max-h-[560px]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 flex-shrink-0 animate-pulse">
                        <FileDown size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-950">Save PDF & Print Controller</h4>
                        <p className="text-[10px] text-slate-400">Review assessment sheet print parameters</p>
                      </div>
                    </div>

                    {/* Student Select dropdown right inside print dialogue for better inputs! */}
                    {subMode === 'IndividualReport' && (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 space-y-1.5 no-print">
                        <label className="text-[10px] text-slate-550 uppercase font-black block font-sans">Switch Target Student inside controller:</label>
                        <select
                          value={selectedStudentId}
                          onChange={(e) => setSelectedStudentId(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 border border-slate-300 bg-white rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {students.filter(s => s.class === selectedClass).map(s => (
                            <option key={s.id} value={s.id}>
                              {s.firstName} {s.lastName} ({s.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <GoogleDriveExportControl 
                      elementId={subMode === 'IndividualReport' ? 'assessment-report-preview-portrait' : 'assessment-roster-preview-landscape'} 
                      defaultFilename={
                        subMode === 'IndividualReport' 
                          ? `${compiledReport ? `${compiledReport.student.firstName}_${compiledReport.student.lastName}` : 'Student'}_Report_Card.pdf`
                          : subMode === 'Broadsheet' 
                          ? `${selectedClass.replace(/\s+/g, '_')}_Broadsheet_Term_${selectedTerm}.pdf`
                          : `${selectedClass.replace(/\s+/g, '_')}_${selectedSubject.replace(/\s+/g, '_')}_Gradesheet_Term_${selectedTerm}.pdf`
                      }
                      isLandscape={subMode !== 'IndividualReport'} 
                    />

                    <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl space-y-1 text-teal-800 text-[10px] leading-relaxed">
                      <span className="font-bold">💡 Recommended Orientation Checklist:</span>
                      <p className="text-[9.5px] text-teal-705">
                        {subMode === 'IndividualReport' 
                          ? 'Vertical Report Cards are optimized for Portrait layout options.' 
                          : 'Large broadsheets are best formatted with Landscape layout options to fit columns elegantly.'}
                      </p>
                    </div>

                    <div className="space-y-2 text-[10px] text-slate-700 font-sans font-semibold border-t border-slate-100 pt-3">
                      <span className="font-bold text-slate-900 border-b border-slate-100 pb-1 block">How to Export to PDF Checklist:</span>
                      
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <div className="font-bold text-[9px] text-slate-600 bg-slate-100 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                          <p className="leading-relaxed text-slate-500">
                            Click <strong className="text-indigo-600 font-bold">Trigger Print Engine</strong> below to load browser settings.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="font-bold text-[9px] text-slate-600 bg-slate-100 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                          <p className="leading-relaxed text-slate-500">
                            Under Destination setting, choose <strong className="text-slate-900 font-bold">Save as PDF</strong> as your target.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="font-bold text-[9px] text-slate-600 bg-slate-100 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                          <p className="leading-relaxed text-slate-500 font-sans">
                            Ensure Layout is optioned as <strong className="text-indigo-600 font-bold">{subMode === 'IndividualReport' ? 'Portrait' : 'Landscape'}</strong>, format A4, select <strong>Background graphics</strong>, and disable headers/footers in options.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-150/60 text-[9px] text-amber-800 leading-normal">
                      <strong>💡 Sandbox Hint:</strong> If direct print is blocked by Chrome sandbox, click <strong className="font-bold">"Open in a new tab" ↗</strong> key at top, then trigger print safely.
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-4 font-sans">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPdfGuide(false);
                        setPdfFloatingMinimized(false);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer transition active:scale-95"
                    >
                      Close Window
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handlePrint();
                      }}
                      className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black shadow-md cursor-pointer transition text-center flex items-center justify-center gap-1.5 active:translate-y-0.5"
                    >
                      <Printer size={13} /> Trigger Print Engine
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
