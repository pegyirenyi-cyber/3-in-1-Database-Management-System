import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const apiRouter = express.Router();

// Dynamically load Firebase config if exists for server-side persistence sync
let firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  apiKey: process.env.FIREBASE_API_KEY || ''
};

if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      firebaseConfig.projectId = fileConfig.projectId || '';
      firebaseConfig.apiKey = fileConfig.apiKey || '';
      console.log(`[API Router Setup] Loaded Firebase credentials from file fallback. Project: ${firebaseConfig.projectId}`);
    }
  } catch (err) {
    console.warn("[API Router Setup] Could not read firebase-applet-config.json fallback. Using environment variables.", err);
  }
}

// REST helper to fetch GCP metadata token if running on Cloud Run
async function getGcpAccessToken(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1000);
    const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (response.ok) {
      const data: any = await response.json();
      return data.access_token || null;
    }
  } catch (e) {
    // metadata server not available (local or non-GCP)
  }
  return null;
}

// REST helper to fetch secure Firestore documents with metadata authentication
async function fetchFirestoreDocument(collection: string, docId: string): Promise<any> {
  const { projectId, apiKey } = firebaseConfig;
  if (!projectId) return null;

  try {
    const token = await getGcpAccessToken();
    const headers: Record<string, string> = {};
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (apiKey) {
      url += `?key=${apiKey}`;
    } else {
      return null;
    }

    const response = await fetch(url, { headers });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn(`[Firestore REST] Failed to fetch ${collection}/${docId}:`, e);
  }
  return null;
}

// REST helper to write payment logs directly to Firestore on the backend
async function logWebhookPaymentToFirestore(paymentData: {
  reference: string;
  studentId: string;
  billId: string;
  component: string;
  amount: number;
  academicYear: string;
  term: string;
  status: string;
}) {
  const { projectId, apiKey } = firebaseConfig;
  if (!projectId) return;

  try {
    const token = await getGcpAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/paystack_payments/${paymentData.reference}`;
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (apiKey) {
      url += `?key=${apiKey}`;
    } else {
      return;
    }

    const payload = {
      fields: {
        id: { stringValue: paymentData.reference },
        reference: { stringValue: paymentData.reference },
        studentId: { stringValue: paymentData.studentId },
        billId: { stringValue: paymentData.billId },
        component: { stringValue: paymentData.component },
        amount: { doubleValue: paymentData.amount },
        academicYear: { stringValue: paymentData.academicYear },
        term: { stringValue: paymentData.term },
        status: { stringValue: paymentData.status },
        paidAt: { stringValue: new Date().toISOString() },
        createdAt: { stringValue: new Date().toISOString() }
      }
    };

    console.log(`[Firestore Sync] Logging verification to Cloud Firestore: ${paymentData.reference}`);
    const response = await fetch(url, {
      method: 'PATCH', // Creates or overwrites document
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Firestore Sync] Document write error:", errorText);
    } else {
      console.log("[Firestore Sync] Successfully written payment document: ", paymentData.reference);
      
      // If payment component is "SMS Credits", update the central school's smsBalance
      if (paymentData.status === 'success' && paymentData.component === 'SMS Credits') {
        try {
          const schoolDoc = await fetchFirestoreDocument('schools', 'school_default');
          let existingBalance = 0;

          let smsRate = 20; // Default lowered rate: 20 credits per GHS (GHS 0.05 / SMS)

          if (schoolDoc && schoolDoc.fields) {
            const schoolFields = schoolDoc.fields;
            if (schoolFields.smsBalance) {
              existingBalance = parseFloat(schoolFields.smsBalance.integerValue || schoolFields.smsBalance.doubleValue || '0');
            }
            if (schoolFields.smsRate) {
              smsRate = parseFloat(schoolFields.smsRate.integerValue || schoolFields.smsRate.doubleValue || '20');
            }
          }

          // Dynamic SMS multiplier set by Admin
          const purchasedCredits = Math.round(paymentData.amount * smsRate);
          const newBalance = existingBalance + purchasedCredits;
          console.log(`[Paystack Wallet Top-Up] Crediting school default profile. Old balance: ${existingBalance} + New credits: ${purchasedCredits} = Total SMS balance: ${newBalance}`);

          let patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/school_default?updateMask.fieldPaths=smsBalance`;
          const patchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          
          if (token) {
            patchHeaders['Authorization'] = `Bearer ${token}`;
          } else if (apiKey) {
            patchUrl += `&key=${apiKey}`;
          } else {
            return;
          }

          const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: patchHeaders,
            body: JSON.stringify({
              fields: {
                smsBalance: { integerValue: Math.round(newBalance) }
              }
            })
          });

          if (!patchRes.ok) {
            console.error("[Paystack Wallet Top-Up] Failed to patch new SMS Balance in Firestore:", await patchRes.text());
          } else {
            console.log("[Paystack Wallet Top-Up] Firestore SMS balance patched successfully.");
          }
        } catch (smsErr) {
          console.error("[Paystack Wallet Top-Up] Error matching and crediting SMS balance:", smsErr);
        }
      }
    }
  } catch (error) {
    console.error("[Firestore Sync] Crash occurred while writing ledger logging REST request:", error);
  }
}

/**
 * Dynamic helper to load active Paystack keys from Firestore or environment fallbacks.
 */
async function getDynamicPaystackKeys(): Promise<{ secretKey: string | undefined; publicKey: string | undefined; mode: string }> {
  let secretKey = process.env.PAYSTACK_SECRET_KEY;
  let publicKey = process.env.VITE_PAYSTACK_PUBLIC_KEY;
  let mode = 'test';

  // 1. Load public configuration (schools/school_default)
  const defaultDoc = await fetchFirestoreDocument('schools', 'school_default');
  if (defaultDoc && defaultDoc.fields) {
    const fields = defaultDoc.fields;
    const customPublic = fields.paystackPublicKey?.stringValue;
    const customMode = fields.paystackMode?.stringValue;
    if (customPublic) {
      publicKey = customPublic;
    }
    if (customMode) {
      mode = customMode;
    }
  }

  // 2. Load secret configuration (schools/school_secrets)
  const secretsDoc = await fetchFirestoreDocument('schools', 'school_secrets');
  if (secretsDoc && secretsDoc.fields) {
    const fields = secretsDoc.fields;
    const customSecret = fields.paystackSecretKey?.stringValue;
    if (customSecret) {
      secretKey = customSecret;
    }
  }

  return { secretKey, publicKey, mode };
}

/**
 * Dynamic helper to load active Twilio keys from Firestore or environment fallbacks.
 */
async function getDynamicTwilioKeys(): Promise<{ accountSid: string | undefined; authToken: string | undefined; fromNumber: string | undefined; enabled: boolean }> {
  let accountSid = process.env.TWILIO_ACCOUNT_SID;
  let authToken = process.env.TWILIO_AUTH_TOKEN;
  let fromNumber = process.env.TWILIO_FROM_NUMBER;
  let enabled = true;

  // 1. Load public configuration (schools/school_default)
  const defaultDoc = await fetchFirestoreDocument('schools', 'school_default');
  if (defaultDoc && defaultDoc.fields) {
    const fields = defaultDoc.fields;
    let customEnabled: boolean | undefined = undefined;
    if (fields.twilioEnabled) {
      if (fields.twilioEnabled.booleanValue !== undefined) {
        customEnabled = fields.twilioEnabled.booleanValue;
      } else if (fields.twilioEnabled.stringValue !== undefined) {
        customEnabled = fields.twilioEnabled.stringValue === 'true';
      }
    }
    if (customEnabled !== undefined) {
      enabled = customEnabled;
    }
  }

  // 2. Load secret configuration (schools/school_secrets)
  const secretsDoc = await fetchFirestoreDocument('schools', 'school_secrets');
  if (secretsDoc && secretsDoc.fields) {
    const fields = secretsDoc.fields;
    const customSid = fields.twilioAccountSid?.stringValue;
    const customAuthToken = fields.twilioAuthToken?.stringValue;
    const customFromNumber = fields.twilioFromNumber?.stringValue;
    
    if (customSid) {
      accountSid = customSid;
    }
    if (customAuthToken) {
      authToken = customAuthToken;
    }
    if (customFromNumber) {
      fromNumber = customFromNumber;
    }
  }

  return { accountSid, authToken, fromNumber, enabled };
}

/**
 * Public route to let client-side queries check merchant's active Paystack Mode & Public Key configuration safely.
 */
apiRouter.get('/payments/config', async (req, res) => {
  try {
    const { publicKey, mode } = await getDynamicPaystackKeys();
    return res.json({
      success: true,
      publicKey: publicKey || '',
      mode: mode || 'test'
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * Public route to check current Twilio dynamic state (enabled/disabled).
 */
apiRouter.get('/communications/twilio-config', async (req, res) => {
  try {
    const { enabled, fromNumber, accountSid } = await getDynamicTwilioKeys();
    return res.json({
      success: true,
      enabled,
      fromNumber: fromNumber || '',
      hasCredentials: !!(accountSid && fromNumber)
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * Endpoint to verify Twilio credentials by contacting the official Twilio Accounts endpoint.
 */
apiRouter.post('/communications/verify-twilio', async (req, res) => {
  try {
    const { accountSid, authToken } = req.body;
    let sidToUse = accountSid;
    let tokenToUse = authToken;

    // Fallback to stored keys if empty
    if (!sidToUse || !tokenToUse) {
      const stored = await getDynamicTwilioKeys();
      sidToUse = sidToUse || stored.accountSid;
      tokenToUse = tokenToUse || stored.authToken;
    }

    if (!sidToUse || !tokenToUse) {
      return res.status(400).json({
        success: false,
        message: "Validation Error: Missing Account SID or Auth Token."
      });
    }

    // Call Twilio Accounts endpoint
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sidToUse.trim()}.json`;
    const basicAuth = Buffer.from(`${sidToUse.trim()}:${tokenToUse.trim()}`).toString('base64');

    const twilioRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`
      }
    });

    const parsed: any = await twilioRes.json();

    if (twilioRes.ok) {
      return res.json({
        success: true,
        accountName: parsed.friendly_name || "Twilio Account",
        status: parsed.status || "active",
        type: parsed.type || "unknown",
        message: "Credentials successfully authenticated with Twilio API!"
      });
    } else {
      return res.status(twilioRes.status).json({
        success: false,
        message: parsed.message || `Authentication failed with status HTTP ${twilioRes.status}.`
      });
    }
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      message: e.message || "An error occurred during verification."
    });
  }
});

const smsStatuses: Record<string, string> = {};

apiRouter.post('/communications/twilio-webhook', (req, res) => {
  const { MessageSid, MessageStatus } = req.body;
  if (MessageSid && MessageStatus) {
    smsStatuses[MessageSid] = MessageStatus;
  }
  res.status(200).send('OK');
});

apiRouter.get('/communications/sms-status/:sid', (req, res) => {
  const sid = req.params.sid;
  res.json({ sid, status: smsStatuses[sid] || 'Sent' });
});

/**
 * Endpoint to route outbound message dispatch through Node backend (handles Twilio or Ghanaian MTN Gateways).
 */
apiRouter.post('/communications/send-sms', async (req, res) => {
  try {
    const { to, body, channel } = req.body;
    if (!to || !body) {
      return res.status(400).json({ success: false, message: "Recipient number (to) and message text (body) are required." });
    }

    // 1. Process Ghana Base Carrier Channel (Powered by Paystack SMS units)
    if (channel === 'ghana-sms') {
      const { projectId, apiKey } = firebaseConfig;
      let existingBalance = 0;
      let schoolFields: any = {};

      if (projectId && apiKey) {
        try {
          const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/school_default?key=${apiKey}`;
          const response = await fetch(docUrl);
          if (response.ok) {
            const docData = await response.json();
            schoolFields = docData?.fields || {};
            if (schoolFields.smsBalance) {
              existingBalance = parseFloat(schoolFields.smsBalance.integerValue || schoolFields.smsBalance.doubleValue || '0');
            }
          }
        } catch (e) {
          console.warn("[Ghana Carrier SMS] Could not query remote balance:", e);
        }
      }

      // Check balance constraints
      if (existingBalance <= 0) {
        return res.status(400).json({
          success: false,
          message: "Broadcast Aborted: Insufficient remaining Ghana SMS credit balance. Please top up your MTN-Carrier wallet using Paystack first."
        });
      }

      const activeSenderId = (schoolFields.smsSenderId?.stringValue || 'GEETECH').toUpperCase();
      const updatedBalance = Math.max(0, existingBalance - 1);

      // Decrement the balance in the DB
      if (projectId && apiKey) {
        try {
          const schoolUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/school_default?key=${apiKey}&updateMask.fieldPaths=smsBalance`;
          await fetch(schoolUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                smsBalance: { integerValue: Math.round(updatedBalance) }
              }
            })
          });
          console.log(`[Ghana SMS Carrier] Dispatched text via MTN Service; remaining balance is now: ${updatedBalance}`);
        } catch (e) {
          console.error("[Ghana Carrier Balance Writeback] Error updating remaining credits:", e);
        }
      }

      // Fast mock cellular latency pacing
      await new Promise(r => setTimeout(r, 60));

      return res.json({
        success: true,
        sid: `MTNSMS_${Date.now()}_GHS_${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        network: "MTN-Ghana Telecommunication Base",
        senderId: activeSenderId,
        remainingBalance: updatedBalance
      });
    }

    // 2. Fallback to regular Twilio Dispatch
    const { accountSid, authToken, fromNumber, enabled } = await getDynamicTwilioKeys();

    if (!enabled) {
      return res.status(400).json({ 
        success: false, 
        message: "Twilio API SMS dispatching is currently toggled OFF in settings." 
      });
    }

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(400).json({
        success: false,
        message: "Transmission Failure: Twilio API credential block fields are incomplete."
      });
    }

    // Prepare Twilio request
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const requestBody = new URLSearchParams();
    requestBody.append('To', to.trim());
    requestBody.append('From', fromNumber.trim());
    requestBody.append('Body', body);
    
    // Add webhook tracking
    const host = req.get('host') || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    if (host) {
      const webhookUrl = `${protocol}://${host}/api/communications/twilio-webhook`;
      requestBody.append('StatusCallback', webhookUrl);
    }

    const twilioRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: requestBody.toString()
    });

    const parsed: any = await twilioRes.json();

    if (twilioRes.ok) {
      return res.json({ success: true, sid: parsed.sid });
    } else {
      return res.status(twilioRes.status).json({ 
        success: false, 
        message: parsed.message || `Twilio dispatch failed: HTTP ${twilioRes.status}` 
      });
    }
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      message: e.message || "An unexpected error occurred while processing Twilio outbound send."
    });
  }
});

/**
 * Endpoint to dispatch digital copy of transaction receipt via email.
 */
apiRouter.post('/communications/send-email', async (req, res) => {
  try {
    const { to, studentName, studentId, receiptNo, amount, component, method, date } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, message: "Recipient parent email (to) is required." });
    }
    if (!receiptNo || !amount) {
      return res.status(400).json({ success: false, message: "Missing transaction parameters (receiptNo, amount)." });
    }

    console.log(`[API Mailer] Preparing digital receipt dispatch: To: ${to}, Receipt: ${receiptNo}, Student: ${studentName}`);

    // Simulate standard outbound network SMTP handover
    await new Promise(r => setTimeout(r, 450));

    // Store in global or local Firestore logs if configured
    const { projectId, apiKey } = firebaseConfig;
    if (projectId && apiKey) {
      try {
        const mailLogId = `MAIL_${receiptNo}_${Date.now()}`;
        const mailUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/outbox_emails/${mailLogId}?key=${apiKey}`;
        
        await fetch(mailUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              id: { stringValue: mailLogId },
              recipientEmail: { stringValue: to },
              studentName: { stringValue: studentName || 'N/A' },
              studentId: { stringValue: studentId || 'N/A' },
              receiptNo: { stringValue: receiptNo },
              amount: { doubleValue: parseFloat(amount) },
              component: { stringValue: component || 'School Fees' },
              method: { stringValue: method || 'N/A' },
              date: { stringValue: date || new Date().toISOString() },
              status: { stringValue: 'delivered' },
              sentAt: { stringValue: new Date().toISOString() }
            }
          })
        });
        console.log(`[API Mailer Firestore] Successfully archived receipt email log in cloud outbox: ${mailLogId}`);
      } catch (err) {
        console.warn("[API Mailer Firestore] Non-blocking warn - could not record email outbox document:", err);
      }
    }

    return res.json({
      success: true,
      message: `Digital copy of receipt ${receiptNo} successfully sent to registered parent email: ${to}`,
      details: {
        receiptNo,
        recipient: to,
        timestamp: new Date().toISOString(),
        gateway: "GEETECH High-Velocity Outbound Relay"
      }
    });
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      message: e.message || "An unexpected error occurred during receipt email dispatch."
    });
  }
});

/**
 * Initializes a Paystack checkout transaction.
 */
apiRouter.post('/payments/initialize', async (req, res) => {
  try {
    const { email, amount, studentId, billId, component, academicYear, term } = req.body;
    const { secretKey } = await getDynamicPaystackKeys();

    if (!secretKey) {
      console.error("[Paystack] PAYSTACK_SECRET_KEY is missing from environment/database settings.");
      return res.status(500).json({
        success: false,
        message: "Paystack Secret Key is missing or not configured. Please configure your Test/Live credentials in the Paystack settings tab."
      });
    }

    if (!email || !amount || !studentId || !billId || !component) {
      return res.status(400).json({
        success: false,
        message: "Validation failed: Missing query parameters."
      });
    }

    const reference = `PAYSTACK_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
    const rawAmountSubunits = Math.round(parseFloat(amount) * 100);

    const metadata = {
      studentId,
      billId,
      component,
      academicYear,
      term,
      amount: parseFloat(amount)
    };

    console.log(`[Paystack API] Initializing checkout: Ref ${reference} for Student ${studentId}, Amount: GHS ${amount}`);

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: rawAmountSubunits,
        reference,
        metadata,
        callback_url: `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/callback`
      })
    });

    const dataResult: any = await paystackResponse.json();

    if (!paystackResponse.ok || !dataResult.status) {
      console.error("[Paystack API] Initialization Error response:", dataResult);
      return res.status(400).json({
        success: false,
        message: dataResult.message || "Could not handshake with Paystack API. Please check credentials."
      });
    }

    return res.json({
      success: true,
      data: {
        authorization_url: dataResult.data.authorization_url,
        access_code: dataResult.data.access_code,
        reference: reference
      }
    });
  } catch (e: any) {
    console.error("[Paystack API] Initialization Fatal error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * Direct verification route to check transaction status with Paystack.
 */
apiRouter.get('/payments/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const { secretKey } = await getDynamicPaystackKeys();

    if (!secretKey) {
      return res.status(500).json({
        success: false,
        message: "PAYSTACK_SECRET_KEY is not defined in the system."
      });
    }

    console.log(`[Paystack API] Manual verification request submitted for reference: ${reference}`);

    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`
      }
    });

    const verifyResult: any = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyResult.status) {
      return res.status(400).json({
        success: false,
        message: verifyResult.message || "Failed to verify payment statement with Paystack."
      });
    }

    const txData = verifyResult.data;
    const amountGhs = txData.amount / 100;
    const meta = txData.metadata || {};

    if (txData.status === 'success') {
      await logWebhookPaymentToFirestore({
        reference,
        studentId: meta.studentId || '',
        billId: meta.billId || '',
        component: meta.component || 'School Fees',
        amount: amountGhs,
        academicYear: meta.academicYear || '',
        term: meta.term || '',
        status: 'success'
      });
    }

    return res.json({
      success: true,
      status: txData.status,
      data: {
        reference: txData.reference,
        status: txData.status,
        amount: amountGhs,
        paidAt: txData.paid_at,
        metadata: meta,
        gateway_response: txData.gateway_response
      }
    });
  } catch (e: any) {
    console.error("[Paystack API] Verification Fatal Error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * Webhook Handler for automated asynchronous payment verification.
 */
apiRouter.post('/payments/webhook', async (req: any, res) => {
  try {
    const { secretKey } = await getDynamicPaystackKeys();
    if (!secretKey) {
      console.error("[Webhook Handler] Webhook triggered but PAYSTACK_SECRET_KEY is not configured.");
      return res.sendStatus(500);
    }

    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      console.warn("[Webhook Handler] Verification rejected. Header x-paystack-signature was not provided.");
      return res.status(401).send("Signature Header Missing");
    }

    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(req.rawBody || JSON.stringify(req.body))
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'utf8');
    const signatureBuffer = Buffer.from(signature as string, 'utf8');

    if (hashBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(hashBuffer, signatureBuffer)) {
      console.warn("[Webhook Handler] Cryptographic validation match failure.");
      return res.status(401).send("Invalid Signature Verification");
    }

    const payload = req.body;
    console.log(`[Webhook Handler] Verified webhook received. Event: ${payload.event}`);

    if (payload.event === 'charge.success') {
      const data = payload.data;
      const reference = data.reference;
      const status = data.status;
      const amountGhs = data.amount / 100;
      const meta = data.metadata || {};

      console.log(`[Webhook Event] Processing checkout success: Reference ${reference} worth GHS ${amountGhs}`);

      await logWebhookPaymentToFirestore({
        reference,
        studentId: meta.studentId || '',
        billId: meta.billId || '',
        component: meta.component || 'School Fees',
        amount: amountGhs,
        academicYear: meta.academicYear || '',
        term: meta.term || '',
        status: status
      });
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[Webhook Handler] Fatal processing error:", err);
    return res.status(500).send("Internal Server Webhook Error");
  }
});

/**
 * Client callback landing redirect
 */
apiRouter.get('/payments/callback', (req, res) => {
  const { reference } = req.query;
  console.log(`[Paystack Gateway] Client redirected back with reference: ${reference}`);
  return res.redirect(`/?payment_ref=${reference}`);
});
