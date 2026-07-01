import { useState, useMemo } from 'react';
import { DbController } from '../db';
import { ClassType, Student } from '../types';
import { ThemeStyles } from './ThemeWrapper';
import { 
  Users, 
  Search, 
  TrendingDown, 
  Filter, 
  ArrowUpDown, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles,
  CalendarDays,
  Activity,
  FileDown
} from 'lucide-react';

interface Props {
  selectedClass: ClassType;
  selectedDate: string;
  theme: ThemeStyles;
}

export default function AttendanceSummaryView({ selectedClass, selectedDate, theme }: Props) {
  // State variables for interactive controls
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly'>('weekly');
  const [genderFilter, setGenderFilter] = useState<'All' | 'Male' | 'Female'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyAbsentees, setShowOnlyAbsentees] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'percentage-asc' | 'percentage-desc'>('percentage-asc');

  // 1. Calculate timeframe boundaries based on selectedDate
  const timeframeLabel = useMemo(() => {
    if (!selectedDate) return '';
    const date = new Date(selectedDate);
    if (isNaN(date.getTime())) return '';

    if (timeframe === 'weekly') {
      // Determine the Monday of the week containing selectedDate
      const day = date.getDay(); // 0 is Sunday, 1 is Monday, etc.
      const diffToMonday = date.getDate() - (day === 0 ? 6 : day - 1);
      const monday = new Date(date);
      monday.setDate(diffToMonday);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const formatOption: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      return `Week of ${monday.toLocaleDateString('en-US', formatOption)} – ${sunday.toLocaleDateString('en-US', formatOption)}`;
    } else {
      // Monthly
      const formatOption: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
      return `Month of ${date.toLocaleDateString('en-US', formatOption)}`;
    }
  }, [selectedDate, timeframe]);

  // Helper to determine if a date falls within our selected timeframe
  const isInTimeframe = useMemo(() => {
    return (recordDateStr: string) => {
      if (!selectedDate || !recordDateStr) return false;
      
      if (timeframe === 'weekly') {
        const date = new Date(selectedDate);
        const recordDate = new Date(recordDateStr);
        if (isNaN(date.getTime()) || isNaN(recordDate.getTime())) return false;

        const day = date.getDay();
        const diffToMonday = date.getDate() - (day === 0 ? 6 : day - 1);
        const monday = new Date(date);
        monday.setDate(diffToMonday);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        return recordDate >= monday && recordDate <= sunday;
      } else {
        // Match year and month e.g., "2026-06"
        const [selYear, selMonth] = selectedDate.split('-');
        const [recYear, recMonth] = recordDateStr.split('-');
        return selYear === recYear && selMonth === recMonth;
      }
    };
  }, [selectedDate, timeframe]);

  // 2. Fetch students and attendance records
  const students = useMemo(() => {
    const allStudents = DbController.getStudents() || [];
    return allStudents.filter(s => s.class === selectedClass);
  }, [selectedClass]);

  const allAttendanceRecords = useMemo(() => {
    return DbController.getAllAttendance() || [];
  }, [selectedClass, selectedDate]);

  // 3. Compile aggregate metrics for each student
  const studentMetrics = useMemo(() => {
    return students.map(student => {
      // Filter records for this student and within the timeframe
      const studentRecords = allAttendanceRecords.filter(
        r => r.studentId === student.id && isInTimeframe(r.date)
      );

      const present = studentRecords.filter(r => r.status === 'Present').length;
      const absent = studentRecords.filter(r => r.status === 'Absent').length;
      const holiday = studentRecords.filter(r => r.status === 'Holiday').length;
      const unmarked = studentRecords.filter(r => r.status === 'Unmarked').length;
      const totalTracked = present + absent;

      const percentage = totalTracked > 0 
        ? Math.round((present / totalTracked) * 100) 
        : null; // null if no classes held

      return {
        student,
        present,
        absent,
        holiday,
        unmarked,
        totalTracked,
        percentage
      };
    });
  }, [students, allAttendanceRecords, isInTimeframe]);

  // 4. Calculate overall class and gender metrics
  const summaryStats = useMemo(() => {
    const boys = studentMetrics.filter(m => m.student.gender === 'Male');
    const girls = studentMetrics.filter(m => m.student.gender === 'Female');

    const getAverageRate = (subset: typeof studentMetrics) => {
      let totalPresent = 0;
      let totalSchoolDays = 0;
      
      subset.forEach(m => {
        totalPresent += m.present;
        totalSchoolDays += m.totalTracked;
      });

      return totalSchoolDays > 0 
        ? Math.round((totalPresent / totalSchoolDays) * 100) 
        : null;
    };

    const overallRate = getAverageRate(studentMetrics);
    const boysRate = getAverageRate(boys);
    const girlsRate = getAverageRate(girls);

    const frequentAbsentees = studentMetrics.filter(m => {
      if (m.percentage === null) return false;
      return m.percentage < 90;
    }).length;

    return {
      totalBoys: boys.length,
      totalGirls: girls.length,
      overallRate,
      boysRate,
      girlsRate,
      frequentAbsentees
    };
  }, [studentMetrics]);

  // 5. Apply filters (gender, search, absentee toggle) and sort the student list
  const filteredAndSortedMetrics = useMemo(() => {
    let list = [...studentMetrics];

    // Gender Filter
    if (genderFilter !== 'All') {
      list = list.filter(m => m.student.gender === genderFilter);
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(m => {
        const fullName = `${m.student.firstName} ${m.student.middleName || ''} ${m.student.lastName}`.toLowerCase();
        return fullName.includes(q) || m.student.id.toLowerCase().includes(q);
      });
    }

    // Show Only Absentees Toggle (< 90%)
    if (showOnlyAbsentees) {
      list = list.filter(m => m.percentage !== null && m.percentage < 90);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = `${a.student.lastName} ${a.student.firstName}`.toLowerCase();
        const nameB = `${b.student.lastName} ${b.student.firstName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'percentage-asc') {
        const pctA = a.percentage ?? 101; // Treat no-data as highest so they go to bottom in asc
        const pctB = b.percentage ?? 101;
        return pctA - pctB;
      } else {
        const pctA = a.percentage ?? -1;  // Treat no-data as lowest so they go to bottom in desc
        const pctB = b.percentage ?? -1;
        return pctB - pctA;
      }
    });

    return list;
  }, [studentMetrics, genderFilter, searchQuery, showOnlyAbsentees, sortBy]);

  // Helper to trigger printing of the aggregate summary list
  const handlePrintSummary = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header and Selectors */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-indigo-600 block">Analytics Panel</span>
          <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="text-indigo-600" size={18} />
            Class Attendance Summaries by Gender
          </h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Monitor and audit attendance ratios. Track Boys vs. Girls rates and pinpoint critical absenteeism.
          </p>
        </div>

        {/* Timeframe Controls */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-3xs flex">
            <button
              onClick={() => setTimeframe('weekly')}
              className={`px-3 py-1.5 font-bold transition rounded-lg cursor-pointer text-xs flex items-center gap-1 ${
                timeframe === 'weekly' ? `${theme.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-250'
              }`}
            >
              <CalendarDays size={13} /> Weekly View
            </button>
            <button
              onClick={() => setTimeframe('monthly')}
              className={`px-3 py-1.5 font-bold transition rounded-lg cursor-pointer text-xs flex items-center gap-1 ${
                timeframe === 'monthly' ? `${theme.primaryBg} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-250'
              }`}
            >
              <Users size={13} /> Monthly View
            </button>
          </div>

          <button
            onClick={handlePrintSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 active:translate-y-0.5 transition text-xs font-semibold rounded-lg cursor-pointer"
          >
            <FileDown size={13} /> Print Summary
          </button>
        </div>
      </div>

      {/* Timeframe Display Ribbon */}
      <div className="bg-indigo-50/50 border border-indigo-100 p-3.5 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
            <CalendarDays size={16} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wide">Selected Summary Period</div>
            <div className="text-xs font-extrabold text-slate-800">{timeframeLabel || 'No dates selected'}</div>
          </div>
        </div>
        <div className="text-[10px] font-mono text-indigo-600 font-bold uppercase tracking-wider bg-white px-2.5 py-1 rounded-lg border border-indigo-100 shadow-3xs">
          Class {selectedClass}
        </div>
      </div>

      {/* 2. Aggregate Gender Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Class Average */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400">Class Average</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
              Overall
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-850 font-display">
              {summaryStats.overallRate !== null ? `${summaryStats.overallRate}%` : 'N/A'}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-indigo-600 h-1.5 rounded-full" 
              style={{ width: `${summaryStats.overallRate || 0}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Average attendance rate across all {students.length} students.
          </p>
        </div>

        {/* Boys Average */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400">Boys Attendance</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-sky-50 text-sky-600 border border-sky-100">
              Male ({summaryStats.totalBoys})
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-sky-700 font-display">
              {summaryStats.boysRate !== null ? `${summaryStats.boysRate}%` : 'N/A'}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-sky-500 h-1.5 rounded-full" 
              style={{ width: `${summaryStats.boysRate || 0}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Average participation logs for male students.
          </p>
        </div>

        {/* Girls Average */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400">Girls Attendance</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-50 text-rose-600 border border-rose-100">
              Female ({summaryStats.totalGirls})
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-rose-700 font-display">
              {summaryStats.girlsRate !== null ? `${summaryStats.girlsRate}%` : 'N/A'}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-rose-500 h-1.5 rounded-full" 
              style={{ width: `${summaryStats.girlsRate || 0}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Average participation logs for female students.
          </p>
        </div>

        {/* Frequent Absentees */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400">Frequent Absentees</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-100">
              &lt; 90% Rate
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-black font-display ${summaryStats.frequentAbsentees > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {summaryStats.frequentAbsentees}
            </span>
            <span className="text-slate-400 text-xs font-semibold">Students</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full ${summaryStats.frequentAbsentees > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${students.length > 0 ? (summaryStats.frequentAbsentees / students.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Students needing immediate intervention at a glance.
          </p>
        </div>

      </div>

      {/* 3. Filter and Student Table Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden no-print">
        
        {/* Controls Ribbon */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          
          {/* Left Controls: Search and Gender Tab Filter */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Search by student or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs w-52 font-semibold placeholder:font-normal"
              />
            </div>

            {/* Gender Filters */}
            <div className="bg-white border border-slate-200 p-1 rounded-lg flex shadow-3xs">
              <button
                onClick={() => setGenderFilter('All')}
                className={`px-3 py-1 font-bold text-[10px] uppercase transition rounded-md cursor-pointer ${
                  genderFilter === 'All' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setGenderFilter('Male')}
                className={`px-3 py-1 font-bold text-[10px] uppercase transition rounded-md cursor-pointer ${
                  genderFilter === 'Male' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Boys
              </button>
              <button
                onClick={() => setGenderFilter('Female')}
                className={`px-3 py-1 font-bold text-[10px] uppercase transition rounded-md cursor-pointer ${
                  genderFilter === 'Female' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Girls
              </button>
            </div>

            {/* Sorting selector */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-3xs">
              <ArrowUpDown className="text-slate-400" size={11} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-[10px] font-bold text-slate-600 bg-transparent border-none focus:outline-none cursor-pointer"
              >
                <option value="percentage-asc">Absentees First (Low %)</option>
                <option value="percentage-desc">Best Attendance (High %)</option>
                <option value="name">Sort by Name (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Right Controls: Absolute Absentees toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOnlyAbsentees(!showOnlyAbsentees)}
              className={`px-3 py-1.5 rounded-lg border font-bold transition text-xs cursor-pointer flex items-center gap-1.5 ${
                showOnlyAbsentees 
                  ? 'bg-amber-500 border-amber-600 text-white' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle size={12} />
              <span>Only Frequent Absentees (&lt; 90%)</span>
            </button>
          </div>

        </div>

        {/* Student Table */}
        <div className="divide-y divide-slate-100">
          {filteredAndSortedMetrics.length === 0 ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-4">
              <img 
                src="/attendance_empty.jpg" 
                alt="No attendance data illustration" 
                className="w-48 h-48 object-contain rounded-2xl border border-slate-100 shadow-sm bg-white"
                referrerPolicy="no-referrer"
              />
              <div className="space-y-1">
                <p className="font-semibold text-slate-600">No student logs found</p>
                <p className="max-w-sm mx-auto text-slate-400 text-[10px] leading-relaxed">
                  Adjust filters or select a different date, class level, or gender parameter to view summaries.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono uppercase text-slate-400 font-bold">
                    <th className="py-3 px-5 w-12 text-center">No.</th>
                    <th className="py-3 px-3">Student Name</th>
                    <th className="py-3 px-3 w-28">Gender</th>
                    <th className="py-3 px-3 text-center w-24">Present Days</th>
                    <th className="py-3 px-3 text-center w-24">Absent Days</th>
                    <th className="py-3 px-3 text-center w-24">Holidays</th>
                    <th className="py-3 px-4 w-52">Attendance Rate</th>
                    <th className="py-3 px-4 w-36">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredAndSortedMetrics.map((item, index) => {
                    const { student, present, absent, holiday, percentage } = item;
                    const fullName = `${student.firstName} ${student.middleName || ''} ${student.lastName}`;

                    // Determine color coding & labels for attendance rate
                    let barColor = 'bg-emerald-500';
                    let textClass = 'text-emerald-700';
                    let bgClass = 'bg-emerald-50 border-emerald-100 text-emerald-800';
                    let statusLabel = 'Excellent';

                    if (percentage === null) {
                      barColor = 'bg-slate-200';
                      textClass = 'text-slate-400';
                      bgClass = 'bg-slate-50 border-slate-200 text-slate-500';
                      statusLabel = 'No Records';
                    } else if (percentage < 75) {
                      barColor = 'bg-red-500 animate-pulse';
                      textClass = 'text-red-700';
                      bgClass = 'bg-red-50 border-red-100 text-red-800';
                      statusLabel = 'Critical';
                    } else if (percentage < 90) {
                      barColor = 'bg-amber-500';
                      textClass = 'text-amber-700';
                      bgClass = 'bg-amber-50 border-amber-100 text-amber-800';
                      statusLabel = 'Frequent Absentee';
                    } else if (percentage < 95) {
                      barColor = 'bg-emerald-400';
                      textClass = 'text-emerald-600';
                      bgClass = 'bg-emerald-50/50 border-emerald-100 text-emerald-700';
                      statusLabel = 'Satisfactory';
                    }

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/50 transition duration-75">
                        {/* Index */}
                        <td className="py-3.5 px-5 font-mono text-[10px] text-slate-300 font-bold text-center">
                          {(index + 1).toString().padStart(2, '0')}
                        </td>
                        
                        {/* Name & ID */}
                        <td className="py-3.5 px-3">
                          <div className="font-semibold text-slate-800">{fullName}</div>
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">ID: {student.id}</div>
                        </td>

                        {/* Gender */}
                        <td className="py-3.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono border ${
                            student.gender === 'Male' 
                              ? 'bg-sky-50 border-sky-100 text-sky-700' 
                              : 'bg-rose-50 border-rose-100 text-rose-700'
                          }`}>
                            {student.gender}
                          </span>
                        </td>

                        {/* Present Days count */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-emerald-600">
                          {present}
                        </td>

                        {/* Absent Days count */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-red-500">
                          {absent}
                        </td>

                        {/* Holidays count */}
                        <td className="py-3.5 px-3 text-center font-mono text-slate-400">
                          {holiday}
                        </td>

                        {/* Percentage and progress bar */}
                        <td className="py-3.5 px-4">
                          {percentage !== null ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between font-mono font-bold text-[10px]">
                                <span className={textClass}>{percentage}%</span>
                                <span className="text-[9px] text-slate-400 font-normal font-sans">
                                  {present} / {present + absent} logs
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className={`h-1.5 rounded-full ${barColor}`} 
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">No logs marked</span>
                          )}
                        </td>

                        {/* Status Label badge */}
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${bgClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer insight */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[10px] font-mono text-slate-400 text-center flex items-center justify-center gap-1">
          <Sparkles size={11} className="text-indigo-500" />
          <span>Attendance rate targets should stay above <strong>90%</strong>. Instantly issue advisories to flagged students.</span>
        </div>

      </div>

      {/* 4. PRINT PREVIEW LOG FOR EXPORTS */}
      <div className="hidden print:block font-serif max-w-5xl mx-auto p-12 bg-white text-black border-4 border-double border-slate-800 rounded-none shadow-none mt-10">
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight">Attendance Summary Report</h1>
          <p className="text-xs font-mono mt-1">Class: {selectedClass} | Period: {timeframeLabel}</p>
          <p className="text-[10px] text-stone-500 mt-0.5">Generated via AI-Studio Academic Management Suite</p>
        </div>

        <div className="grid grid-cols-3 gap-6 text-xs border border-stone-300 p-4 mb-6 bg-stone-50 rounded">
          <div>
            <strong>Class Aggregate Rate:</strong> {summaryStats.overallRate !== null ? `${summaryStats.overallRate}%` : 'N/A'}
          </div>
          <div>
            <strong>Boys Attendance Rate:</strong> {summaryStats.boysRate !== null ? `${summaryStats.boysRate}%` : 'N/A'} (Count: {summaryStats.totalBoys})
          </div>
          <div>
            <strong>Girls Attendance Rate:</strong> {summaryStats.girlsRate !== null ? `${summaryStats.girlsRate}%` : 'N/A'} (Count: {summaryStats.totalGirls})
          </div>
        </div>

        <table className="w-full text-left text-xs border-collapse border border-stone-400">
          <thead>
            <tr className="bg-stone-100 font-bold uppercase text-stone-800">
              <th className="p-2 border border-stone-400 text-center w-12">No.</th>
              <th className="p-2 border border-stone-400">Student Name</th>
              <th className="p-2 border border-stone-400 w-24">Gender</th>
              <th className="p-2 border border-stone-400 text-center w-20">Present</th>
              <th className="p-2 border border-stone-400 text-center w-20">Absent</th>
              <th className="p-2 border border-stone-400 text-center w-20">Rate (%)</th>
              <th className="p-2 border border-stone-400 w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedMetrics.map((item, index) => {
              const { student, present, absent, percentage } = item;
              const fullName = `${student.firstName} ${student.middleName || ''} ${student.lastName}`;
              
              let printStatus = 'Excellent';
              if (percentage === null) printStatus = 'No Logs';
              else if (percentage < 75) printStatus = 'Critical';
              else if (percentage < 90) printStatus = 'Absentee';
              else if (percentage < 95) printStatus = 'Satisfactory';

              return (
                <tr key={student.id} className="border-b border-stone-300">
                  <td className="p-2 border border-stone-400 text-center font-mono">{index + 1}</td>
                  <td className="p-2 border border-stone-400 font-bold">{fullName}</td>
                  <td className="p-2 border border-stone-400 font-mono uppercase">{student.gender}</td>
                  <td className="p-2 border border-stone-400 text-center font-mono">{present}</td>
                  <td className="p-2 border border-stone-400 text-center font-mono">{absent}</td>
                  <td className="p-2 border border-stone-400 text-center font-mono font-bold">
                    {percentage !== null ? `${percentage}%` : 'N/A'}
                  </td>
                  <td className="p-2 border border-stone-400 font-bold text-[10px] uppercase">{printStatus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
