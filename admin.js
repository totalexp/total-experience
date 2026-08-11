const API_URL = window.location.origin;

const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.content-section');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

let adminToken = sessionStorage.getItem('adminToken') || '';

if (adminToken) {
    showDashboard();
}

// ============================================
// HELPERS
// ============================================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function authHeaders(extra = {}) {
    return { ...extra, 'Authorization': `Bearer ${adminToken}` };
}

// Wraps fetch for admin-only endpoints: attaches the token and logs out
// automatically if the server says the session is invalid/expired.
async function adminFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: authHeaders(options.headers || {})
    });
    if (res.status === 401) {
        showToast('Session expired. Please log in again.', 'error');
        sessionStorage.removeItem('adminToken');
        setTimeout(() => location.reload(), 1200);
        throw new Error('Unauthorized');
    }
    return res;
}

// ============================================
// LOGIN / LOGOUT
// ============================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;

    try {
        const res = await fetch(`${API_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (data.success) {
            adminToken = data.token;
            sessionStorage.setItem('adminToken', adminToken);
            showDashboard();
            showToast('Welcome, Admin!');
        } else {
            showToast('Invalid password', 'error');
        }
    } catch (err) {
        showToast('Server error. Is the backend running?', 'error');
    }
});

logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('adminToken');
    location.reload();
});

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'flex';
    loadOverview();
}

// ============================================
// NAVIGATION
// ============================================
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;

        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(section + 'Section').classList.add('active');

        document.getElementById('pageTitle').textContent =
            section.charAt(0).toUpperCase() + section.slice(1);

        if (section === 'messages') loadMessages();
        if (section === 'prayers') loadPrayers();
        if (section === 'contacts') loadContacts();
        if (section === 'overview') loadOverview();
    });
});

// ============================================
// TOAST
// ============================================
function showToast(msg, type = 'success') {
    toastMessage.textContent = msg;
    const icon = toast.querySelector('i');
    icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// OVERVIEW
// ============================================
async function loadOverview() {
    try {
        const res = await adminFetch(`${API_URL}/api/admin/stats`);
        const data = await res.json();

        if (data.success) {
            document.getElementById('statMessages').textContent = data.stats.totalMessages;
            document.getElementById('statPlays').textContent = data.stats.totalPlays.toLocaleString();
            document.getElementById('statPrayers').textContent = data.stats.totalPrayers;
            document.getElementById('statContacts').textContent = data.stats.totalContacts;
        }

        const msgRes = await fetch(`${API_URL}/api/messages`);
        const msgData = await msgRes.json();

        const tbody = document.getElementById('recentMessagesTable');
        tbody.innerHTML = msgData.messages.slice(0, 5).map(m => `
            <tr>
                <td><strong>${escapeHtml(m.title)}</strong></td>
                <td>${escapeHtml(m.speaker)}</td>
                <td>${formatDate(m.date)}</td>
                <td>${m.plays || 0}</td>
                <td>${m.videoUrl ? '<span style="color:#38a169"><i class="fas fa-check"></i> Yes</span>' : '<span style="color:#a0aec0">No</span>'}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Error loading overview:', err);
    }
}

// ============================================
// MESSAGES
// ============================================
async function loadMessages() {
    try {
        const res = await fetch(`${API_URL}/api/messages`);
        const data = await res.json();

        const tbody = document.getElementById('allMessagesTable');
        tbody.innerHTML = data.messages.map(m => `
            <tr>
                <td><strong>${escapeHtml(m.title)}</strong></td>
                <td>${escapeHtml(m.speaker)}</td>
                <td>${formatDate(m.date)}</td>
                <td>${escapeHtml(m.duration) || '-'}</td>
                <td>${m.plays || 0}</td>
                <td>${getVideoBadge(m)}</td>
                <td>
                    <button class="btn btn-danger" onclick="deleteMessage('${m.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        showToast('Failed to load messages', 'error');
    }
}

function getVideoBadge(m) {
    if (!m.videoUrl) return '<span class="video-badge none">None</span>';
    const platform = m.videoPlatform || 'video';
    return `<span class="video-badge ${escapeHtml(platform)}"><i class="fab fa-${escapeHtml(platform)}"></i> ${escapeHtml(platform)}</span>`;
}

window.deleteMessage = async function(id) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
        const res = await adminFetch(`${API_URL}/api/messages/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            showToast('Message deleted');
            loadMessages();
            loadOverview();
        }
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
};

// ============================================
// PRAYERS
// ============================================
async function loadPrayers() {
    try {
        const res = await adminFetch(`${API_URL}/api/prayers`);
        const data = await res.json();

        const tbody = document.getElementById('prayersTable');
        if (data.prayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;padding:40px">No prayer requests yet</td></tr>';
            return;
        }

        tbody.innerHTML = data.prayers.map(p => `
            <tr>
                <td>${escapeHtml(p.name)}</td>
                <td><a href="mailto:${encodeURIComponent(p.email)}">${escapeHtml(p.email)}</a></td>
                <td><span class="video-badge" style="background:#805ad5">${escapeHtml(p.type)}</span></td>
                <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.message)}</td>
                <td>${formatDate(p.createdAt)}</td>
            </tr>
        `).join('');

    } catch (err) {
        showToast('Failed to load prayers', 'error');
    }
}

// ============================================
// CONTACTS
// ============================================
async function loadContacts() {
    try {
        const res = await adminFetch(`${API_URL}/api/contacts`);
        const data = await res.json();

        const tbody = document.getElementById('contactsTable');
        if (data.contacts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;padding:40px">No contact submissions yet</td></tr>';
            return;
        }

        tbody.innerHTML = data.contacts.map(c => `
            <tr>
                <td>${escapeHtml(c.name)}</td>
                <td><a href="mailto:${encodeURIComponent(c.email)}">${escapeHtml(c.email)}</a></td>
                <td>${escapeHtml(c.subject) || '-'}</td>
                <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.message)}</td>
                <td>${formatDate(c.createdAt)}</td>
            </tr>
        `).join('');

    } catch (err) {
        showToast('Failed to load contacts', 'error');
    }
}

// ============================================
// UPLOAD
// ============================================
const uploadForm = document.getElementById('uploadForm');
const fileUploadBox = document.getElementById('fileUploadBox');
const uploadAudioFile = document.getElementById('uploadAudioFile');
const fileNameDisplay = document.getElementById('fileNameDisplay');

fileUploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadBox.classList.add('dragover');
});

fileUploadBox.addEventListener('dragleave', () => {
    fileUploadBox.classList.remove('dragover');
});

fileUploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadBox.classList.remove('dragover');
    uploadAudioFile.files = e.dataTransfer.files;
    updateFileName();
});

uploadAudioFile.addEventListener('change', updateFileName);

function updateFileName() {
    const file = uploadAudioFile.files[0];
    if (file) {
        fileNameDisplay.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
    }
}

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('audio', uploadAudioFile.files[0]);
    formData.append('title', document.getElementById('uploadTitle').value);
    formData.append('speaker', document.getElementById('uploadSpeaker').value);
    formData.append('date', document.getElementById('uploadDate').value);
    formData.append('duration', document.getElementById('uploadDuration').value);

    const videoUrl = document.getElementById('uploadVideoUrl').value;
    formData.append('videoUrl', videoUrl);

    let platform = '';
    if (videoUrl.includes('youtube') || videoUrl.includes('youtu.be')) platform = 'youtube';
    else if (videoUrl.includes('facebook')) platform = 'facebook';
    formData.append('videoPlatform', platform);

    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    submitBtn.disabled = true;

    try {
        const res = await adminFetch(`${API_URL}/api/messages`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (data.success) {
            showToast('Message uploaded successfully!');
            uploadForm.reset();
            fileNameDisplay.textContent = '';
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (err) {
        showToast('Upload failed. Is the server running?', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

// ============================================
// REFRESH BUTTONS
// ============================================
document.getElementById('refreshMessages').addEventListener('click', loadMessages);
document.getElementById('refreshPrayers').addEventListener('click', loadPrayers);
document.getElementById('refreshContacts').addEventListener('click', loadContacts);

// ============================================
// FORMATTING HELPERS
// ============================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}