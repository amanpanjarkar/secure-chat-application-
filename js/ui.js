window.promptAddContact = function () {
    const inputField = document.getElementById('new-contact-username');
    if (inputField) inputField.value = "";
    const errorEl = document.getElementById('add-contact-error');
    if (errorEl) errorEl.style.display = "none";
    document.getElementById('add-contact-modal').style.display = "flex";
    setTimeout(() => {
        if (inputField) inputField.focus();
    }, 100);
};

window.closeAddContactModal = function () {
    document.getElementById('add-contact-modal').style.display = "none";
};

window.confirmAddContact = function () {
    const raw = document.getElementById('new-contact-username').value.trim();
    const errorEl = document.getElementById('add-contact-error');

    if (!raw) {
        errorEl.innerText = "Please enter a username.";
        errorEl.style.display = "block";
        return;
    }

    const h = cleanName(raw);

    if (h === myName) {
        errorEl.innerText = "You cannot message yourself.";
        errorEl.style.display = "block";
        return;
    }

    errorEl.style.display = "none";

    database.ref('users/' + h).once('value', s => {
        if (s.exists()) {
            database.ref(`users/${h}/requests/${myName}`).set({
                timestamp: getTS()
            });

            closeAddContactModal();
            alert(`Chat request sent to @${h}! You can chat once they accept.`);
        } else {
            errorEl.innerText = "User not found. Check the username.";
            errorEl.style.display = "block";
        }
    });
};

window.openFullImage = (url) => {
    document.getElementById("full-image").src = url;
    document.getElementById("image-modal").style.display = "flex";
};

window.toggleProfileMenu = () => {
    const m = document.getElementById("profile-menu");
    if (m) m.style.display = m.style.display === 'block' ? 'none' : 'block';
};

window.toggleMenu = () => {
    const m = document.getElementById("options-menu");
    if (m) m.style.display = m.style.display === 'block' ? 'none' : 'block';
};

window.toggleEmojiMenu = function () {
    const menu = document.getElementById('emoji-menu');
    if (menu) menu.style.display = menu.style.display === 'grid' ? 'none' : 'grid';
};

window.addEmoji = function (emoji) {
    const input = document.getElementById('message-input');
    if (input) {
        input.value += emoji;
        if (typeof handleTyping === 'function') handleTyping();
        document.getElementById('emoji-menu').style.display = 'none';
        input.focus();
    }
};

window.addEventListener('click', (e) => {
    const modal = document.getElementById('add-contact-modal');
    if (e.target === modal) modal.style.display = "none";

    const reqModal = document.getElementById('requests-modal');
    if (e.target === reqModal) reqModal.style.display = "none";

    const menu = document.getElementById('options-menu');
    if (menu && !e.target.matches('.three-dots') && !e.target.closest('#options-menu')) {
        menu.style.display = 'none';
    }
    
    const pMenu = document.getElementById('profile-menu');
    if (pMenu && !e.target.matches('.avatar') && !e.target.closest('#profile-menu')) {
        pMenu.style.display = 'none';
    }

    const chatMenu = document.getElementById('chat-options-menu');
    if (chatMenu && !e.target.matches('.three-dots') && !e.target.closest('#chat-options-menu')) {
        chatMenu.style.display = 'none';
    }

    const emojiMenu = document.getElementById('emoji-menu');
    if (emojiMenu && !e.target.closest('#emoji-menu') && e.target.id !== 'emoji-btn') {
        emojiMenu.style.display = 'none';
    }
});

window.initiateReply = function (key, data) {
    let previewText = "";
    if (data.type === 'image') previewText = '📷 Photo';
    else if (data.type === 'audio') previewText = '🎤 Voice message';
    else previewText = decodeMsg(data.text);

    currentReplyTo = {
        key: key,
        sender: data.sender,
        text: previewText
    };
    document.getElementById('reply-preview-sender').innerText = data.sender === myName ? 'You' : data.sender;
    document.getElementById('reply-preview-text').innerText = currentReplyTo.text;
    document.getElementById('reply-preview-container').style.display = 'block';
    document.getElementById('message-input').focus();
};

window.cancelReply = function () {
    currentReplyTo = null;
    const container = document.getElementById('reply-preview-container');
    if (container) container.style.display = 'none';
};

window.scrollToMessage = function (key) {
    const el = document.getElementById(`msg-${key}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-pulse');
        setTimeout(() => el.classList.remove('highlight-pulse'), 1500);
    }
};

window.toggleDarkMode = function () {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
};

window.handleTyping = function () {
    updateTypingStatus();
    const val = document.getElementById('message-input').value.trim();
    const sendBtn = document.getElementById('send-btn');
    const voiceBtn = document.getElementById('voice-btn');
    if (sendBtn && voiceBtn) {
        if (val) {
            sendBtn.style.display = 'block';
            voiceBtn.style.display = 'none';
        } else {
            sendBtn.style.display = 'none';
            voiceBtn.style.display = 'block';
        }
    }
};

window.filterContacts = function () {
    const term = document.getElementById('contact-search').value.toLowerCase();
    const items = document.querySelectorAll('.contact-item');
    items.forEach(item => {
        const name = item.querySelector('.contact-name').innerText.toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
    });
};

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

window.toggleVoiceRecord = async function () {
    const voiceBtn = document.getElementById('voice-btn');
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = [];

                voiceBtn.style.color = "";
                voiceBtn.innerText = "🎤";

                const snap = await database.ref(`users/${myName}/contacts/${activeRecipient}`).once('value');
                if (!snap.exists() || snap.val() !== true) {
                    showToast("You cannot send audio. You are no longer friends.", "error");
                    return;
                }

                const file = new File([audioBlob], "voice_note.webm", { type: 'audio/webm' });
                const url = await uploadToCloudinary(file, true);

                if (url && currentChatRef) {
                    const payload = {
                        sender: myName,
                        text: url,
                        type: 'audio',
                        time: getTS(),
                        status: 'sent'
                    };
                    if (currentReplyTo) {
                        payload.replyTo = currentReplyTo;
                    }
                    currentChatRef.push().set(payload);
                    playTikSound();
                    if (typeof cancelReply === 'function') cancelReply();
                }
            };

            audioChunks = [];
            mediaRecorder.start();
            isRecording = true;
            voiceBtn.style.color = "#f15c6d"; // Red color
            voiceBtn.innerText = "⏹"; // Stop icon
        } catch (err) {
            console.error("Microphone access denied:", err);
            alert("Microphone access is required to send voice notes.");
        }
    } else {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        isRecording = false;
    }
};

window.logoutUser = function () {
    auth.signOut().then(() => {
        localStorage.removeItem('secureChatUsername');
        localStorage.removeItem('secureChatUserEmail');
        location.reload();
    }).catch(() => {
        localStorage.clear();
        location.reload();
    });
};

window.openRequestsModal = function () {
    const modal = document.getElementById('requests-modal');
    if (modal) modal.style.display = "flex";
};

window.closeRequestsModal = function () {
    const modal = document.getElementById('requests-modal');
    if (modal) modal.style.display = "none";
};

window.acceptRequest = function (sender) {
    database.ref(`users/${myName}/contacts/${sender}`).set(true);
    database.ref(`users/${sender}/contacts/${myName}`).set(true);
    database.ref(`users/${myName}/requests/${sender}`).remove();
    alert(`System: Chat request from @${sender} accepted.`);
};

window.rejectRequest = function (sender) {
    database.ref(`users/${myName}/requests/${sender}`).remove();
};

window.toggleChatMenu = function () {
    const menu = document.getElementById('chat-options-menu');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

window.clearCurrentChat = function () {
    if (!activeRecipient || !currentChatRef) return;
    showConfirm(`Are you sure you want to completely clear your chat history with @${activeRecipient}? This cannot be undone.`, () => {
        const now = Date.now();
        database.ref(`users/${myName}/clearedChats/${activeRecipient}`).set(now).then(() => {
            document.getElementById('chat-box').innerHTML = "";
            toggleChatMenu();
            showToast("System: Chat cleared successfully.");
        }).catch(err => showToast("Failed to clear chat: " + err.message, 'error'));
    });
};

window.unfriendCurrentContact = function () {
    if (!activeRecipient) return;
    showConfirm(`Are you sure you want to unfriend @${activeRecipient}? You will no longer see them in your contacts list.`, () => {
        // Remove from both contacts lists
        database.ref(`users/${myName}/contacts/${activeRecipient}`).remove();
        database.ref(`users/${activeRecipient}/contacts/${myName}`).remove().then(() => {
            resetViewport();
            toggleChatMenu();
            showToast(`System: You have unfriended @${activeRecipient}.`);
        });
    });
};

window.toggleSensitiveChat = function() {
    isSensitiveChatEnabled = !isSensitiveChatEnabled;
    const btn = document.getElementById('sensitive-chat-toggle');
    if (btn) {
        btn.innerText = isSensitiveChatEnabled ? 'Disable Sensitive Chat' : 'Enable Sensitive Chat';
    }
    
    if (isSensitiveChatEnabled) {
        showToast("Sensitive Chat enabled. Screenshots will be reported.", "info");
    } else {
        document.body.classList.remove('blur-overlay');
        showToast("Sensitive Chat disabled.", "info");
    }
};

window.addEventListener('blur', () => {
    if (isSensitiveChatEnabled && activeRecipient) {
        document.body.classList.add('blur-overlay');
    }
});

window.addEventListener('focus', () => {
    document.body.classList.remove('blur-overlay');
});

// Screenshot detection
window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        reportScreenshot();
    }
});

window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's', 'S'].includes(e.key)) {
        reportScreenshot();
    }
});

function reportScreenshot() {
    if (!activeRecipient || !currentChatRef || !isSensitiveChatEnabled) return;
    
    showToast("⚠️ Screenshot detected! The other user has been notified.", "error");

    const payload = {
        sender: 'System',
        text: encodeMsg(`📸 @${myName} took a screenshot.`),
        type: 'system',
        time: getTS(),
        status: 'sent'
    };
    currentChatRef.push().set(payload);
}

// Drag and Drop support
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (activeRecipient) {
        const box = document.getElementById('chat-box');
        if (box) box.style.opacity = '0.7';
    }
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (activeRecipient) {
        const box = document.getElementById('chat-box');
        if (box) box.style.opacity = '1';
    }
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (activeRecipient) {
        const box = document.getElementById('chat-box');
        if (box) box.style.opacity = '1';
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            if (typeof sendFile === 'function') {
                sendFile(e.dataTransfer.files[0]);
            }
        }
    }
});

window.onload = () => {
    const savedName = localStorage.getItem('secureChatUsername');
    const savedEmail = localStorage.getItem('secureChatUserEmail');

    if (savedName && savedEmail) {
        myName = savedName;
        const authContainer = document.getElementById('auth-container');
        if (authContainer) authContainer.style.display = 'none';

        const chatApp = document.getElementById('chat-app');
        if (chatApp) chatApp.style.display = 'flex';

        if(typeof bootSystems === 'function') {
            bootSystems();
        }
    }
};
