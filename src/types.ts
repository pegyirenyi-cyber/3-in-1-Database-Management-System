export interface SchoolInfo {
  id: string;
  name: string;
  motto: string;
  logoUrl: string;
  schoolNumber: string;
  emisCode: string;
  gpsAddress: string;
  schoolType: 'Public' | 'Private';
  headteacherName: string;
  telephone: string;
  email: string;
  qualifications: string;
  highestAcademicQualifications: string;
  district: string;
  circuit: string;
}

export type ClassType =
  | 'Nursery'
  | 'KG.1'
  | 'KG.2'
  | 'Class 1'
  | 'Class 2'
  | 'Class 3'
  | 'Class 4'
  | 'Class 5'
  | 'Class 6'
  | 'JHS 1'
  | 'JHS 2'
  | 'JHS 3';

export const CLASSES: ClassType[] = [
  'Nursery',
  'KG.1',
  'KG.2',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'JHS 1',
  'JHS 2',
  'JHS 3'
];

export type SectionType = 'Faith' | 'Harmony' | 'Humility' | 'Peace';

export const SECTIONS: SectionType[] = ['Faith', 'Harmony', 'Humility', 'Peace'];

export interface Student {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  class: ClassType;
  gender: 'Male' | 'Female';
  dateOfBirth: string; // YYYY-MM-DD
  placeOfBirth: string;
  status: 'Day' | 'Boarder';
  section: SectionType;
  nationality: string;
  guardianName: string;
  guardianTelephone: string;
  guardianOccupation: string;
  residentialAddress: string;
  photoUrl: string; // Base64 or local path
  createdAt: string;
}

export type TeacherRank =
  | 'Superintendent II'
  | 'Superintendent I'
  | 'Senior Superintendent II'
  | 'Senior Superintendent I'
  | 'Principal Superintendent'
  | 'Assistant Director II'
  | 'Assistant Director I'
  | 'Deputy Director'
  | 'Director II'
  | 'Director I'
  | 'Not applicable';

export const TEACHER_RANKS: TeacherRank[] = [
  'Superintendent II',
  'Superintendent I',
  'Senior Superintendent II',
  'Senior Superintendent I',
  'Principal Superintendent',
  'Assistant Director II',
  'Assistant Director I',
  'Deputy Director',
  'Director II',
  'Director I',
  'Not applicable'
];

export interface Teacher {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: 'Male' | 'Female';
  dateOfBirth: string;
  placeOfBirth: string;
  subjectsTaught: string; // Description of Class teacher/Subjects
  professionalQualifications: string;
  highestAcademicQualifications: string;
  rank: TeacherRank;
  dateOfFirstAppointment: string;
  dateOfPostingToCurrentStation: string;
  staffId: string;
  ntcNumber: string;
  ssnitNumber: string;
  district: string;
  circuit: string;
  photoUrl: string;
  createdAt: string;
}

export type AttendanceStatus = 'Present' | 'Holiday' | 'Absent';

export interface AttendanceRecord {
  id: string; // date_studentId
  date: string; // YYYY-MM-DD
  studentId: string;
  studentName: string;
  class: ClassType;
  status: AttendanceStatus;
}

export type AcademicYearType =
  | '2025/2026'
  | '2026/2027'
  | '2027/2028'
  | '2028/2029'
  | '2029/2030';

export const ACADEMIC_YEARS: AcademicYearType[] = [
  '2025/2026',
  '2026/2027',
  '2027/2028',
  '2028/2029',
  '2029/2030'
];

export type TermType = 'Term 1' | 'Term 2' | 'Term 3';

export const TERMS: TermType[] = ['Term 1', 'Term 2', 'Term 3'];

export type SubjectType =
  | 'English Language'
  | 'Mathematics'
  | 'Integrated Science'
  | 'Social Studies'
  | 'Religious And Moral Education'
  | 'Computing'
  | 'Creative Arts And Design'
  | 'French Language'
  | 'Our World Our People'
  | 'Career Technology'
  | 'History'
  | 'Ghanaian Language And Culture';

export const SUBJECTS: SubjectType[] = [
  'English Language',
  'Mathematics',
  'Integrated Science',
  'Social Studies',
  'Religious And Moral Education',
  'Computing',
  'Creative Arts And Design',
  'French Language',
  'Our World Our People',
  'Career Technology',
  'History',
  'Ghanaian Language And Culture'
];

export interface StudentAssessment {
  id: string; // auth-uid + studentId + academicYear + term + subject
  studentId: string;
  studentName: string;
  class: ClassType;
  academicYear: AcademicYearType;
  term: TermType;
  subject: SubjectType;
  // Assessments schema
  exercises: number[]; // Array of exactly 4 numbers (0-10 each) -> total 40
  tests: number[]; // Array of exactly 2 numbers (0-20 each) -> total 40
  projectWork: number; // 0-10
  groupWork: number; // 0-10
  // Result fields
  classScoreTotal: number; // 0-100 sum
  classScore50: number; // classScoreTotal * 0.50
  examScore100: number; // 0-100 exam mark
  examScore50: number; // examScore100 * 0.50
  totalScore: number; // classScore50 + examScore50 (0-100)
  gradeLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  remarks: string; // Emerging, Developing, etc.
  position?: number; // Position in class for this subject
  teacherRemarks?: string;
}

export type UserRole = 'Admin' | 'Headteacher';

export interface UserAccount {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type ThemeType = 'Classic' | 'Emerald' | 'Ruby' | 'Cosmic' | 'Gold' | 'Sophisticated Dark' | 'Crystal Glass';

export interface FeePayment {
  id: string; // transaction ID
  amount: number;
  date: string; // YYYY-MM-DD
  component: 'School Fees' | 'Utility Bill' | 'Sports Fees' | 'PTA dues' | 'Other Fee';
  method: 'Cash' | 'Mobile Money' | 'Bank Transfer' | 'Cheque';
  receiptNo: string;
  remarks?: string;
}

export interface StudentFeeBill {
  id: string; // studentId + "_" + academicYear + "_" + term
  studentId: string;
  studentName: string;
  class: ClassType;
  academicYear: AcademicYearType;
  term: TermType;
  
  // Bills per component
  schoolFees: number;
  utilityBill: number;
  sportsFees: number;
  ptaDues: number;
  otherFee: number;
  otherFeeDescription?: string;
  
  // Installments list
  payments: FeePayment[];
  
  createdAt: string;
  updatedAt: string;
}

