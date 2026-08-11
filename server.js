const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SECRET = process.env.ADMIN_SECRET || ADMIN_PASSWORD;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function readDB() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { messages: [], prayers: [], contacts: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function createToken() {
    const expires = Date.now() + TOKEN_TTL_MS;
    const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(String(expires)).digest('hex');
    return `${expires}.${sig}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') return false;
    const [expiresStr, sig] = token.split('.');
    if (!expiresStr || !sig) return false;
    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(expiresStr).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    return Date.now() <= Number(expiresStr);
}

function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!verifyToken(token)) {
        return res.status(401).json({ success: false, error: 'Unauthorized. Please log in again.' });
    }
    next();
}

// ============================================
// CLOUDINARY STORAGE CONFIG (FIXED)
// ============================================
// NOTE: resource_type changed from 'raw' to 'video' — Cloudinary handles
// audio files through the video pipeline, which gives correct content-type
// headers and proper range-request support for streaming/seeking in <audio>.
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'totalexp-sermons',
        resource_type: 'video',
        allowed_formats: ['mp3', 'wav', 'm4a']
    }
});

const ALLOWED_AUDIO_TYPES = [
    'audio/mpeg', 'audio/mp3',
    'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/mp4', 'audio/x-m4a', 'audio/m4a',
    'audio/ogg', 'audio/webm', 'audio/aac'
];

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files (MP3, WAV, M4A, OGG) are allowed'), false);
        }
    }
});

function uploadAudio(req, res, next) {
    upload.single('audio')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError || /Only audio files/.test(err.message)) {
                return res.status(400).json({ success: false, error: err.message });
            }
            return next(err);
        }
        next();
    });
}

// ============================================
// PUBLIC ROUTES
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/messages', (req, res) => {
    const db = readDB();
    res.json({ success: true, messages: db.messages });
});

app.get('/api/messages/:id', (req, res) => {
    const db = readDB();
    const message = db.messages.find(m => m.id === req.params.id);
    if (!message) {
        return res.status(404).json({ success: false, error: 'Message not found' });
    }
    res.json({ success: true, message });
});

app.post('/api/messages/:id/play', (req, res) => {
    const db = readDB();
    const message = db.messages.find(m => m.id === req.params.id);

    if (message) {
        message.plays = (message.plays || 0) + 1;
        writeDB(db);
        res.json({ success: true, plays: message.plays });
    } else {
        res.status(404).json({ success: false, error: 'Message not found' });
    }
});

app.post('/api/prayers', (req, res) => {
    try {
        const { name, email, type, message } = req.body;

        if (!name || !email || !type || !message) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        const db = readDB();
        const newPrayer = {
            id: `prayer-${uuidv4().slice(0, 8)}`,
            name: String(name).trim(),
            email: String(email).trim(),
            type: String(type).trim(),
            message: String(message).trim(),
            createdAt: new Date().toISOString(),
            status: 'new'
        };

        db.prayers.unshift(newPrayer);
        writeDB(db);

        res.status(201).json({ success: true, prayer: newPrayer });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/contacts', (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and message are required'
            });
        }

        const db = readDB();
        const newContact = {
            id: `contact-${uuidv4().slice(0, 8)}`,
            name: String(name).trim(),
            email: String(email).trim(),
            subject: subject ? String(subject).trim() : '',
            message: String(message).trim(),
            createdAt: new Date().toISOString(),
            status: 'new'
        };

        db.contacts.unshift(newContact);
        writeDB(db);

        res.status(201).json({ success: true, contact: newContact });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: createToken() });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

// ============================================
// ADMIN-ONLY ROUTES
// ============================================
app.post('/api/messages', requireAdmin, uploadAudio, (req, res) => {
    try {
        const { title, speaker, date, duration, videoUrl, videoPlatform } = req.body;

        if (!title || !speaker || !date) {
            return res.status(400).json({
                success: false,
                error: 'Title, speaker, and date are required'
            });
        }

        const db = readDB();
        const audioUrl = req.file ? req.file.path : '';

        const newMessage = {
            id: `msg-${uuidv4().slice(0, 8)}`,
            title: String(title).trim(),
            speaker: String(speaker).trim(),
            date,
            duration: duration || '00:00',
            plays: 0,
            // FIX: expose the Cloudinary URL as `audioUrl` (what the frontend
            // checks first). Previously only `audioFile` was set, so the
            // frontend fell through to its "/uploads/" + audioFile fallback
            // and mangled the full Cloudinary URL into a broken path.
            audioUrl: audioUrl,
            audioFile: audioUrl,
            videoUrl: videoUrl || '',
            videoPlatform: videoPlatform || '',
            createdAt: new Date().toISOString()
        };

        db.messages.unshift(newMessage);
        writeDB(db);

        res.status(201).json({ success: true, message: newMessage });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/messages/:id', requireAdmin, async (req, res) => {
    try {
        const db = readDB();
        const messageIndex = db.messages.findIndex(m => m.id === req.params.id);

        if (messageIndex === -1) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        const message = db.messages[messageIndex];

        if (message.audioFile) {
            const publicId = message.audioFile.split('/').pop().split('.')[0];
            try {
                await cloudinary.uploader.destroy(`totalexp-sermons/${publicId}`, { resource_type: 'video' });
            } catch (cloudErr) {
                console.warn('Could not delete from Cloudinary:', cloudErr.message);
            }
        }

        db.messages.splice(messageIndex, 1);
        writeDB(db);

        res.json({ success: true, message: 'Message deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/prayers', requireAdmin, (req, res) => {
    const db = readDB();
    res.json({ success: true, prayers: db.prayers });
});

app.get('/api/contacts', requireAdmin, (req, res) => {
    const db = readDB();
    res.json({ success: true, contacts: db.contacts });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const db = readDB();
    const totalPlays = db.messages.reduce((sum, m) => sum + (m.plays || 0), 0);

    res.json({
        success: true,
        stats: {
            totalMessages: db.messages.length,
            totalPrayers: db.prayers.length,
            totalContacts: db.contacts.length,
            totalPlays: totalPlays
        }
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
    console.log(`Total Experience International server running on http://localhost:${PORT}`);
    console.log(`Database: ${DB_PATH}`);
});