const express = require('express');
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const cors = require('cors');
const admin = require('firebase-admin');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

// Firebase Admin SDK Configuration (OTP database ke liye)
const serviceAccount = require('./firebase-service-key.json'); 
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors());

let sock;

// WhatsApp Connection Setup using Local MultiFile Auth
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

// API Endpoint jo website se request lega aur WhatsApp par OTP bhejega
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length !== 10) {
    return res.status(400).json({ success: false, message: 'Invalid phone number' });
  }

  // 6-digit OTP Generation
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // 1. Save OTP in Firestore Database (otps collection)
    await db.collection('otps').doc(phone).set({
      otp: otp,
      createdAt: new Date()
    });

    // 2. Format Mobile Number (India +91 prefix)
    const jid = `91${phone}@s.whatsapp.net`;
    const message = `🎮 *Venom eSports*\n\nAapka login OTP code yeh hai: *${otp}*\nKripya ise kisi ke sath share na karein!`;

    // 3. Send Message via WhatsApp Bot
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