import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Plus, 
  Save, 
  Trash2, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  MessageSquare,
  TrendingUp,
  ShieldAlert,
  Clock,
  History,
  PenLine,
  FileDown,
  Printer
} from 'lucide-react';
import { TeacherReflection, ClassType, Teacher, SchoolInfo } from '../types';
import { DbController } from '../db';
import { generatePdfFromHtml, downloadBlobLocally } from '../pdfHelper';
import { getWatermarkHtml } from '../utils';

interface TeacherReflectionsProps {
  teacher: Teacher;
  reflections: TeacherReflection[];
  schoolInfo: SchoolInfo;
  onRefresh: () => void;
}

export default function TeacherReflections({ teacher, reflections, schoolInfo, onRefresh }: TeacherReflectionsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<TeacherReflection['category']>('General');
  const [selectedClass, setSelectedClass] = useState<ClassType | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Period filtering
  const [period, setPeriod] = useState<'all' | 'month' | 'week'>('all');

  const filteredReflections = useMemo(() => {
    let list = reflections.filter(r => r.teacherId === teacher.id);
    
    if (period === 'month') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      list = list.filter(r => new Date(r.createdAt) >= thirtyDaysAgo);
    } else if (period === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      list = list.filter(r => new Date(r.createdAt) >= sevenDaysAgo);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reflections, teacher.id, period]);

  const teacherReflections = filteredReflections;

  const handleSave = () => {
    if (!content.trim()) return;
    
    setIsSubmitting(true);
    const newReflection: TeacherReflection = {
      id: `refl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      teacherId: teacher.id,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      date: new Date().toISOString().split('T')[0],
      content: content.trim(),
      category,
      class: selectedClass || undefined,
      createdAt: new Date().toISOString()
    };

    DbController.saveTeacherReflection(newReflection);
    
    // Simulate save delay for UI feel
    setTimeout(() => {
      setContent('');
      setIsAdding(false);
      setIsSubmitting(false);
      onRefresh();
    }, 500);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this reflection?')) {
      DbController.deleteTeacherReflection(id);
      onRefresh();
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const filename = `Reflections_Report_${teacher.lastName}_${new Date().toISOString().split('T')[0]}`;
      const result = await generatePdfFromHtml('reflections-print-area', filename);
      downloadBlobLocally(result.blob, result.filename);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
            <BookOpen size={20} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Teacher Reflections</h3>
            <p className="text-xs text-slate-500 font-sans">Document class progress and behavior notes</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['all', 'month', 'week'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  period === p 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {p === 'all' ? 'All' : p === 'month' ? '30D' : '7D'}
              </button>
            ))}
          </div>

          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf || teacherReflections.length === 0}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-100 transition-all disabled:opacity-50"
            title="Download PDF Report"
          >
            {isGeneratingPdf ? (
              <div className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <FileDown size={18} />
            )}
          </button>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              isAdding 
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700'
            }`}
          >
            {isAdding ? (
              <>Cancel</>
            ) : (
              <><Plus size={14} /> New Entry</>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-xl shadow-indigo-50/50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-mono">Category</label>
                  <div className="flex gap-2">
                    {(['Behavior', 'Learning Progress', 'General', 'Other'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          category === cat 
                            ? 'bg-indigo-600 border-indigo-600 text-white' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-mono">Assigned Class (Optional)</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value as ClassType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">No specific class</option>
                    {teacher.assignedClasses?.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-mono">Journal Entry</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Describe class behavior, learning breakthroughs, or any notes for today..."
                  className="w-full min-h-[120px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-sans focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={isSubmitting || !content.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Save size={14} /> Save Reflection</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Log */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2">
          <History size={14} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 font-mono">Recent Reflections</span>
        </div>
        
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {teacherReflections.map((refl) => (
            <div key={refl.id} className="p-4 hover:bg-slate-50/30 transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 cursor-pointer flex-1" onClick={() => setExpandedId(expandedId === refl.id ? null : refl.id)}>
                  <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${
                    refl.category === 'Behavior' ? 'bg-rose-50 text-rose-500' :
                    refl.category === 'Learning Progress' ? 'bg-emerald-50 text-emerald-500' :
                    'bg-slate-50 text-slate-500'
                  }`}>
                    {refl.category === 'Behavior' ? <TrendingUp size={14} /> :
                     refl.category === 'Learning Progress' ? <ShieldAlert size={14} /> :
                     <MessageSquare size={14} />}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {refl.category} 
                        {refl.class && <span className="text-indigo-500 ml-1">({refl.class})</span>}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock size={10} /> {new Date(refl.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-xs text-slate-600 leading-relaxed font-sans ${expandedId === refl.id ? '' : 'line-clamp-2'}`}>
                      {refl.content}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDelete(refl.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === refl.id ? null : refl.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  >
                    {expandedId === refl.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {teacherReflections.length === 0 && (
            <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-200 border border-slate-100">
                <PenLine size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">No Journal Entries Yet</p>
                <p className="text-xs text-slate-400 max-w-[240px]">Start documenting your daily observations to track class growth over time.</p>
              </div>
              <button
                onClick={() => setIsAdding(true)}
                className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                Create your first entry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PRINT-ONLY AREA */}
      <div id="reflections-print-area" className="hidden print:block fixed top-[-9999px] left-[-9999px] w-[210mm] bg-white text-black p-12 font-serif">
        <div className="absolute inset-0 z-0 pointer-events-none opacity-5" dangerouslySetInnerHTML={{ __html: getWatermarkHtml(schoolInfo?.logoUrl) }} />
        
        <div className="relative z-10">
          <div className="text-center border-b-2 border-slate-800 pb-4 mb-8">
            <h1 className="text-2xl font-bold uppercase tracking-tight">{schoolInfo.name}</h1>
            <p className="text-xs italic mt-1">{schoolInfo.motto}</p>
            <p className="text-[10px] font-mono mt-2">
              EMIS: {schoolInfo.emisCode} | {schoolInfo.gpsAddress}
            </p>
          </div>

          <div className="flex justify-between items-end mb-8 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Teacher Reflections Report</h2>
              <p className="text-sm text-slate-500 mt-1">Prepared by: <strong>{teacher.firstName} {teacher.lastName}</strong> ({teacher.staffId})</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Report Generated</p>
              <p className="text-xs font-bold">{new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
            </div>
          </div>

          <div className="space-y-8">
            {teacherReflections.map((refl, idx) => (
              <div key={refl.id} className="page-break-inside-avoid">
                <div className="flex items-center justify-between border-l-4 border-indigo-600 pl-4 mb-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 block">{refl.category}</span>
                    <h4 className="text-sm font-bold">
                      {refl.class ? `Class Note: ${refl.class}` : 'General Observation'}
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(refl.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{refl.content}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-20 pt-8 border-t border-slate-200 grid grid-cols-2 gap-12">
            <div className="text-center">
              <div className="h-12 border-b border-slate-300 mb-2"></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Teacher Signature</p>
            </div>
            <div className="text-center">
              <div className="h-12 border-b border-slate-300 mb-2"></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Head of Department / Principal</p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-[9px] font-mono text-slate-400 italic">
              This report is a confidential professional document intended for academic review and student progress tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
