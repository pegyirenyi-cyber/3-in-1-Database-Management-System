import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import { apiRouter } from './src/api-router';

// Dynamically load Firebase config if exists for server-side persistence sync
let firebaseConfig = { projectId: '', apiKey: '' };
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`[Server Setup] Dynamically loaded Firebase credentials. Project: ${firebaseConfig.projectId}`);
  }
} catch (err) {
  console.warn("[Server Setup] Could not read firebase-applet-config.json. Fallback to client-side database synchronization.", err);
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
    console.log("[Firestore Sync] Inactive Firebase credentials. Bypassing persistent cloud logging in server.");
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
      method: 'PATCH', // Creates or overwrites document
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Custom parser to capture the exact raw request payload as a Buffer
  // This is required to securely verify Paystack Webhook signatures (HMAC-SHA512)
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true }));
 
  // ==================== PAYSTACK PAYMENT API ====================
  app.use('/api', apiRouter);
 
  // ==================== VITE & ASSETS ROUTING ====================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log("[Node Server] Running in Development Mode. Mounted Vite live refresh middleware.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("[Node Server] Running in Production Mode. Serving static compiled resources from /dist.");
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Applet Engine] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
