const API_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', function() {

    // ============================================
    // DOM ELEMENTS
    // ============================================
    const header = document.getElementById('header');
    const mobileToggle = document.getElementById('mobileToggle');
    const nav = document.getElementById('nav');
    const navLinks = document.querySelectorAll('.nav-link');
    const scrollTopBtn = document.getElementById('scrollTop');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const audioGrid = document.getElementById('audioGrid');

    const audioModal = document.getElementById('audioModal');
    const closeAudioModal = document.getElementById('closeAudioModal');
    const audioPlayerTitle = document.getElementById('audioPlayerTitle');
    const audioPlayerSpeaker = document.getElementById('audioPlayerSpeaker');
    const audioDownloadBtn = document.getElementById('audioDownloadBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressFill = document.getElementById('progressFill');
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.querySelector('.current-time');
    const totalTimeEl = document.querySelector('.total-time');
    const audioWave = document.getElementById('audioWave');

    const contactForm = document.getElementById('contactForm');
    const prayerForm = document.getElementById('prayerForm');
    const newsletterForm = document.getElementById('newsletterForm');

    let isPlaying = false;
    let currentAudio = new Audio();

    // ============================================
    // LOAD MESSAGES
    // ============================================
    async function loadMessages() {
        try {
            const res = await fetch(`${API_URL}/api/messages`);
            const data = await res.json();

            if (data.success && data.messages.length > 0) {
                renderMessages(data.messages);
            } else {
                audioGrid.innerHTML = `
                    <div class="loading-messages">
                        <i class="fas fa-music" style="font-size:2rem;color:#fbbf24;margin-bottom:16px;display:block"></i>
                        <p>No messages uploaded yet.</p>
                        <p style="font-size:0.85rem;margin-top:8px">Visit the admin dashboard to upload sermons.</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error('Failed to load messages:', err);
            audioGrid.innerHTML = `
                <div class="loading-messages">
                    <i class="fas fa-wifi" style="font-size:2rem;color:#94a3b8;margin-bottom:16px;display:block"></i>
                    <p>Unable to connect to server.</p>
                    <p style="font-size:0.85rem;margin-top:8px">Make sure the backend is running.</p>
                </div>
            `;
        }
    }

    function getAudioSrc(msg) {
        if (msg.audioUrl) return msg.audioUrl;
        if (msg.audioFile) {
            // If audioFile is already a full URL (e.g. Cloudinary), use it
            // as-is. Only prepend '/uploads/' for legacy local filenames
            // that are NOT already absolute URLs.
            if (/^https?:\/\//i.test(msg.audioFile)) return msg.audioFile;
            return '/uploads/' + msg.audioFile;
        }
        return '';
    }

    // Browsers ignore the <a download> attribute for cross-origin URLs
    // (like Cloudinary) unless the server sends a Content-Disposition:
    // attachment header. Cloudinary supports forcing that via the
    // 'fl_attachment' flag inserted into the URL after '/upload/'.
    function getDownloadSrc(src) {
        if (!src) return src;
        if (src.includes('res.cloudinary.com') && src.includes('/upload/') && !src.includes('fl_attachment')) {
            return src.replace('/upload/', '/upload/fl_attachment/');
        }
        return src;
    }

    function renderMessages(messages) {
        audioGrid.innerHTML = messages.map(msg => {
            const audioSrc = getAudioSrc(msg);
            const dateStr = formatDate(msg.date);
            const plays = (msg.plays || 0).toLocaleString();

            let actionsHtml = '';
            if (audioSrc) {
                actionsHtml += `<a href="${getDownloadSrc(audioSrc)}" download class="download-btn" title="Download"><i class="fas fa-download"></i></a>`;
            }
            if (msg.videoUrl) {
                const isFacebook = msg.videoPlatform === 'facebook' || msg.videoUrl.includes('facebook');
                const platformClass = isFacebook ? 'facebook' : '';
                actionsHtml += `<a href="${escapeHtml(msg.videoUrl)}" target="_blank" class="video-link ${platformClass}" title="Watch Video" rel="noopener"><i class="fas fa-external-link-alt"></i></a>`;
            }

            return `
                <div class="message-row audio-card" data-type="audio" data-id="${msg.id}">
                    <div class="message-play">
                        <button class="play-btn" data-src="${audioSrc}" data-id="${msg.id}" data-title="${escapeHtml(msg.title)}" data-speaker="${escapeHtml(msg.speaker)}">
                            <i class="fas fa-play"></i>
                        </button>
                    </div>
                    <div class="message-details">
                        <h3 class="message-title">${escapeHtml(msg.title)}</h3>
                        <p class="message-speaker"><i class="fas fa-user"></i> ${escapeHtml(msg.speaker)}</p>
                    </div>
                    <div class="message-stats">
                        <span><i class="far fa-calendar"></i> ${dateStr}</span>
                        <span><i class="far fa-clock"></i> ${msg.duration || '00:00'}</span>
                        <span><i class="fas fa-headphones"></i> ${plays}</span>
                    </div>
                    <div class="message-actions">
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');

        attachPlayListeners();
    }

    function getVideoLinkHtml(url, platform) {
        const isYouTube = platform === 'youtube' || url.includes('youtube') || url.includes('youtu.be');
        const isFacebook = platform === 'facebook' || url.includes('facebook');
        const iconClass = isYouTube ? 'fab fa-youtube' : (isFacebook ? 'fab fa-facebook' : 'fas fa-video');
        const linkText = isYouTube ? 'Watch on YouTube' : (isFacebook ? 'Watch on Facebook' : 'Watch Video');
        const platformClass = isYouTube ? '' : (isFacebook ? 'facebook' : '');

        return `<a href="${escapeHtml(url)}" target="_blank" class="video-link ${platformClass}" rel="noopener">
            <i class="${iconClass}"></i> ${linkText}
        </a>`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    loadMessages();

    // ============================================
    // STICKY HEADER & SCROLL EFFECTS
    // ============================================
    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 30) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        if (currentScroll > 500) {
            scrollTopBtn.classList.add('visible');
        } else {
            scrollTopBtn.classList.remove('visible');
        }
    });

    // ============================================
    // MOBILE MENU
    // ============================================
    mobileToggle.addEventListener('click', function() {
        this.classList.toggle('active');
        nav.classList.toggle('active');
        header.classList.toggle('menu-open');
        document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            mobileToggle.classList.remove('active');
            nav.classList.remove('active');
            header.classList.remove('menu-open');
            document.body.style.overflow = '';
        });
    });

    // ============================================
    // SMOOTH SCROLLING
    // ============================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerHeight = header.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });

    // ============================================
    // ACTIVE NAV LINK ON SCROLL
    // ============================================
    const sections = document.querySelectorAll('section[id]');

    function updateActiveNav() {
        const scrollPos = window.pageYOffset + header.offsetHeight + 100;
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + sectionId) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', updateActiveNav);

    // ============================================
    // SCROLL TO TOP
    // ============================================
    scrollTopBtn.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ============================================
    // TOAST NOTIFICATION
    // ============================================
    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        const icon = toast.querySelector('i');
        icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // ============================================
    // AUDIO PLAYER
    // ============================================
    function attachPlayListeners() {
        document.querySelectorAll('.audio-card .play-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const title = this.dataset.title;
                const speaker = this.dataset.speaker;
                const audioSrc = this.dataset.src;
                const msgId = this.dataset.id;

                if (!audioSrc) {
                    showToast('No audio file available', 'error');
                    return;
                }

                audioPlayerTitle.textContent = title;
                audioPlayerSpeaker.textContent = speaker;
                audioDownloadBtn.href = getDownloadSrc(audioSrc);
                audioDownloadBtn.download = title + '.mp3';

                audioModal.classList.add('active');
                document.body.style.overflow = 'hidden';

                currentAudio.src = audioSrc;
                currentAudio.play().catch(err => {
                    console.error('Audio play failed:', err);
                    showToast('Could not play audio', 'error');
                });
                isPlaying = true;
                updatePlayPauseIcon();
                audioWave.classList.add('playing');

                if (msgId) {
                    fetch(`${API_URL}/api/messages/${msgId}/play`, { method: 'POST' })
                        .catch(err => console.error('Failed to increment plays:', err));
                }
            });
        });
    }

    currentAudio.addEventListener('timeupdate', () => {
        if (currentAudio.duration) {
            const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
            progressFill.style.width = progress + '%';
            currentTimeEl.textContent = formatTime(currentAudio.currentTime);
        }
    });

    currentAudio.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(currentAudio.duration);
    });

    currentAudio.addEventListener('ended', () => {
        isPlaying = false;
        updatePlayPauseIcon();
        audioWave.classList.remove('playing');
    });

    currentAudio.addEventListener('error', () => {
        showToast('Error loading audio file', 'error');
        isPlaying = false;
        updatePlayPauseIcon();
        audioWave.classList.remove('playing');
    });

    closeAudioModal.addEventListener('click', closeAudioPlayer);
    audioModal.addEventListener('click', function(e) {
        if (e.target === audioModal) closeAudioPlayer();
    });

    function closeAudioPlayer() {
        audioModal.classList.remove('active');
        document.body.style.overflow = '';
        currentAudio.pause();
        currentAudio.src = '';
        isPlaying = false;
        updatePlayPauseIcon();
        audioWave.classList.remove('playing');
        progressFill.style.width = '0%';
        currentTimeEl.textContent = '0:00';
        totalTimeEl.textContent = '0:00';
        
    }

    playPauseBtn.addEventListener('click', function() {
        if (currentAudio.paused) {
            currentAudio.play();
            isPlaying = true;
            audioWave.classList.add('playing');
        } else {
            currentAudio.pause();
            isPlaying = false;
            audioWave.classList.remove('playing');
        }
        updatePlayPauseIcon();
    });

    function updatePlayPauseIcon() {
        playPauseBtn.innerHTML = isPlaying
            ? '<i class="fas fa-pause"></i>'
            : '<i class="fas fa-play"></i>';
    }

    progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        if (currentAudio.duration) {
            currentAudio.currentTime = pos * currentAudio.duration;
        }
    });

    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    document.getElementById('prevBtn').addEventListener('click', () => showToast('Previous message', 'info'));
    document.getElementById('nextBtn').addEventListener('click', () => showToast('Next message', 'info'));

    // ============================================
    // CONTACT FORM
    // ============================================
    window.submitContactForm = async function() {
        const submitBtn = contactForm.querySelector('button[onclick="submitContactForm()"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        submitBtn.disabled = true;

        const data = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            subject: document.getElementById('subject').value,
            message: document.getElementById('message').value
        };

        try {
            const res = await fetch(`${API_URL}/api/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();

            if (result.success) {
                showToast(`Thank you, ${data.name}! Your message has been received.`, 'success');
                contactForm.reset();
            } else {
                showToast(result.error || 'Failed to send message', 'error');
            }
        } catch (err) {
            const mailtoSubject = encodeURIComponent(data.subject || 'Message from Website');
            const mailtoBody = encodeURIComponent(`Name: ${data.name}\nEmail: ${data.email}\n\nMessage:\n${data.message}`);
            window.location.href = `mailto:totalexperienceintl@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`;
            showToast(`Thank you, ${data.name}! Your email client has opened.`, 'success');
            contactForm.reset();
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    };

    // ============================================
    // PRAYER FORM
    // ============================================
    window.submitPrayerForm = async function() {
        const submitBtn = prayerForm.querySelector('button[onclick="submitPrayerForm()"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        submitBtn.disabled = true;

        const data = {
            name: document.getElementById('prayerName').value,
            email: document.getElementById('prayerEmail').value,
            type: document.getElementById('prayerType').value,
            message: document.getElementById('prayerMessage').value
        };

        try {
            const res = await fetch(`${API_URL}/api/prayers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();

            if (result.success) {
                showToast(`Thank you, ${data.name}! Your ${data.type.toLowerCase()} has been received.`, 'success');
                prayerForm.reset();
            } else {
                showToast(result.error || 'Failed to send', 'error');
            }
        } catch (err) {
            const mailtoSubject = encodeURIComponent(`${data.type} from ${data.name}`);
            const mailtoBody = encodeURIComponent(`Name: ${data.name}\nEmail: ${data.email}\nType: ${data.type}\n\nMessage:\n${data.message}`);
            window.location.href = `mailto:totalexp@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`;
            showToast(`Thank you, ${data.name}! Your email client has opened.`, 'success');
            prayerForm.reset();
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    };

    // ============================================
    // SCROLL REVEAL
    // ============================================
    const revealElements = document.querySelectorAll('.about-grid, .message-card, .contact-card, .value-card, .section-header, .prayer-card');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach((el, index) => {
        el.classList.add('reveal');
        el.style.transitionDelay = `${index * 0.1}s`;
        revealObserver.observe(el);
    });

    // ============================================
    // KEYBOARD NAVIGATION
    // ============================================
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAudioPlayer();
            if (nav.classList.contains('active')) {
                mobileToggle.classList.remove('active');
                nav.classList.remove('active');
                header.classList.remove('menu-open');
                document.body.style.overflow = '';
            }
        }
    });

    // ============================================
    // LOGO FALLBACK
    // ============================================
    const logoImg = document.getElementById('logoImg');
    logoImg.addEventListener('error', function() {
        this.style.display = 'none';
    });

    // ============================================
    // PARALLAX HERO
    // ============================================
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const heroContent = document.querySelector('.hero-content');
        if (heroContent && scrolled < window.innerHeight) {
            heroContent.style.transform = `translateY(${scrolled * 0.3}px)`;
            heroContent.style.opacity = 1 - (scrolled / window.innerHeight);
        }
    });

    console.log('%c Total Experience International ', 'background: #1e293b; color: #fbbf24; font-size: 18px; font-weight: bold; padding: 8px 16px; border-radius: 8px;');
    console.log('%c Frontend loaded. API: ' + API_URL, 'color: #1e293b; font-size: 12px;');
});