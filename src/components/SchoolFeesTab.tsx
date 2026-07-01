import { useState, useMemo, useRef, ChangeEvent, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Student, 
  ClassType, 
  CLASSES, 
  AcademicYearType, 
  ACADEMIC_YEARS, 
  TermType, 
  TERMS, 
  StudentFeeBill, 
  FeePayment, 
  SchoolInfo 
} from '../types';
import { DbController, getStorageItem, setStorageItem } from '../db';
import { QRCodeSVG } from 'qrcode.react';
import PaystackPaymentTrigger from './PaystackPaymentTrigger';
import { generatePdfFromHtml, downloadBlobLocally } from '../pdfHelper';
import { ThemeStyles } from './ThemeWrapper';
import { generateSecureToken } from '../utils';
import { getWatermarkHtml } from '../utils';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  X, 
  Check, 
  Save, 
  FileDown, 
  FileSpreadsheet,
  Coins, 
  Receipt, 
  CreditCard, 
  Calendar, 
  User, 
  Info, 
  Filter, 
  BookOpen, 
  AlertTriangle,
  Eraser,
  RotateCcw,
  Eye,
  Bell,
  Mail,
  Send,
  MessageSquare
} from 'lucide-react';

interface Props {
  theme: ThemeStyles;
  students: Student[];
  schoolInfo: SchoolInfo;
  isAutoSave: boolean;
  onManualSave: () => void;
  selectedAcademicYear?: AcademicYearType;
  setSelectedAcademicYear?: (yr: AcademicYearType) => void;
  selectedTerm?: TermType;
  setSelectedTerm?: (tm: TermType) => void;
}

export default function SchoolFeesTab({ 
  theme, 
  students, 
  schoolInfo, 
  isAutoSave, 
  onManualSave,
  selectedAcademicYear: propAcademicYear,
  setSelectedAcademicYear: propSetAcademicYear,
  selectedTerm: propTerm,
  setSelectedTerm: propSetTerm
}: Props) {
  // Navigation & selectors
  const [localAcademicYear, setLocalAcademicYear] = useState<AcademicYearType>('2026/2027');
  const [localTerm, setLocalTerm] = useState<TermType>('Term 1');

  const selectedAcademicYear = propAcademicYear || localAcademicYear;
  const setSelectedAcademicYear = propSetAcademicYear || setLocalAcademicYear;

  const selectedTerm = propTerm || localTerm;
  const setSelectedTerm = propSetTerm || setLocalTerm;

  const [selectedClass, setSelectedClass] = useState<ClassType | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected student for billing setup & details
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  // Core billing states loading
  const [feeBills, setFeeBills] = useState<StudentFeeBill[]>(() => DbController.getStudentFeeBills());
  
  // Add payment form states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'manual' | 'paystack'>('manual');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentComponent, setPaymentComponent] = useState<FeePayment['component']>('School Fees');
  const [paymentMethod, setPaymentMethod] = useState<FeePayment['method']>('Cash');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Selected payment for receipt viewing/generation
  const [activeReceiptPayment, setActiveReceiptPayment] = useState<{ bill: StudentFeeBill; payment: FeePayment } | null>(null);
  const [activeLedgerStudent, setActiveLedgerStudent] = useState<StudentFeeBill | null>(null);
  const [receiptEmailOverride, setReceiptEmailOverride] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Payment Reminder states
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderCustomMessage, setReminderCustomMessage] = useState('');
  const [reminderClosingDate, setReminderClosingDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [reminderRecipientPhone, setReminderRecipientPhone] = useState('');
  const [reminderSendingSms, setReminderSendingSms] = useState(false);
  const [reminderSmsSuccess, setReminderSmsSuccess] = useState<string | null>(null);

  // Automated Fee Invoice States
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [invoiceDueDate, setInvoiceDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [invoiceNotes, setInvoiceNotes] = useState(
    'Please deposit outstanding fees directly into the school account: GeeTech Academy, GCB Bank, Account No. 10111223344, or send via MTN Mobile Money to 0244123456 (Merchant: GeeTech Academy). Please present your deposit slip or transaction ID to the accounts office for official receipting.'
  );

  // SMS Logs for delivery tracking
  const [smsLogs, setSmsLogs] = useState<{ sid: string; studentName: string; phone: string; status: string; sentAt: number }[]>(() => {
    return getStorageItem('smsLogs_fees_reminders', []);
  });

  const [bulkReceiptData, setBulkReceiptData] = useState<{ bill: StudentFeeBill; payment: FeePayment }[]>([]);

  useEffect(() => {
    setStorageItem('smsLogs_fees_reminders', smsLogs);
  }, [smsLogs]);

  useEffect(() => {
    // Poll pending SMS statuses
    const interval = setInterval(() => {
      const pendingLogs = smsLogs.filter(log => !['delivered', 'failed', 'undelivered'].includes(log.status.toLowerCase()));
      if (pendingLogs.length > 0) {
        pendingLogs.forEach(async (log) => {
          try {
            const res = await fetch(`/api/communications/sms-status/${log.sid}`);
            if (res.ok) {
              const data = await res.json();
              if (data.status && data.status.toLowerCase() !== log.status.toLowerCase()) {
                setSmsLogs(prev => prev.map(l => l.sid === log.sid ? { ...l, status: data.status } : l));
              }
            }
          } catch (err) {}
        });
      }
    }, 5000); // poll every 5 seconds
    return () => clearInterval(interval);
  }, [smsLogs]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const urlStudentId = q.get('studentId');
      const urlReceiptNo = q.get('receiptNo');
      
      if (urlStudentId) {
        setActiveStudentId(urlStudentId);
        
        if (urlReceiptNo) {
          // Find if there is a bill containing this payment receipt
          const foundBill = feeBills.find(b => 
            b.studentId === urlStudentId && 
            b.payments.some(p => p.receiptNo === urlReceiptNo)
          );
          if (foundBill) {
            const foundPayment = foundBill.payments.find(p => p.receiptNo === urlReceiptNo);
            if (foundPayment) {
              setActiveReceiptPayment({ bill: foundBill, payment: foundPayment });
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to parse URL query params for ledger", err);
    }
  }, [feeBills]);

  useEffect(() => {
    if (activeReceiptPayment) {
      const studentObj = students.find(s => s.id === activeReceiptPayment.bill.studentId);
      const emailVal = studentObj?.guardianEmail || studentObj?.email || '';
      setReceiptEmailOverride(emailVal);
    } else {
      setReceiptEmailOverride('');
    }
  }, [activeReceiptPayment, students]);

  // Form handling state for currently active selected student
  const activeStudent = useMemo(() => students.find(s => s.id === activeStudentId), [students, activeStudentId]);
  
  const activeBill = useMemo(() => {
    if (!activeStudent) return null;
    return getStudentBill(activeStudent);
  }, [activeStudent, feeBills, selectedAcademicYear, selectedTerm]);

  // Outstanding calculations for selected student
  const activeExpectedAndPaid = useMemo(() => {
    if (!activeStudent || !activeBill) return { expected: 0, paid: 0, bal: 0 };
    const expected = activeBill.schoolFees + activeBill.utilityBill + activeBill.sportsFees + activeBill.ptaDues + activeBill.otherFee;
    const paid = activeBill.payments.reduce((sum, p) => sum + p.amount, 0);
    const bal = expected - paid;
    return { expected, paid, bal };
  }, [activeStudent, activeBill]);

  const compileReminderMessage = (templateText: string) => {
    if (!activeStudent) return templateText;
    const { bal } = activeExpectedAndPaid;
    const token = generateSecureToken(activeStudent.id, selectedAcademicYear, selectedTerm);
    const parentUrl = `${window.location.origin}/?studentId=${activeStudent.id}&year=${encodeURIComponent(selectedAcademicYear)}&term=${encodeURIComponent(selectedTerm)}&token=${token}`;
    
    return templateText
      .replace(/{guardianName}/g, activeStudent.guardianName || 'Guardian')
      .replace(/{firstName}/g, activeStudent.firstName)
      .replace(/{lastName}/g, activeStudent.lastName)
      .replace(/{studentId}/g, activeStudent.id)
      .replace(/{balance}/g, bal.toFixed(2))
      .replace(/{term}/g, selectedTerm)
      .replace(/{academicYear}/g, selectedAcademicYear)
      .replace(/{reportLink}/g, parentUrl);
  };

  const compileRandomReminderMessage = (templateText: string) => {
    return templateText
      .replace(/{guardianName}/g, 'Abigail Owusu')
      .replace(/{firstName}/g, 'Emmanuel')
      .replace(/{lastName}/g, 'Mensah')
      .replace(/{studentId}/g, 'STU-8821-XP')
      .replace(/{balance}/g, '150.00')
      .replace(/{term}/g, 'Term 1')
      .replace(/{academicYear}/g, '2026/2027')
      .replace(/{reportLink}/g, 'https://geetech.edu/portal?id=demo&token=secure_example');
  };

  const handleOpenReminderModal = () => {
    if (!activeStudent || !activeBill) return;

    setReminderRecipientPhone(activeStudent.guardianTelephone || '');
    setReminderSmsSuccess(null);
    setReminderCustomMessage(
      `Dear {guardianName}, this is a payment reminder for {firstName} {lastName} ({studentId}). Our school ledger shows an outstanding balance of GHS {balance} for {term}, {academicYear}. Kindly arrange to settle this amount. You can securely view/download the full bill & receipt ledger here: {reportLink}`
    );
    setShowReminderModal(true);
  };

  const handleOpenInvoice = () => {
    if (!activeStudent) return;
    const yearPart = selectedAcademicYear.split('/')[0];
    const randPart = Math.floor(1000 + Math.random() * 9000);
    setInvoiceNo(`INV-${yearPart}-${activeStudent.id}-${randPart}`);
    
    // Set default invoice date to today
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    
    // Default due date: 14 days from now
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setInvoiceDueDate(d.toISOString().split('T')[0]);
    
    setShowInvoiceModal(true);
  };

  const handleSendReminderSMS = async () => {
    if (!reminderRecipientPhone) return;
    setReminderSendingSms(true);
    setReminderSmsSuccess(null);

    const sName = `${activeStudent?.firstName} ${activeStudent?.lastName}`;
    const sGuardian = activeStudent?.guardianName || 'Guardian';

    try {
      const res = await fetch('/api/communications/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: reminderRecipientPhone.trim(),
          body: compileReminderMessage(reminderCustomMessage)
        })
      });

      const parsed = await res.json();
      
      if (res.ok && parsed.success) {
        // Add to student database if parent tel changed or was blank
        if (activeStudent && activeStudent.guardianTelephone !== reminderRecipientPhone) {
          try {
            const updatedStudent = {
              ...activeStudent,
              guardianTelephone: reminderRecipientPhone
            };
            await DbController.saveStudent(updatedStudent);
            if (navigator.onLine) {
              DbController.syncAllDataFromFirebase().catch(e => console.warn(e));
            }
          } catch (err) {
            console.warn("Failed to sync guardian telephone updates:", err);
          }
        }
        
        // Save to logs
        setSmsLogs(prev => [
          { sid: parsed.sid, studentName: sName, phone: reminderRecipientPhone, status: 'Sent', sentAt: Date.now() },
          ...prev
        ]);
        
        setReminderSmsSuccess(`Automated payment compliance SMS reminder successfully dispatched to parent ${sGuardian} (${reminderRecipientPhone})!`);
      } else {
        showToast(parsed.message || "Failed to dispatch SMS reminder.", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to contact SMS gateway.", "error");
    }

    setReminderSendingSms(false);
  };

  const handleSendReminderWhatsApp = () => {
    if (!reminderRecipientPhone) return;
    
    let phone = reminderRecipientPhone.trim().replace(/[\s\-\(\)\+]/g, '');
    if (phone.startsWith('0') && phone.length === 10) {
      phone = '233' + phone.substring(1);
    }
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(compileReminderMessage(reminderCustomMessage))}`;
    
    const sName = activeStudent ? `${activeStudent.firstName} ${activeStudent.lastName}` : 'Student';
    const sGuardian = activeStudent?.guardianName || 'Guardian';
    
    setSmsLogs(prev => [
      { sid: `WA_${Date.now()}`, studentName: sName, phone: reminderRecipientPhone, status: 'WhatsApp Sent', sentAt: Date.now() },
      ...prev
    ]);

    if (activeStudent && activeStudent.guardianTelephone !== reminderRecipientPhone) {
      try {
        const updatedStudent = {
          ...activeStudent,
          guardianTelephone: reminderRecipientPhone
        };
        DbController.saveStudent(updatedStudent);
      } catch (err) {
        console.warn("Failed to sync guardian telephone updates:", err);
      }
    }

    window.open(whatsappUrl, '_blank');
    setReminderSmsSuccess(`Formatted WhatsApp reminder opened in standard secure web chat view!`);
  };

  // Notification / Feedback Toast states
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleClearInputs = () => {
    setPaymentAmount('');
    setPaymentRemarks('');
    setPaymentComponent('School Fees');
    setPaymentMethod('Cash');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    showToast("Resetted active payment dialogue inputs to blank.", "success");
  };

  const handleDeleteActiveSelection = () => {
    if (activeStudentId) {
      if (window.confirm("Do you want to delete and reset fee accounts billing data for the currently active student?")) {
        const nextBills = feeBills.filter(b => b.studentId !== activeStudentId);
        setFeeBills(nextBills);
        const toDelete = feeBills.filter(b => b.studentId === activeStudentId);
        toDelete.forEach(b => {
          if (b.id) DbController.deleteStudentFeeBill(b.id);
        });
        setActiveStudentId(null);
        showToast("Active student fee log successfully reset.", "success");
      }
    } else {
      showToast("Please select a student from the fee ledger directory first.", "error");
    }
  };

  const handleDeleteAllFees = () => {
    if (window.confirm("CRITICAL WARNING: Are you sure you want to completely delete all historical Student Fee Bills and payments transactions ledger? This action is permanent and cannot be undone.")) {
      DbController.clearAllStudentFeeBills();
      setFeeBills([]);
      onManualSave();
      showToast("Successfully purged all recorded fee logs and ledger transactions.", "success");
    }
  };

  // Synchronize state with LocalStorage / Cloud
  const handleSaveBill = (updatedBill: StudentFeeBill) => {
    const nextBills = feeBills.map(b => b.id === updatedBill.id ? updatedBill : b);
    if (!nextBills.some(b => b.id === updatedBill.id)) {
      nextBills.push(updatedBill);
    }
    setFeeBills(nextBills);
    DbController.saveStudentFeeBill(updatedBill);
    if (!isAutoSave) {
      onManualSave();
    }
  };

  const handleBulkSetup = (targetClass: ClassType | 'All', values: {
    schoolFees: number;
    utilityBill: number;
    sportsFees: number;
    ptaDues: number;
    otherFee: number;
    otherFeeDescription: string;
  }) => {
    // Collect all students fitting description
    const targetStudents = students.filter(s => targetClass === 'All' || s.class === targetClass);
    if (targetStudents.length === 0) {
      showToast("No students found in the target class class directory.", "error");
      return;
    }

    let updatedCount = 0;
    const updatedBills = [...feeBills];

    targetStudents.forEach(student => {
      const billId = `${student.id}_${selectedAcademicYear}_${selectedTerm}`.replace(/\//g, '-');
      const existingIdx = updatedBills.findIndex(b => b.id === billId);

      if (existingIdx >= 0) {
        // Update bills but maintain payments of this account
        const existing = updatedBills[existingIdx];
        const updated: StudentFeeBill = {
          ...existing,
          ...values,
          updatedAt: new Date().toISOString()
        };
        updatedBills[existingIdx] = updated;
        DbController.saveStudentFeeBill(updated);
      } else {
        // Create new account
        const newBill: StudentFeeBill = {
          id: billId,
          studentId: student.id,
          studentName: `${student.firstName} ${student.middleName ? student.middleName + ' ' : ''}${student.lastName}`,
          class: student.class,
          academicYear: selectedAcademicYear,
          term: selectedTerm,
          ...values,
          payments: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        updatedBills.push(newBill);
        DbController.saveStudentFeeBill(newBill);
      }
      updatedCount++;
    });

    setFeeBills(updatedBills);
    if (!isAutoSave) {
      onManualSave();
    }
    showToast(`Successfully set standard term bills for ${updatedCount} student registries.`, 'success');
  };

  const handleClearAllFees = () => {
    if (window.confirm("Are you absolutely sure you want to delete ALL student school fee accounts and payment installments across all terms? This is irreversible.")) {
      DbController.clearAllStudentFeeBills();
      setFeeBills([]);
      setActiveStudentId(null);
      showToast("All school fees database records have been securely initialized and cleared.", 'success');
    }
  };

  // Find the bill state for a given student
  function getStudentBill(student: Student): StudentFeeBill {
    const billId = `${student.id}_${selectedAcademicYear}_${selectedTerm}`.replace(/\//g, '-');
    const found = feeBills.find(b => b.id === billId);
    if (found) return found;

    // Default template-less state
    return {
      id: billId,
      studentId: student.id,
      studentName: `${student.firstName} ${student.middleName ? student.middleName + ' ' : ''}${student.lastName}`,
      class: student.class,
      academicYear: selectedAcademicYear,
      term: selectedTerm,
      schoolFees: 0,
      utilityBill: 0,
      sportsFees: 0,
      ptaDues: 0,
      otherFee: 0,
      otherFeeDescription: '',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // Aggregate totals
  const overallStats = useMemo(() => {
    // Filtered by selected year and term
    const activeTermAccounts = feeBills.filter(b => b.academicYear === selectedAcademicYear && b.term === selectedTerm);
    
    let totalExpected = 0;
    let totalPaid = 0;

    activeTermAccounts.forEach(bill => {
      // expected sum
      totalExpected += (bill.schoolFees || 0) + (bill.utilityBill || 0) + (bill.sportsFees || 0) + (bill.ptaDues || 0) + (bill.otherFee || 0);
      // paid sum
      const paidSum = bill.payments.reduce((sum, p) => sum + p.amount, 0);
      totalPaid += paidSum;
    });

    const totalOutstanding = totalExpected - totalPaid;
    const collectionPercent = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

    return {
      totalExpected,
      totalPaid,
      totalOutstanding,
      collectionPercent,
      activeAccountsCount: activeTermAccounts.length
    };
  }, [feeBills, selectedAcademicYear, selectedTerm]);

  // Handle bill details modification
  const handleEditBillComponent = (field: keyof Omit<StudentFeeBill, 'payments' | 'id'>, value: any) => {
    if (!activeBill) return;
    const nextBill = {
      ...activeBill,
      [field]: value,
      updatedAt: new Date().toISOString()
    };
    handleSaveBill(nextBill);
  };

  const handleAddPayment = (e: FormEvent) => {
    e.preventDefault();
    if (!activeBill || !activeStudent) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      showToast("Please specify a valid payment amount greater than zero.", "error");
      return;
    }

    // Generate neat clean unique receipt number GSE-FEES-YYYY-{Random}
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const generatedReceipt = `GTIMS-${selectedAcademicYear.split('/')[0]}-${randPart}`;

    const newPayment: FeePayment = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      amount,
      date: paymentDate,
      component: paymentComponent,
      method: paymentMethod,
      receiptNo: generatedReceipt,
      remarks: paymentRemarks.trim() || undefined
    };

    const nextBill: StudentFeeBill = {
      ...activeBill,
      payments: [...activeBill.payments, newPayment],
      updatedAt: new Date().toISOString()
    };

    handleSaveBill(nextBill);
    setShowPaymentModal(false);
    setPaymentAmount('');
    setPaymentRemarks('');
    showToast(`Installment of GHS ${amount.toFixed(2)} received from ${activeBill.studentName}. Receipt Generated.`, 'success');
  };

  const handleDeletePayment = (paymentId: string) => {
    if (!activeBill) return;
    if (window.confirm("Are you sure you want to void/delete this fee installment payment transaction? This subtraction will affect student balances immediately.")) {
      const nextPayments = activeBill.payments.filter(p => p.id !== paymentId);
      const nextBill: StudentFeeBill = {
        ...activeBill,
        payments: nextPayments,
        updatedAt: new Date().toISOString()
      };
      handleSaveBill(nextBill);
      showToast("Installment payment transaction successfully deleted and voided.", "success");
    }
  };

  const handleBulkPrintReceipts = () => {
    const data = filteredStudents
      .map(student => {
        const bill = getStudentBill(student);
        if (bill.payments.length === 0) return null;
        // Get the latest payment
        const latestPayment = [...bill.payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        return { bill, payment: latestPayment };
      })
      .filter(item => item !== null) as { bill: StudentFeeBill; payment: FeePayment }[];

    if (data.length === 0) {
      showToast("No payments found for the selected students in this term.", "error");
      return;
    }

    setBulkReceiptData(data);
    showToast(`Generating bulk receipts for ${data.length} students...`, "success");
    
    // Give it a bit of time to render the hidden print area then trigger print
    setTimeout(() => {
      handlePrintStandard('bulk-receipts-print-area');
      // We don't clear immediately to allow print window to read it
      setTimeout(() => setBulkReceiptData([]), 2000);
    }, 1000);
  };

  const filenameFriendly = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const handleExportFeesPDF = async (elementId: string, filename: string) => {
    try {
      const isReceipt = elementId === 'fee-receipt-print-area' || elementId === 'bulk-receipts-print-area';
      const result = await generatePdfFromHtml(elementId, filename, isReceipt); // Use landscape (isReceipt) for DL
      downloadBlobLocally(result.blob, result.filename);
      showToast("PDF report generated successfully!");
    } catch (e: any) {
      showToast(`Error creating PDF resource: ${e.message}`, "error");
    }
  };

  const handlePrintStandard = (elementId: string) => {
    const printContent = document.getElementById(elementId);
    if (!printContent) return;
    try {
      const isReceipt = elementId === 'fee-receipt-print-area' || elementId === 'bulk-receipts-print-area';
      const windowUrl = 'about:blank';
      const uniqueName = new Date().getTime().toString();
      const printWindow = window.open(windowUrl, uniqueName, 'left=100,top=100,width=900,height=900');
      if (!printWindow) {
        showToast("Popups are blocked by your browser container. Please export PDF or enable popups in settings to print.", "error");
        return;
      }
      
      // Build beautiful offsite styles to accompany printout
      printWindow.document.write(`
        <html>
          <head>
            <title>${filenameFriendly(schoolInfo.name) || 'Printout'}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
            <style>
              body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1e293b; padding: 24px; position: relative; }
              .font-mono { font-family: 'JetBrains Mono', monospace; }
              .receipt-container { margin-bottom: 20px; page-break-after: always; }
              @media print {
                body { padding: 0; }
                button { display: none; }
                @page { 
                  size: ${isReceipt ? '220mm 110mm' : 'A4'}; 
                  margin: 0; 
                }
                #fee-receipt-print-area, .bulk-receipt-item {
                  width: 220mm !important;
                  height: 110mm !important;
                  padding: 8mm 10mm !important;
                  overflow: hidden !important;
                  page-break-after: always;
                }
              }
            </style>
          </head>
          <body>
            ${getWatermarkHtml(schoolInfo.crestUrl)}
            <div class="${isReceipt ? 'w-[220mm]' : 'max-w-4xl'} mx-auto">${printContent.innerHTML}</div>
            <script>
              window.onload = function() {
                setTimeout(function(){ window.print(); window.close(); }, 800);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err: any) {
      console.error("Window print exception: ", err);
      showToast("Browser sandboxing blocks direct print popups. Please export PDF.", "error");
    }
  };

  const handleSendReceiptEmail = async () => {
    if (!activeReceiptPayment) return;
    if (!receiptEmailOverride || !receiptEmailOverride.trim()) {
      showToast("Please specify a valid parent/guardian email address.", "error");
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await fetch('/api/communications/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: receiptEmailOverride.trim(),
          studentName: activeReceiptPayment.bill.studentName,
          studentId: activeReceiptPayment.bill.studentId,
          receiptNo: activeReceiptPayment.payment.receiptNo,
          amount: activeReceiptPayment.payment.amount,
          component: activeReceiptPayment.payment.component,
          method: activeReceiptPayment.payment.method,
          date: activeReceiptPayment.payment.date
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        showToast(`Digital copy of receipt ${activeReceiptPayment.payment.receiptNo} successfully sent to ${receiptEmailOverride.trim()}`, "success");
      } else {
        showToast(result.message || "Failed to dispatch digital receipt copy.", "error");
      }
    } catch (err: any) {
      console.error("Failed to send receipt email:", err);
      showToast(err.message || "Network error occurred while connecting to email gateway.", "error");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleExportLedgerCSV = (student: StudentFeeBill) => {
    if (!student) return;

    // Build chronological debits and credits list
    const debits = [
      { date: student.academicYear + " - " + student.term, desc: "Standard School Tuition Fees", debit: student.schoolFees, credit: 0 },
      { date: student.academicYear + " - " + student.term, desc: "Utility and Maintenance levy", debit: student.utilityBill, credit: 0 },
      { date: student.academicYear + " - " + student.term, desc: "Sports development dues", debit: student.sportsFees, credit: 0 },
      { date: student.academicYear + " - " + student.term, desc: "PTA annual dues allocation", debit: student.ptaDues, credit: 0 },
    ];
    if (student.otherFee > 0) {
      debits.push({
        date: student.academicYear + " - " + student.term,
        desc: `Other Levy / Miscellaneous (${student.otherFeeDescription || 'Other'})`,
        debit: student.otherFee,
        credit: 0
      });
    }

    const credits = student.payments.map((p) => ({
      date: p.date,
      desc: `Payment Receipt: ${p.receiptNo} (${p.component} via ${p.method})`,
      debit: 0,
      credit: p.amount
    }));

    const ledgerEntries = [...debits, ...credits];

    const csvRows: string[][] = [];

    // Metadata
    csvRows.push(["STUDENT TRANSACTION STATEMENT & LEDGER"]);
    csvRows.push([]);
    csvRows.push(["Student Name", student.studentName]);
    csvRows.push(["Student ID", student.studentId]);
    csvRows.push(["Class/Division", student.class]);
    csvRows.push(["Academic Year", student.academicYear]);
    csvRows.push(["Term", student.term]);
    csvRows.push(["Statement Generated Date", new Date().toISOString().split('T')[0]]);
    csvRows.push([]);

    // Headers
    csvRows.push(["Transaction Date", "Description/Reference", "Debit (Charge) GHS", "Credit (Payment) GHS", "Running Balance GHS"]);

    let runningBalance = 0;
    ledgerEntries.forEach((entry) => {
      runningBalance += entry.debit - entry.credit;
      csvRows.push([
        entry.date,
        entry.desc,
        entry.debit > 0 ? entry.debit.toFixed(2) : "0.00",
        entry.credit > 0 ? entry.credit.toFixed(2) : "0.00",
        runningBalance.toFixed(2)
      ]);
    });

    csvRows.push([]);
    
    const expectedTotal = student.schoolFees + student.utilityBill + student.sportsFees + student.ptaDues + student.otherFee;
    const totalPaid = student.payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = expectedTotal - totalPaid;

    csvRows.push(["SUMMARY BALANCE"]);
    csvRows.push(["Total Expected Charges (Debits)", expectedTotal.toFixed(2)]);
    csvRows.push(["Total Payments Received (Credits)", totalPaid.toFixed(2)]);
    csvRows.push(["Outstanding Cumulative Balance Due", outstanding.toFixed(2)]);

    const csvContent = csvRows
      .map((row) =>
        row
          .map((value) => {
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const filename = `ledger_${filenameFriendly(student.studentName || student.studentId)}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast(`Ledger CSV statement exported successfully!`);
  };

  // Filter students based on state selections
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // 1. Class filter
      if (selectedClass !== 'All' && student.class !== selectedClass) return false;
      // 2. Search query filter
      const fullName = `${student.firstName} ${student.middleName || ''} ${student.lastName}`.toLowerCase();
      if (searchQuery.trim() !== '' && !fullName.includes(searchQuery.toLowerCase()) && !student.id.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [students, selectedClass, searchQuery]);

  return (
    <div id="fees-registry-view" className="space-y-6">
      
      {/* Dynamic Feedback Toast */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-white transition-all duration-300 transform translate-y-0 ${
          toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          <Check className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Main Stats Header Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Expected (Term Summary)</p>
            <p className="text-2xl font-bold font-mono text-slate-800">
              GHS {overallStats.totalExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 capitalize font-medium">{selectedAcademicYear} • {selectedTerm}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Coins className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider font-semibold">Total Paid (Installments)</p>
            <p className="text-2xl font-bold font-mono text-emerald-700">
              GHS {overallStats.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1">
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-1 rounded">
                {overallStats.collectionPercent}% Collection Rate
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Outstanding Balance</p>
            <p className="text-2xl font-bold font-mono text-rose-600">
              GHS {overallStats.totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 font-medium">Remaining to collect</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg">
            <User className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Active Fee Registers</p>
            <p className="text-2xl font-bold font-mono text-slate-800">{overallStats.activeAccountsCount}</p>
            <span className="text-[10px] text-slate-400 font-medium">Billed students this term</span>
          </div>
        </div>
      </div>

      {/* SMS Delivery Summary Stats */}
      {smsLogs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Delivered SMS</p>
              <p className="text-xl font-bold font-mono text-emerald-600 mt-1">
                {smsLogs.filter(l => l.status.toLowerCase() === 'delivered').length}
              </p>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Check className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Pending SMS</p>
              <p className="text-xl font-bold font-mono text-blue-600 mt-1">
                {smsLogs.filter(l => !['delivered', 'failed', 'undelivered'].includes(l.status.toLowerCase())).length}
              </p>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Failed SMS</p>
              <p className="text-xl font-bold font-mono text-rose-600 mt-1">
                {smsLogs.filter(l => l.status.toLowerCase() === 'failed' || l.status.toLowerCase() === 'undelivered').length}
              </p>
            </div>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Control Utility bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-slate-800 font-semibold">
            <Filter className="h-4 w-4" />
            <span className="text-sm">Manage Context:</span>
          </div>
          
          <select 
            value={selectedAcademicYear}
            onChange={(e) => setSelectedAcademicYear(e.target.value as AcademicYearType)}
            className="text-xs border-slate-200 rounded-lg bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 py-1.5 px-3"
          >
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select 
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value as TermType)}
            className="text-xs border-slate-200 rounded-lg bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 py-1.5 px-3"
          >
            {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk Fee Applicator template */}
          <button
            onClick={() => {
              const cap = window.prompt("Apply default standard bills to ALL students? Enter base GHS amount for School Fees:\n(Leave blank to cancel)", "400");
              if (cap !== null) {
                const sAmt = parseFloat(cap) || 0;
                handleBulkSetup('All', {
                  schoolFees: sAmt,
                  utilityBill: 50,
                  sportsFees: 20,
                  ptaDues: 30,
                  otherFee: 0,
                  otherFeeDescription: 'Excursion'
                });
              }
            }}
            className="text-xs inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white py-1.5 px-3 rounded-lg font-medium transition"
          >
            <Plus className="h-3.5 w-3.5" /> Initialize Standard Billing
          </button>

          <button
            onClick={handleBulkPrintReceipts}
            className="text-xs inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-1.5 px-3 rounded-lg font-medium transition border border-indigo-200"
          >
            <Printer className="h-3.5 w-3.5" /> Bulk Print Receipts
          </button>

          <button
            onClick={() => handleExportFeesPDF('fees-summary-table-and-view', `school_fees_summary_${selectedAcademicYear.replace('/', '_')}_${selectedTerm.toLowerCase().replace(' ', '_')}`)}
            className="text-xs inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg font-medium transition"
          >
            <FileDown className="h-3.5 w-3.5" /> Export Ledger PDF
          </button>

          <button
            onClick={handleClearAllFees}
            className="text-xs inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 py-1.5 px-3 rounded-lg font-medium transition border border-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset Fees Directory
          </button>
        </div>
      </div>

      {/* SMS Delivery Tracking Panel */}
      {smsLogs.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 no-print">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="text-indigo-600" size={15} /> 
                Automated SMS Deliveries 
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Live tracking of fee reminder dispatches</p>
            </div>
            <button 
              onClick={() => {
                if (window.confirm("Clear all SMS dispatch logs?")) setSmsLogs([]);
              }}
              className="text-[10px] text-rose-500 hover:text-rose-700 font-bold px-2 py-1 bg-rose-50 rounded"
            >
              Clear Logs
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500 border-y border-slate-200">
                  <th className="p-2 font-semibold">Sent At</th>
                  <th className="p-2 font-semibold">Student / Parent</th>
                  <th className="p-2 font-semibold">Phone #</th>
                  <th className="p-2 font-semibold text-right">Delivery Status</th>
                </tr>
              </thead>
              <tbody className="text-[11px] divide-y divide-slate-100 font-medium">
                {smsLogs.map((log) => (
                  <tr key={log.sid} className="hover:bg-slate-50">
                    <td className="p-2 text-slate-500 font-mono">
                      {new Date(log.sentAt).toLocaleString('en-US', { hour12: true, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-2 text-slate-800">{log.studentName}</td>
                    <td className="p-2 text-slate-600 font-mono">{log.phone}</td>
                    <td className="p-2 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                        log.status.toLowerCase() === 'delivered' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        log.status.toLowerCase() === 'failed' || log.status.toLowerCase() === 'undelivered' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                        log.status.toLowerCase() === 'sent' || log.status.toLowerCase() === 'queued' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Student Selection Search lists (grid-span-5) */}
        <div id="school-fees-student-list-container" className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col h-[650px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider flex items-center gap-1.5">
              <User className="h-4 w-4" /> Student Registry
            </h3>

            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or registry ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value as ClassType | 'All')}
                className="w-full text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 py-1.5 px-2"
              >
                <option value="All">Filter Class: All Classes</option>
                {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No matching student records found.
              </div>
            ) : (
              filteredStudents.map(student => {
                const bill = getStudentBill(student);
                const expected = bill.schoolFees + bill.utilityBill + bill.sportsFees + bill.ptaDues + bill.otherFee;
                const paid = bill.payments.reduce((sum, p) => sum + p.amount, 0);
                const bal = expected - paid;
                const isSelected = student.id === activeStudentId;

                return (
                  <button
                    key={student.id}
                    onClick={() => setActiveStudentId(student.id)}
                    className={`w-full p-3 text-left transition flex items-center justify-between ${
                      isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-semibold text-slate-800">
                          {student.firstName} {student.lastName}
                        </p>
                        {bal > 0 && (
                          <span className="text-[8px] bg-rose-50 text-rose-700 px-1.5 py-0.2 rounded font-bold border border-rose-200 select-none uppercase tracking-wider">
                            Arrears
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {student.class} • Register {student.id}
                      </p>
                    </div>

                    <div className="text-right">
                      {expected === 0 ? (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono font-medium">Unbilled</span>
                      ) : (
                        <div>
                          <p className={`text-xs font-bold font-mono ${bal <= 0 ? 'text-emerald-600' : 'text-rose-600 animate-pulse-slow'}`}>
                            {bal <= 0 ? 'Fully Paid' : `Bal: GHS ${bal.toFixed(0)}`}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            Paid: GHS {paid.toFixed(0)} / {expected.toFixed(0)}
                          </p>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active Student Accounts & Payments Ledger Details (grid-span-8) */}
        <div id="fees-summary-table-and-view" className="lg:col-span-8 space-y-6">
          {activeStudent && activeBill ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
              
              {/* Active Student Card Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-slate-100 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase py-0.5 px-2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      BILLING & LEDGER {selectedTerm}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 mt-1 capitalize leading-snug">
                    {activeStudent.firstName} {activeStudent.middleName ? activeStudent.middleName + ' ' : ''}{activeStudent.lastName}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Class {activeStudent.class} • Student ID: <span className="font-mono font-semibold">{activeStudent.id}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {activeExpectedAndPaid.bal > 0 && (
                    <button
                      onClick={handleOpenReminderModal}
                      className="text-xs inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white py-2 px-3 rounded-lg font-semibold transition shadow-md select-none active:translate-y-0.5"
                    >
                      <Bell className="h-3.5 w-3.5 animate-bounce-slow" /> Notice & SMS Reminder
                    </button>
                  )}

                  <button
                    onClick={handleOpenInvoice}
                    className="text-xs inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-3 rounded-lg font-semibold transition shadow-md select-none active:translate-y-0.5"
                  >
                    <Receipt className="h-3.5 w-3.5" /> Generate Fee Invoice
                  </button>

                  <button
                    onClick={() => {
                      setActiveLedgerStudent(activeBill);
                    }}
                    className="text-xs inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-3 rounded-lg font-medium transition"
                  >
                    <Printer className="h-3.5 w-3.5" /> Full Ledger Report
                  </button>

                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="text-xs inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-lg font-medium transition shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" /> Record Installment
                  </button>
                </div>
              </div>

              {/* Installments calculations balances details box */}
              {(() => {
                const expected = activeBill.schoolFees + activeBill.utilityBill + activeBill.sportsFees + activeBill.ptaDues + activeBill.otherFee;
                const paid = activeBill.payments.reduce((sum, p) => sum + p.amount, 0);
                const bal = expected - paid;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="p-3 bg-white rounded-lg border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Expected Term Bills</p>
                      <p className="text-xl font-bold font-mono text-slate-700 mt-1">GHS {expected.toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Total Installments Paid</p>
                      <p className="text-xl font-bold font-mono text-emerald-700 mt-1">GHS {paid.toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Outstanding/Balance Due</p>
                      <p className={`text-xl font-bold font-mono mt-1 ${bal > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        GHS {bal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* SECTION: ADMIN ADD/MODIFY BILLS */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Modify Expected Bill Categories (Terminal setup)</span>
                  <span className="text-[10px] text-slate-400 capitalize font-medium font-sans">Modify values instantly. Changes persist.</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">School Fees (GHS)</label>
                    <input
                      type="number"
                      value={activeBill.schoolFees}
                      min="0"
                      onChange={(e) => handleEditBillComponent('schoolFees', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono py-1.5 px-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Utility Bill (GHS)</label>
                    <input
                      type="number"
                      value={activeBill.utilityBill}
                      min="0"
                      onChange={(e) => handleEditBillComponent('utilityBill', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono py-1.5 px-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Sports Fees (GHS)</label>
                    <input
                      type="number"
                      value={activeBill.sportsFees}
                      min="0"
                      onChange={(e) => handleEditBillComponent('sportsFees', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono py-1.5 px-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">PTA Dues (GHS)</label>
                    <input
                      type="number"
                      value={activeBill.ptaDues}
                      min="0"
                      onChange={(e) => handleEditBillComponent('ptaDues', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono py-1.5 px-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Other Fee amount (GHS)</label>
                    <input
                      type="number"
                      value={activeBill.otherFee}
                      min="0"
                      onChange={(e) => handleEditBillComponent('otherFee', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono py-1.5 px-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Other Fee Memo Description</label>
                    <input
                      type="text"
                      placeholder="e.g. Excursion, Practical materials"
                      value={activeBill.otherFeeDescription || ''}
                      onChange={(e) => handleEditBillComponent('otherFeeDescription', e.target.value)}
                      className="w-full text-xs py-1.5 px-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* INSTALLMENT TRANSACTION LIST */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Receipt className="h-4 w-4" /> Installments payment history (Receipt directory)
                </h3>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <th className="py-2.5 px-3">Installment Date</th>
                        <th className="py-2.5 px-3">Receipt Code</th>
                        <th className="py-2.5 px-3">Allocated Component</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3 text-right">Amount (GHS)</th>
                        <th className="py-2.5 px-3 text-center">Receipt Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {activeBill.payments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 font-mono text-[11px]">
                            No payment installments received for this academic term yet.
                          </td>
                        </tr>
                      ) : (
                        activeBill.payments.map(payment => (
                          <tr key={payment.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{payment.date}</td>
                            <td className="py-2 px-3 font-semibold text-[11px] font-mono text-slate-800">{payment.receiptNo}</td>
                            <td className="py-2 px-3">
                              <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                                {payment.component}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{payment.method}</td>
                            <td className="py-2 px-3 font-mono font-semibold text-right text-emerald-700">
                              {payment.amount.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="inline-flex gap-1.5 items-center justify-center">
                                <button
                                  onClick={() => setActiveReceiptPayment({ bill: activeBill, payment })}
                                  title="Print Official Receipt"
                                  className="p-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                >
                                  <Receipt className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeletePayment(payment.id)}
                                  title="Delete Transaction"
                                  className="p-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            /* DEFAULT EMPTY REGISTRY DASHBOARD TABLE */
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">School Fees Registry - Quick Overview</h3>
                  <p className="text-[10px] text-slate-400">Total ledger summaries across class divisions for {selectedAcademicYear} • {selectedTerm}</p>
                </div>
              </div>

              <div id="school-fees-general-table" className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                      <th className="p-3">Student Details & Class</th>
                      <th className="p-3">School Fees</th>
                      <th className="p-3">Utility Bill</th>
                      <th className="p-3">Sports Fees</th>
                      <th className="p-3">PTA Dues</th>
                      <th className="p-3">Other Fee</th>
                      <th className="p-3 text-right">Term Total</th>
                      <th className="p-3 text-right">Amount Paid</th>
                      <th className="p-3 text-right">Outstanding Bal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400 font-mono">
                          Please register students first in the Student profiles registry directory in order to manage billing.
                        </td>
                      </tr>
                    ) : (
                      students.map(student => {
                        const bill = getStudentBill(student);
                        const expected = bill.schoolFees + bill.utilityBill + bill.sportsFees + bill.ptaDues + bill.otherFee;
                        const paid = bill.payments.reduce((sum, p) => sum + p.amount, 0);
                        const outstanding = expected - paid;

                        return (
                          <tr key={student.id} className="hover:bg-slate-50/50">
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-slate-700">{student.firstName} {student.lastName}</p>
                                {outstanding > 0 && (
                                  <span className="text-[8px] bg-rose-50 text-rose-700 font-bold px-1.5 py-0.2 rounded border border-rose-200 select-none uppercase tracking-wider">
                                    Arrears
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-400">{student.class} • Register #{student.id}</p>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">GHS {bill.schoolFees}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">GHS {bill.utilityBill}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">GHS {bill.sportsFees}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">GHS {bill.ptaDues}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">GHS {bill.otherFee} <span className="text-[9px] text-slate-400 italic block">{bill.otherFeeDescription}</span></td>
                            <td className="p-3 text-right font-mono font-medium text-slate-700 font-semibold bg-slate-50/30">
                              GHS {expected.toFixed(1)}
                            </td>
                            <td className="p-3 text-right font-mono font-semibold text-emerald-700">
                              GHS {paid.toFixed(1)}
                            </td>
                            <td className={`p-3 text-right font-mono font-bold ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              GHS {outstanding.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* MODAL overlay: Receive Installment Form */}
      <AnimatePresence>
        {showPaymentModal && activeStudent && activeBill && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPaymentModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto cursor-pointer no-print"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ ease: "easeOut", duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-[465px] w-full rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden cursor-default md:my-8"
            >
              
              <div className="p-6 pb-4 bg-white border-b border-slate-100/80 flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-widest font-sans flex items-center gap-1.5 leading-none">
                    <CreditCard className="h-4 w-4 text-emerald-650" /> Settle Student Fees
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">Settle or log fee collections for {activeBill.studentName}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Secure Tab Controller inside Dialog */}
              <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 no-print">
                <button
                  type="button"
                  onClick={() => setPaymentTab('manual')}
                  className={`flex-1 py-2 text-center text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    paymentTab === 'manual'
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-200/45 font-extrabold'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Manual Cash/Cheque
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentTab('paystack')}
                  className={`flex-1 py-1 px-2 text-center text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    paymentTab === 'paystack'
                      ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/40 font-extrabold'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Paystack MoMo/Card
                </button>
              </div>

              <div className="p-6 md:p-8 space-y-5 text-xs text-left bg-white">
                {/* Form fields that are shared between both manual and online payments */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Component allocation</label>
                  <select
                    value={paymentComponent}
                    onChange={(e) => setPaymentComponent(e.target.value as FeePayment['component'])}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] text-slate-700 bg-slate-50/15 hover:bg-slate-50/30 transition duration-150 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="School Fees">School Fees (Standard tuition)</option>
                    <option value="Utility Bill">Utility Bill</option>
                    <option value="Sports Fees">Sports Fees</option>
                    <option value="PTA dues">PTA Dues</option>
                    <option value="Other Fee">Other Fee (Excursions/Misc)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Amount (GHS)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3.5 font-bold text-slate-400 font-mono text-[10px] leading-none">GHS</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.01"
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl pl-12 pr-4 py-2.5 font-sans text-[13px] focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none text-slate-700 font-medium"
                    />
                  </div>
                </div>

                {paymentTab === 'manual' ? (
                  <form onSubmit={handleAddPayment} className="space-y-5 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transaction date</label>
                      <input
                        type="date"
                        required
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 font-sans text-[13px] focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Method</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'] as const).map(met => (
                          <button
                            key={met}
                            type="button"
                            onClick={() => setPaymentMethod(met)}
                            className={`py-2 px-1 border rounded-xl font-medium text-[11px] text-center transition ${
                              paymentMethod === met 
                                ? 'border-blue-500 bg-blue-50/40 text-blue-600 font-semibold' 
                                : 'border-slate-200/80 hover:bg-slate-50 text-slate-500 font-normal bg-white'
                            }`}
                          >
                            {met}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Remarks / Details / Memo</label>
                      <input
                        type="text"
                        placeholder="e.g. Paid in cash by father, transaction reference"
                        value={paymentRemarks}
                        onChange={(e) => setPaymentRemarks(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none placeholder:text-slate-300"
                      />
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex justify-end gap-3 bg-white">
                      <button
                        type="button"
                        onClick={() => setShowPaymentModal(false)}
                        className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold rounded-xl transition cursor-pointer text-[12px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-xl shadow-xs transition cursor-pointer text-[12px]"
                      >
                        Record Installment
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="pt-2">
                    <PaystackPaymentTrigger
                      studentId={activeStudent.id}
                      studentName={`${activeStudent.firstName} ${activeStudent.lastName}`}
                      email={activeStudent.email || ''}
                      amount={parseFloat(paymentAmount) || 0}
                      academicYear={selectedAcademicYear}
                      term={selectedTerm}
                      component={paymentComponent}
                      billId={activeBill.id}
                      onSuccess={(verifiedData) => {
                        const amount = parseFloat(paymentAmount) || verifiedData.amount;
                        const randPart = Math.floor(1000 + Math.random() * 9000);
                        const generatedReceipt = `GTIMS-PAYSTACK-${selectedAcademicYear.split('/')[0]}-${randPart}`;
                        const today = new Date().toISOString().split('T')[0];

                        const newPayment: FeePayment = {
                          id: verifiedData.reference,
                          amount,
                          date: today,
                          component: paymentComponent,
                          method: 'Mobile Money',
                          receiptNo: generatedReceipt,
                          remarks: `Paid online via Paystack. Ref: ${verifiedData.reference}`
                        };

                        const nextBill: StudentFeeBill = {
                          ...activeBill,
                          payments: [...activeBill.payments, newPayment],
                          updatedAt: new Date().toISOString()
                        };

                        handleSaveBill(nextBill);
                        setTimeout(() => {
                          setShowPaymentModal(false);
                          setPaymentAmount('');
                          setPaymentRemarks('');
                        }, 2000);
                      }}
                      onCancel={() => setShowPaymentModal(false)}
                      triggerLabel={`Initialize Online Settle: GHS ${(parseFloat(paymentAmount) || 0).toFixed(2)}`}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DYNAMIC GENERAL PRINT AREA (HIDDEN) FOR RECEIPT SPECIFIC */}
      <AnimatePresence>
        {activeReceiptPayment && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveReceiptPayment(null);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto cursor-pointer no-print"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ ease: "easeOut", duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-2xl w-full rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] cursor-default md:my-8"
            >
              
              <div className="p-6 pb-4 bg-white border-b border-slate-100/85 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-widest font-sans leading-none">
                    GTIMS OFFICIAL RECEIPT
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">Review ledger payment transaction metadata</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrintStandard('fee-receipt-print-area')}
                    className="px-3.5 py-2 hover:bg-slate-50 border border-slate-200 text-slate-500 font-semibold rounded-xl text-xs transition cursor-pointer bg-white"
                  >
                    <Printer className="h-3.5 w-3.5 inline mr-1" /> Print
                  </button>
                  <button
                    onClick={() => handleExportFeesPDF('fee-receipt-print-area', `receipt_${activeReceiptPayment.payment.receiptNo}`)}
                    className="px-3.5 py-2 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-xl text-xs shadow-xs transition cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5 inline mr-1" /> Toggle Preview Mode
                  </button>
                  <button 
                    onClick={() => setActiveReceiptPayment(null)}
                    className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer ml-1 animate-none bg-transparent"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Inline parent/guardian email dispatch controls */}
              <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 no-print">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#059669]" />
                  <span className="font-medium">Send to Parent:</span>
                  <input 
                    type="email" 
                    value={receiptEmailOverride}
                    onChange={(e) => setReceiptEmailOverride(e.target.value)}
                    placeholder="parent@email.com"
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none w-48 font-medium text-slate-800"
                  />
                </div>
                <button
                  onClick={handleSendReceiptEmail}
                  disabled={isSendingEmail}
                  className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-50"
                >
                  {isSendingEmail ? (
                    <>Sending...</>
                  ) : (
                    <>
                      <Mail className="h-3.5 w-3.5" /> Dispatch Receipt
                    </>
                  )}
                </button>
              </div>

            <div className="flex-1 overflow-y-auto p-4" id="fee-receipt-print-area">
              <div className="relative border-[2px] border-double border-slate-800 p-4 space-y-3 bg-white text-slate-900 text-left h-full flex flex-col justify-between overflow-hidden">
                {/* Watermark */}
                <div className="absolute inset-0 pointer-events-none" dangerouslySetInnerHTML={{ __html: getWatermarkHtml(schoolInfo.crestUrl) }} />
                
                <div className="relative z-10 flex flex-col h-full justify-between">
                {/* Official Crest & School metadata - Compact for DL */}
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <div className="space-y-0.5">
                    <h1 className="text-sm font-bold tracking-tight text-slate-950 uppercase leading-tight">{schoolInfo.name}</h1>
                    <p className="text-[9px] font-semibold text-slate-500 tracking-wider">Motto: "{schoolInfo.motto}"</p>
                    <p className="text-[9px] text-slate-700 leading-tight">{schoolInfo.gpsAddress} • Tel: {schoolInfo.telephone}</p>
                  </div>
                  {schoolInfo.logoUrl ? (
                    <img referrerPolicy="no-referrer" src={schoolInfo.logoUrl} className="h-10 w-10 object-contain" alt="School Crest" />
                  ) : (
                    <div className="p-1 border border-slate-200 rounded bg-slate-50 text-slate-400">
                      <Receipt className="h-6 w-6" />
                    </div>
                  )}
                </div>

                {/* Receipt Title - Slimmer */}
                <div className="text-center py-1 bg-slate-50 border-b border-slate-200">
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-950">OFFICIAL PAYMENT RECEIPT</h2>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-sans">
                  <div className="space-y-1">
                    <p><span className="text-slate-500">CODE:</span> <span className="font-mono font-bold">{activeReceiptPayment.payment.receiptNo}</span></p>
                    <p><span className="text-slate-500">STUDENT:</span> <span className="font-bold uppercase">{activeReceiptPayment.bill.studentName}</span></p>
                    <p><span className="text-slate-500">ID:</span> <span className="font-semibold font-mono">{activeReceiptPayment.bill.studentId}</span></p>
                  </div>

                  <div className="space-y-1 text-right">
                    <p><span className="text-slate-500">DATE:</span> <span className="font-semibold font-mono">{activeReceiptPayment.payment.date}</span></p>
                    <p><span className="text-slate-500">TERM:</span> <span className="font-semibold">{activeReceiptPayment.bill.academicYear} • {activeReceiptPayment.bill.term}</span></p>
                    <p><span className="text-slate-500">METHOD:</span> <span className="font-bold">{activeReceiptPayment.payment.method}</span></p>
                  </div>
                </div>

                {/* Main receipt ledger breakdown - Ultra compact */}
                <div className="border border-slate-800 rounded overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-800 text-[9px]">
                        <th className="p-1.5 text-left pl-3">Description</th>
                        <th className="p-1.5 text-right pr-3">Amount (GHS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 pl-3">
                          <p className="font-bold text-slate-900 uppercase">{activeReceiptPayment.payment.component}</p>
                        </td>
                        <td className="p-2 text-right pr-3 font-mono font-bold text-slate-900 bg-slate-50">
                          {activeReceiptPayment.payment.amount.toFixed(2)}
                        </td>
                      </tr>
                      {activeReceiptPayment.payment.remarks && (
                        <tr>
                          <td colSpan={2} className="p-1.5 pl-3 bg-slate-50/50 italic text-[9px] text-slate-500 border-t border-slate-200">
                            Note: {activeReceiptPayment.payment.remarks}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totals - Side by side to save height */}
                <div className="flex justify-between items-end text-[10px] border-t border-slate-300 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="p-0.5 bg-white border border-slate-200 rounded-md shrink-0">
                      <QRCodeSVG 
                        value={`${window.location.origin}/?tab=fees&studentId=${activeReceiptPayment.bill.studentId}&receiptNo=${activeReceiptPayment.payment.receiptNo}`}
                        size={40} 
                        level="M" 
                      />
                    </div>
                    <div className="text-left space-y-0.5">
                      <p className="text-slate-400 text-[8px] uppercase font-bold tracking-tighter">Verification</p>
                      <p className="text-[8px] text-slate-500 leading-tight">Scan to verify electronic ledger statement</p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    {(() => {
                      const bill = activeReceiptPayment.bill;
                      const expectedTotal = bill.schoolFees + bill.utilityBill + bill.sportsFees + bill.ptaDues + bill.otherFee;
                      const totalPaid = bill.payments.reduce((sum, p) => sum + p.amount, 0);
                      const outstanding = expectedTotal - totalPaid;

                      return (
                        <div className="space-y-0.5">
                          <p className="flex justify-between gap-6"><span className="text-slate-500">Paid to-date:</span> <span className="font-mono font-bold text-emerald-700">GHS {totalPaid.toFixed(2)}</span></p>
                          <p className="flex justify-between gap-6 font-bold text-slate-950 border-t border-slate-300 pt-0.5 text-[11px]"><span className="font-bold">Balance:</span> <span className="font-mono">GHS {outstanding.toFixed(2)}</span></p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Signature - Compact */}
                <div className="pt-2 grid grid-cols-2 gap-4 text-center text-[9px]">
                  <div className="border-t border-dashed border-slate-400 pt-1">
                    <p className="font-medium text-slate-700 uppercase tracking-tighter">Accounts Office</p>
                  </div>
                  <div className="border-t border-dashed border-slate-400 pt-1">
                    <p className="font-medium text-slate-700 uppercase tracking-tighter">Bursar / Signature</p>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* DYNAMIC GENERAL PRINT AREA (HIDDEN) FOR FULL STUDENT LEDGER */}
      <AnimatePresence>
        {activeLedgerStudent && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveLedgerStudent(null);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto cursor-pointer no-print"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ ease: "easeOut", duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-2xl w-full rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] cursor-default md:my-8"
            >
              
              <div className="p-6 pb-4 bg-white border-b border-slate-100/85 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-widest font-sans leading-none">
                    GTIMS LEDGER REPORT
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">Review student fee liabilities and payment streams</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrintStandard('fee-ledger-print-area')}
                    className="px-3.5 py-2 hover:bg-slate-50 border border-slate-200 text-slate-500 font-semibold rounded-xl text-xs transition cursor-pointer bg-white"
                  >
                    <Printer className="h-3.5 w-3.5 inline mr-1" /> Print Details
                  </button>
                  <button
                    onClick={() => handleExportLedgerCSV(activeLedgerStudent)}
                    className="px-3.5 py-2 hover:bg-slate-50 border border-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer bg-white"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1 text-[#059669]" /> Download CSV
                  </button>
                  <button
                    onClick={() => handleExportFeesPDF('fee-ledger-print-area', `ledger_${activeLedgerStudent.studentId}`)}
                    className="px-3.5 py-2 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-xl text-xs shadow-xs transition cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5 inline mr-1" /> Toggle Preview Mode
                  </button>
                  <button 
                    onClick={() => setActiveLedgerStudent(null)}
                    className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer ml-1 bg-transparent animate-none"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

            <div className="flex-1 overflow-y-auto p-4" id="fee-ledger-print-area">
              <div className="border-[2px] border-double border-slate-800 p-4 space-y-3 bg-white text-slate-900 text-left h-full flex flex-col justify-between">
                
                {/* Official Crest & School metadata - Compact for DL */}
                <div className="flex justify-between items-center pb-2 border-b border-slate-800 shrink-0">
                  <div className="space-y-0.5">
                    <h1 className="text-sm font-bold tracking-tight text-slate-950 uppercase leading-tight">{schoolInfo.name}</h1>
                    <p className="text-[9px] font-semibold text-slate-500 tracking-wider leading-none">Motto: "{schoolInfo.motto}"</p>
                    <p className="text-[9px] text-slate-700 leading-tight">{schoolInfo.gpsAddress} • Tel: {schoolInfo.telephone}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200">
                      BILLING & LEDGER
                    </span>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">Academic: {activeLedgerStudent.academicYear} • {activeLedgerStudent.term}</p>
                  </div>
                </div>

                {/* DL Columns content layout */}
                <div className="grid grid-cols-2 gap-4 text-[10px] font-sans flex-1">
                  
                  {/* Left Column: Student details & Expected bills table */}
                  <div className="space-y-2 border-r border-slate-200 pr-3 flex flex-col justify-between">
                    <div className="bg-slate-50 p-1.5 rounded space-y-0.5 border border-slate-100">
                      <p><span className="text-slate-500 font-medium uppercase text-[8px] tracking-tight">Student Name:</span> <span className="font-bold text-slate-950 uppercase">{activeLedgerStudent.studentName}</span></p>
                      <p><span className="text-slate-500 font-medium uppercase text-[8px] tracking-tight">ID:</span> <span className="font-semibold font-mono">{activeLedgerStudent.studentId}</span> | <span className="text-slate-500 font-medium uppercase text-[8px] tracking-tight">Class:</span> <span className="font-semibold">{activeLedgerStudent.class}</span></p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">I. Summary of Expected Bills</p>
                      <table className="w-full text-[9px] border border-slate-300">
                        <tbody>
                          <tr className="border-b border-slate-200">
                            <td className="p-1 pl-1.5 text-slate-600">Tuition Fees</td>
                            <td className="p-1 text-right pr-1.5 font-mono">GHS {activeLedgerStudent.schoolFees.toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="p-1 pl-1.5 text-slate-600">Utility Bill</td>
                            <td className="p-1 text-right pr-1.5 font-mono">GHS {activeLedgerStudent.utilityBill.toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="p-1 pl-1.5 text-slate-600">Sports & PTA</td>
                            <td className="p-1 text-right pr-1.5 font-mono">GHS {(activeLedgerStudent.sportsFees + activeLedgerStudent.ptaDues).toFixed(2)}</td>
                          </tr>
                          {activeLedgerStudent.otherFee > 0 && (
                            <tr className="border-b border-slate-200">
                              <td className="p-1 pl-1.5 text-slate-600">Other Levy</td>
                              <td className="p-1 text-right pr-1.5 font-mono">GHS {activeLedgerStudent.otherFee.toFixed(2)}</td>
                            </tr>
                          )}
                          <tr className="bg-slate-100 font-bold">
                            <td className="p-1 pl-1.5 text-slate-900">Total Term Bill</td>
                            <td className="p-1 text-right pr-1.5 font-mono text-slate-900">
                              GHS {(() => {
                                const total = activeLedgerStudent.schoolFees + activeLedgerStudent.utilityBill + activeLedgerStudent.sportsFees + activeLedgerStudent.ptaDues + activeLedgerStudent.otherFee;
                                return total.toFixed(2);
                              })()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Payments table & Outstanding balances */}
                  <div className="space-y-2 flex flex-col justify-between">
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">II. Credited Installments History</p>
                      <div className="border border-slate-300 rounded max-h-[85px] overflow-hidden">
                        <table className="w-full text-[9px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 text-[8px] uppercase">
                              <th className="p-1 text-left pl-1.5">Date</th>
                              <th className="p-1 text-left">Receipt No</th>
                              <th className="p-1 text-right pr-1.5">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeLedgerStudent.payments.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="p-2 text-center text-slate-400 italic text-[8px]">No payments credited yet.</td>
                              </tr>
                            ) : (
                              activeLedgerStudent.payments.slice(0, 3).map((p) => (
                                <tr key={p.id}>
                                  <td className="p-1 font-mono pl-1.5">{p.date}</td>
                                  <td className="p-1 font-mono font-semibold">{p.receiptNo}</td>
                                  <td className="p-1 text-right pr-1.5 font-mono text-emerald-700 font-bold">GHS {p.amount.toFixed(2)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {activeLedgerStudent.payments.length > 3 && (
                        <p className="text-[7px] text-right text-slate-400 italic pr-1 leading-none">Showing latest 3 transactions</p>
                      )}
                    </div>

                    {/* Overall Statements Summary balances */}
                    <div className="bg-slate-50 p-1.5 rounded space-y-0.5 border border-slate-100">
                      {(() => {
                        const expectedTotal = activeLedgerStudent.schoolFees + activeLedgerStudent.utilityBill + activeLedgerStudent.sportsFees + activeLedgerStudent.ptaDues + activeLedgerStudent.otherFee;
                        const totalPaid = activeLedgerStudent.payments.reduce((sum, p) => sum + p.amount, 0);
                        const outstanding = expectedTotal - totalPaid;

                        return (
                          <div className="space-y-0.5 font-sans text-[10px]">
                            <div className="flex justify-between"><span className="text-slate-500 font-medium">Expected Total:</span> <span className="font-mono">GHS {expectedTotal.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500 font-medium">Total Paid To-Date:</span> <span className="font-mono text-emerald-700 font-bold">GHS {totalPaid.toFixed(2)}</span></div>
                            <div className="flex justify-between border-t border-slate-300 pt-0.5 font-bold text-slate-950 text-[11px]"><span className="font-bold">Outstanding Balance:</span> <span className="font-mono">GHS {outstanding.toFixed(2)}</span></div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                </div>

                {/* Signatures Footer - Side by side compact */}
                <div className="grid grid-cols-2 gap-4 text-center text-[8px] border-t border-slate-200 pt-1.5 shrink-0">
                  <div className="border-t border-dashed border-slate-400 pt-0.5">
                    <p className="font-bold text-slate-700 uppercase tracking-tighter">Bursar / Accounts Office</p>
                  </div>
                  <div className="border-t border-dashed border-slate-400 pt-0.5">
                    <p className="font-bold text-slate-700 uppercase tracking-tighter">Official Verification & Stamp</p>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* PAYMENT REMINDER NOTICE MODAL OVERLAY */}
    <AnimatePresence>
      {showReminderModal && activeStudent && activeBill && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs no-print flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowReminderModal(false)}
            className="fixed inset-0 cursor-pointer"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-5xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col lg:flex-row h-[90vh] lg:h-[80vh] z-10 text-left font-sans"
          >
            {/* LEFT COLUMN: CONTROLS & PARAMS */}
            <div className="w-full lg:w-2/5 p-6 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto flex flex-col justify-between bg-slate-50 gap-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl flex items-center justify-center">
                    <Bell size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Reminder notice engine</h3>
                    <p className="text-[10px] text-slate-400">Generate professional debt reminders and dispatch automated SMS advisories.</p>
                  </div>
                </div>

                <hr className="border-slate-200" />

                {/* RECEP DETAILS & PHONE */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Recipient Contact Information</h4>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Guardian Name</label>
                      <input 
                        type="text"
                        value={activeStudent.guardianName || 'Guardian'}
                        disabled
                        className="w-full text-xs px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-semibold cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex justify-between">
                        <span>Guardian Telephone</span>
                        {!reminderRecipientPhone && <span className="text-rose-500 lowercase font-bold animate-pulse">Required *</span>}
                      </label>
                      <input 
                        type="tel"
                        value={reminderRecipientPhone}
                        onChange={(e) => {
                          setReminderRecipientPhone(e.target.value);
                          setReminderSmsSuccess(null);
                        }}
                        placeholder="e.g. +233240000000"
                        className={`w-full text-xs px-3 py-2 border rounded-lg font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 ${!reminderRecipientPhone ? 'border-rose-300 bg-rose-50/50 focus:ring-rose-500' : 'border-slate-200 focus:ring-amber-500'}`}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Response / Payment Due Deadline</label>
                      <input 
                        type="date"
                        value={reminderClosingDate}
                        onChange={(e) => {
                          setReminderClosingDate(e.target.value);
                          setReminderSmsSuccess(null);
                        }}
                        className="w-full text-xs px-3 py-2 border border-slate-200 bg-white rounded-lg font-mono text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* EDIT MESSAGE PREVIEW */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Custom Carrier SMS Template Message</label>
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-250 px-1 py-0.5 rounded font-black">
                      Chars: {reminderCustomMessage.length}
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={reminderCustomMessage}
                    onChange={(e) => {
                      setReminderCustomMessage(e.target.value);
                      setReminderSmsSuccess(null);
                    }}
                    className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-700 leading-relaxed resize-none"
                  />
                  
                  {/* Safe Live Preview (Fictional Example) to avoid Data breach / PII leaks on screen */}
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                    <span className="text-[9.5px] font-black uppercase text-indigo-750 font-sans tracking-wide block">🛡 GDPR Shield: Safe Fictional Preview</span>
                    <p className="text-[10.5px] text-slate-650 font-medium leading-relaxed font-sans italic select-none">
                      "{compileRandomReminderMessage(reminderCustomMessage)}"
                    </p>
                  </div>

                  <p className="text-[9px] text-slate-400 italic leading-snug">The SMS template contains curly bracket variables like <code className="bg-slate-200 text-slate-700 px-0.5 rounded font-bold font-mono text-[8px]">{'{guardianName}'}</code> and <code className="bg-slate-200 text-slate-700 px-0.5 rounded font-bold font-mono text-[8px]">{'{reportLink}'}</code> which are compiled securely on transmission.</p>
                </div>

                {reminderSmsSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-[11px] font-medium leading-relaxed flex gap-2">
                    <Check className="text-emerald-600 flex-shrink-0 mt-0.5" size={14} />
                    <span>{reminderSmsSuccess}</span>
                  </div>
                )}
              </div>

              {/* ACTION FOOTER BUTTONS */}
              <div className="space-y-2 pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={reminderSendingSms || !reminderRecipientPhone}
                    onClick={handleSendReminderSMS}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-md transition transform active:translate-y-0.5 select-none ${!reminderRecipientPhone ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                  >
                    {reminderSendingSms ? (
                      <>
                        <RotateCcw size={12} className="animate-spin" /> Sending SMS...
                      </>
                    ) : (
                      <>
                        <Send size={12} /> Dispatch SMS
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={!reminderRecipientPhone}
                    onClick={handleSendReminderWhatsApp}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-md transition transform active:translate-y-0.5 select-none ${!reminderRecipientPhone ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                  >
                    <MessageSquare size={12} /> WhatsApp Link
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportFeesPDF('fees-reminder-notice-canvas', `payment_reminder_${activeStudent.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold bg-white rounded-lg text-xs transition"
                  >
                    <FileDown size={12} /> Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const printContents = document.getElementById('fees-reminder-notice-canvas')?.innerHTML;
                      if (printContents) {
                        const w = window.open('', '_blank');
                        if (w) {
                          w.document.write(`
                            <html>
                              <head>
                                <title>Payment Reminder Notice - ${activeStudent.firstName} ${activeStudent.lastName}</title>
                                <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                                <style>
                                  @media print {
                                    body { padding: 2cm; }
                                    .no-print { display: none; }
                                  }
                                  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                                  body { font-family: 'Inter', sans-serif; }
                                </style>
                              </head>
                              <body onload="window.print(); window.close();" style="position: relative;">
                                ${getWatermarkHtml(schoolInfo.crestUrl)}
                                ${printContents}
                              </body>
                            </html>
                          `);
                          w.document.close();
                        }
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg text-xs transition"
                  >
                    <Printer size={12} /> Direct Print
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReminderModal(false)}
                  className="w-full text-center py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
                >
                  Close Dialogue Panel
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: DOCUMENT PREVIEW */}
            <div className="flex-1 bg-slate-100 p-6 overflow-y-auto flex items-center justify-center">
              {/* PORTRAIT LETTER CONTAINER */}
              <div 
                id="fees-reminder-notice-canvas"
                className="w-full max-w-[620px] min-h-[780px] bg-white border border-slate-300 shadow-lg p-8 relative flex flex-col justify-between text-slate-905 leading-normal"
                style={{ aspectRatio: '1/1.414' }}
              >
                <div>
                  {/* SCHOOL LETTERHEAD */}
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      {schoolInfo.logoUrl ? (
                        <img 
                          src={schoolInfo.logoUrl} 
                          alt="School Logo" 
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 object-contain rounded-xl"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold text-xl uppercase">
                          {schoolInfo.name?.substring(0, 2) || 'SC'}
                        </div>
                      )}
                      <div>
                        <h1 className="text-sm font-black uppercase text-slate-900 tracking-tight">{schoolInfo.name || 'GeeTech Academy'}</h1>
                        <p className="text-[10px] italic font-medium text-slate-500">{schoolInfo.motto || 'Motto: Excellence and Dignity'}</p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{schoolInfo.gpsAddress || 'Digital Address System'} • GPS</p>
                      </div>
                    </div>
                    <div className="text-right text-[8.5px] font-mono text-slate-500 space-y-0.5">
                      <p>TEL: {schoolInfo.telephone || '+233 24 556 7780'}</p>
                      <p>EMAIL: {schoolInfo.email || 'info@school.edu.gh'}</p>
                      <p>DATE: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                  </div>

                  {/* DOCUMENT TITLE */}
                  <div className="text-center my-6 space-y-1">
                    <h2 className="text-xs font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-100 py-1 px-4 rounded-lg inline-block">
                      OFFICIAL FEES CLEARANCE & ARREARS ADVISORY
                    </h2>
                    <p className="text-[9px] text-slate-400 font-mono">Reference No: {activeStudent.id}_REM_T{selectedTerm?.replace(/\D/g, '')}</p>
                  </div>

                  {/* SALUTATION */}
                  <div className="text-[11px] space-y-3 font-sans text-left">
                    <p>To the Parent / Guardian of <span className="font-bold underline capitalize">{activeStudent.firstName} {activeStudent.middleName ? activeStudent.middleName + ' ' : ''}{activeStudent.lastName}</span>,</p>
                    <p className="text-slate-700 leading-relaxed text-justify">
                      We hope this letter finds you well. The school administration is writing to formally notify you of outstanding tuition dues in our accounts. Our current ledger records state that the financial obligations for the student listed below are currently in arrears for <strong>{selectedTerm} ({selectedAcademicYear})</strong>.
                    </p>
                  </div>

                  {/* STUDENT DETAIL & ARREARS TABLE */}
                  <div className="my-6 space-y-3 text-left">
                    <div className="grid grid-cols-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[10px]">
                      <div>
                        <span className="text-slate-400 uppercase font-bold tracking-wider block text-[8px]">Pupil Full Name</span>
                        <span className="font-bold text-slate-900 capitalize">{activeStudent.firstName} {activeStudent.lastName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 uppercase font-bold tracking-wider block text-[8px]">Student Register ID / Class</span>
                        <span className="font-bold font-mono text-slate-900">{activeStudent.id} • Class {activeStudent.class}</span>
                      </div>
                    </div>

                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest pl-1">Arrears Category Ledger Summary</p>
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                            <th className="p-2">Levy Component Description</th>
                            <th className="p-2 text-right">Debit Billed</th>
                            <th className="p-2 text-right">Credit Settled</th>
                            <th className="p-2 text-right">Outstanding Arrears</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {/* schoolFees row */}
                          {activeBill.schoolFees > 0 && (
                            <tr>
                              <td className="p-2">Standard School Tuition Fees</td>
                              <td className="p-2 text-right font-mono text-slate-500">GHS {activeBill.schoolFees.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-slate-500">-</td>
                              <td className="p-2 text-right font-mono font-semibold text-rose-600">GHS {activeBill.schoolFees.toFixed(2)}</td>
                            </tr>
                          )}
                          {/* utilityBill row */}
                          {activeBill.utilityBill > 0 && (
                            <tr>
                              <td className="p-2">Facility & Utility Maintenance Levy</td>
                              <td className="p-2 text-right font-mono text-slate-500">GHS {activeBill.utilityBill.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-slate-500">-</td>
                              <td className="p-2 text-right font-mono font-semibold text-rose-600">GHS {activeBill.utilityBill.toFixed(2)}</td>
                            </tr>
                          )}
                          {/* sportsFees row */}
                          {activeBill.sportsFees > 0 && (
                            <tr>
                              <td className="p-2">Sports development dues allocation</td>
                              <td className="p-2 text-right font-mono text-slate-500">GHS {activeBill.sportsFees.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-slate-500">-</td>
                              <td className="p-2 text-right font-mono font-semibold text-rose-600">GHS {activeBill.sportsFees.toFixed(2)}</td>
                            </tr>
                          )}
                          {/* ptaDues row */}
                          {activeBill.ptaDues > 0 && (
                            <tr>
                              <td className="p-2">PTA annual dues allocation</td>
                              <td className="p-2 text-right font-mono text-slate-500">GHS {activeBill.ptaDues.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-slate-500">-</td>
                              <td className="p-2 text-right font-mono font-semibold text-rose-600">GHS {activeBill.ptaDues.toFixed(2)}</td>
                            </tr>
                          )}
                          {/* otherFee row */}
                          {activeBill.otherFee > 0 && (
                            <tr>
                              <td className="p-2">Miscellaneous category ({activeBill.otherFeeDescription || 'Other'})</td>
                              <td className="p-2 text-right font-mono text-slate-500">GHS {activeBill.otherFee.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-slate-500">-</td>
                              <td className="p-2 text-right font-mono font-semibold text-rose-600">GHS {activeBill.otherFee.toFixed(2)}</td>
                            </tr>
                          )}
                          {/* installments paid subtract row */}
                          {activeExpectedAndPaid.paid > 0 && (
                            <tr className="bg-emerald-50/50">
                              <td className="p-2 font-semibold text-emerald-700">Less: Credited installments registered</td>
                              <td className="p-2 text-right font-mono text-slate-400">-</td>
                              <td className="p-2 text-right font-mono text-emerald-700">GHS {activeExpectedAndPaid.paid.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-emerald-500">- GHS {activeExpectedAndPaid.paid.toFixed(2)}</td>
                            </tr>
                          )}
                          {/* Combined net balance totals */}
                          <tr className="bg-slate-100 font-bold border-t border-slate-300 text-[11px]">
                            <td className="p-2">Total Net Financial Dues Pending:</td>
                            <td className="p-2 text-right font-mono text-slate-700">GHS {activeExpectedAndPaid.expected.toFixed(2)}</td>
                            <td className="p-2 text-right font-mono text-emerald-700">GHS {activeExpectedAndPaid.paid.toFixed(2)}</td>
                            <td className="p-2 text-right font-mono text-rose-700 bg-rose-50/50">GHS {activeExpectedAndPaid.bal.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* COMPLIANCE WARNING TEXT */}
                  <div className="text-[10.5px] leading-relaxed text-slate-700 space-y-2 border-l-2 border-amber-500 pl-4 bg-amber-50/20 py-2 pr-2 rounded-r-lg text-left">
                    <p className="font-bold text-slate-800">Ledger Compliance Instructions:</p>
                    <p>
                      We kindly query you to clear the outstanding sum of <strong>GHS {activeExpectedAndPaid.bal.toFixed(2)}</strong> on or before <strong>{new Date(reminderClosingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong> to ensure uninterrupted class participation and terminal educational activity records processing.
                    </p>
                    <p>
                      All pay-slips and mobile money receipts MUST be verified manually at the main treasury office for ledger credit update.
                    </p>
                  </div>
                </div>

                {/* SIGNATURE AREA IN PORTRAIT CANVAS FOOTER */}
                <div className="mt-8 border-t border-slate-200 pt-6 flex justify-between items-end text-left">
                  <div className="space-y-1 text-slate-500 text-[8px] font-mono leading-relaxed">
                    <p>Produced by: Ledger Administration Center</p>
                    <p>Signee: {schoolInfo.headteacherName || 'Head Teacher Principal'}</p>
                    <p>Certified Official Copy • Digital Signature Verification</p>
                  </div>
                  
                  <div className="text-center relative">
                    {/* Stamp or signature images */}
                    {schoolInfo.signatureUrl && (
                      <img 
                        src={schoolInfo.signatureUrl} 
                        alt="Signature" 
                        referrerPolicy="no-referrer"
                        className="w-16 h-8 absolute -top-6 left-1/2 -translate-x-1/2 object-contain pointer-events-none opacity-80"
                      />
                    )}
                    {schoolInfo.stampUrl && (
                      <img 
                        src={schoolInfo.stampUrl} 
                        alt="Stamp Seal" 
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 absolute -top-8 -right-4 object-contain pointer-events-none opacity-70"
                      />
                    )}
                    <span className="block italic text-[10px] text-slate-800 font-bold border-t border-slate-400 border-dashed pt-1 min-w-[130px]">
                      {schoolInfo.headteacherName || 'Principal headteacher'}
                    </span>
                    <span className="block text-[8px] uppercase tracking-wider text-slate-400 mt-0.5">Seal & Signature</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* AUTOMATED FEE INVOICE GENERATOR MODAL */}
    <AnimatePresence>
      {showInvoiceModal && activeStudent && activeBill && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs no-print flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowInvoiceModal(false)}
            className="fixed inset-0 cursor-pointer"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-5xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col lg:flex-row h-[90vh] lg:h-[80vh] z-10 text-left font-sans"
          >
            {/* LEFT COLUMN: CONTROLS & INSTRUCTIONS */}
            <div className="w-full lg:w-2/5 p-6 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto flex flex-col justify-between bg-slate-50 gap-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 rounded-xl flex items-center justify-center">
                    <Receipt size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Invoice Generator</h3>
                    <p className="text-[10px] text-slate-400">Pulls student particulars & outstanding balances to compile printable parental notices.</p>
                  </div>
                </div>

                <hr className="border-slate-200" />

                {/* EDITABLE PARAMETERS */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Invoice Particulars</h4>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Invoice Number</label>
                      <input 
                        type="text"
                        value={invoiceNo}
                        onChange={(e) => setInvoiceNo(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Issue Date</label>
                        <input 
                          type="date"
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Payment Due Date</label>
                        <input 
                          type="date"
                          value={invoiceDueDate}
                          onChange={(e) => setInvoiceDueDate(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Custom Notes / Payment Terms</label>
                      <textarea
                        rows={5}
                        value={invoiceNotes}
                        onChange={(e) => setInvoiceNotes(e.target.value)}
                        className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 leading-relaxed resize-none"
                        placeholder="Specify payment details, bank accounts, or MOMO merchant info..."
                      />
                    </div>
                  </div>
                </div>

                {/* NOTE TEMPLATES FOR EASY POPULATION */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Note Templates</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInvoiceNotes('Please deposit outstanding fees directly into the school account: GeeTech Academy, GCB Bank, Account No. 10111223344, or send via MTN Mobile Money to 0244123456 (Merchant: GeeTech Academy). Please present your deposit slip or transaction ID to the accounts office for official receipting.')}
                      className="text-[10px] font-medium p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition text-left leading-snug"
                    >
                      <strong>Default (MOMO & GCB)</strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceNotes('All fees must be fully cleared before the third week of term. Payment can be made in person at the school accounting desk (cash/cheque) or deposited into Ecobank Ghana, Account Name: GeeTech Academy, Account Number: 012233445566. Credit card payments are accepted.')}
                      className="text-[10px] font-medium p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition text-left leading-snug"
                    >
                      <strong>Alternative (Ecobank & Desk)</strong>
                    </button>
                  </div>
                </div>
              </div>

              {/* ACTION FOOTER */}
              <div className="space-y-2 pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportFeesPDF('fees-invoice-notice-canvas', `fee_invoice_${activeStudent.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-md transition transform active:translate-y-0.5 select-none"
                  >
                    <FileDown size={14} /> Save Invoice PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const printContents = document.getElementById('fees-invoice-notice-canvas')?.innerHTML;
                      if (printContents) {
                        const w = window.open('', '_blank');
                        if (w) {
                          w.document.write(`
                            <html>
                              <head>
                                <title>Official Student Fee Invoice - ${activeStudent.firstName} ${activeStudent.lastName}</title>
                                <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                                <style>
                                  @media print {
                                    body { padding: 1.5cm; }
                                    .no-print { display: none; }
                                  }
                                  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                                  body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1e293b; }
                                </style>
                              </head>
                              <body onload="window.print(); window.close();" style="position: relative;">
                                ${getWatermarkHtml(schoolInfo.crestUrl)}
                                <div class="max-w-4xl mx-auto">${printContents}</div>
                              </body>
                            </html>
                          `);
                          w.document.close();
                        }
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-xs transition"
                  >
                    <Printer size={14} /> Direct Print
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="w-full text-center py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
                >
                  Close Invoice Panel
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: DOCUMENT PREVIEW */}
            <div className="flex-1 bg-slate-100 p-6 overflow-y-auto flex items-center justify-center">
              {/* PORTRAIT LETTER CONTAINER */}
              <div 
                id="fees-invoice-notice-canvas"
                className="w-full max-w-[620px] bg-white border border-slate-300 shadow-lg p-8 relative flex flex-col justify-between text-slate-900 leading-normal"
                style={{ minHeight: '800px', aspectRatio: '1/1.414' }}
              >
                <div>
                  {/* SCHOOL LETTERHEAD */}
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      {schoolInfo.logoUrl ? (
                        <img 
                          src={schoolInfo.logoUrl} 
                          alt="School Logo" 
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 object-contain rounded-xl"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold text-xl uppercase">
                          {schoolInfo.name?.substring(0, 2) || 'SC'}
                        </div>
                      )}
                      <div>
                        <h1 className="text-sm font-black uppercase text-slate-900 tracking-tight">{schoolInfo.name || 'GeeTech Academy'}</h1>
                        <p className="text-[10px] italic font-medium text-slate-500">{schoolInfo.motto || 'Motto: Excellence and Dignity'}</p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{schoolInfo.gpsAddress || 'Digital Address System'} • GPS</p>
                      </div>
                    </div>
                    <div className="text-right text-[8.5px] font-mono text-slate-500 space-y-0.5">
                      <p>TEL: {schoolInfo.telephone || '+233 24 556 7780'}</p>
                      <p>EMAIL: {schoolInfo.email || 'info@school.edu.gh'}</p>
                      <p className="font-bold">INVOICE: #{invoiceNo}</p>
                    </div>
                  </div>

                  {/* INVOICE TITLE & STATUS BLOCK */}
                  <div className="flex justify-between items-center my-6">
                    <div className="text-left">
                      <h2 className="text-sm font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 py-1 px-4 rounded-lg inline-block">
                        STUDENT TERM FEE INVOICE
                      </h2>
                      <p className="text-[9px] text-slate-400 font-mono mt-1">Academic Cycle: {selectedTerm} ({selectedAcademicYear})</p>
                    </div>
                    
                    <div className="text-right">
                      {activeExpectedAndPaid.bal <= 0 ? (
                        <span className="text-[10px] font-bold uppercase py-1 px-3 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded">Fully Settled</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase py-1 px-3 bg-amber-100 text-amber-800 border border-amber-200 rounded">Payment Pending</span>
                      )}
                    </div>
                  </div>

                  {/* CLIENT & BILL TO BLOCK */}
                  <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs mb-6 text-left">
                    <div className="space-y-1">
                      <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold block">Bill To (Parent/Guardian)</span>
                      <p className="font-black text-slate-800 capitalize">{activeStudent.guardianName || 'Parent/Guardian'}</p>
                      {activeStudent.guardianTelephone && <p className="font-mono text-slate-500 font-semibold">{activeStudent.guardianTelephone}</p>}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold block">Student Particulars</span>
                      <p className="font-bold text-slate-800 capitalize">{activeStudent.firstName} {activeStudent.lastName}</p>
                      <p className="font-mono text-slate-500 font-semibold">{activeStudent.id} • Class: {activeStudent.class}</p>
                    </div>
                  </div>

                  {/* INVOICE METADATA DETAILS */}
                  <div className="grid grid-cols-3 gap-2 text-left text-[10px] mb-6 font-medium text-slate-600 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[8px] uppercase text-slate-400 block font-bold">Invoice Date</span>
                      <span className="font-mono text-slate-800 font-bold">{new Date(invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div>
                      <span className="text-[8px] uppercase text-slate-400 block font-bold">Due Date</span>
                      <span className="font-mono text-slate-800 font-bold">{new Date(invoiceDueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div>
                      <span className="text-[8px] uppercase text-slate-400 block font-bold">Billing Status</span>
                      <span className="font-mono text-slate-800 font-bold capitalize">{activeExpectedAndPaid.bal <= 0 ? 'Clearance Issued' : `Outstanding Arrears`}</span>
                    </div>
                  </div>

                  {/* ITEMIZED BILL TABLE */}
                  <div className="space-y-3 text-left">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">I. Itemized Term Fees breakdown</p>
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                            <th className="p-2">Levy Category component description</th>
                            <th className="p-2 text-right">Debit Expected</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {/* schoolFees row */}
                          <tr>
                            <td className="p-2">Standard School Tuition Fees</td>
                            <td className="p-2 text-right font-mono text-slate-800 font-medium">GHS {activeBill.schoolFees.toFixed(2)}</td>
                          </tr>
                          {/* utilityBill row */}
                          <tr>
                            <td className="p-2">Facility & Utility Maintenance Levy</td>
                            <td className="p-2 text-right font-mono text-slate-800 font-medium">GHS {activeBill.utilityBill.toFixed(2)}</td>
                          </tr>
                          {/* sportsFees row */}
                          <tr>
                            <td className="p-2">Sports Development Dues Allocation</td>
                            <td className="p-2 text-right font-mono text-slate-800 font-medium">GHS {activeBill.sportsFees.toFixed(2)}</td>
                          </tr>
                          {/* ptaDues row */}
                          <tr>
                            <td className="p-2">PTA Annual Dues Allocation</td>
                            <td className="p-2 text-right font-mono text-slate-800 font-medium">GHS {activeBill.ptaDues.toFixed(2)}</td>
                          </tr>
                          {/* otherFee row */}
                          {activeBill.otherFee > 0 && (
                            <tr>
                              <td className="p-2">Miscellaneous Fee ({activeBill.otherFeeDescription || 'Other'})</td>
                              <td className="p-2 text-right font-mono text-slate-800 font-medium">GHS {activeBill.otherFee.toFixed(2)}</td>
                            </tr>
                          )}
                          
                          {/* Expected total row */}
                          <tr className="bg-slate-50 font-bold border-t border-slate-300">
                            <td className="p-2 font-black text-slate-800">Total Billed expected this Term:</td>
                            <td className="p-2 text-right font-mono font-black text-slate-900">GHS {activeExpectedAndPaid.expected.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* CREDITS APPLIED BOX (IF ANY) */}
                  {activeExpectedAndPaid.paid > 0 && (
                    <div className="mt-4 space-y-2 text-left">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">II. Credited installments received to-date</p>
                      <div className="border border-slate-300 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-[9px]">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                              <th className="p-1.5">Date</th>
                              <th className="p-1.5">Receipt No</th>
                              <th className="p-1.5">Method</th>
                              <th className="p-1.5 text-right">Amount Paid</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeBill.payments.map((p) => (
                              <tr key={p.id}>
                                <td className="p-1.5 font-mono text-slate-600">{p.date}</td>
                                <td className="p-1.5 font-mono text-slate-700 font-semibold">{p.receiptNo}</td>
                                <td className="p-1.5 text-slate-600">{p.method}</td>
                                <td className="p-1.5 text-right font-mono text-emerald-700 font-semibold">GHS {p.amount.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr className="bg-emerald-50/50 font-bold border-t border-slate-300 text-[10px]">
                              <td colSpan={3} className="p-1.5 text-right text-emerald-800">Total Payments Credited:</td>
                              <td className="p-1.5 text-right font-mono text-emerald-700 font-black">GHS {activeExpectedAndPaid.paid.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* GRAND OUTSTANDING BOX */}
                  <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                    <div className="text-left">
                      <h3 className="text-xs font-black uppercase text-slate-900 tracking-tight">TOTAL OUTSTANDING DUE</h3>
                      <p className="text-[9px] text-slate-400 font-mono">Kindly settle this amount prior to due date</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-black font-mono ${activeExpectedAndPaid.bal > 0 ? 'text-indigo-600' : 'text-emerald-600'}`}>
                        GHS {activeExpectedAndPaid.bal.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* INVOICE PAYMENT TERMS & NOTES */}
                  <div className="mt-5 text-[9.5px] leading-relaxed text-slate-600 border-l-2 border-indigo-500 pl-4 bg-indigo-50/15 py-2.5 pr-2 rounded-r-lg text-left">
                    <p className="font-bold text-slate-800 uppercase tracking-wider text-[8px] mb-1">Official Payment Instructions:</p>
                    <p className="whitespace-pre-wrap">{invoiceNotes}</p>
                  </div>
                </div>

                {/* SIGNATURE AREA IN PORTRAIT CANVAS FOOTER */}
                <div className="mt-8 border-t border-slate-200 pt-6 flex justify-between items-end text-left">
                  <div className="space-y-1 text-slate-400 text-[8px] font-mono leading-relaxed">
                    <p>Generated via GTIMS automated ledger engine</p>
                    <p>Invoice status: {activeExpectedAndPaid.bal <= 0 ? 'CLOSED' : 'OPEN - ARREARS'}</p>
                    <p>Official Digital Signature Verification Certificate</p>
                  </div>
                  
                  <div className="text-center relative">
                    {/* Stamp or signature images */}
                    {schoolInfo.signatureUrl && (
                      <img 
                        src={schoolInfo.signatureUrl} 
                        alt="Signature" 
                        referrerPolicy="no-referrer"
                        className="w-16 h-8 absolute -top-6 left-1/2 -translate-x-1/2 object-contain pointer-events-none opacity-80"
                      />
                    )}
                    {schoolInfo.stampUrl && (
                      <img 
                        src={schoolInfo.stampUrl} 
                        alt="Stamp Seal" 
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 absolute -top-8 -right-4 object-contain pointer-events-none opacity-70"
                      />
                    )}
                    <span className="block italic text-[10px] text-slate-800 font-bold border-t border-slate-400 border-dashed pt-1 min-w-[130px]">
                      {schoolInfo.headteacherName || 'Principal headteacher'}
                    </span>
                    <span className="block text-[8px] uppercase tracking-wider text-slate-400 mt-0.5">Seal & Signature</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* SECTION DATA CONTROLS */}
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3 no-print mt-6">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
        <AlertTriangle className="text-indigo-500" size={14} /> Section School Fees Controls
      </h4>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Manage active payment states, wipe entry fields inside overlays, and purge historical transaction and debit rows associated with this module.
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
          <RotateCcw size={13} /> Delete Selected Student Fees Ledger
        </button>
        <button
          type="button"
          onClick={handleDeleteAllFees}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:text-rose-850 hover:bg-rose-100 rounded-xl font-bold font-sans transition text-xs cursor-pointer shadow-xs sm:ml-auto"
        >
          <Trash2 size={13} /> Delete All Section Data
        </button>
      </div>
    </div>

    {/* BULK RECEIPTS PRINT AREA (HIDDEN) */}
    <div id="bulk-receipts-print-area" className="hidden">
      {bulkReceiptData.map((data, idx) => (
        <div key={`${data.payment.id}-${idx}`} className="bulk-receipt-item relative bg-white text-slate-900 text-left border-[2px] border-double border-slate-800 p-4 space-y-3 flex flex-col justify-between mb-8 overflow-hidden" style={{ width: '220mm', height: '110mm', overflow: 'hidden', pageBreakAfter: 'always' }}>
          {/* Watermark */}
          <div className="absolute inset-0 pointer-events-none" dangerouslySetInnerHTML={{ __html: getWatermarkHtml(schoolInfo.crestUrl) }} />
          
          <div className="relative z-10 flex flex-col h-full justify-between">
          {/* Official Crest & School metadata */}
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div className="space-y-0.5">
              <h1 className="text-sm font-bold tracking-tight text-slate-950 uppercase leading-tight">{schoolInfo.name}</h1>
              <p className="text-[9px] font-semibold text-slate-500 tracking-wider">Motto: "{schoolInfo.motto}"</p>
              <p className="text-[9px] text-slate-700 leading-tight">{schoolInfo.gpsAddress} • Tel: {schoolInfo.telephone}</p>
            </div>
            {schoolInfo.logoUrl ? (
              <img referrerPolicy="no-referrer" src={schoolInfo.logoUrl} className="h-10 w-10 object-contain" alt="School Crest" />
            ) : (
              <div className="p-1 border border-slate-200 rounded bg-slate-50 text-slate-400">
                <Receipt className="h-6 w-6" />
              </div>
            )}
          </div>

          {/* Receipt Title */}
          <div className="text-center py-1 bg-slate-50 border-b border-slate-200">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-950">OFFICIAL PAYMENT RECEIPT</h2>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-sans">
            <div className="space-y-1">
              <p><span className="text-slate-500">CODE:</span> <span className="font-mono font-bold">{data.payment.receiptNo}</span></p>
              <p><span className="text-slate-500">STUDENT:</span> <span className="font-bold uppercase">{data.bill.studentName}</span></p>
              <p><span className="text-slate-500">ID:</span> <span className="font-semibold font-mono">{data.bill.studentId}</span></p>
            </div>

            <div className="space-y-1 text-right">
              <p><span className="text-slate-500">DATE:</span> <span className="font-semibold font-mono">{data.payment.date}</span></p>
              <p><span className="text-slate-500">TERM:</span> <span className="font-semibold">{data.bill.academicYear} • {data.bill.term}</span></p>
              <p><span className="text-slate-500">METHOD:</span> <span className="font-bold">{data.payment.method}</span></p>
            </div>
          </div>

          {/* Main receipt ledger breakdown */}
          <div className="border border-slate-800 rounded overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-800 text-[9px]">
                  <th className="p-1.5 text-left pl-3">Description</th>
                  <th className="p-1.5 text-right pr-3">Amount (GHS)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 pl-3">
                    <p className="font-bold text-slate-900 uppercase">{data.payment.component}</p>
                  </td>
                  <td className="p-2 text-right pr-3 font-mono font-bold text-slate-900 bg-slate-50">
                    {data.payment.amount.toFixed(2)}
                  </td>
                </tr>
                {data.payment.remarks && (
                  <tr>
                    <td colSpan={2} className="p-1.5 pl-3 bg-slate-50/50 italic text-[9px] text-slate-500 border-t border-slate-200">
                      Note: {data.payment.remarks}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-between items-end text-[10px] border-t border-slate-300 pt-2">
            <div className="flex items-center gap-2">
              <div className="p-0.5 bg-white border border-slate-200 rounded-md shrink-0">
                <QRCodeSVG 
                  value={`${window.location.origin}/?tab=fees&studentId=${data.bill.studentId}&receiptNo=${data.payment.receiptNo}`}
                  size={40} 
                  level="M" 
                />
              </div>
              <div className="text-left space-y-0.5">
                <p className="text-slate-400 text-[8px] uppercase font-bold tracking-tighter">Verification</p>
                <p className="text-[8px] text-slate-500 leading-tight">Scan to verify electronic ledger statement</p>
              </div>
            </div>
            <div className="text-right space-y-1">
              {(() => {
                const bill = data.bill;
                const expectedTotal = bill.schoolFees + bill.utilityBill + bill.sportsFees + bill.ptaDues + bill.otherFee;
                const totalPaid = bill.payments.reduce((sum, p) => sum + p.amount, 0);
                const outstanding = expectedTotal - totalPaid;

                return (
                  <div className="space-y-0.5">
                    <p className="flex justify-between gap-6"><span className="text-slate-500">Paid to-date:</span> <span className="font-mono font-bold text-emerald-700">GHS {totalPaid.toFixed(2)}</span></p>
                    <p className="flex justify-between gap-6 font-bold text-slate-950 border-t border-slate-300 pt-0.5 text-[11px]"><span className="font-bold">Balance:</span> <span className="font-mono">GHS {outstanding.toFixed(2)}</span></p>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Signature */}
          <div className="pt-2 grid grid-cols-2 gap-4 text-center text-[9px]">
            <div className="border-t border-dashed border-slate-400 pt-1">
              <p className="font-medium text-slate-700 uppercase tracking-tighter">Accounts Office</p>
            </div>
            <div className="border-t border-dashed border-slate-400 pt-1">
              <p className="font-medium text-slate-700 uppercase tracking-tighter">Bursar / Signature</p>
            </div>
          </div>
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
