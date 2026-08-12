const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
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

// ============================================
// MONGODB CONNECTION
// ============================================
// Set MONGODB_URI in your environment variables (Render dashboard -> your
// service -> Environment). Get this connection string from MongoDB Atlas:
// https://cloud.mongodb.com -> Connect -> Drivers -> copy the URI, then
// swap in your actual username/password/database name.
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to your environment variables.');
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// ============================================
// SCHEMAS
// ============================================
const messageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    speaker: { type: String, required: true },
    date: { type: String, required: true },
    duration: { type: String, default: '00:00' },
    plays: { type: Number, default: 0 },
    audioUrl: { type: String, default: '' },
    audioFile: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    videoPlatform: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const prayerSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'new' }
});

const contactSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, default: '' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'new' }
});

const Message = mongoose.model('Message', messageSchema);
const Prayer = mongoose.model('Prayer', prayerSchema);
const Contact = mongoose.model('Contact', contactSchema);

// Strip Mongo's internal _id/__v so responses look identical to the old
// db.json-based API that the frontend already expects.
function clean(doc) {
    const obj = doc.toObject ? doc.toObject() : doc;
    const { _id, __v, ...rest } = obj;
    return rest;
}

app.use(cors());
app.use(express.json());
// SECURITY: block direct access to db.json before it ever reaches the
// static file handler below. Serving the whole project directory
// (as this app previously did) exposed prayer requests, contact
// messages, and emails to anyone who requested /db.json directly.
app.use((req, res, next) => {
    if (req.path === '/db.json') {
        return res.status(404).send('Not found');
    }
    next();
});
app.use(express.static(path.join(__dirname)));

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
// CLOUDINARY STORAGE CONFIG (unchanged)
// ============================================
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

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: -1 });
        res.json({ success: true, messages: messages.map(clean) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/messages/:id', async (req, res) => {
    try {
        const message = await Message.findOne({ id: req.params.id });
        if (!message) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }
        res.json({ success: true, message: clean(message) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/messages/:id/play', async (req, res) => {
    try {
        const message = await Message.findOneAndUpdate(
            { id: req.params.id },
            { $inc: { plays: 1 } },
            { new: true }
        );
        if (!message) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }
        res.json({ success: true, plays: message.plays });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/prayers', async (req, res) => {
    try {
        const { name, email, type, message } = req.body;

        if (!name || !email || !type || !message) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        const newPrayer = new Prayer({
            id: `prayer-${uuidv4().slice(0, 8)}`,
            name: String(name).trim(),
            email: String(email).trim(),
            type: String(type).trim(),
            message: String(message).trim()
        });

        await newPrayer.save();

        res.status(201).json({ success: true, prayer: clean(newPrayer) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/contacts', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and message are required'
            });
        }

        const newContact = new Contact({
            id: `contact-${uuidv4().slice(0, 8)}`,
            name: String(name).trim(),
            email: String(email).trim(),
            subject: subject ? String(subject).trim() : '',
            message: String(message).trim()
        });

        await newContact.save();

        res.status(201).json({ success: true, contact: clean(newContact) });
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
app.post('/api/messages', requireAdmin, uploadAudio, async (req, res) => {
    try {
        const { title, speaker, date, duration, videoUrl, videoPlatform } = req.body;

        if (!title || !speaker || !date) {
            return res.status(400).json({
                success: false,
                error: 'Title, speaker, and date are required'
            });
        }

        const audioUrl = req.file ? req.file.path : '';

        const newMessage = new Message({
            id: `msg-${uuidv4().slice(0, 8)}`,
            title: String(title).trim(),
            speaker: String(speaker).trim(),
            date,
            duration: duration || '00:00',
            plays: 0,
            audioUrl: audioUrl,
            audioFile: audioUrl,
            videoUrl: videoUrl || '',
            videoPlatform: videoPlatform || ''
        });

        await newMessage.save();

        res.status(201).json({ success: true, message: clean(newMessage) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/messages/:id', requireAdmin, async (req, res) => {
    try {
        const message = await Message.findOne({ id: req.params.id });

        if (!message) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        if (message.audioFile) {
            const publicId = message.audioFile.split('/').pop().split('.')[0];
            try {
                await cloudinary.uploader.destroy(`totalexp-sermons/${publicId}`, { resource_type: 'video' });
            } catch (cloudErr) {
                console.warn('Could not delete from Cloudinary:', cloudErr.message);
            }
        }

        await Message.deleteOne({ id: req.params.id });

        res.json({ success: true, message: 'Message deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/prayers', requireAdmin, async (req, res) => {
    try {
        const prayers = await Prayer.find().sort({ createdAt: -1 });
        res.json({ success: true, prayers: prayers.map(clean) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/contacts', requireAdmin, async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json({ success: true, contacts: contacts.map(clean) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const [totalMessages, totalPrayers, totalContacts, messages] = await Promise.all([
            Message.countDocuments(),
            Prayer.countDocuments(),
            Contact.countDocuments(),
            Message.find({}, 'plays')
        ]);

        const totalPlays = messages.reduce((sum, m) => sum + (m.plays || 0), 0);

        res.json({
            success: true,
            stats: {
                totalMessages,
                totalPrayers,
                totalContacts,
                totalPlays
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
    console.log(`Total Experience International server running on http://localhost:${PORT}`);
});