import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { Student, ClassType, CLASSES, SectionType, SECTIONS } from '../types';
import { DbController } from '../db';
import { compressImage } from '../utils';
import { ThemeStyles } from './ThemeWrapper';
import { 
  Plus, Search, Edit2, Trash2, Printer, Upload, X, Check, Save, User, MapPin, PhoneCall, ShieldAlert, BadgeCheck, FileDown
} from 'lucide-react';
import GoogleDriveExportControl from './GoogleDriveExportControl';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  theme: ThemeStyles;
  students: Student[];
  onRefresh: () => void;
  isAutoSave: boolean;
  onManualSave: () => void;
}

const INITIAL_FORM: Partial<Student> = {
  firstName: '',
  middleName: '',
  lastName: '',
  class: 'Class 1',
  gender: 'Male',
  dateOfBirth: '',
  placeOfBirth: '',
  status: 'Day',
  section: 'Faith',
  nationality: 'Ghanaian',
  guardianName: '',
  guardianTelephone: '',
  guardianOccupation: '',
  residentialAddress: '',
  photoUrl: ''
};

export default function StudentsTab({ theme, students, onRefresh, isAutoSave, onManualSave }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [selectedSection, setSelectedSection] = useState<string>('All');
  
  // Modal/Form toggle states
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<Partial<Student>>({ ...INITIAL_FORM });
  const [showFormModal, setShowFormModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter students dynamically
  const filteredStudents = students.filter(std => {
    const fullName = `${std.firstName} ${std.middleName || ''} ${std.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || std.id.includes(searchTerm);
    const matchesClass = selectedClass === 'All' || std.class === selectedClass;
    const matchesSection = selectedSection === 'All' || std.section === selectedSection;
    return matchesSearch && matchesClass && matchesSection;
  });

  const handleOpenAdd = () => {
    setFormState({ ...INITIAL_FORM, id: 'ST' + Math.floor(100000 + Math.random() * 90000) });
    setIsEditing(false);
    setShowFormModal(true);
  };

  const handleOpenEdit = (student: Student) => {
    setFormState({ ...student });
    setIsEditing(true);
    setShowFormModal(true);
  };

  const handleDelete = (studentId: string) => {
    setStudentToDelete(studentId);
    setShowConfirmModal(true);
  };

  const confirmDelete = () => {
    if (studentToDelete) {
      DbController.deleteStudent(studentToDelete);
      onRefresh();
      setShowConfirmModal(false);
      setStudentToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowConfirmModal(false);
    setStudentToDelete(null);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const compressed = await compressImage(base64);
        setFormState(prev => ({ ...prev, photoUrl: compressed }));
      } catch (err) {
        console.error("Image compression error:", err);
        setFormState(prev => ({ ...prev, photoUrl: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUrlImage = () => {
    const url = prompt("Enter online image URL:");
    if (url) {
      setFormState(prev => ({ ...prev, photoUrl: url }));
    }
  };

  const handleSaveSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formState.firstName || !formState.lastName || !formState.class || !formState.dateOfBirth) {
      alert("Please populate all required fields (*)");
      return;
    }

    const payload: Student = {
      id: formState.id || 'ST' + Math.floor(100000 + Math.random() * 90000),
      firstName: formState.firstName,
      middleName: formState.middleName || '',
      lastName: formState.lastName,
      class: formState.class as ClassType,
      gender: formState.gender as 'Male' | 'Female',
      dateOfBirth: formState.dateOfBirth,
      placeOfBirth: formState.placeOfBirth || '',
      status: formState.status as 'Day' | 'Boarder',
      section: formState.section as SectionType,
      nationality: formState.nationality || 'Ghanaian',
      guardianName: formState.guardianName || '',
      guardianTelephone: formState.guardianTelephone || '',
      guardianOccupation: formState.guardianOccupation || '',
      residentialAddress: formState.residentialAddress || '',
      photoUrl: formState.photoUrl || '',
      createdAt: formState.createdAt || new Date().toISOString()
    };

    DbController.saveStudent(payload);
    onRefresh();
    setShowFormModal(false);
    
    if (isAutoSave) {
      // Auto save triggered
    } else {
      onManualSave();
    }
  };

  const [printBlocked, setPrintBlocked] = useState(false);
  const [showPdfGuide, setShowPdfGuide] = useState(false);

  const handlePrintRegistry = () => {
    try {
      window.print();
    } catch (e) {
      console.warn("Direct print restricted inside sandbox iframe:", e);
      setPrintBlocked(true);
    }
  };

  return (
    <div className="space-y-6 fade-in">
      
      {/* Control ribbon workspace */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm no-print">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-grow sm:flex-grow-0">
            <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search student or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-60 text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
            />
          </div>
          
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="text-xs px-2.5 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="All">All Classes</option>
            {CLASSES.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>

          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="text-xs px-2.5 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="All">All Sections</option>
            {SECTIONS.map(sec => (
              <option key={sec} value={sec}>{sec}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={() => setShowPdfGuide(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 active:translate-y-0.5 transition text-xs font-semibold rounded-lg cursor-pointer"
          >
            <FileDown size={15} /> Save PDF
          </button>
          <button
            onClick={handleOpenAdd}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer active:translate-y-0.5 transition ${theme.btnColors}`}
          >
            <Plus size={16} /> Add Student
          </button>
        </div>
      </div>

      {/* Grid container of student cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 no-print">
        {filteredStudents.length === 0 ? (
          <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 p-12 text-center rounded-xl">
            <User size={36} className="text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-700">No Student Records Found</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Create student logs to populate indexes, take grades sheets on roll, and create assessment registers.</p>
            <button
              onClick={handleOpenAdd}
              className={`mt-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${theme.btnColors}`}
            >
              <Plus size={14} /> Add First Student
            </button>
          </div>
        ) : (
          filteredStudents.map(std => (
            <div 
              key={std.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition duration-200 flex flex-col justify-between"
            >
              <div className="p-4 flex gap-4">
                {/* Photo profile container */}
                <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {std.photoUrl ? (
                    <img src={std.photoUrl} alt={std.firstName} className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} className="text-slate-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm mb-1 ${std.status === 'Boarder' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                    {std.status}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-800 truncate">
                    {std.firstName} {std.middleName ? std.middleName + ' ' : ''}{std.lastName}
                  </h4>
                  <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                    ID: {std.id}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                      {std.class}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${std.section === 'Faith' ? 'bg-blue-50 text-blue-700' : std.section === 'Harmony' ? 'bg-emerald-50 text-emerald-700' : std.section === 'Humility' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'}`}>
                      {std.section}
                    </span>
                  </div>
                </div>
              </div>

              {/* Guard details / actions */}
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between items-center">
                <div className="truncate pr-4 flex items-center gap-1">
                  <PhoneCall size={12} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{std.guardianName || 'Guardian'}: {std.guardianTelephone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(std)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer transition"
                    title="Edit profile"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(std.id)}
                    className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-slate-600 cursor-pointer transition"
                    title="Delete profile"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

            </div>
          ))
        )}
      </div>

      {/* COMPACT PRINT-ONLY SHEET (Meets date of birth, section, status print requirements perfectly!) */}
      <div className="hidden print:block font-sans max-w-6xl mx-auto p-4 bg-white text-black">
        <div className="text-center pb-6 border-b-2 border-slate-900 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            {DbController.getSchoolInfo().name}
          </h1>
          <p className="text-xs font-mono mt-1 italic">
            Motto: "{DbController.getSchoolInfo().motto}" | Registered Enrollment Register
          </p>
          <div className="text-[10px] text-slate-600 font-mono mt-2">
            Filter: {selectedClass === 'All' ? 'All Classes' : `Class: ${selectedClass}`} / {selectedSection === 'All' ? 'All Sections' : `Section: ${selectedSection}`} | Export On: {new Date().toLocaleDateString()}
          </div>
        </div>

        <h3 className="text-lg font-bold uppercase text-center mb-4 tracking-wider">
          Student Enrollment Roster Register
        </h3>

        <table className="w-full text-left border-collapse text-[11px] font-sans">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-800">
              <th className="py-2 px-1 border border-slate-300 font-bold">Student ID</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Student Full Name</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Class Level</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Gender</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Date of Birth</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Section Assignment</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Day/Boarder</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Guardian Details</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Address</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-4 text-slate-500">No matching student profile logs available for this roster spreadsheet.</td>
              </tr>
            ) : (
              filteredStudents.map(std => (
                <tr key={std.id} className="border-b border-slate-200">
                  <td className="py-1 px-1 border border-slate-200 font-mono font-semibold">{std.id}</td>
                  <td className="py-1 px-1 border border-slate-200 font-semibold">{std.firstName} {std.middleName ? std.middleName + ' ' : ''}{std.lastName}</td>
                  <td className="py-1 px-1 border border-slate-200">{std.class}</td>
                  <td className="py-1 px-1 border border-slate-200">{std.gender}</td>
                  <td className="py-1 px-1 border border-slate-200 font-mono">{std.dateOfBirth}</td>
                  <td className="py-1 px-1 border border-slate-200 font-medium">{std.section}</td>
                  <td className="py-1 px-1 border border-slate-200">{std.status}</td>
                  <td className="py-1 px-1 border border-slate-200 font-sans">{std.guardianName} ({std.guardianTelephone})</td>
                  <td className="py-1 px-1 border border-slate-200 text-[10px] break-all">{std.residentialAddress}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Aggregate details footer */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-xs font-mono pt-4 border-t border-slate-300 text-center">
          <div>Total Listed Students: <strong className="text-slate-900">{filteredStudents.length}</strong></div>
          <div>Day Status: <strong>{filteredStudents.filter(s => s.status === 'Day').length}</strong></div>
          <div>Boarding Status: <strong>{filteredStudents.filter(s => s.status === 'Boarder').length}</strong></div>
        </div>
      </div>

      {/* RICH EDIT / ADD MODAL PANEL (NO-PRINT) */}
      {showFormModal && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFormModal(false);
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto no-print cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-6 cursor-default"
          >
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5">
                <BadgeCheck className={theme.accentText} size={20} />
                {isEditing ? 'Modify Student Profile Enrolment' : 'New Student Academic Registration'}
              </h3>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="space-y-6 text-xs">
              
              {/* Photo Upload area */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {formState.photoUrl ? (
                    <img src={formState.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} className="text-slate-300" />
                  )}
                </div>
                <div className="space-y-1.5 text-center sm:text-left">
                  <div className="font-semibold text-slate-700">Student Profile Photo</div>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded font-medium shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    >
                      <Upload size={13} /> Select Local Drive
                    </button>
                    <button
                      type="button"
                      onClick={handleUrlImage}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded font-medium shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    >
                      Use Image Link
                    </button>
                    {formState.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setFormState(prev => ({ ...prev, photoUrl: '' }))}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded font-medium transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="text-[10px] text-slate-400">File sizes will compress to client persistent storage.</div>
                </div>
              </div>

              {/* Step 1: Personal Particulars */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100">Personal Identity Details</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">First Name *</label>
                    <input
                      type="text"
                      value={formState.firstName}
                      onChange={(e) => setFormState(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="e.g. Ama"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={formState.middleName}
                      onChange={(e) => setFormState(prev => ({ ...prev, middleName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={formState.lastName}
                      onChange={(e) => setFormState(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="e.g. Mensah"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Active Class Level *</label>
                    <select
                      value={formState.class}
                      onChange={(e) => setFormState(prev => ({ ...prev, class: e.target.value as ClassType }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white bg-no-repeat focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Section Assignment</label>
                    <select
                      value={formState.section}
                      onChange={(e) => setFormState(prev => ({ ...prev, section: e.target.value as SectionType }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none"
                    >
                      {SECTIONS.map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Gender *</label>
                    <select
                      value={formState.gender}
                      onChange={(e) => setFormState(prev => ({ ...prev, gender: e.target.value as 'Male' | 'Female' }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Date of Birth *</label>
                    <input
                      type="date"
                      value={formState.dateOfBirth}
                      onChange={(e) => setFormState(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Place of Birth</label>
                    <input
                      type="text"
                      value={formState.placeOfBirth}
                      onChange={(e) => setFormState(prev => ({ ...prev, placeOfBirth: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Kumasi"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Nationality</label>
                    <input
                      type="text"
                      value={formState.nationality}
                      onChange={(e) => setFormState(prev => ({ ...prev, nationality: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Ghanaian"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Day / Boarder status</label>
                    <select
                      value={formState.status}
                      onChange={(e) => setFormState(prev => ({ ...prev, status: e.target.value as 'Day' | 'Boarder' }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Day">Day Status</option>
                      <option value="Boarder">Boarding Status</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 2: Guardian Details */}
              <div className="space-y-4 pt-1">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100">Guardian / Family Contacts</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Guardian Full Name</label>
                    <input
                      type="text"
                      value={formState.guardianName}
                      onChange={(e) => setFormState(prev => ({ ...prev, guardianName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="Parent/Guardian Name"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Telephone Contact</label>
                    <input
                      type="text"
                      value={formState.guardianTelephone}
                      onChange={(e) => setFormState(prev => ({ ...prev, guardianTelephone: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="Phone digits"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Occupation</label>
                    <input
                      type="text"
                      value={formState.guardianOccupation}
                      onChange={(e) => setFormState(prev => ({ ...prev, guardianOccupation: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Merchant"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Residential Address</label>
                  <input
                    type="text"
                    value={formState.residentialAddress}
                    onChange={(e) => setFormState(prev => ({ ...prev, residentialAddress: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                    placeholder="e.g., PLT 12 BLK B, Kumasi"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 space-x-1">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg font-semibold active:translate-y-0.5 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold shadow-sm cursor-pointer active:translate-y-0.5 transition ${theme.btnColors}`}
                >
                  <Check size={14} /> {isEditing ? 'Confirm Updates' : 'Enrol Student'}
                </button>
              </div>

            </form>

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
                Your browser blocks direct print triggers from inside the preview iframe. To print this roster, please click the <strong className="text-slate-800">"Open in a new tab" ↗</strong> button at the top right of the application workspace first.
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
      {showPdfGuide && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPdfGuide(false);
          }}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 no-print overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-100 rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-hidden my-8 max-h-[90vh] cursor-default"
          >
            
            {/* Left: Document Live Preview */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-700 flex flex-col justify-between items-center space-y-4">
              <span className="text-white text-xs font-mono tracking-widest uppercase opacity-70">Interactive Page Print Draft Preview</span>
              
              <div id="students-roster-preview-card" className="w-full max-w-[650px] aspect-[1.414/1] bg-white p-6 text-black border shadow-2xl text-[8px] space-y-3 font-sans rounded-none overflow-y-auto">
                <div className="text-center pb-3 border-b-2 border-slate-800 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-stone-900">
                    {DbController.getSchoolInfo().name}
                  </h3>
                  <p className="text-[8px] font-mono mt-0.5 italic text-stone-600">
                    Motto: "{DbController.getSchoolInfo().motto}" | Registered Enrollment Register
                  </p>
                  <div className="text-[7px] text-slate-500 font-mono mt-1">
                    Filter: {selectedClass === 'All' ? 'All Classes' : `Class: ${selectedClass}`} / {selectedSection === 'All' ? 'All Sections' : `Section: ${selectedSection}`} | Export On: {new Date().toLocaleDateString()}
                  </div>
                </div>

                <h4 className="text-[9px] font-bold uppercase text-center mb-2 tracking-wider text-stone-900">
                  Student Enrollment Roster Register (Landscape)
                </h4>

                <table className="w-full text-left border-collapse text-[7px] font-sans">
                  <thead>
                    <tr className="bg-stone-100 border-b border-stone-800">
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">ID</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Full Name</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Class</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Gender</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Birth Date</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Section</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Status</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Guardian Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-2 text-stone-400">No matching student profile logs available.</td>
                      </tr>
                    ) : (
                      filteredStudents.slice(0, 5).map(std => (
                        <tr key={std.id} className="border-b border-stone-200">
                          <td className="py-1 px-0.5 border border-stone-200 font-mono font-semibold">{std.id}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-semibold">{std.firstName} {std.lastName}</td>
                          <td className="py-1 px-0.5 border border-stone-200">{std.class}</td>
                          <td className="py-1 px-0.5 border border-stone-200">{std.gender}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-mono">{std.dateOfBirth}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-medium">{std.section}</td>
                          <td className="py-1 px-0.5 border border-stone-200">{std.status}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-sans">{std.guardianName} ({std.guardianTelephone})</td>
                        </tr>
                      ))
                    )}
                    {filteredStudents.length > 5 && (
                      <tr>
                        <td colSpan={8} className="text-center py-1 bg-stone-50 text-[7px] text-indigo-600 font-mono italic">
                          ... and {filteredStudents.length - 5} more student entries rendered inside high-fidelity PDF output stream ...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="mt-4 grid grid-cols-3 gap-2 text-[8px] font-mono pt-2 border-t border-stone-300 text-center text-stone-700">
                  <div>List Total: <strong className="text-stone-950">{filteredStudents.length}</strong></div>
                  <div>Day Status: <strong>{filteredStudents.filter(s => s.status === 'Day').length}</strong></div>
                  <div>Boarders: <strong>{filteredStudents.filter(s => s.status === 'Boarder').length}</strong></div>
                </div>
              </div>
              
              <span className="text-[10px] text-slate-300 font-mono tracking-wide">Standard Landscape A4 Format Draft Miniature</span>
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
                    <p className="text-[10px] text-slate-400">Review class roster print parameters</p>
                  </div>
                </div>

                <GoogleDriveExportControl 
                  elementId="students-roster-preview-card" 
                  defaultFilename={`${selectedClass.replace(/\s+/g, '_')}_Student_Registry.pdf`}
                  isLandscape={true} 
                />

                <div className="p-3 bg-indigo-50 border border-indigo-100/70 rounded-xl space-y-1 text-indigo-950 text-[11px]">
                  <span className="font-bold">🌐 Recommended: Landscape Layout</span>
                  <p className="text-[10px] text-indigo-800/90 leading-relaxed">
                    Student lists are printed in tabular sheets. In order to fit all details beautifully, <strong>Landscape orientation</strong> in the browser's PDF options is highly recommended.
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
                        Under the <strong>Destination</strong> drop-down menu, choose <strong className="text-slate-900 font-bold">Save as PDF</strong> as your target system printer.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="font-bold text-[10px] text-slate-600 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                      <p className="text-[11px] leading-relaxed">
                        Expand <strong>More Settings</strong>, set orientation check to <strong className="text-indigo-600 font-bold">Landscape</strong>, format size <strong>A4</strong>, tick <strong>Background Graphics</strong>, and untick headers/footers.
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

              <div className="flex items-center gap-2 pt-4 border-t border-slate-100 mt-6 font-sans">
                <button
                  type="button"
                  onClick={() => setShowPdfGuide(false)}
                  className="flex-shrink-0 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePrintRegistry();
                  }}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black shadow-md cursor-pointer transition text-center flex items-center justify-center gap-1.5 active:translate-y-0.5"
                >
                  <Printer size={14} /> Trigger Print Engine
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* DELETION CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && studentToDelete && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowConfirmModal(false);
            }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 no-print cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-slate-900 font-sans cursor-default"
              id="student-delete-confirmation-modal"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Visual warning indicator with pulse effect */}
                <div className="relative w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-600">
                  <span className="absolute inset-0 rounded-full bg-rose-400/20 animate-ping"></span>
                  <ShieldAlert size={32} className="relative z-10" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-black text-slate-950 uppercase tracking-wide">
                    Confirm Permanent Deletion
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You are about to irreversibly purge the following student registry listing from the system database:
                  </p>
                </div>

                {/* Identity Card Block */}
                {students.find(s => s.id === studentToDelete) && (
                  <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-left font-mono space-y-2.5">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px]">
                      <div className="col-span-2 border-b border-slate-100 pb-1.5">
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">Full Student Name</span>
                        <strong className="text-slate-900 font-bold">
                          {(() => {
                            const s = students.find(x => x.id === studentToDelete)!;
                            return `${s.firstName} ${s.middleName ? s.middleName + ' ' : ''}${s.lastName}`;
                          })()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">Student ID Code</span>
                        <strong className="text-slate-950 font-bold">{students.find(x => x.id === studentToDelete)!.id}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">Class Level</span>
                        <strong className="text-slate-950 font-bold">{students.find(x => x.id === studentToDelete)!.class}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning message */}
                <div className="bg-rose-50 border border-rose-100/80 p-3.5 rounded-xl text-left text-rose-950 text-[11px] leading-relaxed space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-rose-800">
                    ⚠️ Cascade Deletion Policy Notice:
                  </p>
                  <p>
                    Proceeding with this action will automatically and permanently cascade delete all terminal scoresheet worksheets, assessment analytics, and active daily attendance registry logs associated with this specific student. This physical database clear cannot be undone.
                  </p>
                </div>

                {/* Controls */}
                <div className="w-full flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition text-center"
                    id="cancel-student-deletion"
                  >
                    Cancel, Keep Profile
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/10 cursor-pointer transition text-center"
                    id="confirm-student-deletion"
                  >
                    Yes, Purge Permanently
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
