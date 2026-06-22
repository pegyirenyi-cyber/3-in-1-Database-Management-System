import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const apiRouter = express.Router();

// Dynamically load Firebase config if exists for server-side persistence sync
let firebaseConfig = { projectId: '', apiKey: '' };
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`[API Router Setup] Loaded Firebase credentials. Project: ${firebaseConfig.projectId}`);
  }
} catch (err) {
  console.warn("[API Router Setup] Could not read firebase-applet-config.json. Bypassing cloud sync.");
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
  if (!projectId || !apiKey) {
    console.log("[Firestore Sync] Inactive Firebase credentials. Bypassing persistent cloud logging.");
    return;
  }

  try {
    const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/paystack_payments/${paymentData.reference}?key=${apiKey}`;
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
    const response = await fetch(documentUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Firestore Sync] Document write error:", errorText);
    } else {
      console.log("[Firestore Sync] Successfully written payment document: ", paymentData.reference);
    }
  } catch (error) {
    console.error("[Firestore Sync] Crash occurred while writing ledger logging REST request:", error);
  }
}

/**
 * Initializes a Paystack checkout transaction.
 */
apiRouter.post('/payments/initialize', async (req, res) => {
  try {
    const { email, amount, studentId, billId, component, academicYear, term } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      console.error("[Paystack] PAYSTACK_SECRET_KEY is missing from environment variables.");
      return res.status(500).json({
        success: false,
        message: "Paystack Secret Key is missing or not configured on the environment server. Please configure it in your Secrets Panel."
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
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        success: false,
        message: "PAYSTACK_SECRET_KEY is not defined in the server."
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
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
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

    if (hash !== signature) {
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
