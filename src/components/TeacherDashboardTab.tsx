import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Calendar, 
  CheckCircle, 
  Clock, 
  BookOpen, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  GraduationCap,
  CalendarDays,
  Target,
  Sparkles,
  Zap,
  Plus,
  Send,
  MessageSquare,
  X
} from 'lucide-react';
import { Teacher, Student, AttendanceRecord, AcademicCalendarConfig, ClassType, SubjectType, StudentAssessment, TeacherReflection, SchoolInfo } from '../types';
import TeacherReflections from './TeacherReflections';

interface TeacherDashboardTabProps {
  teacherProfile: Teacher;
  students: Student[];
  attendance: AttendanceRecord[];
  calendar: AcademicCalendarConfig;
  assessments: StudentAssessment[];
  reflections: TeacherReflection[];
  schoolInfo: SchoolInfo;
  themeStyles: any;
  onNavigate: (tabId: string, params?: any) => void;
  onRefresh: () => void;
}

export default function TeacherDashboardTab({
  teacherProfile,
  students,
  attendance,
  calendar,
  assessments,
  reflections,
  schoolInfo,
  themeStyles,
  onNavigate,
  onRefresh
}: TeacherDashboardTabProps) {
  
  const assignedClasses = useMemo(() => {
    const classesList: ClassType[] = [];
    if (teacherProfile.assignedClasses) {
      classesList.push(...teacherProfile.assignedClasses);
    }
    if (teacherProfile.assignedClass && teacherProfile.assignedClass !== 'None' && !classesList.includes(teacherProfile.assignedClass)) {
      classesList.push(teacherProfile.assignedClass);
    }
    return classesList;
  }, [teacherProfile]);

  const assignedSubjects = teacherProfile.assignedSubjects || [];

  // Filter students belonging to assigned classes
  const myStudents = useMemo(() => {
    return students.filter(s => assignedClasses.includes(s.class));
  }, [students, assignedClasses]);

  // Calculate students per class
  const studentsPerClass = useMemo(() => {
    const counts: Record<string, number> = {};
    assignedClasses.forEach(c => {
      counts[c] = students.filter(s => s.class === c).length;
    });
    return counts;
  }, [assignedClasses, students]);

  // Attendance rate for assigned classes (last 30 days or current month)
  const attendanceRate = useMemo(() => {
    const relevantAttendance = attendance.filter(a => assignedClasses.includes(a.class));
    if (relevantAttendance.length === 0) return 0;
    const presents = relevantAttendance.filter(a => a.status === 'Present').length;
    return Math.round((presents / relevantAttendance.length) * 100);
  }, [attendance, assignedClasses]);

  // Pending grading tasks (heuristic: count students in assigned classes/subjects who don't have an assessment for the active term/year)
  const pendingGradingCount = useMemo(() => {
    let count = 0;
    assignedClasses.forEach(cls => {
      const classStudents = students.filter(s => s.class === cls);
      assignedSubjects.forEach(sub => {
        classStudents.forEach(stu => {
          const hasRecord = assessments.some(a => 
            a.studentId === stu.id && 
            a.subject === sub && 
            a.academicYear === calendar.activeAcademicYear && 
            a.term === calendar.activeTerm
          );
          if (!hasRecord) count++;
        });
      });
    });
    return count;
  }, [assignedClasses, assignedSubjects, students, assessments, calendar]);

  // Upcoming Tasks list
  const upcomingTasks = useMemo(() => {
    const tasks = [];
    
    // Task: Mark attendance (if today is a weekday and we are in term time)
    const today = new Date();
    const isWeekday = today.getDay() !== 0 && today.getDay() !== 6;
    if (isWeekday) {
      tasks.push({
        id: 'mark_attendance',
        title: 'Mark Today Attendance',
        description: `Ensure attendance for your ${assignedClasses.length} assigned classes is recorded.`,
        icon: CalendarCheck,
        priority: 'high',
        action: () => onNavigate('attendance')
      });
    }

    // Task: Grading
    if (pendingGradingCount > 0) {
      tasks.push({
        id: 'grading',
        title: 'Pending Student Assessments',
        description: `You have ${pendingGradingCount} records to complete for the current term.`,
        icon: GraduationCap,
        priority: 'medium',
        action: () => onNavigate('assessments')
      });
    }

    // Term Closure Task
    const activeYearCfg = calendar.years[calendar.activeAcademicYear];
    if (activeYearCfg) {
      const termCfg = activeYearCfg.terms[calendar.activeTerm];
      if (termCfg) {
        const endDate = new Date(termCfg.endDate);
        const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays <= 14) {
          tasks.push({
            id: 'term_closure',
            title: `${calendar.activeTerm} Closure Approaching`,
            description: `Only ${diffDays} days left until the end of the term. Prepare final reports.`,
            icon: Clock,
            priority: 'critical',
            action: () => {}
          });
        }
      }
    }

    return tasks;
  }, [assignedClasses, calendar, pendingGradingCount, onNavigate]);

  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);

  return (
    <div className="relative">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Welcome Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden text-white shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl" />
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Teacher Dashboard
            </span>
            <span className="text-amber-400 text-[10px] font-black uppercase tracking-tighter flex items-center gap-1">
              <Sparkles size={12} /> Live Insights
            </span>
          </div>
          
          <div className="space-y-1">
            <h1 className="text-3xl font-black font-display tracking-tight leading-tight">
              Welcome back, <span className="text-amber-400">{teacherProfile.firstName} {teacherProfile.lastName}</span>
            </h1>
            <p className="text-slate-400 text-sm font-sans max-w-xl leading-relaxed">
              Managing <span className="text-white font-bold">{assignedClasses.join(', ')}</span> for the <span className="text-indigo-300 font-bold">{calendar.activeAcademicYear}</span> session. Your focus today: <span className="text-slate-200">attendance verification and assessment updates.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={Users} 
          label="Total Students" 
          value={myStudents.length.toString()} 
          subtext={`${assignedClasses.length} Classes Assigned`}
          color="indigo"
        />
        <StatCard 
          icon={Calendar} 
          label="Attendance Rate" 
          value={`${attendanceRate}%`} 
          subtext="Current Term Average"
          color="emerald"
        />
        <StatCard 
          icon={GraduationCap} 
          label="Pending Grades" 
          value={pendingGradingCount.toString()} 
          subtext="Missing Assessment Entries"
          color="amber"
        />
        <StatCard 
          icon={Clock} 
          label="Term Progress" 
          value={(() => {
            const activeYearCfg = calendar.years[calendar.activeAcademicYear];
            if (!activeYearCfg) return '0%';
            const termCfg = activeYearCfg.terms[calendar.activeTerm];
            if (!termCfg) return '0%';
            const start = new Date(termCfg.startDate).getTime();
            const end = new Date(termCfg.endDate).getTime();
            const now = new Date().getTime();
            if (now < start) return '0%';
            if (now > end) return '100%';
            return `${Math.round(((now - start) / (end - start)) * 100)}%`;
          })()} 
          subtext={calendar.activeTerm}
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Assigned Classes & Students */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Target size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Assigned Classes</h3>
                  <p className="text-xs text-slate-500 font-sans">Breakdown of students under your care</p>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedClasses.map(cls => (
                  <motion.div 
                    key={cls}
                    whileHover={{ scale: 1.02 }}
                    className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-indigo-100 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-mono">Section: Default</span>
                        <h4 className="text-xl font-black text-slate-900 font-display">{cls}</h4>
                      </div>
                      <div className="p-2 rounded-lg bg-white shadow-sm text-indigo-600 border border-slate-100">
                        <Users size={18} />
                      </div>
                    </div>
                    
                    <div className="mt-6 flex items-end justify-between">
                      <div>
                        <span className="block text-2xl font-black text-indigo-600 leading-none">{studentsPerClass[cls] || 0}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase font-sans mt-1 block">Total Students</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => onNavigate('attendance')}
                          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-colors"
                          title="Attendance"
                        >
                          <CalendarCheck size={16} />
                        </button>
                        <button 
                          onClick={() => onNavigate('assessments')}
                          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-colors"
                          title="Assessments"
                        >
                          <ClipboardCheck size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {assignedClasses.length === 0 && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <div className="p-3 rounded-full bg-slate-100 text-slate-400">
                      <AlertCircle size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">No Classes Assigned</p>
                      <p className="text-xs text-slate-500">Contact your administrator to assign classes to your profile.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recently Recorded Attendance Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Assigned Subjects</h3>
                  <p className="text-xs text-slate-500 font-sans">Subjects you are authorized to grade</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {assignedSubjects.map(sub => (
                  <span key={sub} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-2">
                    <BookOpen size={14} className="text-indigo-500" />
                    {sub}
                  </span>
                ))}
                {assignedSubjects.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No subjects assigned yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Teacher Reflections Module */}
          <TeacherReflections 
            teacher={teacherProfile} 
            reflections={reflections} 
            schoolInfo={schoolInfo}
            onRefresh={onRefresh} 
          />
        </div>

        {/* Right Column: Upcoming Tasks & Calendar */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white rounded-2xl overflow-hidden shadow-xl border border-slate-800">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Clock size={14} className="text-amber-400" /> Upcoming Tasks
              </h3>
            </div>
            <div className="divide-y divide-slate-800">
              {upcomingTasks.map((task, idx) => (
                <div 
                  key={task.id} 
                  className="p-5 hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  onClick={task.action}
                >
                  <div className="flex gap-4">
                    <div className={`mt-1 p-2 rounded-lg shrink-0 ${
                      task.priority === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                      task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-indigo-500/20 text-indigo-400'
                    }`}>
                      <task.icon size={18} />
                    </div>
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">{task.title}</h4>
                        {task.priority === 'critical' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-sans">{task.description}</p>
                    </div>
                    <ArrowRight size={14} className="ml-auto text-slate-700 group-hover:text-white group-hover:translate-x-1 transition-all self-center" />
                  </div>
                </div>
              ))}
              {upcomingTasks.length === 0 && (
                <div className="p-10 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-600">
                    <CheckCircle size={24} />
                  </div>
                  <p className="text-xs text-slate-500 font-medium">All caught up! No pending tasks.</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Calendar Snapshot */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 border-b border-slate-100 pb-3">
              <CalendarDays size={14} className="text-indigo-500" /> Academic Context
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Current Term</span>
                <span className="text-xs font-black text-slate-900">{calendar.activeTerm}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Academic Year</span>
                <span className="text-xs font-black text-slate-900">{calendar.activeAcademicYear}</span>
              </div>
              <hr className="border-slate-50" />
              {(() => {
                const activeYearCfg = calendar.years[calendar.activeAcademicYear];
                if (!activeYearCfg) return null;
                const termCfg = activeYearCfg.terms[calendar.activeTerm];
                if (!termCfg) return null;
                return (
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase font-mono">
                      <span>Term Start</span>
                      <span>Term End</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>{new Date(termCfg.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <span>{new Date(termCfg.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: (() => {
                          const start = new Date(termCfg.startDate).getTime();
                          const end = new Date(termCfg.endDate).getTime();
                          const now = new Date().getTime();
                          if (now < start) return '0%';
                          if (now > end) return '100%';
                          return `${Math.round(((now - start) / (end - start)) * 100)}%`;
                        })() }}
                        className="bg-indigo-500 h-full rounded-full"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </motion.div>

    {/* Floating Quick Actions */}
    <div className="fixed bottom-8 right-8 z-50">
        <AnimatePresence>
          {isQuickActionsOpen && (
            <div className="absolute bottom-20 right-0 space-y-3 flex flex-col items-end">
              {[
                { label: 'Take Attendance', icon: CalendarCheck, color: 'bg-emerald-600', tab: 'attendance' },
                { label: 'Add Grade', icon: GraduationCap, color: 'bg-amber-600', tab: 'assessments' },
                { label: 'Compose Message', icon: MessageSquare, color: 'bg-indigo-600', tab: 'communications' }
              ].map((action, idx) => (
                <motion.button
                  key={action.tab}
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 20 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => {
                    onNavigate(action.tab);
                    setIsQuickActionsOpen(false);
                  }}
                  className="flex items-center gap-3 group"
                >
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                    {action.label}
                  </span>
                  <div className={`p-4 rounded-2xl ${action.color} text-white shadow-2xl hover:scale-110 transition-transform`}>
                    <action.icon size={20} />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
          className={`p-5 rounded-3xl shadow-2xl transition-all duration-300 flex items-center justify-center ${
            isQuickActionsOpen 
              ? 'bg-slate-900 text-white rotate-90' 
              : 'bg-amber-400 text-slate-900'
          }`}
        >
          {isQuickActionsOpen ? <X size={28} /> : <Zap size={28} fill="currentColor" />}
          
          {!isQuickActionsOpen && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-white"></span>
            </span>
          )}
        </motion.button>
      </div>

      {/* Close backdrop when menu is open */}
      {isQuickActionsOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/5 backdrop-blur-[2px]"
          onClick={() => setIsQuickActionsOpen(false)}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, color }: { 
  icon: any, 
  label: string, 
  value: string, 
  subtext: string,
  color: 'indigo' | 'emerald' | 'amber' | 'rose'
}) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100'
  };

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">{label}</p>
        <h4 className="text-2xl font-black text-slate-900 mt-0.5">{value}</h4>
        <p className="text-[10px] font-medium text-slate-500 mt-1 uppercase font-sans tracking-tight">{subtext}</p>
      </div>
    </motion.div>
  );
}

const CalendarCheck = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
);

const ClipboardCheck = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
);
