import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import { 
  CreditCard, Search, RefreshCw, CheckCircle2, AlertTriangle, Trash2, 
  Settings, ArrowLeftRight, Download, Filter, FileText, Plus, HelpCircle, AlertCircle
} from 'lucide-react';
import { DbController } from '../db';
import { PaystackPayment, StudentFeeBill, Student } from '../types';

async function fetchJsonSafe(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const text = await res.text();
  
  if (!text) {
    throw new Error(`Empty response received from server (Status: ${res.status})`);
  }
  
  try {
    const data = JSON.parse(text);
    return { res, data };
  } catch (err) {
    if (text.startsWith('<!doctype') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error(`Server returned HTML instead of JSON. The backend might still be starting up or experiencing configuration issues (Status: ${res.status} - ${res.statusText}).`);
    }
    throw new Error(`Invalid JSON response (Status: ${res.status}): ${text.substring(0, 100)}...`);
  }
}

interface PaystackManagementTabProps {
  themeStyles: {
    primaryBg: string;
    primaryText: string;
    accentBg: string;
    borderAccent: string;
  };
}

export default function PaystackManagementTab({ themeStyles }: PaystackManagementTabProps) {
  const [payments, setPayments] = useState<PaystackPayment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Manual Handshake Verifier State
  const [verifyRef, setVerifyRef] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    success: boolean;
    message: string;
    type: 'success' | 'warning' | 'error' | null;
  } | null>(null);

  // Searching & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [componentFilter, setComponentFilter] = useState<string>('all');

  // Manual payment creation override state for Admin reconciled transactions
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualRefInput, setManualRefInput] = useState('');
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualComponent, setManualComponent] = useState<'School Fees' | 'Utility Bill' | 'Sports Fees' | 'PTA dues' | 'Other Fee'>('School Fees');
  const [manualYear, setManualYear] = useState('2026/2027');
  const [manualTerm, setManualTerm] = useState('Term 1');
  const [manualStatus, setManualStatus] = useState('success');

  const loadData = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const logs = await DbController.getPaystackPaymentsAsync();
      setPayments(logs);
      setStudents(DbController.getStudents());
    } catch (e) {
      console.error("Failed to load Paystack system logs:", e);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper to map student ID to Full Name
  const getStudentName = (studentId: string) => {
    if (!studentId) return 'Unknown Student';
    const s = students.find(x => x.id === studentId);
    if (s) return `${s.firstName} ${s.lastName} (${s.class})`;
    const logged = payments.find(p => p.studentId === studentId && p.studentName);
    if (logged && logged.studentName) return logged.studentName;
    return studentId;
  };

  // Sync payments trigger
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await loadData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setSyncing(false), 800);
    }
  };

  // Automated reconcile checking & ledger crediting engine
  const handleVerifyReference = async (reference: string) => {
    if (!reference.trim()) return;
    setVerifying(true);
    setVerifyStatus(null);

    try {
      const { res, data } = await fetchJsonSafe(`/api/payments/verify/${reference.trim()}`);

      if (!res.ok || !data.success) {
        setVerifyStatus({
          success: false,
          message: data.message || "Failed to verify payment with Paystack engine.",
          type: 'error'
        });
        return;
      }

      const txData = data.data; // verified response info from paystack
      const status = txData.status; // success, failed, abandoned
      const amountGhs = txData.amount;
      const meta = txData.metadata || {};

      const studentId = meta.studentId || '';
      const academicYear = meta.academicYear || '2026/2027';
      const term = meta.term || 'Term 1';
      const component = meta.component || 'School Fees';
      const billId = meta.billId || `${studentId}_${academicYear}_${term}`.replace(/\//g, '-');

      if (status !== 'success') {
        // Log transaction even if not successful yet so Admin can inspect
        const unmatchedLog: PaystackPayment = {
          id: reference.trim().toUpperCase(),
          reference: reference.trim().toUpperCase(),
          studentId: studentId,
          studentName: getStudentName(studentId),
          billId: billId,
          component: component,
          amount: amountGhs,
          academicYear: academicYear,
          term: term,
          status: status,
          createdAt: new Date().toISOString()
        };
        DbController.savePaystackPayment(unmatchedLog);
        await loadData(true);

        setVerifyStatus({
          success: true,
          message: `Handshake established: Paystack reported transaction state as "${status.toUpperCase()}". No ledger credit performed.`,
          type: 'warning'
        });
        return;
      }

      // Reconcile and credit the student bill ledger (if it is not a system software license payment)!
      const isLicensePayment = studentId && studentId.startsWith('LICENSE_');
      const generatedReceipt = `GTIMS-PAY-RECON-${academicYear.split('/')[0]}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (!isLicensePayment) {
        const feeBills = DbController.getStudentFeeBills();
        const existingBill = feeBills.find(b => b.id === billId || (b.studentId === studentId && b.academicYear === academicYear && b.term === term));

        // Make sure reference hasn't already been credited
        if (existingBill && existingBill.payments.some((p: any) => p.remarks?.includes(reference) || p.receiptNo === reference || p.id === reference)) {
          setVerifyStatus({
            success: true,
            message: `Already Credited! Paystack payment verification succeeded, but Ledger Bill of ${getStudentName(studentId)} already carries a payment matching confirmation Ref: ${reference}.`,
            type: 'warning'
          });
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const newInstallment: any = {
          id: `PAY_RECON_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          amount: amountGhs,
          date: today,
          component: component,
          method: 'Bank Transfer',
          receiptNo: generatedReceipt,
          remarks: `Reconciled online Paystack verification. Ref: ${reference.trim()}`
        };

        let updatedBill: StudentFeeBill;
        if (existingBill) {
          updatedBill = {
            ...existingBill,
            payments: [...existingBill.payments, newInstallment],
            updatedAt: new Date().toISOString()
          };
        } else {
          // Create full ledger on the fly
          const targetStudent = students.find(s => s.id === studentId);
          updatedBill = {
            id: billId,
            studentId,
            studentName: targetStudent ? `${targetStudent.firstName} ${targetStudent.lastName}` : 'Unreconciled Student',
            class: targetStudent ? targetStudent.class : 'Basic 1',
            academicYear: academicYear as any,
            term: term as any,
            schoolFees: component === 'School Fees' ? amountGhs : 0,
            utilityBill: component === 'Utility Bill' ? amountGhs : 0,
            sportsFees: component === 'Sports Fees' ? amountGhs : 0,
            ptaDues: component === 'PTA dues' ? amountGhs : 0,
            otherFee: component === 'Other Fee' ? amountGhs : 0,
            payments: [newInstallment],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }

        // Save credited student bill
        DbController.saveStudentFeeBill(updatedBill);
      } else {
        // Correctly synchronize or activate the software subscription key upon manual verification
        try {
          const extractedUid = studentId.replace('LICENSE_', '');
          const registeredUsers = DbController.getRegisteredUsers();
          const targetUser = registeredUsers.find(u => u.uid === extractedUid);
          if (targetUser) {
            const { generateActivationCode } = await import('../subscription');
            const generatedKey = generateActivationCode(targetUser.email, targetUser.requestCode || 'REQ-SYSTEM-9401');
            await DbController.updateUserLicense(
              targetUser.uid,
              'activated',
              new Date().toISOString(),
              generatedKey,
              targetUser.requestCode || 'REQ-SYSTEM-9401'
            );
            console.log(`[Paystack Manual Reconcile] Successfully activated license for user: ${targetUser.email}`);
          }
        } catch (err) {
          console.error("Failed to automatically activate/sync license within manual reconcile:", err);
        }
      }

      // Save/Log transaction details in system
      const paymentLog: PaystackPayment = {
        id: reference.trim().toUpperCase(),
        reference: reference.trim().toUpperCase(),
        studentId: studentId,
        studentName: getStudentName(studentId),
        billId: billId,
        component: component,
        amount: amountGhs,
        academicYear: academicYear,
        term: term,
        status: 'success',
        paidAt: txData.paidAt || new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      DbController.savePaystackPayment(paymentLog);
      await loadData(true);

      setVerifyStatus({
        success: true,
        message: `Success! Fully verified Transaction ${reference}. Ledger updated: credited GHS ${amountGhs.toFixed(2)} to ${getStudentName(studentId)} under ${component} with Receipt: ${generatedReceipt}.`,
        type: 'success'
      });
      setVerifyRef('');
    } catch (err: any) {
      console.error(err);
      setVerifyStatus({
        success: false,
        message: err?.message || "Critical connection breakdown while requesting validation with security server.",
        type: 'error'
      });
    } finally {
      setVerifying(false);
    }
  };

  // Delete transaction record
  const handleDeletePayment = (id: string) => {
    if (window.confirm("Are you sure you want to delete this payment log from the auditing record? This will not rescind the credited amount from the student's bill, which must be debited separately if necessary.")) {
      DbController.deletePaystackPayment(id);
      loadData(true);
    }
  };

  // Administrative Wipe
  const handleClearAll = () => {
    if (window.confirm("☢️ SECURITY ALERT: Are you absolutely sure you want to delete all Paystack auditing records? This action is irreversible.")) {
      DbController.clearAllPaystackPayments();
      loadData(true);
    }
  };

  // Submit manual override logger
  const handleCreateManualOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRefInput.trim() || !manualStudentId.trim() || !manualAmount || isNaN(Number(manualAmount))) {
      alert("Please fill in all manual reconciliation entry details.");
      return;
    }

    const refUpper = manualRefInput.trim().toUpperCase();
    const parsedAmount = parseFloat(manualAmount);

    const manualLog: PaystackPayment = {
      id: refUpper,
      reference: refUpper,
      studentId: manualStudentId,
      studentName: getStudentName(manualStudentId),
      billId: `${manualStudentId}_${manualYear}_${manualTerm}`.replace(/\//g, '-'),
      component: manualComponent,
      amount: parsedAmount,
      academicYear: manualYear,
      term: manualTerm,
      status: manualStatus,
      paidAt: manualStatus === 'success' ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString()
    };

    DbController.savePaystackPayment(manualLog);
    loadData(true);
    setShowManualModal(false);
    
    // Reset form
    setManualRefInput('');
    setManualStudentId('');
    setManualAmount('');
  };

  // Compute Metrics
  const successPayments = payments.filter(p => p.status === 'success' || p.status === 'success_reconciled');
  const totalVolumeGhs = successPayments.reduce((acc, curr) => acc + curr.amount, 0);
  const successCount = successPayments.length;
  const otherCount = payments.length - successCount;

  // Process monthly revenue data for Recharts
  const monthlyRevenueData = useMemo(() => {
    const monthlyMap: Record<string, { monthKey: string; monthLabel: string; totalAmount: number; txCount: number; timestamp: number }> = {};
    
    successPayments.forEach(p => {
      const dateStr = p.paidAt || p.createdAt;
      if (!dateStr) return;
      
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return;
        
        const yearObj = date.getFullYear();
        const monthObj = date.getMonth(); // 0-11
        const monthKey = `${yearObj}-${String(monthObj + 1).padStart(2, '0')}`;
        
        const monthLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        
        if (!monthlyMap[monthKey]) {
          monthlyMap[monthKey] = {
            monthKey,
            monthLabel,
            totalAmount: 0,
            txCount: 0,
            timestamp: new Date(yearObj, monthObj, 1).getTime()
          };
        }
        
        monthlyMap[monthKey].totalAmount += p.amount;
        monthlyMap[monthKey].txCount += 1;
      } catch (err) {
        console.warn("Could not parse payment date for monthly trend visualizer:", dateStr, err);
      }
    });
    
    // Sort chronologically by timestamp
    const sortedData = Object.values(monthlyMap).sort((a, b) => a.timestamp - b.timestamp);
    
    // Fallback if no entries yet (past 6 months with 0s)
    if (sortedData.length === 0) {
      const fallbackList = [];
      const current = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
        fallbackList.push({
          monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          monthLabel: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
          totalAmount: 0,
          txCount: 0,
          timestamp: d.getTime()
        });
      }
      return fallbackList;
    }
    
    return sortedData;
  }, [successPayments]);

  // Filter logs for list
  const filteredPayments = payments.filter(p => {
    const sIdLower = p.studentId?.toLowerCase() || '';
    const nameLower = getStudentName(p.studentId).toLowerCase();
    const refLower = p.reference?.toLowerCase() || '';
    const qLower = searchQuery.toLowerCase();

    const matchesSearch = sIdLower.includes(qLower) || nameLower.includes(qLower) || refLower.includes(qLower);
    
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesComponent = componentFilter === 'all' || p.component === componentFilter;

    return matchesSearch && matchesStatus && matchesComponent;
  });

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 border border-slate-200 rounded-2xl gap-4 shadow-xs">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block mb-0.5">Admin Security Control</span>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="text-emerald-600" size={24} /> Paystack Integration Center
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-prose">
            Monitor, reconcile, and audit cloud transactions initialized via the Paystack payment gateway.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer"
          >
            <Plus size={14} /> Reconcile Entry
          </button>
          
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-white ${themeStyles.primaryBg} hover:opacity-90 disabled:opacity-50 transition cursor-pointer`}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing Logs..." : "Sync Logs Now"}
          </button>
        </div>
      </div>

      {/* Overview Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs relative overflow-hidden flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-mono font-bold text-slate-400">Total Volume Processed</p>
            <p className="text-2xl font-black text-emerald-700 font-mono">GHS {totalVolumeGhs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-slate-400">Total accumulated settled funds</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CreditCard size={24} />
          </div>
        </div>

        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs relative overflow-hidden flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-mono font-bold text-slate-400">Completed Payments</p>
            <p className="text-2xl font-black text-slate-800 font-mono">{successCount} <span className="text-xs text-emerald-600 font-sans">Settled</span></p>
            <p className="text-[10px] text-slate-400">Successfully locked credentials</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs relative overflow-hidden flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-mono font-bold text-slate-400">Pending & Unresolved</p>
            <p className="text-2xl font-black text-amber-600 font-mono">{otherCount} <span className="text-xs text-slate-400 font-sans">Incomplete</span></p>
            <p className="text-[10px] text-slate-400">Abandoned checkouts / Retries</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <AlertTriangle size={24} />
          </div>
        </div>
      </div>

      {/* Monthly Revenue Trends Chart Block */}
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-indigo-600 block mb-0.5">Financial Intelligence</span>
            <h3 className="text-md font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
              Gateway Revenue Stream Analytics
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Visualizes real-time performance of consolidated online tuition settlements.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-indigo-600 rounded-xs"></span>
              <span className="text-slate-600 font-bold">Settled GHS</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="text-slate-400">Monthly Avg:</span>
              <span className="text-indigo-950 font-black">
                GHS {(totalVolumeGhs / (monthlyRevenueData.filter(d => d.totalAmount > 0).length || 1)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={monthlyRevenueData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="monthLabel" 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={(val) => `GHS ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as any;
                    return (
                      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-lg border border-slate-800 text-xs space-y-1 font-sans">
                        <p className="font-bold text-slate-400 font-mono text-[9px] uppercase tracking-wider">{data.monthLabel}</p>
                        <p className="text-md font-extrabold text-emerald-400 font-mono">
                          GHS {data.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-slate-400 text-right">
                          {data.txCount} settled payment{data.txCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="totalAmount" 
                stroke="#4f46e5" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                activeDot={{ r: 5, strokeWidth: 0, fill: '#4f46e5' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Manual verification box & sync widget */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-6 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-2xl space-y-4">
          <span className="text-[9px] uppercase font-mono tracking-widest font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">Secure Gateway Terminal</span>
          <h3 className="text-md font-bold text-slate-100 flex items-center gap-1.5 leading-none">
            <ArrowLeftRight size={18} className="text-amber-400" /> Paystack Reference Validation API Handshake
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Did a parent initiate payment whose status failed to sync automatically? Input the Paystack transaction reference sequence below to establish a real-time ledger verify check. Safe verified logs will auto-credit the student's ledger.
          </p>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyReference(verifyRef);
            }} 
            className="flex items-center gap-2 max-w-lg"
          >
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder="e.g. PAYSTACK_171891024_ABCDE"
                value={verifyRef}
                onChange={(e) => setVerifyRef(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 hover:border-slate-700 focus:border-amber-400 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-mono tracking-wide placeholder-slate-600 transition"
              />
            </div>
            <button
              type="submit"
              disabled={verifying || !verifyRef.trim()}
              className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:bg-slate-800 disabled:text-slate-600 font-extrabold text-xs tracking-wider transition cursor-pointer flex items-center gap-1 shrink-0"
            >
              {verifying ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Verifying...
                </>
              ) : "Verify & Sync"}
            </button>
          </form>

          {verifyStatus && (
            <div className={`p-4 rounded-xl text-xs flex gap-2 border leading-relaxed animate-fadeIn ${
              verifyStatus.type === 'success' ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-300' :
              verifyStatus.type === 'warning' ? 'bg-amber-950/30 border-amber-900/50 text-amber-300' :
              'bg-rose-950/30 border-rose-900/50 text-rose-300'
            }`}>
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wider block mb-0.5">Verification Report</span>
                <p className="font-sans">{verifyStatus.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logs Table Area */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Filters Block */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-black text-slate-700 font-display">System Transactions Log</span>
            <span className="px-2 py-0.5 bg-slate-200 rounded-full text-[10px] font-bold text-slate-600 font-mono">{filteredPayments.length} of {payments.length}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Search Input */}
            <div className="relative text-slate-400 w-full md:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reference, student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3.5 py-1.5 focus:border-slate-400 focus:outline-none text-xs text-slate-800 transition"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All States</option>
              <option value="success">Success / Settled</option>
              <option value="abandoned">Abandoned</option>
              <option value="failed">Failed</option>
              <option value="ongoing">Ongoing</option>
            </select>

            {/* Component Filter */}
            <select
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all font-semibold">All Components</option>
              <option value="School Fees">School Fees</option>
              <option value="Utility Bill">Utility Bill</option>
              <option value="Sports Fees">Sports Fees</option>
              <option value="PTA dues">PTA dues</option>
              <option value="Other Fee">Other Fee</option>
            </select>

            {/* Wipe Logs */}
            {payments.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-1.5 rounded-xl hover:bg-rose-50 text-rose-500 transition cursor-pointer"
                title="Wipe Logs Records"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Real Table */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
            <p className="text-xs text-slate-500 font-mono">Syncing system audit log indices...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-16 text-center">
            <FileText size={40} className="mx-auto text-slate-300 mb-2" />
            <h4 className="text-sm font-bold text-slate-850">Empty Audit Ledger</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No matching Paystack online transactions were indexed under the current viewport filter settings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/60 uppercase text-[9px] font-mono font-bold text-slate-500 tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3">Reference / ID</th>
                  <th className="px-6 py-3">Student Name (ID)</th>
                  <th className="px-6 py-3">Target Fee Component</th>
                  <th className="px-6 py-3 text-right">Amount (GHS)</th>
                  <th className="px-6 py-3">Term / Year</th>
                  <th className="px-6 py-3 text-center">Gate Status</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 divide-dashed">
                {filteredPayments.map((p) => {
                  const statusColors = p.status === 'success' || p.status === 'success_reconciled'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                    : p.status === 'abandoned'
                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                    : p.status === 'failed'
                    ? 'bg-rose-50 text-rose-800 border-rose-100'
                    : 'bg-slate-50 text-slate-700 border-slate-100';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition">
                      {/* Reference */}
                      <td className="px-6 py-3.5">
                        <div className="space-y-0.5">
                          <span className="font-mono text-[10px] font-bold text-slate-800 block select-all bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200 inline-block">{p.reference}</span>
                          {p.paidAt && (
                            <span className="text-[9px] text-slate-400 font-mono block">
                              Paid: {new Date(p.paidAt).toLocaleDateString()} {new Date(p.paidAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Student details */}
                      <td className="px-6 py-3.5">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800">{getStudentName(p.studentId)}</p>
                          <p className="text-[9px] font-mono text-slate-400">{p.studentId}</p>
                        </div>
                      </td>

                      {/* Component */}
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                          p.component === 'School Fees' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                          p.component === 'Utility Bill' ? 'bg-teal-50 text-teal-800 border border-teal-100' :
                          p.component === 'Sports Fees' ? 'bg-amber-50 text-amber-800 border-amber-100' :
                          'bg-slate-50 text-slate-700 border-slate-150'
                        }`}>
                          {p.component}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="px-6 py-3.5 text-right font-mono text-xs font-black text-slate-800">
                        {p.amount.toFixed(2)}
                      </td>

                      {/* Term / Year */}
                      <td className="px-6 py-3.5">
                        <div className="space-y-0.5 text-[10px]">
                          <p className="font-bold text-slate-700">{p.term}</p>
                          <p className="text-slate-400 font-mono">{p.academicYear}</p>
                        </div>
                      </td>

                      {/* Gateway status */}
                      <td className="px-6 py-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border inline-block ${statusColors}`}>
                          {p.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {p.status !== 'success' && p.status !== 'success_reconciled' && (
                            <button
                              onClick={() => handleVerifyReference(p.reference)}
                              className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-extrabold text-slate-700 transition cursor-pointer flex items-center gap-1"
                              title="Re-verify client checkout hook state"
                            >
                              <RefreshCw size={10} /> Sync Hand
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            className="p-1 rounded-lg hover:bg-rose-50 text-rose-500 transition cursor-pointer"
                            title="Remove log file"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reconcile Manual Modal Entry (Modal popup style) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 p-6 shadow-2xl relative animate-scaleUp">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <Plus size={18} className="text-emerald-600" /> Reconcile Offline / Test Entry
            </h3>

            <form onSubmit={handleCreateManualOverride} className="py-4 space-y-4">
              {/* Reference */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Transaction Reference</label>
                <input
                  type="text"
                  placeholder="e.g. PAYSTACK_MANUAL_123"
                  value={manualRefInput}
                  onChange={(e) => setManualRefInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono tracking-wider text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none"
                  required
                />
              </div>

              {/* Student Link */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Link to Student Profile</label>
                <select
                  value={manualStudentId}
                  onChange={(e) => setManualStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700"
                  required
                >
                  <option value="">-- Select Target Student --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.class}) - ID: {s.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount & Component */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Amount (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="250.00"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black text-slate-800"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Fee Target Component</label>
                  <select
                    value={manualComponent}
                    onChange={(e) => setManualComponent(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-bold"
                  >
                    <option value="School Fees">School Fees</option>
                    <option value="Utility Bill">Utility Bill</option>
                    <option value="Sports Fees">Sports Fees</option>
                    <option value="PTA dues">PTA dues</option>
                    <option value="Other Fee">Other Fee</option>
                  </select>
                </div>
              </div>

              {/* Year & Term */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Academic Year</label>
                  <input
                    type="text"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-750"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Term Group</label>
                  <select
                    value={manualTerm}
                    onChange={(e) => setManualTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700"
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1 border-t border-slate-100 pt-3">
                <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Log Reconciliation State</label>
                <div className="flex items-center gap-3 mt-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 font-bold cursor-pointer">
                    <input
                      type="radio"
                      name="manualStatus"
                      value="success"
                      checked={manualStatus === 'success'}
                      onChange={() => setManualStatus('success')}
                      className="accent-emerald-600 scale-110"
                    />
                    Settled Success
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 font-bold cursor-pointer">
                    <input
                      type="radio"
                      name="manualStatus"
                      value="failed"
                      checked={manualStatus === 'failed'}
                      onChange={() => setManualStatus('failed')}
                      className="accent-rose-600 scale-110"
                    />
                    Unresolved/Failed
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white ${themeStyles.primaryBg}`}
                >
                  Reconcile Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
