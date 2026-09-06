const express = require('express');
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const cors = require('cors');
const admin = require('firebase-admin');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

// Firebase Admin SDK Configuration - Bulletproof Setup
admin.initializeApp({
  credential: admin.credential.cert({
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID || "venom-esports-a3a68",
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "892fe0ff6d4e15adc86a499a313d8c8ab6c8301d",
    private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    client_email: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@venom-esports-a3a68.iam.gserviceaccount.com",
    client_id: process.env.FIREBASE_CLIENT_ID || "101925882236097981031",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40venom-esports-a3a68.iam.gserviceaccount.com"
  })
});

const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors());

let sock;

// WhatsApp Connection Setup
async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    
    if (qr) {
      console.log('QR Code aa gaya, scan karein:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      console.log('Connection closed, reconnecting...');
      connectWhatsApp();
    } else if (connection === 'open') {
      console.log('WhatsApp Connected Successfully!');
    }
  });
}
connectWhatsApp();

// API Endpoint for OTP
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length !== 10) {
    return res.status(400).json({ success: false, message: 'Invalid phone number' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await db.collection('otps').doc(phone).set({
      otp: otp,
      createdAt: new Date()
    });

    const jid = `91${phone}@s.whatsapp.net`;
    const message = `🎮 *Venom eSports*\n\nAapka login OTP code yeh hai: *${otp}*\nKripya ise kisi ke sath share na karein!`;

    await sock.sendMessage(jid, { text: message });

    res.json({ success: true, message: 'OTP sent to WhatsApp successfully' });
  } catch (error) {
    console.error('Error sending WhatsApp OTP:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});