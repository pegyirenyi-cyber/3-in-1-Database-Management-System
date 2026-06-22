import { UserAccount } from './types';

export interface SubscriptionStatus {
  isLocked: boolean;
  isTrial: boolean;
  registeredOnDate: Date;
  expiryDate: Date;
  remainingDays: number;
  message: string;
  requestCode: string;
  licenseType: 'trial' | 'activated';
}

/**
 * Deterministically generates a secure activation/renewal passcode based on
 * the user's email, their unique request code, and an offline salt.
 * Ensures the admin (pegyirenyi@gmail.com) can generate keys offline
 * and the user's client can securely verify them without requiring database lookups.
 */
export function generateActivationCode(email: string, requestCode: string): string {
  const cleanEmail = email.toLowerCase().trim();
  const cleanRequest = requestCode.toUpperCase().trim();
  
  let hash = 0;
  const combined = `${cleanEmail}:${cleanRequest}:GEETECH-SALT-2026`;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const absHash = Math.abs(hash);
  const numPart = (absHash % 900000) + 100000; // Force exactly 6 digits
  const charPart = cleanEmail.substring(0, 3).toUpperCase().split('').reverse().join('');
  return `SEC-${charPart}-${numPart}`;
}

/**
 * Creates or retrieves a standard format random Request Code.
 * Useful so that multiple requests are unique.
 */
export function getOrCreateRequestCode(user: UserAccount): string {
  if (user.requestCode) return user.requestCode;
  // Generate random digits
  const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 digits
  const emailPrefix = user.email.split('@')[0].substring(0, 4).toUpperCase();
  return `REQ-${emailPrefix}-${randomDigits}`;
}

/**
 * Evaluates the subscription status for any user account.
 * Peggy is free and exempt forever.
 */
export function evaluateSubscription(user: UserAccount | null): SubscriptionStatus | null {
  if (!user) return null;
  
  const email = user.email.toLowerCase().trim();
  
  // Rule: pegyirenyi@gmail.com is exempt from subscription limits
  if (email === 'pegyirenyi@gmail.com') {
    return {
      isLocked: false,
      isTrial: false,
      registeredOnDate: new Date(user.createdAt),
      expiryDate: new Date('2036-12-31T23:59:59Z'), // Long future date
      remainingDays: 3650,
      message: 'System Master Admin Access Granted.',
      requestCode: 'SYSTEM-BYPASS',
      licenseType: 'activated'
    };
  }

  // Handle default fields if undefined on the user record
  const licenseType = user.licenseType || 'trial';
  const registeredOn = user.registeredOn || user.createdAt || new Date().toISOString();
  const lastActivatedOn = user.lastActivatedOn || null;
  const requestCode = user.requestCode || `REQ-${email.split('@')[0].substring(0, 4).toUpperCase()}-9401`;
  
  const regDate = new Date(registeredOn);
  let expDate: Date;

  // -------------------------------------------------------------
  // ACADEMIC CALENDAR DRIVEN SUBSCRIPTION EXPIRY LOGIC
  // -------------------------------------------------------------
  let calendarConfig: any = null;
  try {
    const savedCal = typeof localStorage !== 'undefined' ? localStorage.getItem('sms_academic_calendar') : null;
    if (savedCal) {
      calendarConfig = JSON.parse(savedCal);
    }
  } catch (e) {
    console.error("Error reading academic calendar for subscription evaluation:", e);
  }

  // Robust defaults matching DEFAULT_CALENDAR
  const activeYear = calendarConfig?.activeAcademicYear || '2026/2027';
  const activeTerm = calendarConfig?.activeTerm || 'Term 1';
  const yearConfig = calendarConfig?.years?.[activeYear] || {
    startDate: '2026-09-01',
    endDate: '2027-07-31',
    terms: {
      'Term 1': { startDate: '2026-09-01', endDate: '2026-12-18' },
      'Term 2': { startDate: '2027-01-07', endDate: '2027-04-09' },
      'Term 3': { startDate: '2027-05-03', endDate: '2027-07-30' }
    }
  };

  if (licenseType === 'trial') {
    // Trial expires exactly 21 days after registration
    expDate = new Date(regDate.getTime() + 21 * 24 * 60 * 60 * 1000);
  } else {
    // Licensed access expires on the defined end date of the active academic calendar school year
    const yearEndDateStr = yearConfig.endDate || '2026-07-31';
    expDate = new Date(`${yearEndDateStr}T23:59:59`);
  }

  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isExpired = now.getTime() >= expDate.getTime();
  const isLocked = isExpired;

  // Build helpful display status statements
  let message = '';
  if (isLocked) {
    message = licenseType === 'trial'
      ? `Your 21-day trial limit has expired. It is highly recommended to subscribe for 1 year or more. Please contact the administrator at pegyirenyi@gmail.com to activate your annual school license.`
      : `Your academic year license has expired. Please contact pegyirenyi@gmail.com for your yearly application renewal.`;
  } else {
    message = licenseType === 'trial'
      ? `System Trial is Active. You have ${remainingDays} days left out of your 21-day trial limit. After your 21-day trial, it is highly recommended to subscribe for 1 year or more.`
      : `Licensed School Account. Your license is healthy with ${remainingDays} days remaining in this academic year (${activeYear}).`;
  }

  return {
    isLocked,
    isTrial: licenseType === 'trial',
    registeredOnDate: regDate,
    expiryDate: expDate,
    remainingDays,
    message,
    requestCode,
    licenseType
  };
}

/**
 * Prepares direct contact links for admin Peggy
 */
export function getContactAdminLinks(email: string, requestCode: string) {
  const adminEmail = 'pegyirenyi@gmail.com';
  const phone = '0544052717'; // Admin Phone in GH (Country code +233 or local 0544052717)
  const strongSuggestedKey = generateActivationCode(email, requestCode);

  const subject = encodeURIComponent('GEETECH School DB License Activation Request');
  const body = encodeURIComponent(
    `Hello Administrator,\n\nI need to renew/activate my GEETECH School Database access.\n` +
    `My Registered User Email: ${email}\n` +
    `My System Request Code: ${requestCode}\n` +
    `Please generate the activation code for me so we can complete our license payment.\n\n` +
    `Suggested Key: ${strongSuggestedKey}\n\n` +
    `Thank you!`
  );

  const mailtoUrl = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
  
  // Format international number for WhatsApp
  const cleanPhone = '233544052717'; // format for WhatsApp click-to-chat
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${body}`;

  return {
    mailtoUrl,
    whatsappUrl,
    phone,
    adminEmail,
    strongSuggestedKey
  };
}
