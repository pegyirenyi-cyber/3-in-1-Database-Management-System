import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { DbController } from '../db';
import { UserAccount } from '../types';
import { 
  evaluateSubscription, 
  getContactAdminLinks, 
  generateActivationCode 
} from '../subscription';
import { 
  Lock, Mail, Phone, KeyRound, ArrowRightLeft, ShieldAlert, Sparkles, CheckCircle2, LogOut 
} from 'lucide-react';

interface SubscriptionLockModalProps {
  user: UserAccount;
  onUnlocked: (updatedUser: UserAccount) => void;
  onLogout: () => void;
}

export default function SubscriptionLockModal({ user, onUnlocked, onLogout }: SubscriptionLockModalProps) {
  const [activationInput, setActivationInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const status = evaluateSubscription(user);
  if (!status) return null;

  const { requestCode, isTrial } = status;
  const adminLinks = getContactAdminLinks(user.email, requestCode);

  const handleActivationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsVerifying(true);

    try {
      const cleanInput = activationInput.trim();
      const expectedCode = generateActivationCode(user.email, requestCode);

      if (cleanInput.toUpperCase() === expectedCode) {
        // Correct key! Activate the user for an academic year (12 months)
        const updated = await DbController.updateUserLicense(
          user.uid,
          'activated',
          new Date().toISOString(), // lastActivatedOn = now
          cleanInput.toUpperCase(),
          requestCode
        );
        
        setSuccess(true);
        setTimeout(() => {
          onUnlocked(updated);
        }, 1800);
      } else {
        setErrorMsg("Incorrect activation code. Please contact Admin at pegyirenyi@gmail.com or 0544052717 for a valid code.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to verify code. Please check your network or try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-6 text-slate-100 my-8"
      >
        {/* Lock header */}
        <div className="text-center space-y-2">
          {success ? (
            <motion.div 
              initial={{ scale: 0.5 }}
              animate={{ scale: [1, 1.2, 1] }}
              className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto"
            >
              <CheckCircle2 size={32} className="animate-bounce" />
            </motion.div>
          ) : (
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/25 text-amber-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <Lock size={26} />
            </div>
          )}
          
          <h2 className="text-xl font-black tracking-tight text-amber-400 uppercase font-sans">
            {success ? "License Unlocked!" : isTrial ? "App Trial Expired" : "License Renewal Required"}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            {success 
              ? "Your license has been verified. Welcome back to GEETECH Multimedia!"
              : isTrial 
                ? "Your 21-day system trial has expired. To preserve your school databases and continue using the software, it is highly recommended to subscribe for 1 year or more."
                : "Your school database license has completed its academic term. Please contact the administrator to renew or subscribe for 1 year or more."
            }
          </p>
        </div>

        {success ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-emerald-400 font-bold font-mono">Initializing Academic Workspace...</p>
            <div className="text-xs text-slate-500 font-mono">Storing secure offline signature token</div>
          </div>
        ) : (
          <>
            {/* Account Metadata Detail Card */}
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4.5 space-y-3.5 text-xs font-sans">
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">Active Account</span>
                <span className="font-mono font-bold text-slate-300 truncate max-w-[180px]">{user.email}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">System Request Code</span>
                <span className="font-mono font-extrabold text-amber-400 tracking-wider bg-amber-950/20 px-2 py-0.5 rounded border border-amber-900/20">{requestCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Status</span>
                <span className="text-rose-400 font-bold uppercase tracking-wider text-[10px]">Expired / Locked</span>
              </div>
            </div>

            {/* Quick-action support links */}
            <div className="space-y-3">
              <span className="block text-[10px] text-slate-500 font-mono uppercase tracking-wider text-center">Contact GEETECH Admin</span>
              
              <div className="grid grid-cols-2 gap-3.5">
                <a 
                  href={adminLinks.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-2 px-3 bg-teal-600/10 hover:bg-teal-600/20 border border-teal-500/20 hover:border-teal-500/40 text-teal-400 font-bold text-xs rounded-xl transition text-center"
                >
                  <Phone size={14} className="text-teal-400" />
                  Chat on WhatsApp
                </a>
                <a 
                  href={adminLinks.mailtoUrl}
                  className="flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 font-bold text-xs rounded-xl transition text-center"
                >
                  <Mail size={14} className="text-indigo-400" />
                  Request via Email
                </a>
              </div>

              <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl space-y-1 text-center">
                <p className="text-[10px] text-slate-400 leading-normal">
                  Renewal Hotline: <strong className="text-slate-200">0544052717</strong> or email <strong className="text-slate-200">pegyirenyi@gmail.com</strong>
                </p>
                <div className="text-[9px] text-slate-500 font-mono tracking-wider">
                  Suggesting renewal activation code token to admin.
                </div>
              </div>
            </div>

            {/* Enter Activation Code Form */}
            <form onSubmit={handleActivationSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 font-mono">
                  Enter License Activation Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={15} />
                  <input 
                    type="text"
                    required
                    placeholder="e.g. SEC-XXX-XXXXXX"
                    value={activationInput}
                    onChange={(e) => setActivationInput(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-800 focus:border-amber-500 rounded-xl bg-slate-950 text-slate-100 placeholder-slate-700 uppercase tracking-widest text-center font-mono focus:outline-none transition"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-950/40 border border-rose-900/30 text-rose-400 rounded-xl text-xs flex gap-2">
                  <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying || !activationInput}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 hover:text-white font-extrabold rounded-xl transition duration-200 shadow-lg cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 text-xs tracking-wider uppercase font-sans"
              >
                {isVerifying ? "Validating License..." : "Activate App License"}
              </button>
            </form>
          </>
        )}

        {/* System escape hatches / logout backup */}
        <div className="border-t border-slate-850 pt-4 flex justify-between items-center text-[11px]">
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition duration-150 cursor-pointer"
          >
            <LogOut size={13} />
            Log Out Account
          </button>
          <span className="text-slate-600 font-mono">GEETECH OS v3.2</span>
        </div>
      </motion.div>
    </div>
  );
}
