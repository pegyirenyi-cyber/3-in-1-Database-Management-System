import React, { useState, useRef, ChangeEvent, FormEvent, useMemo } from 'react';
import { Teacher, TeacherRank, TEACHER_RANKS, CLASSES, ClassType } from '../types';
import { DbController } from '../db';
import { compressImage } from '../utils';
import { ThemeStyles } from './ThemeWrapper';
import { 
  Plus, Search, Edit2, Trash2, Printer, Upload, X, Check, Save, UserCheck, User, Briefcase, Award, GraduationCap, Calendar, FileDown, ShieldAlert, RotateCcw, Eraser, Eye, FileSpreadsheet,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import GoogleDriveExportControl from './GoogleDriveExportControl';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  theme: ThemeStyles;
  teachers: Teacher[];
  onRefresh: () => void;
  isAutoSave: boolean;
  onManualSave: () => void;
}

const INITIAL_FORM: Partial<Teacher> = {
  firstName: '',
  middleName: '',
  lastName: '',
  gender: 'Male',
  dateOfBirth: '',
  placeOfBirth: '',
  subjectsTaught: '',
  professionalQualifications: '',
  highestAcademicQualifications: '',
  rank: 'Not applicable',
  dateOfFirstAppointment: '',
  dateOfPostingToCurrentStation: '',
  staffId: '',
  ntcNumber: '',
  ssnitNumber: '',
  district: '',
  circuit: '',
  photoUrl: '',
  email: '',
  assignedClass: 'None'
};

export default function TeachersTab({ theme, teachers, onRefresh, isAutoSave, onManualSave }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination states
  const [teacherPage, setTeacherPage] = useState(1);
  const [teacherPageSize, setTeacherPageSize] = useState(12);

  // Reset page when search or filters change
  React.useEffect(() => {
    setTeacherPage(1);
  }, [searchTerm]);
  
  // Registration Dialog and Form controllers
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<Partial<Teacher>>({ ...INITIAL_FORM });
  const [showFormModal, setShowFormModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedTeachers, setParsedTeachers] = useState<{ teacher: Partial<Teacher>; errors: string[] }[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV utility which handles quotes and double quotes escapes properly
  const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            cell += '"';
            i++; // skip next char
          } else {
            inQuotes = false;
          }
        } else {
          cell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(cell.trim());
          cell = '';
        } else if (char === '\n' || char === '\r') {
          row.push(cell.trim());
          cell = '';
          if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
            result.push(row);
          }
          row = [];
          if (char === '\r' && nextChar === '\n') {
            i++;
          }
        } else {
          cell += char;
        }
      }
    }

    if (row.length > 0 || cell !== '') {
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
    }

    return result;
  };

  // Maps raw CSV cells to structured Teacher records with inline warnings & default fallbacks
  const mapCSVRowsToTeachers = (rows: string[][]): { teacher: Partial<Teacher>; errors: string[] }[] => {
    if (rows.length < 2) return [];

    const rawHeaders = rows[0].map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1);

    // Dynamic, flexible index matching
    const findIndex = (aliases: string[]) => {
      return rawHeaders.findIndex(header => 
        aliases.some(alias => header === alias || header.replace(/[\s_-]/g, '') === alias.replace(/[\s_-]/g, ''))
      );
    };

    const idIdx = findIndex(['id', 'teacherid', 'teacher id']);
    const firstNameIdx = findIndex(['firstname', 'first name', 'fname']);
    const middleNameIdx = findIndex(['middlename', 'middle name', 'mname']);
    const lastNameIdx = findIndex(['lastname', 'last name', 'lname']);
    const genderIdx = findIndex(['gender', 'sex']);
    const dobIdx = findIndex(['dateofbirth', 'date of birth', 'dob', 'birthdate']);
    const placeOfBirthIdx = findIndex(['placeofbirth', 'place of birth']);
    const subjectsIdx = findIndex(['subjects', 'subject', 'subjectstaught', 'subjects taught', 'taught', 'class taught', 'classroom']);
    const profQualIdx = findIndex(['professionalqualifications', 'professional qualifications', 'professional qualification', 'prof qual']);
    const acadQualIdx = findIndex(['highestacademicqualifications', 'highest academic qualifications', 'academic qualification', 'academic qualifications', 'acad qual']);
    const rankIdx = findIndex(['rank', 'professionalrank', 'professional rank']);
    const firstApptIdx = findIndex(['dateoffirstappointment', 'date of first appointment', 'first appointment', 'appt date', 'first appt']);
    const postingIdx = findIndex(['dateofposting', 'date of posting', 'posting date', 'posting']);
    const staffIdIdx = findIndex(['staffid', 'staff id', 'staffidnumber', 'staff id number']);
    const ntcIdx = findIndex(['ntcnumber', 'ntc number', 'ntc']);
    const ssnitIdx = findIndex(['ssnitnumber', 'ssnit number', 'ssnit']);
    const districtIdx = findIndex(['district', 'academic district']);
    const circuitIdx = findIndex(['circuit', 'educational circuit']);

    return dataRows.map((row) => {
      const getValue = (idx: number) => (idx >= 0 && idx < row.length ? row[idx].trim() : '');
      const errors: string[] = [];

      // Required fields checks
      const firstName = getValue(firstNameIdx);
      if (!firstName) {
        errors.push("Missing First Name *");
      }

      const lastName = getValue(lastNameIdx);
      if (!lastName) {
        errors.push("Missing Last Name *");
      }

      const staffId = getValue(staffIdIdx);
      // Staff ID is optional like NTC number

      // Gender normalization
      let gender: 'Male' | 'Female' = 'Male';
      const rawGender = getValue(genderIdx);
      if (rawGender) {
        const gLower = rawGender.toLowerCase();
        if (gLower === 'male' || gLower === 'm') {
          gender = 'Male';
        } else if (gLower === 'female' || gLower === 'f') {
          gender = 'Female';
        } else {
          errors.push(`Invalid Gender value: "${rawGender}". Must specify "Male" or "Female"`);
        }
      }

      // Birthdate formatting checks if present
      const dateOfBirth = getValue(dobIdx);
      if (dateOfBirth) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateOfBirth)) {
          errors.push(`Invalid Date of Birth format: "${dateOfBirth}". Use absolute YYYY-MM-DD`);
        }
      }

      // First appointment date formatting checks if present
      const firstAppt = getValue(firstApptIdx);
      if (firstAppt) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(firstAppt)) {
          errors.push(`Invalid First Appointment Date: "${firstAppt}". Use YYYY-MM-DD`);
        }
      }

      // Posting date formatting checks if present
      const postingDate = getValue(postingIdx);
      if (postingDate) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(postingDate)) {
          errors.push(`Invalid Posting Date: "${postingDate}". Use YYYY-MM-DD`);
        }
      }

      // Professional Rank check & alignments
      let rank: TeacherRank = 'Not applicable';
      const rawRank = getValue(rankIdx);
      if (rawRank) {
        const foundRank = TEACHER_RANKS.find(r => 
          r.toLowerCase() === rawRank.toLowerCase() || 
          r.replace(/\s+/g, '').toLowerCase() === rawRank.replace(/\s+/g, '').toLowerCase()
        );
        if (foundRank) {
          rank = foundRank;
        } else {
          // If not matching but has content, raise an error pointing to options
          errors.push(`Invalid Professional Rank: "${rawRank}". Expected one of: ${TEACHER_RANKS.join(', ')}`);
        }
      }

      const rawId = getValue(idIdx);
      const id = rawId || 'T' + Math.floor(1000 + Math.random() * 9000);

      const teacher: Partial<Teacher> = {
        id,
        firstName,
        middleName: getValue(middleNameIdx),
        lastName,
        gender,
        dateOfBirth: dateOfBirth || '',
        placeOfBirth: getValue(placeOfBirthIdx),
        subjectsTaught: getValue(subjectsIdx),
        professionalQualifications: getValue(profQualIdx),
        highestAcademicQualifications: getValue(acadQualIdx),
        rank,
        dateOfFirstAppointment: firstAppt || '',
        dateOfPostingToCurrentStation: postingDate || '',
        staffId,
        ntcNumber: getValue(ntcIdx),
        ssnitNumber: getValue(ssnitIdx),
        district: getValue(districtIdx),
        circuit: getValue(circuitIdx),
        photoUrl: '', // Default blank on bulk uploading
        createdAt: new Date().toISOString()
      };

      return { teacher, errors };
    });
  };

  const processFile = (file: File) => {
    setImportFile(file);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = parseCSV(text);
        if (rows.length < 2) {
          setImportError("CSV contains insufficient rows. Please include a header row followed by data.");
          setParsedTeachers([]);
          return;
        }
        const mapped = mapCSVRowsToTeachers(rows);
        setParsedTeachers(mapped);
      } catch (err) {
        console.error(err);
        setImportError("Encountered filesystem read or encoding error parsing the CSV.");
        setParsedTeachers([]);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv')) {
        processFile(file);
      } else {
        setImportError("The dropped file is not a supported CSV spreadsheet. Please upload a .csv file.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv')) {
        processFile(file);
      } else {
        setImportError("The selected file must be a structured CSV spreadsheet format (.csv).");
      }
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'First Name', 'Middle Name', 'Last Name', 'Gender', 'Date of Birth',
      'Place of Birth', 'Subjects Taught', 'Professional Qualifications',
      'Highest Academic Qualifications', 'Rank', 'Date of First Appointment',
      'Date of Posting', 'Staff ID', 'NTC Number', 'SSNIT Number',
      'District', 'Circuit'
    ];
    const examples = [
      ['Mary', 'Ama', 'Annan', 'Female', '1988-05-15', 'Accra', 'English Language', 'Licensed Teacher (NTC Certified)', 'Bachelor of Education (B.Ed)', 'Senior Superintendent I', '2010-09-01', '2018-01-15', 'GES-T10294', 'NTC-90291', 'SSNIT-2019A', 'Kumasi Metropolitan', 'Asokonyi Circuit'],
      ['Emmanuel', '', 'Kofi', 'Male', '1990-11-23', 'Cape Coast', 'Mathematics / Science', 'Professional Teacher (Diploma/Degree in Education)', 'Master of Education / Arts / Science (M.Ed / M.A / M.Sc)', 'Principal Superintendent', '2012-10-10', '2020-03-01', 'GES-T39021', 'NTC-81923', 'SSNIT-89201', 'Cape Coast District', 'Central Circuit']
    ];

    const csvContent = [
      headers.join(','),
      ...examples.map(ex => ex.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "teacher_bulk_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExecuteImport = () => {
    const validRows = parsedTeachers.filter(p => p.errors.length === 0);
    if (validRows.length === 0) {
      alert("No valid rows available to import. Correct validation issues and try again.");
      return;
    }

    validRows.forEach(row => {
      DbController.saveTeacher(row.teacher as Teacher);
    });

    onRefresh();
    setShowImportModal(false);
    setImportFile(null);
    setParsedTeachers([]);
    alert(`Successfully populated ${validRows.length} new teacher records to roster database.`);

    if (isAutoSave) {
      // Auto save triggered
    } else {
      onManualSave();
    }
  };

  // Filter teachers dynamically with high-performance memoization
  const filteredTeachers = useMemo(() => {
    return teachers.filter(tea => {
      const fullName = `${tea.firstName} ${tea.middleName || ''} ${tea.lastName}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || tea.staffId.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [teachers, searchTerm]);

  // Paginated teachers slice for desktop UI performance with high-performance memoization
  const totalTeachersCount = filteredTeachers.length;
  const totalTeacherPages = useMemo(() => Math.ceil(totalTeachersCount / teacherPageSize), [totalTeachersCount, teacherPageSize]);
  const activeTeacherPage = Math.min(Math.max(1, teacherPage), totalTeacherPages || 1);
  
  const paginatedTeachers = useMemo(() => {
    return filteredTeachers.slice((activeTeacherPage - 1) * teacherPageSize, activeTeacherPage * teacherPageSize);
  }, [filteredTeachers, activeTeacherPage, teacherPageSize]);

  const handleExportCSV = () => {
    const headers = [
      'Teacher ID', 'First Name', 'Middle Name', 'Last Name', 'Gender', 'Date of Birth',
      'Place of Birth', 'Subjects/Class Taught', 'Professional Qualifications',
      'Highest Academic Qualifications', 'Rank', 'Date of First Appointment',
      'Date of Posting to Current Station', 'Staff ID', 'NTC Number', 'SSNIT Number',
      'District', 'Circuit', 'Created At'
    ];
    
    const csvRows = [headers.join(',')];
    
    for (const t of filteredTeachers) {
      const values = [
        t.id,
        t.firstName,
        t.middleName || '',
        t.lastName,
        t.gender,
        t.dateOfBirth,
        t.placeOfBirth,
        t.subjectsTaught,
        t.professionalQualifications,
        t.highestAcademicQualifications,
        t.rank,
        t.dateOfFirstAppointment,
        t.dateOfPostingToCurrentStation,
        t.staffId,
        t.ntcNumber,
        t.ssnitNumber,
        t.district,
        t.circuit,
        t.createdAt
      ].map(val => {
        const escaped = ('' + (val || '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `teacher_database_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenAdd = () => {
    setFormState({ ...INITIAL_FORM, id: 'T' + Math.floor(1000 + Math.random() * 9000) });
    setIsEditing(false);
    setShowFormModal(true);
  };

  const handleOpenEdit = (teacher: Teacher) => {
    setFormState({ ...teacher });
    setIsEditing(true);
    setShowFormModal(true);
  };

  const handleDelete = (teacherId: string) => {
    setTeacherToDelete(teacherId);
    setShowConfirmModal(true);
  };

  const confirmDelete = () => {
    if (teacherToDelete) {
      DbController.deleteTeacher(teacherToDelete);
      onRefresh();
      setShowConfirmModal(false);
      setTeacherToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowConfirmModal(false);
    setTeacherToDelete(null);
  };

  const handleClearInputs = () => {
    setFormState({ ...INITIAL_FORM });
    alert("Teacher Profile input form fields cleared.");
  };

  const handleDeleteActiveSelection = () => {
    if (formState.id) {
      if (window.confirm(`Are you sure you want to delete the active selected teacher "${formState.firstName} ${formState.lastName}"?`)) {
        DbController.deleteTeacher(formState.id);
        setFormState({ ...INITIAL_FORM });
        setIsEditing(false);
        setShowFormModal(false);
        onRefresh();
      }
    } else if (teachers.length > 0) {
      const first = teachers[0];
      if (window.confirm(`No active form selection loaded. Do you want to delete the first teacher in the list (${first.firstName} ${first.lastName})?`)) {
        DbController.deleteTeacher(first.id);
        onRefresh();
      }
    } else {
      alert("No teachers exist to delete.");
    }
  };

  const handleDeleteAllTeachers = () => {
    if (window.confirm("CRITICAL WARNING: Are you sure you want to delete ALL teacher records? This action is irreversible and cannot be undone.")) {
      DbController.clearAllTeachers();
      onRefresh();
      alert("Successfully purged all teacher records from the database state.");
    }
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
    const url = prompt("Enter online profile image URL:");
    if (url) {
      setFormState(prev => ({ ...prev, photoUrl: url }));
    }
  };

  const handleSaveSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formState.firstName || !formState.lastName || !formState.rank) {
      alert("Please populate all required fields (*)");
      return;
    }

    const payload: Teacher = {
      id: formState.id || 'T' + Math.floor(1000 + Math.random() * 9000),
      firstName: formState.firstName,
      middleName: formState.middleName || '',
      lastName: formState.lastName,
      gender: formState.gender as 'Male' | 'Female',
      dateOfBirth: formState.dateOfBirth || '',
      placeOfBirth: formState.placeOfBirth || '',
      subjectsTaught: formState.subjectsTaught || '',
      professionalQualifications: formState.professionalQualifications || '',
      highestAcademicQualifications: formState.highestAcademicQualifications || '',
      rank: formState.rank as TeacherRank,
      dateOfFirstAppointment: formState.dateOfFirstAppointment || '',
      dateOfPostingToCurrentStation: formState.dateOfPostingToCurrentStation || '',
      staffId: formState.staffId,
      ntcNumber: formState.ntcNumber || '',
      ssnitNumber: formState.ssnitNumber || '',
      district: formState.district || '',
      circuit: formState.circuit || '',
      photoUrl: formState.photoUrl || '',
      email: formState.email || '',
      assignedClass: (formState.assignedClass || 'None') as ClassType | 'None',
      createdAt: formState.createdAt || new Date().toISOString()
    };

    DbController.saveTeacher(payload);
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
        <div className="relative w-full md:w-auto flex-grow max-w-md">
          <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search teacher by name or staff ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 active:translate-y-0.5 transition text-xs font-semibold rounded-lg cursor-pointer shadow-xs"
            title="Export filtered/all records to a CSV spreadsheet"
          >
            <FileSpreadsheet size={15} /> Export to CSV
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 active:translate-y-0.5 transition text-xs font-semibold rounded-lg cursor-pointer shadow-xs"
            title="Import teacher records from a formatted CSV file"
          >
            <Upload size={15} /> Bulk Import CSV
          </button>
          <button
            onClick={() => setShowPdfGuide(!showPdfGuide)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 active:translate-y-0.5 transition text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Eye size={15} /> Toggle Preview Mode
          </button>
          <button
            onClick={handleOpenAdd}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer active:translate-y-0.5 transition ${theme.btnColors}`}
          >
            <Plus size={16} /> Add Teacher Record
          </button>
        </div>
      </div>

      {/* Grid container of teacher profiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 no-print">
        {paginatedTeachers.length === 0 ? (
          <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 p-12 text-center rounded-xl">
            <Briefcase size={36} className="text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-700">No Teacher Profiles Registered</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Create records of your academic faculty to manage class teachers, assign grades, and populate official report cards.</p>
            <button
              onClick={handleOpenAdd}
              className={`mt-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${theme.btnColors}`}
            >
              <Plus size={14} /> Add First Teacher
            </button>
          </div>
        ) : (
          paginatedTeachers.map(tea => (
            <div 
              key={tea.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition duration-200 flex flex-col justify-between"
            >
              <div className="p-4 space-y-4">
                <div className="flex gap-4">
                  {/* Photo profile container */}
                  <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {tea.photoUrl ? (
                      <img src={tea.photoUrl} alt={tea.firstName} className="w-full h-full object-cover" />
                    ) : (
                      <UserCheck size={24} className="text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-teal-50 text-teal-800 border border-teal-100 mb-1">
                      {tea.rank}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800 truncate">
                      {tea.firstName} {tea.middleName ? tea.middleName + ' ' : ''}{tea.lastName}
                    </h4>
                    <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                      Staff ID: {tea.staffId} | Gender: {tea.gender}
                    </div>
                  </div>
                </div>

                {/* Subtext info */}
                <div className="space-y-1 text-[11px] border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1 text-slate-600">
                    <GraduationCap size={13} className="text-slate-400" />
                    <span className="truncate"><strong>Subject/Class:</strong> {tea.subjectsTaught || 'Not specified'}</span>
                  </div>
                  {tea.email && (
                    <div className="flex items-center gap-1 text-slate-500 font-mono text-[10px] truncate">
                      <span><strong>Login Email:</strong> {tea.email}</span>
                    </div>
                  )}
                  {tea.assignedClass && tea.assignedClass !== 'None' && (
                    <div className="flex items-center gap-1 text-slate-600 mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[9px] uppercase">
                        Class Teacher: {tea.assignedClass}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-slate-600">
                    <Award size={13} className="text-slate-400" />
                    <span className="truncate"><strong>Degree:</strong> {tea.highestAcademicQualifications || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-600">
                    <Calendar size={13} className="text-slate-400" />
                    <span><strong>Appointed:</strong> {tea.dateOfFirstAppointment || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons footer */}
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-500 font-mono flex justify-between items-center">
                <div>NTC No: {tea.ntcNumber || 'N/A'}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(tea)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer transition"
                    title="Edit profile"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(tea.id)}
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

      {/* Teacher pagination controls */}
      {filteredTeachers.length > 0 && (
        <div id="teacher-pagination-bar" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 mt-2 bg-white border border-slate-200 rounded-xl no-print shadow-2xs">
          <div className="text-xs text-slate-500 font-sans">
            Showing <span className="font-semibold text-slate-700">{(activeTeacherPage - 1) * teacherPageSize + 1}</span> to{' '}
            <span className="font-semibold text-slate-700">{Math.min(activeTeacherPage * teacherPageSize, totalTeachersCount)}</span> of{' '}
            <span className="font-semibold text-slate-700">{totalTeachersCount}</span> staff records
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Show</span>
              <select
                value={teacherPageSize}
                onChange={(e) => {
                  setTeacherPageSize(Number(e.target.value));
                  setTeacherPage(1);
                }}
                className="bg-white border border-slate-200 rounded px-1.5 py-1 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 cursor-pointer"
              >
                {[6, 12, 24, 48, 100].map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
              <span>records</span>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTeacherPage(1)}
                disabled={activeTeacherPage === 1}
                className="p-1 px-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
                title="First Page"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setTeacherPage(p => Math.max(1, p - 1))}
                disabled={activeTeacherPage === 1}
                className="p-1 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                <span>Prev</span>
              </button>
              
              {/* Numeric Page indicators */}
              {(() => {
                const pageRange = [];
                const maxButtons = 5;
                let startPage = Math.max(1, activeTeacherPage - 2);
                let endPage = Math.min(totalTeacherPages, startPage + maxButtons - 1);
                if (endPage - startPage < maxButtons - 1) {
                  startPage = Math.max(1, endPage - maxButtons + 1);
                }
                for (let i = startPage; i <= endPage; i++) {
                  pageRange.push(i);
                }
                return pageRange.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTeacherPage(p)}
                    className={`w-7 h-7 flex items-center justify-center text-xs font-bold rounded-lg border transition cursor-pointer ${p === activeTeacherPage ? `${theme.primaryBg || 'bg-slate-900'} text-white border-transparent` : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {p}
                  </button>
                ));
              })()}
              
              <button
                type="button"
                onClick={() => setTeacherPage(p => Math.min(totalTeacherPages, p + 1))}
                disabled={activeTeacherPage === totalTeacherPages}
                className="p-1 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setTeacherPage(totalTeacherPages)}
                disabled={activeTeacherPage === totalTeacherPages}
                className="p-1 px-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
                title="Last Page"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY STAFF DIRECTORY REGISTER SHEET */}
      <div className="hidden print:block font-sans max-w-6xl mx-auto p-4 bg-white text-black">
        <div className="text-center pb-6 border-b-2 border-slate-900 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            {DbController.getSchoolInfo().name}
          </h1>
          <p className="text-xs font-mono mt-1 italic">
            Motto: "{DbController.getSchoolInfo().motto}" | Official Staff Directory List
          </p>
          <div className="text-[10px] text-slate-600 font-mono mt-2">
            Generated on: {new Date().toLocaleDateString()} | Active Personnel Registers
          </div>
        </div>

        <h3 className="text-lg font-bold uppercase text-center mb-4 tracking-wider">
          Academic Faculty & Administrative Staff Register
        </h3>

        <table className="w-full text-left border-collapse text-[11px] font-sans">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-800">
              <th className="py-2 px-1 border border-slate-300 font-bold">Staff ID</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Full Name</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Gender</th>
              <th className="py-2 px-1 border border-slate-300 font-bold font-mono">NTC Registration</th>
              <th className="py-2 px-1 border border-slate-300 font-bold font-mono">SSNIT NO</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Academic Ranks</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">Assignment Area</th>
              <th className="py-2 px-1 border border-slate-300 font-bold font-sans">Appointment Date</th>
              <th className="py-2 px-1 border border-slate-300 font-bold">District & Circuit</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-4 text-slate-500">No active staff profiles are currently saved in this directory registry.</td>
              </tr>
            ) : (
              filteredTeachers.map(tea => (
                <tr key={tea.id} className="border-b border-slate-200">
                  <td className="py-1 px-1 border border-slate-200 font-mono font-semibold">{tea.staffId}</td>
                  <td className="py-1 px-1 border border-slate-200 font-semibold">{tea.firstName} {tea.middleName ? tea.middleName + ' ' : ''}{tea.lastName}</td>
                  <td className="py-1 px-1 border border-slate-200">{tea.gender}</td>
                  <td className="py-1 px-1 border border-slate-200 font-mono">{tea.ntcNumber || 'N/A'}</td>
                  <td className="py-1 px-1 border border-slate-200 font-mono">{tea.ssnitNumber || 'N/A'}</td>
                  <td className="py-1 px-1 border border-slate-200 text-[10px] font-medium">{tea.rank}</td>
                  <td className="py-1 px-1 border border-slate-200">{tea.subjectsTaught}</td>
                  <td className="py-1 px-1 border border-slate-200 font-mono">{tea.dateOfFirstAppointment || 'N/A'}</td>
                  <td className="py-1 px-1 border border-slate-200 text-[10px]">{tea.district} / {tea.circuit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Aggregate details footer */}
        <div className="mt-8 text-xs font-mono pt-4 border-t border-slate-300 text-center">
          Total Faculty Strength: <strong className="text-slate-900">{filteredTeachers.length} Registered Educators</strong>
        </div>
      </div>

      {/* RICH EDIT / ADD MODAL PANEL (NO-PRINT) */}
      <AnimatePresence>
        {showFormModal && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowFormModal(false);
            }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto no-print cursor-pointer"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ ease: "easeOut", duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] border border-slate-100 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-hidden flex flex-col cursor-default md:my-8"
            >
            
            <div className="p-6 pb-4 bg-white border-b border-slate-100/85 flex justify-between items-center">
              <div>
                <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-widest font-sans flex items-center gap-1.5 leading-none">
                  <GraduationCap className="text-emerald-600" size={18} />
                  {isEditing ? 'Modify Teacher Record Enrolment' : 'New Teacher Academic Registration'}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Specify employment bio details, qualifications, and class assignments</p>
              </div>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 text-xs bg-white">
              
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
                  <div className="font-semibold text-slate-700">Teacher Profile Photo</div>
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
                </div>
              </div>

              {/* Personal Particulars */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 font-display">Personal Identity</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">First Name *</label>
                    <input
                      type="text"
                      value={formState.firstName}
                      onChange={(e) => setFormState(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Paul"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={formState.middleName}
                      onChange={(e) => setFormState(prev => ({ ...prev, middleName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={formState.lastName}
                      onChange={(e) => setFormState(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Egyirenyi"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Gender *</label>
                    <select
                      value={formState.gender}
                      onChange={(e) => setFormState(prev => ({ ...prev, gender: e.target.value as 'Male' | 'Female' }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={formState.dateOfBirth}
                      onChange={(e) => setFormState(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none"
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
                </div>
              </div>

              {/* Faculty Credentials */}
              <div className="space-y-4 pt-1">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 font-display">Administrative & Academic Credentials</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Staff ID Number (Recommended)</label>
                    <input
                      type="text"
                      value={formState.staffId}
                      onChange={(e) => setFormState(prev => ({ ...prev, staffId: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. GES-T89045 (Recommended)"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">NTC Number (Licence)</label>
                    <input
                      type="text"
                      value={formState.ntcNumber}
                      onChange={(e) => setFormState(prev => ({ ...prev, ntcNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="National Teaching Council No"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">SSNIT Number</label>
                    <input
                      type="text"
                      value={formState.ssnitNumber}
                      onChange={(e) => setFormState(prev => ({ ...prev, ssnitNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="Social Security No"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Professional Rank *</label>
                    {/* Perfect rank selection selection including "Not applicable" exactly representing instructions! */}
                    <select
                      value={formState.rank}
                      onChange={(e) => setFormState(prev => ({ ...prev, rank: e.target.value as TeacherRank }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      {TEACHER_RANKS.map(rk => (
                        <option key={rk} value={rk}>{rk}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Subjects or Class Taught</label>
                    <input
                      type="text"
                      value={formState.subjectsTaught}
                      onChange={(e) => setFormState(prev => ({ ...prev, subjectsTaught: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g., Computing / Class 3"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Login Email Address</label>
                    <input
                      type="email"
                      value={formState.email || ''}
                      onChange={(e) => setFormState(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="teacher.email@school.com"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Enables automatic Class Teacher role mapping on login.</p>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Assigned Class Role</label>
                    <select
                      value={formState.assignedClass || 'None'}
                      onChange={(e) => setFormState(prev => ({ ...prev, assignedClass: e.target.value as ClassType | 'None' }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="None">None / Subject Teacher Only</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls} (Class Teacher)</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Restricts teacher access to their assigned class data only.</p>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Highest Academic Qualifications</label>
                    <select
                      value={formState.highestAcademicQualifications}
                      onChange={(e) => setFormState(prev => ({ ...prev, highestAcademicQualifications: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none font-sans bg-white text-xs text-slate-800"
                    >
                      <option value="">-- Select Academic Qualification --</option>
                      <option value="Not applicable">Not applicable (N/A)</option>
                      <option value="Ph.D. / Doctorate">Ph.D. / Doctorate</option>
                      <option value="Master of Philosophy (M.Phil)">Master of Philosophy (M.Phil)</option>
                      <option value="Master of Education / Arts / Science (M.Ed / M.A / M.Sc)">Master of Education / Arts / Science (M.Ed / M.A / M.Sc)</option>
                      <option value="Bachelor of Education (B.Ed)">Bachelor of Education (B.Ed)</option>
                      <option value="Bachelor of Arts / Science (B.A / B.Sc)">Bachelor of Arts / Science (B.A / B.Sc)</option>
                      <option value="Post Graduate Diploma in Education (PGDE)">Post Graduate Diploma in Education (PGDE)</option>
                      <option value="Diploma in Basic Education (DBE)">Diploma in Basic Education (DBE)</option>
                      <option value="Diploma (Non-Education / Tertiary)">Diploma (Non-Education / Tertiary)</option>
                      <option value="Teacher Cert 'A'">Teacher Cert 'A'</option>
                      <option value="WASSCE / SHS Graduate">WASSCE / SHS Graduate</option>
                      <option value="Other">Other Academic Qualification</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Professional Licensing Qualifications</label>
                    <select
                      value={formState.professionalQualifications}
                      onChange={(e) => setFormState(prev => ({ ...prev, professionalQualifications: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none bg-white text-xs text-slate-800"
                    >
                      <option value="">-- Select Professional Qualifications --</option>
                      <option value="Not applicable">Not applicable (N/A)</option>
                      <option value="Licensed Teacher (NTC Certified)">Licensed Teacher (NTC Certified)</option>
                      <option value="Professional Teacher (Diploma/Degree in Education)">Professional Teacher (Diploma/Degree in Education)</option>
                      <option value="Provisional Licence Holder">Provisional Licence Holder</option>
                      <option value="Student / Intern License">Student / Intern License</option>
                      <option value="Non-Professional Teacher">Non-Professional Teacher</option>
                      <option value="Other">Other Professional Certificate</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-1">Date of First Appt.</label>
                      <input
                        type="date"
                        value={formState.dateOfFirstAppointment}
                        onChange={(e) => setFormState(prev => ({ ...prev, dateOfFirstAppointment: e.target.value }))}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-1">Date Posted Here</label>
                      <input
                        type="date"
                        value={formState.dateOfPostingToCurrentStation}
                        onChange={(e) => setFormState(prev => ({ ...prev, dateOfPostingToCurrentStation: e.target.value }))}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Academic District Jurisdiction</label>
                    <input
                      type="text"
                      value={formState.district}
                      onChange={(e) => setFormState(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Kumasi Metropolitan"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Educational Circuit Assigned</label>
                    <input
                      type="text"
                      value={formState.circuit}
                      onChange={(e) => setFormState(prev => ({ ...prev, circuit: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                      placeholder="e.g. Asokonyi Circuit"
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 bg-white">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-semibold transition cursor-pointer text-[12px] bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-xl shadow-xs transition cursor-pointer text-[12px]"
                >
                  <Check size={14} /> {isEditing ? 'Confirm Updates' : 'Enrol Faculty Member'}
                </button>
              </div>

            </form>

          </motion.div>
        </div>
      )}
    </AnimatePresence>

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
                Your browser blocks direct print triggers from inside the preview iframe. To print this roster, please click the <strong className="text-slate-800 font-bold">"Open in a new tab" ↗</strong> button at the top right of the application workspace first.
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
              
              <div id="teachers-roster-preview-card" className="w-full max-w-[650px] aspect-[1.414/1] bg-white p-6 text-black border shadow-2xl text-[8px] space-y-3 font-sans rounded-none overflow-y-auto">
                <div className="text-center pb-3 border-b-2 border-slate-800 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-stone-900">
                    {DbController.getSchoolInfo().name}
                  </h3>
                  <p className="text-[8px] font-mono mt-0.5 italic text-stone-600">
                    Motto: "{DbController.getSchoolInfo().motto}" | Official Staff Directory List
                  </p>
                  <div className="text-[7px] text-slate-500 font-mono mt-1">
                    Generated on: {new Date().toLocaleDateString()} | Active Personnel Registers
                  </div>
                </div>

                <h4 className="text-[9px] font-bold uppercase text-center mb-2 tracking-wider text-stone-900">
                  Academic Faculty & Administrative Staff Register (Landscape)
                </h4>

                <table className="w-full text-left border-collapse text-[7px] font-sans">
                  <thead>
                    <tr className="bg-stone-100 border-b border-stone-800">
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Staff ID</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Full Name</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Gender</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold font-mono">NTC Reg</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold font-mono">SSNIT NO</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Academic Ranks</th>
                      <th className="py-1 px-0.5 border border-stone-300 font-bold">Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-2 text-stone-400">No active staff profiles are currently saved.</td>
                      </tr>
                    ) : (
                      filteredTeachers.slice(0, 5).map(tea => (
                        <tr key={tea.id} className="border-b border-stone-200">
                          <td className="py-1 px-0.5 border border-stone-200 font-mono font-semibold">{tea.staffId}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-semibold">{tea.firstName} {tea.lastName}</td>
                          <td className="py-1 px-0.5 border border-stone-200">{tea.gender}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-mono">{tea.ntcNumber || 'N/A'}</td>
                          <td className="py-1 px-0.5 border border-stone-200 font-mono">{tea.ssnitNumber || 'N/A'}</td>
                          <td className="py-1 px-0.5 border border-stone-200 text-[6.5px] font-medium">{tea.rank}</td>
                          <td className="py-1 px-0.5 border border-stone-200">{tea.subjectsTaught}</td>
                        </tr>
                      ))
                    )}
                    {filteredTeachers.length > 5 && (
                      <tr>
                        <td colSpan={7} className="text-center py-1 bg-stone-50 text-[7px] text-indigo-600 font-mono italic">
                          ... and {filteredTeachers.length - 5} more staff credentials printed within high-fidelity PDF output stream ...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[8px] font-mono pt-2 border-t border-stone-300 text-center text-stone-700">
                  <div>Roster Total Staff: <strong className="text-stone-950">{filteredTeachers.length}</strong></div>
                  <div>NTC Certified: <strong>{filteredTeachers.filter(t => !!t.ntcNumber).length}</strong></div>
                </div>
              </div>
              
              <span className="text-[10px] text-slate-300 font-mono tracking-wide">Standard Landscape A4 Format Draft Miniature</span>
            </div>

            {/* Right: Setup Manual & Control */}
            <div className="w-full md:w-[400px] p-6 bg-white flex flex-col justify-between overflow-y-auto max-h-none md:max-h-[90vh]">
              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <Eye size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-950">Toggle Preview Mode & Print Controller</h4>
                    <p className="text-[10px] text-slate-400">Review staff directory print parameters</p>
                  </div>
                </div>

                <GoogleDriveExportControl 
                  elementId="teachers-roster-preview-card" 
                  defaultFilename="Faculty_Staff_Directory.pdf"
                  isLandscape={true} 
                />

                <div className="p-3 bg-indigo-50 border border-indigo-100/70 rounded-xl space-y-1 text-indigo-950 text-[11px]">
                  <span className="font-bold">🌐 Recommended: Landscape Layout</span>
                  <p className="text-[10px] text-indigo-800/90 leading-relaxed">
                    Faculty files are outputted in landscape grids. Set the print orientation setting to <strong>Landscape</strong> inside the native configuration dialog box.
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
                        Under the <strong>Destination</strong> list selector, switch to <strong className="text-slate-900 font-bold">Save as PDF</strong> as your target.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="font-bold text-[10px] text-slate-600 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                      <p className="text-[11px] leading-relaxed">
                        Set orientation layout to <strong className="text-indigo-600 font-bold">Landscape</strong>, paper size to <strong>A4</strong>, tick <strong>Background Graphics</strong>, and disable headers.
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

              <div className="flex items-center gap-3 pt-6 border-t border-slate-100 mt-6 font-sans">
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
                    handlePrintRegistry();
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

      {/* DELETION CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && teacherToDelete && (
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
              id="teacher-delete-confirmation-modal"
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
                    You are about to irreversibly purge the following teacher profile and credentials from the system database:
                  </p>
                </div>

                {/* Identity Card Block */}
                {teachers.find(t => t.id === teacherToDelete) && (
                  <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-left font-mono space-y-2.5">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px]">
                      <div className="col-span-2 border-b border-slate-100 pb-1.5">
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">Full Instructor Name</span>
                        <strong className="text-slate-900 font-bold">
                          {(() => {
                            const t = teachers.find(x => x.id === teacherToDelete)!;
                            return `${t.firstName} ${t.middleName ? t.middleName + ' ' : ''}${t.lastName}`;
                          })()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">Staff ID Number</span>
                        <strong className="text-slate-950 font-bold">{teachers.find(x => x.id === teacherToDelete)!.staffId}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">Professional Rank</span>
                        <strong className="text-slate-950 font-bold">{teachers.find(x => x.id === teacherToDelete)!.rank}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning message */}
                <div className="bg-rose-50 border border-rose-100/80 p-3.5 rounded-xl text-left text-rose-950 text-[11px] leading-relaxed space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-rose-800">
                    ⚠️ Deletion Policy Warning:
                  </p>
                  <p>
                    Retiring/deleting an active teacher profile does not delete class records, but will disassociate them as lead instructors. Make sure class handovers are handled properly before retiring staff. This action cannot be reverted.
                  </p>
                </div>

                {/* Controls */}
                <div className="w-full flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition text-center"
                    id="cancel-teacher-deletion"
                  >
                    Cancel, Keep Profile
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/10 cursor-pointer transition text-center"
                    id="confirm-teacher-deletion"
                  >
                    Yes, Purge Permanently
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TEACHERS CSV BULK IMPORT MODAL */}
      <AnimatePresence>
        {showImportModal && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowImportModal(false);
                setImportFile(null);
                setParsedTeachers([]);
                setImportError(null);
              }
            }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto no-print cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl border border-slate-200 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-hidden flex flex-col cursor-default font-sans text-xs my-4"
            >
              {/* Header */}
              <div className="p-6 pb-4 bg-white border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 leading-none">
                    <FileSpreadsheet className="text-indigo-600" size={18} />
                    Bulk Upload & Import Teacher Records
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">Upload multiple teacher profiles at once using a formatted CSV spreadsheet</p>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setParsedTeachers([]);
                    setImportError(null);
                  }}
                  className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Instruction Banner */}
                <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-50 text-[10px] text-indigo-700 font-bold">i</span>
                      Formatting Instruction Guide:
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-normal max-w-2xl">
                      Make sure your spreadsheet includes headers such as: <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-amber-800">First Name</code>, <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-amber-800">Last Name</code>, <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-amber-800">Staff ID</code> (unique), <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-amber-800">Gender</code>, <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-amber-800">Professional Rank</code>, and <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-amber-800">Subjects Taught</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-250 hover:bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 transition cursor-pointer self-start md:self-auto flex-shrink-0"
                  >
                    <FileDown size={14} className="text-slate-500" />
                    Download CSV Template
                  </button>
                </div>

                {/* Upload & Drag State */}
                {!importFile ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => importFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3 ${
                      dragActive 
                        ? 'border-indigo-505 bg-indigo-50/50' 
                        : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/20'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shadow-xs">
                      <Upload size={22} className={dragActive ? 'animate-bounce text-indigo-600' : ''} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-700 text-xs">Drag and drop your staff roster CSV file here</p>
                      <p className="text-[10px] text-slate-400">or click to browse your desktop storage library</p>
                    </div>
                    <input
                      type="file"
                      ref={importFileInputRef}
                      onChange={handleFileChange}
                      accept=".csv"
                      className="hidden"
                    />
                    <div className="pt-2 text-[9px] text-slate-400 max-w-md mx-auto">
                      Only structured <strong className="text-slate-600">CSV spreadsheet format files (.csv)</strong> are accepted. Maximum size 3MB.
                    </div>
                  </div>
                ) : (
                  /* File Info & Parsing Metrics Area */
                  <div className="space-y-4">
                    <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                          <FileSpreadsheet size={16} />
                        </div>
                        <div>
                          <strong className="block text-xs font-bold text-slate-800">{importFile.name}</strong>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {(importFile.size / 1024).toFixed(1)} KB • {parsedTeachers.length} rows loaded
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setImportFile(null);
                          setParsedTeachers([]);
                          setImportError(null);
                        }}
                        className="px-2.5 py-1 text-red-650 hover:bg-red-50 hover:text-red-700 rounded font-bold transition text-[10px] cursor-pointer"
                      >
                        Reset / Choose Another
                      </button>
                    </div>

                    {/* Parser Error Alert */}
                    {importError && (
                      <div className="bg-red-50 border border-red-150 p-4 rounded-xl text-red-900 space-y-1 text-xs">
                        <h5 className="font-bold flex items-center gap-1.5 text-red-800">
                          ⚠️ Parsing Failure Alert:
                        </h5>
                        <p>{importError}</p>
                      </div>
                    )}

                    {/* Roster Spreadsheet Preview Table */}
                    {!importError && parsedTeachers.length > 0 && (
                      <div className="space-y-2">
                        {/* Summary metrics header */}
                        <div className="flex items-center justify-between text-[11px] font-sans pb-1">
                          <span className="text-slate-500">
                            Spreadsheet breakdown preview summary:
                          </span>
                          <div className="flex gap-2.5">
                            <span className="bg-indigo-50 text-indigo-750 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                              Total: {parsedTeachers.length} rows
                            </span>
                            <span className="bg-emerald-50 text-emerald-750 font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                              Ready: {parsedTeachers.filter(p => p.errors.length === 0).length} valid
                            </span>
                            {parsedTeachers.filter(p => p.errors.length > 0).length > 0 && (
                              <span className="bg-rose-50 text-rose-750 font-bold px-2 py-0.5 rounded-full border border-rose-100">
                                Issues: {parsedTeachers.filter(p => p.errors.length > 0).length} flagged
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Scrolling scrollbar grid preview container */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto overflow-x-auto shadow-xs">
                          <table className="w-full text-left border-collapse text-[11px] min-w-[900px]">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                              <tr>
                                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-400 tracking-wider font-mono uppercase">Row</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-700">Full Name</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-700">Gender</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-700 font-mono">Staff ID</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-700">Professional Rank</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-700">Assignment</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-700">Credentials</th>
                                <th className="py-2.5 px-3 text-right font-semibold text-slate-700 pr-4">Status / Feedbacks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {parsedTeachers.map((rowVal, idx) => {
                                const { teacher, errors } = rowVal;
                                const hasErrors = errors.length > 0;
                                return (
                                  <tr key={idx} className={hasErrors ? 'bg-rose-50/20' : 'hover:bg-slate-50/30'}>
                                    <td className="py-2 px-3 font-mono font-bold text-slate-400">{idx + 2}</td>
                                    <td className="py-2 px-3 font-semibold text-slate-800">
                                      {teacher.firstName || <span className="text-red-500 italic">[Empty]</span>} {teacher.middleName ? teacher.middleName + ' ' : ''}{teacher.lastName || <span className="text-red-500 italic">[Empty]</span>}
                                    </td>
                                    <td className="py-2 px-3 text-slate-600">{teacher.gender}</td>
                                    <td className="py-2 px-3 font-mono font-semibold text-stone-700">{teacher.staffId || <span className="text-red-500 italic">[Empty]</span>}</td>
                                    <td className="py-2 px-3">
                                      <span className="font-semibold text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 border border-amber-100">{teacher.rank}</span>
                                    </td>
                                    <td className="py-2 px-3 font-medium text-slate-700">{teacher.subjectsTaught || 'Not specified'}</td>
                                    <td className="py-2 px-3 text-slate-500 truncate max-w-[150px]">
                                      {teacher.highestAcademicQualifications || 'N/A'}{teacher.professionalQualifications && ` | ${teacher.professionalQualifications}`}
                                    </td>
                                    <td className="py-2 px-3 text-right pr-4">
                                      {hasErrors ? (
                                        <div className="inline-flex flex-col items-end gap-0.5">
                                          {errors.map((err, eIdx) => (
                                            <span key={eIdx} className="text-[9px] font-semibold text-red-600 bg-red-100/50 px-1.5 py-0.5 rounded">
                                              ⚠️ {err}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                          <Check size={10} /> Ready
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Verification Notice warning/success footer */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 flex items-center justify-between text-[10px] text-slate-400">
                          <span>
                            * Complete validation check: Rows with issues (⚠️) are skipped on execution. Correct your sheet and revalidate if necessary.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-150 flex items-center justify-between">
                <div className="text-[10px] text-slate-400 italic">
                  * Dynamic auto ID codes will generate format `TXXXX` if ID column isn't provided.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                      setParsedTeachers([]);
                      setImportError(null);
                    }}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold rounded-xl cursor-pointer transition text-xs shadow-2xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={!importFile || parsedTeachers.length === 0 || parsedTeachers.filter(p => p.errors.length === 0).length === 0}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white font-bold rounded-xl cursor-pointer transition text-xs shadow-md shadow-indigo-600/10 inline-flex items-center gap-1.5"
                  >
                    <Check size={14} /> Execute Import ({parsedTeachers.filter(p => p.errors.length === 0).length} valid rosters)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SECTION DATA CONTROLS */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3 no-print">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldAlert className="text-indigo-500" size={14} /> Section Teacher Controls
        </h4>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Manage local instructor profile states, erase database inputs, and process personnel purge states for this module.
        </p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleClearInputs}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-850 hover:bg-slate-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs"
          >
            <Eraser size={13} /> Clear All Inputs
          </button>
          <button
            type="button"
            onClick={handleDeleteActiveSelection}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 hover:text-amber-850 hover:bg-amber-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs"
          >
            <RotateCcw size={13} /> Delete Active / Selected Teacher
          </button>
          <button
            type="button"
            onClick={handleDeleteAllTeachers}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:text-rose-850 hover:bg-rose-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs sm:ml-auto"
          >
            <Trash2 size={13} /> Delete All Section Data
          </button>
        </div>
      </div>

    </div>
  );
}
