document.addEventListener("DOMContentLoaded", () => {
    
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

    // --- State Initialization ---
    loadChatHistory();
    updateStats();

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('rag_chat_history');
        // Keep the welcome message, remove others
        while (chatHistory.children.length > 1) {
            chatHistory.removeChild(chatHistory.lastChild);
        }
    });

    // --- Upload Logic ---
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
            showStatus('Please upload valid PDF or TXT files.', 'error');
            return;
        }

        uploadProgress.classList.remove('hidden');
        uploadStatus.className = 'status-msg'; // hide and reset
        fileInput.value = ''; // Reset input

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                showStatus(data.message, 'success');
                updateStats(); // Update stats dynamically so GUI displays the new array map
            } else {
                showStatus(data.detail || 'Upload failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showStatus('Network error during upload.', 'error');
        } finally {
            uploadProgress.classList.add('hidden');
        }
    }

    // --- Chat Logic ---
    function autoResizeTextarea() {
        questionInput.style.height = 'auto';
        questionInput.style.height = (questionInput.scrollHeight) + 'px';
    }
    questionInput.addEventListener('input', autoResizeTextarea);

    questionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    async function sendMessage() {
        const question = questionInput.value.trim();
        if (!question) return;

        // User message
        appendMessage('user', question);
        questionInput.value = '';
        questionInput.style.height = 'auto'; // Reset size

        // UI blocking
        sendBtn.disabled = true;
        chatTyping.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('question', question);

            const response = await fetch('/chat', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                appendMessage('system', data.answer);
            } else {
                appendMessage('system', 'Error: ' + (data.answer || 'Something went wrong.'));
            }
        } catch(err) {
            console.error(err);
            appendMessage('system', 'System error contacting the server.');
        } finally {
            sendBtn.disabled = false;
            chatTyping.classList.add('hidden');
            focusInput();
        }
    }

    function appendMessage(role, text, save=true) {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `message ${role}-msg`;

        // SVG Avatar Selection
        let avatarSvg = '';
        if (role === 'system') {
            avatarSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
        } else {
            avatarSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }

        msgWrapper.innerHTML = `
            <div class="avatar">${avatarSvg}</div>
            <div class="msg-bubble">${escapeHTML(text)}</div>
        `;
        
        chatHistory.appendChild(msgWrapper);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        if (save) {
            saveChatMessage(role, text);
        }
    }

    function saveChatMessage(role, text) {
        let history = JSON.parse(localStorage.getItem('rag_chat_history') || '[]');
        history.push({role, text});
        localStorage.setItem('rag_chat_history', JSON.stringify(history));
    }

    function loadChatHistory() {
        let history = JSON.parse(localStorage.getItem('rag_chat_history') || '[]');
        history.forEach(msg => appendMessage(msg.role, msg.text, false));
    }

    function escapeHTML(str) {
        let div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }

    // --- Util Methods ---
    function showStatus(text, type) {
        uploadStatus.textContent = text;
        uploadStatus.className = `status-msg ${type}`;
        setTimeout(() => {
            uploadStatus.classList.remove(type);
        }, 5000); // hide after 5s
    }

    async function updateStats() {
        try {
            const response = await fetch('/stats');
            const data = await response.json();
            updateStatsUI(data.files, data.chunks, data.file_list || []);
        } catch (e) {
            console.error("Could not fetch stats", e);
        }
    }

    function updateStatsUI(files, chunks, fileList) {
        if (files === 0) {
            statsText.textContent = "0 files / 0 chunks indexed";
            statsBadge.style.opacity = '0.5';
            fileCountBadge.textContent = '0';
            uploadedFilesList.innerHTML = '<li class="empty-list">No files indexed yet.</li>';
        } else {
            statsText.textContent = `${files} files / ${chunks} chunks indexed`;
            statsBadge.style.opacity = '1';
            fileCountBadge.textContent = files;

            uploadedFilesList.innerHTML = '';
            fileList.forEach(file => {
                const li = document.createElement('li');
                li.className = 'file-item';
                li.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> ${escapeHTML(file)}`;
                uploadedFilesList.appendChild(li);
            });
        }
    }

    function focusInput() {
        questionInput.focus();
    }
});
