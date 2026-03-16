document.addEventListener("DOMContentLoaded", () => {
    
    // --- Auth Elements ---
    const authOverlay = document.getElementById('authOverlay');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const verifyForm = document.getElementById('verifyForm');
    
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    
    const loginStatus = document.getElementById('loginStatus');
    const signupStatus = document.getElementById('signupStatus');
    const verifyStatus = document.getElementById('verifyStatus');
    
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    
    const logoutBtn = document.getElementById('logoutBtn');

    // --- Buttons for loading states ---
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const signupSubmitBtn = document.getElementById('signupSubmitBtn');
    const verifySubmitBtn = document.getElementById('verifySubmitBtn');

    // --- UI Elements ---
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadProgress = document.getElementById('uploadProgress');
    const statsText = document.getElementById('statsText');
    const statsBadge = document.getElementById('statsBadge');

    const uploadedFilesList = document.getElementById('uploadedFilesList');
    const fileCountBadge = document.getElementById('fileCountBadge');
    
    const chatHistory = document.getElementById('chatHistory');
    const questionInput = document.getElementById('questionInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatTyping = document.getElementById('chatTyping');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // --- State & Auth Logic ---
    let authToken = localStorage.getItem('rag_token');
    let verifyEmail = ""; 

    checkAuth();

    function checkAuth() {
        if (!authToken) {
            authOverlay.classList.remove('hidden');
        } else {
            authOverlay.classList.add('hidden');
            loadChatHistory();
            updateStats();
        }
    }

    function saveToken(token) {
        authToken = token;
        localStorage.setItem('rag_token', token);
        checkAuth();
    }

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('rag_token');
        authToken = null;
        checkAuth();
    });

    // --- Auth View Swapping ---
    showSignup.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        authSubtitle.textContent = "Start your journey today";
    });

    showLogin.addEventListener('click', () => {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authSubtitle.textContent = "Login to your workspace";
    });

    async function safeFetch(url, options) {
        try {
            const response = await fetch(url, options);
            let data;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = { detail: text || "Server returned a non-JSON response." };
            }
            return { ok: response.ok, status: response.status, data };
        } catch (err) {
            console.error("Fetch error:", err);
            return { ok: false, status: 0, data: { detail: "Connection failed. Check your internet or server status." } };
        }
    }

    // --- Signup ---
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        
        signupStatus.textContent = "Sending security code...";
        signupStatus.className = "auth-status success";
        signupSubmitBtn.classList.add('loading');

        const { ok, status, data } = await safeFetch('/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        signupSubmitBtn.classList.remove('loading');

        if (ok) {
            verifyEmail = email;
            signupForm.classList.add('hidden');
            verifyForm.classList.remove('hidden');
            authSubtitle.textContent = `Verify your email: ${email}`;
            verifyStatus.textContent = "Check your inbox for the OTP.";
            verifyStatus.className = "auth-status success";
        } else {
            // Show the actual detail from the server if available
            signupStatus.textContent = data.detail || "Signup failed. Please try again later.";
            signupStatus.className = "auth-status error";
        }
    });

    // --- Verification ---
    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = document.getElementById('verifyOtp').value;
        
        verifyStatus.textContent = "Securing account...";
        verifyStatus.className = "auth-status success";
        verifySubmitBtn.classList.add('loading');

        const { ok, data } = await safeFetch('/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: verifyEmail, otp })
        });
        
        verifySubmitBtn.classList.remove('loading');

        if (ok) {
            verifyStatus.textContent = "Verified! Redirecting to login...";
            verifyStatus.className = "auth-status success";
            setTimeout(() => {
                verifyForm.classList.add('hidden');
                loginForm.classList.remove('hidden');
                authSubtitle.textContent = "Account active. Please login.";
            }, 1500);
        } else {
            verifyStatus.textContent = data.detail || "Invalid code. Try again.";
            verifyStatus.className = "auth-status error";
        }
    });

    // --- Login ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        loginStatus.textContent = "Authorizing...";
        loginStatus.className = "auth-status success";
        loginSubmitBtn.classList.add('loading');

        const { ok, status, data } = await safeFetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        loginSubmitBtn.classList.remove('loading');

        if (ok) {
            saveToken(data.access_token);
        } else {
            loginStatus.textContent = status === 403 ? "Please verify your email first." : (data.detail || "Access denied.");
            loginStatus.className = "auth-status error";
        }
    });

    // --- App Logic ---

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('rag_chat_history');
        while (chatHistory.children.length > 1) {
            chatHistory.removeChild(chatHistory.lastChild);
        }
    });

    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFilesAndUpload(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFilesAndUpload(fileInput.files);
        }
    });

    async function handleFilesAndUpload(files) {
        const formData = new FormData();
        let validFiles = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.txt')) {
                formData.append('files', file);
                validFiles++;
            }
        }

        if (validFiles === 0) {
            showStatus('PDF or TXT required.', 'error');
            return;
        }

        uploadProgress.classList.remove('hidden');
        uploadStatus.className = 'status-msg';
        fileInput.value = '';

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                showStatus(data.message, 'success');
                updateStats();
            } else if (response.status === 401) {
                logoutBtn.click();
            } else {
                showStatus(data.detail || 'Upload failed.', 'error');
            }
        } catch (err) {
            showStatus('Network error.', 'error');
        } finally {
            uploadProgress.classList.add('hidden');
        }
    }

    function autoResizeTextarea() {
        questionInput.style.height = 'auto';
        questionInput.style.height = (questionInput.scrollHeight) + 'px';
    }
    questionInput.addEventListener('input', autoResizeTextarea);

    questionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 600) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    async function sendMessage() {
        const question = questionInput.value.trim();
        if (!question) return;

        appendMessage('user', question);
        questionInput.value = '';
        questionInput.style.height = 'auto';

        sendBtn.disabled = true;
        chatTyping.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('question', question);

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                appendMessage('system', data.answer);
            } else if (response.status === 401) {
                logoutBtn.click();
            } else {
                appendMessage('system', 'Error: ' + (data.answer || 'Slow response.'));
            }
        } catch(err) {
            appendMessage('system', 'System error.');
        } finally {
            sendBtn.disabled = false;
            chatTyping.classList.add('hidden');
            focusInput();
        }
    }

    function appendMessage(role, text, save=true) {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `message ${role}-msg`;

        let avatarSvg = role === 'system' ? 
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>` :
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

        msgWrapper.innerHTML = `
            <div class="avatar">${avatarSvg}</div>
            <div class="msg-bubble">
                ${escapeHTML(text)}
                <div class="msg-actions">
                    <button class="msg-copy-btn" title="Copy message">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                </div>
            </div>
        `;
        
        chatHistory.appendChild(msgWrapper);
        
        // Use requestAnimationFrame for smoother scrolling after DOM update
        requestAnimationFrame(() => {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        });
        
        // Double-check scroll after a tiny delay for mobile rendering
        setTimeout(() => {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }, 50);

        // Message-level copy logic
        const copyBtn = msgWrapper.querySelector('.msg-copy-btn');
        copyBtn.addEventListener('click', () => {
            const copyToClipboard = (str) => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    return navigator.clipboard.writeText(str);
                }
                // Fallback for older browsers/mobile
                const el = document.createElement('textarea');
                el.value = str;
                el.setAttribute('readonly', '');
                el.style.position = 'absolute';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                return Promise.resolve();
            };

            copyToClipboard(text).then(() => {
                copyBtn.classList.add('copied');
                const originalIcon = copyBtn.innerHTML;
                copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                
                // Optional: Toast notification or status
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = originalIcon;
                }, 2000);
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });

        if (save) {
            let history = JSON.parse(localStorage.getItem('rag_chat_history') || '[]');
            history.push({role, text});
            localStorage.setItem('rag_chat_history', JSON.stringify(history));
        }
    }

    const shareChatBtn = document.getElementById('shareChatBtn');
    shareChatBtn.addEventListener('click', () => {
        let history = JSON.parse(localStorage.getItem('rag_chat_history') || '[]');
        if (history.length === 0) {
            alert("No conversation to share yet.");
            return;
        }

        let fullText = history.map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n\n');
        navigator.clipboard.writeText(fullText).then(() => {
            alert("Full chat transcript copied to clipboard!");
        });
    });

    function loadChatHistory() {
        chatHistory.innerHTML = `
            <div class="message system-msg">
                <div class="avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                </div>
                <div class="msg-bubble">Welcome. Upload your files and ask away.</div>
            </div>
        `;
        let history = JSON.parse(localStorage.getItem('rag_chat_history') || '[]');
        history.forEach(msg => appendMessage(msg.role, msg.text, false));
    }

    function escapeHTML(str) {
        let div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }

    function showStatus(text, type) {
        uploadStatus.textContent = text;
        uploadStatus.className = `status-msg ${type}`;
        setTimeout(() => { uploadStatus.classList.remove(type); }, 5000);
    }

    async function updateStats() {
        if (!authToken) return;
        try {
            const response = await fetch('/stats', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.status === 401) { logoutBtn.click(); return; }
            const data = await response.json();
            updateStatsUI(data.files, data.chunks, data.file_list || []);
        } catch (e) { console.error("Could not fetch stats", e); }
    }

    function updateStatsUI(files, chunks, fileList) {
        if (files === 0) {
            statsText.textContent = "0 files / 0 chunks";
            statsBadge.style.opacity = '0.5';
            fileCountBadge.textContent = '0';
            uploadedFilesList.innerHTML = '<li class="empty-list">No files indexed.</li>';
        } else {
            statsText.textContent = `${files} files / ${chunks} chunks`;
            statsBadge.style.opacity = '1';
            fileCountBadge.textContent = files;

            uploadedFilesList.innerHTML = '';
            fileList.forEach(file => {
                const li = document.createElement('li');
                li.className = 'file-item';
                li.innerHTML = `
                    <div class="file-info">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> 
                        <span>${escapeHTML(file)}</span>
                    </div>
                    <button class="file-delete-btn" data-filename="${escapeHTML(file)}" title="Delete file">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                `;
                
                const deleteBtn = li.querySelector('.file-delete-btn');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteFile(file);
                });
                
                uploadedFilesList.appendChild(li);
            });
        }
    }

    async function deleteFile(filename) {
        if (!confirm(`Remove "${filename}" from your knowledge base?`)) return;
        
        try {
            const response = await fetch(`/delete/${encodeURIComponent(filename)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                updateStats();
            } else {
                alert("Could not delete file.");
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    }

    // --- Theme Logic ---
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('rag_theme') || 'dark';
    if (savedTheme === 'bright') {
        document.body.classList.add('bright-mode');
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('bright-mode');
        const currentTheme = document.body.classList.contains('bright-mode') ? 'bright' : 'dark';
        localStorage.setItem('rag_theme', currentTheme);
    });

    // --- Mobile Nav Logic ---
    const mobileNavItems = document.querySelectorAll('.mobile-bottom-nav .nav-item');
    const uploadSidebar = document.querySelector('.upload-sidebar');
    const chatSection = document.querySelector('.chat-section');

    function switchView(target) {
        if (window.innerWidth > 600) return; // Only for mobile

        if (target === 'chat') {
            chatSection.classList.remove('view-hidden');
            uploadSidebar.classList.add('view-hidden');
        } else {
            chatSection.classList.add('view-hidden');
            uploadSidebar.classList.remove('view-hidden');
        }

        mobileNavItems.forEach(item => {
            item.classList.toggle('active', item.dataset.target === target);
        });
    }

    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.dataset.target);
        });
    });

    // Initialize mobile view
    if (window.innerWidth <= 600) {
        switchView('chat');
    }

    function focusInput() { questionInput.focus(); }
});
