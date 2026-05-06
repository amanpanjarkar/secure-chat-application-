
const firebaseConfig = {
    apiKey: "AIzaSyCVzy4vBaVosB2cWP3bSjFl4QeqjaLSIKg",
    authDomain: "chat-ce4e3.firebaseapp.com",
    databaseURL: "https://chat-ce4e3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chat-ce4e3",
    storageBucket: "chat-ce4e3.firebasestorage.app",
    messagingSenderId: "379406222022",
    appId: "1:379406222022:web:0dced9906e6848a12d4dc7"
};

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dnn5psjx6/image/upload";
const CLOUDINARY_PRESET = "secure_chat";

if (!firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
        console.log("System: Firebase initialized successfully.");
    } catch (e) {
        console.error("System: Critical Firebase Init Error", e);
    }
}

const auth = firebase.auth();
const database = firebase.database();


let activeRecipient = "";
let myName = "";
let currentChatRef = null;
let currentReplyTo = null;
let typingTimeout = null;
let networkStatus = true;
let lastRenderedDate = null;
const defaultPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";


const encodeMsg = (str) => {
    if (!str) return "";
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (error) {
        console.error("Encoding Pipeline Fault:", error);
        return "";
    }
};

const decodeMsg = (str) => {
    if (!str) return "";
    try {
        return decodeURIComponent(escape(atob(str)));
    } catch (error) {
        console.warn("Decoding Pipeline Fault (Legacy Message detected)");
        return "System: Unable to decrypt message content.";
    }
};


const cleanName = (str) => {
    if (!str) return "";
    return str.toLowerCase().trim().replace(/[\.\#\$\[\]\s]/g, "_");
};

window.playNotificationSound = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) { console.warn("Audio Context blocked or unsupported"); }
};

window.showToast = function (msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3300);
};

window.showConfirm = function (msg, callback) {
    document.getElementById('confirm-message').innerText = msg;
    document.getElementById('confirm-modal').style.display = 'flex';
    document.getElementById('confirm-btn-yes').onclick = () => {
        document.getElementById('confirm-modal').style.display = 'none';
        callback();
    };
};
window.closeConfirmModal = function () {
    document.getElementById('confirm-modal').style.display = 'none';
};

window.alert = function (msg) {
    if (typeof msg === 'string' && (msg.includes('Error') || msg.includes('Failed'))) showToast(msg, 'error');
    else showToast(msg);
};


const getTS = (ts) => {
    const d = ts ? new Date(ts) : new Date();
    return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const getTimestampFromPushId = (pushId) => {
    const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let time = 0;
    for (let i = 0; i < 8; i++) {
        time = time * 64 + PUSH_CHARS.indexOf(pushId.charAt(i));
    }
    return time;
};

const formatDateSeparator = (timestamp) => {
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};


async function uploadToCloudinary(file, isAuto = false) {
    if (!file) {
        console.warn("Media: No binary data provided.");
        return null;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    const uploadEndpoint = isAuto ? CLOUDINARY_URL.replace("/image/upload", "/video/upload") : CLOUDINARY_URL;

    try {
        console.log("Media: Initiating Cloudinary POST stream...");
        const response = await fetch(uploadEndpoint, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error(`Media Error: ${response.status}`);

        const data = await response.json();
        console.log("Media: Success. HTTPS Endpoint:", data.secure_url);
        return data.secure_url || null;
    } catch (err) {
        console.error("Media Engine Fault:", err);
        alert("Media Engine: Upload failed. Check network stability.");
        return null;
    }
}


window.registerUserFromPage = function () {
    const handle = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;

    if (!handle) return alert("Register: Please choose a username.");
    if (!email || pass.length < 6) {
        return alert("Register: Requires valid email and 6+ character password.");
    }

    const username = cleanName(handle);

    database.ref('users/' + username).once('value').then(snapshot => {
        if (snapshot.exists()) {
            throw new Error(`Handle @${username} is taken.`);
        }
        console.log("Auth: Registering credential...");
        return auth.createUserWithEmailAndPassword(email, pass);
    }).then(userCredential => {
        console.log("DB: Provisioning user data node...");
        return database.ref('users/' + username).set({
            username: username,
            email: email,
            photo: defaultPic,
            status: "Online",
            contacts: {},
            typing: "",
            searchIndex: email.toLowerCase(),
            metadata: {
                platform: navigator.platform,
                registeredAt: firebase.database.ServerValue.TIMESTAMP
            }
        });
    }).then(() => {
        alert(`Account Verified! Welcome @${username}. Please log in now.`);
        window.location.href = "index.html";
    }).catch(error => {
        console.error("Auth Exception:", error.message);
        alert("Registration Failed: " + error.message);
    });
};


window.loginUser = async function () {
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;

    const dbg = document.getElementById('debug-log');
    if (dbg) { dbg.style.display = 'block'; dbg.innerHTML = 'Starting login...<br>'; }
    const log = (m) => { if (dbg) dbg.innerHTML += m + '<br>'; console.log(m); };

    if (!email || !pass) return alert("Login: Missing required fields.");

    const loginBtn = document.querySelector('.btn-login');
    if (loginBtn) {
        loginBtn.innerText = "Verifying...";
        loginBtn.style.opacity = "0.7";
        loginBtn.disabled = true;
    }

    const resetBtn = () => {
        if (loginBtn) { loginBtn.innerText = "Login"; loginBtn.style.opacity = "1"; loginBtn.disabled = false; }
    };

    log("Auth: Initiating Firebase sign in...");
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, pass);
        const authEmail = userCredential.user.email;
        log("Auth: Success. Email: " + authEmail);

        log("DB: Querying searchIndex...");
        let snap = await database.ref('users').orderByChild('searchIndex').equalTo(authEmail.toLowerCase()).once('value');
        log("DB: searchIndex snap exists? " + snap.exists());
        if (snap.exists()) { proceedLogin(snap, authEmail); resetBtn(); return; }

        log("DB: Querying exact authEmail...");
        snap = await database.ref('users').orderByChild('email').equalTo(authEmail).once('value');
        log("DB: authEmail snap exists? " + snap.exists());
        if (snap.exists()) { proceedLogin(snap, authEmail); resetBtn(); return; }

        log("DB: Querying raw typed email...");
        snap = await database.ref('users').orderByChild('email').equalTo(email).once('value');
        log("DB: typed email snap exists? " + snap.exists());
        if (snap.exists()) { proceedLogin(snap, authEmail); resetBtn(); return; }

        resetBtn();
        log("Error: Handle missing in DB.");
        alert("System Error: Handle association missing.");
        await auth.signOut();
    } catch (err) {
        resetBtn();
        log("<span style='color:#f15c6d'>Exception: " + err.message + "</span>");
        alert("Auth/DB Failed: " + err.message);
    }
};

function proceedLogin(snapshot, finalEmail) {
    snapshot.forEach(child => {
        myName = child.key;
        localStorage.setItem('secureChatUserEmail', finalEmail);
        localStorage.setItem('secureChatUsername', myName);

        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('chat-app').style.display = 'flex';

        bootSystems();
    });
}


function bootSystems() {
    const usernameDisplay = document.getElementById('my-username-display');
    if (usernameDisplay) usernameDisplay.innerText = myName;

    database.ref('users/' + myName).update({ status: "Online", typing: "" });
    database.ref('users/' + myName).onDisconnect().update({ status: "Offline", lastSeen: firebase.database.ServerValue.TIMESTAMP, typing: "" });

    database.ref(`users/${myName}/photo`).on('value', s => {
        const url = s.val() || defaultPic;
        const pImg = document.getElementById('display-pic');
        if (pImg) pImg.src = url;
    });

    database.ref(".info/connected").on("value", (snap) => {
        networkStatus = snap.val();
        if (!networkStatus) console.warn("System: Connection Latency detected.");
    });

    listenForRequests();
    initializeSidebar();
}

let isInitialRequestLoad = true;
let previousRequestCount = 0;

function listenForRequests() {
    database.ref(`users/${myName}/requests`).on('value', snap => {
        const badge = document.getElementById('requests-badge');
        const list = document.getElementById('requests-list');
        if (!badge || !list) return;

        list.innerHTML = "";

        if (!snap.exists()) {
            badge.style.display = 'none';
            list.innerHTML = "<p style='color: var(--text-muted); text-align: center; font-size: 14px;'>No pending requests.</p>";
            isInitialRequestLoad = false;
            previousRequestCount = 0;
            return;
        }

        let count = 0;
        snap.forEach(req => {
            count++;
            const sender = req.key;
            list.innerHTML += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                    <span style="font-weight: 500; color: var(--text-main); font-size: 15px;">@${sender}</span>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="acceptRequest('${sender}')" style="background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500;">Accept</button>
                        <button onclick="rejectRequest('${sender}')" style="background: transparent; color: #f15c6d; border: 1px solid #f15c6d; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500;">Reject</button>
                    </div>
                </div>
            `;
        });

        if (!isInitialRequestLoad && count > previousRequestCount) {
            playNotificationSound();
        }
        previousRequestCount = count;
        isInitialRequestLoad = false;

        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    });
}


function initializeSidebar() {
    const contactsRef = database.ref(`users/${myName}/contacts`);

    contactsRef.on('value', snap => {
        const list = document.getElementById('contact-list');
        list.innerHTML = "";

        if (!snap.exists()) {
            console.log("Sidebar: Empty contact list.");
            return;
        }

        snap.forEach(entry => {
            if (entry.val() === true) {
                renderSidebarRow(entry.key);
            }
        });
    });
}


function renderSidebarRow(cid) {
    database.ref('users/' + cid).on('value', uSnap => {
        const u = uSnap.val();
        if (!u) return;

        const existing = document.getElementById(`row-${cid}`);
        if (existing) existing.remove();

        const row = document.createElement('div');
        row.className = 'contact-item';
        row.id = `row-${cid}`;

        const isTyping = u.typing === myName;
        const color = isTyping || u.status === 'Online' ? '#25d366' : '#8696a0';

        let displayStatus = u.status || 'Offline';
        if (u.status === 'Offline' && u.lastSeen) {
            displayStatus = "Last seen: " + getTS(u.lastSeen);
        }

        row.innerHTML = `
            <div class="sidebar-avatar-frame">
                <img src="${u.photo || defaultPic}" class="avatar" onclick="event.stopPropagation(); openFullImage('${u.photo || defaultPic}')">
            </div>
            <div class="sidebar-info-frame" onclick="startChat('${u.username}', '${u.photo || defaultPic}')">
                <div class="contact-top">
                    <div class="contact-name">${u.username}</div>
                    <div class="contact-time" id="time-${cid}"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="contact-status" id="status-${cid}" style="color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${isTyping ? 'typing...' : displayStatus}</div>
                    <div id="unread-${cid}" style="display: none; background: var(--accent); color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; font-weight: bold;">0</div>
                </div>
            </div>
        `;

        document.getElementById('contact-list').appendChild(row);

        let isInitialMsgLoad = true;
        let previousUnread = 0;
        const roomPath = [myName, cid].sort().join("_");
        database.ref('chats/' + roomPath).off('value'); // Prevent memory leak when re-rendering
        database.ref('chats/' + roomPath).on('value', chatSnap => {
            let unreadCount = 0;
            let lastMsg = null;

            chatSnap.forEach(msgSnap => {
                const msg = msgSnap.val();
                lastMsg = msg;
                if (msg.sender !== myName && msg.status !== 'seen') unreadCount++;
            });

            if (!isInitialMsgLoad && unreadCount > previousUnread) {
                playNotificationSound();
            }
            previousUnread = unreadCount;
            isInitialMsgLoad = false;

            const unreadBadge = document.getElementById(`unread-${cid}`);
            const statusDiv = document.getElementById(`status-${cid}`);
            const timeDiv = document.getElementById(`time-${cid}`);
            const rowEl = document.getElementById(`row-${cid}`);

            if (!unreadBadge || !rowEl) return;

            if (lastMsg) {
                timeDiv.innerText = lastMsg.time;
                let preview = "";
                if (lastMsg.type === 'audio') preview = "🎤 Voice message";
                else if (lastMsg.type === 'image') preview = "📷 Photo";
                else preview = decodeMsg(lastMsg.text);

                if (unreadCount > 0 && activeRecipient !== cid) {
                    unreadBadge.innerText = unreadCount;
                    unreadBadge.style.display = 'block';
                    statusDiv.innerText = preview;
                    statusDiv.style.fontWeight = "bold";
                    statusDiv.style.color = "var(--text-main)";

                    const list = document.getElementById('contact-list');
                    if (list.firstChild !== rowEl) list.prepend(rowEl);
                } else {
                    unreadBadge.style.display = 'none';
                    statusDiv.innerText = u.typing === myName ? 'typing...' : preview;
                    statusDiv.style.fontWeight = "normal";
                    statusDiv.style.color = "var(--text-muted)";

                    const list = document.getElementById('contact-list');
                    if (list.firstChild !== rowEl) list.prepend(rowEl);
                }
            }
        });
    });
}

const resetViewport = () => {
    if (currentChatRef) {
        currentChatRef.off();
        currentChatRef = null;
    }
    activeRecipient = "";
    document.getElementById('chat-box').innerHTML = "";
    const activeView = document.getElementById('chat-active-view');
    const placeholder = document.getElementById('chat-placeholder');
    if (activeView) activeView.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    document.getElementById('active-user-title').innerText = "Messenger";
    document.getElementById('last-seen-status').innerText = "Select a contact to begin";
    document.getElementById('chat-app').classList.remove('mobile-chat-active');
};


window.startChat = function (target, photoUrl) {
    if (!target) return;
    activeRecipient = target;
    lastRenderedDate = null;

    document.getElementById('chat-app').classList.add('mobile-chat-active');
    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('chat-active-view').style.display = 'flex';

    document.getElementById('active-user-title').innerText = target;
    if (photoUrl) document.getElementById('active-user-pic').src = photoUrl;
    document.getElementById('chat-box').innerHTML = "";

    const roomPath = [myName, activeRecipient].sort().join("_");

    if (currentChatRef) currentChatRef.off();
    currentChatRef = database.ref('chats/' + roomPath);


    database.ref('users/' + target).on('value', snap => {
        const u = snap.val();
        const sLabel = document.getElementById('last-seen-status');
        if (u && u.typing === myName) {
            sLabel.innerText = "typing...";
            sLabel.style.color = "#25d366";
        } else if (u) {
            if (u.status === 'Offline' && u.lastSeen) {
                sLabel.innerText = "Last seen: " + getTS(u.lastSeen);
            } else {
                sLabel.innerText = u.status || "";
            }
            sLabel.style.color = "#8696a0";
        }
    });

    listenToTraffic();
};


function listenToTraffic() {

    currentChatRef.on('child_added', snap => {
        const d = snap.val();
        if (d.sender !== myName && d.status !== 'seen') {
            currentChatRef.child(snap.key).update({ status: 'seen' });
        }

        const ts = getTimestampFromPushId(snap.key);
        const dateString = new Date(ts).toDateString();

        if (dateString !== lastRenderedDate) {
            const box = document.getElementById('chat-box');
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.innerHTML = `<span>${formatDateSeparator(ts)}</span>`;
            box.appendChild(sep);
            lastRenderedDate = dateString;
        }

        renderMessageBubble(d, snap.key);
    });


    currentChatRef.on('child_changed', snap => {
        const data = snap.val();
        const ticks = document.getElementById(`tick-${snap.key}`);
        if (ticks && data.status === 'seen') {
            ticks.classList.add('seen');
        }
    });


    currentChatRef.on('child_removed', snap => {
        const el = document.getElementById(`msg-${snap.key}`);
        if (el) el.remove();
    });
}


function renderMessageBubble(data, key) {
    const isMe = data.sender === myName;
    const box = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');

    msgDiv.className = `message ${isMe ? 'me' : ''}`;
    msgDiv.id = `msg-${key}`;

    let bodyHTML = "";
    if (data.type === 'image') {
        bodyHTML = `<img src="${data.text}" class="chat-img-small" loading="lazy" onclick="openFullImage('${data.text}')">`;
    } else if (data.type === 'audio') {
        bodyHTML = `<audio controls style="width: 240px; height: 45px; margin-top: 5px;"><source src="${data.text}" type="audio/webm">Your browser does not support the audio element.</audio>`;
    } else {
        bodyHTML = `<div class="text-content">${decodeMsg(data.text)}</div>`;
    }

    let quotedHTML = "";
    if (data.replyTo) {
        quotedHTML = `
            <div class="quoted-message" onclick="scrollToMessage('${data.replyTo.key}')">
                <span class="quoted-sender">${data.replyTo.sender === myName ? 'You' : data.replyTo.sender}</span>
                <span class="quoted-text">${data.replyTo.text}</span>
            </div>
        `;
    }

    msgDiv.innerHTML = `
        <div class="bubble-inner">
            ${quotedHTML}
            <div class="content-frame">${bodyHTML}</div>
            <div class="meta-frame">
                <span class="meta-time">${data.time}</span>
                ${isMe ? `<span class="tick ${data.status === 'seen' ? 'seen' : ''}" id="tick-${key}">✓✓</span>` : ''}
            </div>
        </div>
    `;


    setupBubbleMenu(msgDiv, key, isMe, data);

    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
}


function setupBubbleMenu(element, key, isMe, data) {
    let t;
    const trigger = (e) => {
        const posX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const posY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        t = setTimeout(() => {
            const menu = document.createElement('div');
            menu.className = 'delete-menu';
            menu.style.left = posX + "px";
            menu.style.top = posY + "px";

            const btnReply = document.createElement('div');
            btnReply.className = "delete-opt";
            btnReply.innerText = "Reply";
            btnReply.onclick = () => { initiateReply(key, data); menu.remove(); };
            menu.appendChild(btnReply);

            const btn1 = document.createElement('div');
            btn1.className = "delete-opt";
            btn1.innerText = "Delete for me";
            btn1.onclick = () => { element.remove(); menu.remove(); };
            menu.appendChild(btn1);

            if (isMe) {
                const btn2 = document.createElement('div');
                btn2.className = "delete-opt danger";
                btn2.innerText = "Delete for everyone";
                btn2.onclick = () => { currentChatRef.child(key).remove(); menu.remove(); };
                menu.appendChild(btn2);
            }

            document.body.appendChild(menu);
            setTimeout(() => { window.onclick = () => { if (menu) menu.remove(); }; }, 100);
        }, 850);
    };

    element.addEventListener('mousedown', trigger);
    element.addEventListener('touchstart', trigger);
    element.addEventListener('mouseup', () => clearTimeout(t));
    element.addEventListener('touchend', () => clearTimeout(t));
    element.oncontextmenu = (e) => e.preventDefault();
}


window.sendMessage = function () {
    const inp = document.getElementById('message-input');
    const val = inp.value.trim();
    if (!val || !currentChatRef) return;

    const payload = {
        sender: myName,
        text: encodeMsg(val),
        type: 'text',
        time: getTS(),
        status: 'sent'
    };
    if (currentReplyTo) {
        payload.replyTo = currentReplyTo;
    }

    currentChatRef.push().set(payload);

    inp.value = "";
    if (typeof cancelReply === 'function') cancelReply();
    if (typeof handleTyping === 'function') handleTyping();
    database.ref('users/' + myName).update({ typing: "" });
};


window.sendImageFile = async function () {
    const fInput = document.getElementById('image-input');
    const file = fInput.files[0];
    if (!file) return;

    const url = await uploadToCloudinary(file);
    if (url) {
        currentChatRef.push().set({
            sender: myName,
            text: url,
            type: 'image',
            time: getTS(),
            status: 'sent'
        });
    }
    fInput.value = "";
};


window.updateProfilePhoto = async function () {
    const file = document.getElementById('profile-upload').files[0];
    if (!file) return;
    const url = await uploadToCloudinary(file);
    if (url) {
        database.ref(`users/${myName}`).update({ photo: url });
        alert("System: Profile updated successfully.");
    }
};


window.updateTypingStatus = function () {
    if (!activeRecipient) return;
    database.ref('users/' + myName).update({ typing: activeRecipient });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        database.ref('users/' + myName).update({ typing: "" });
    }, 1800);
};


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
            // Send request to the other user
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
        currentChatRef.remove().then(() => {
            document.getElementById('chat-box').innerHTML = "";
            toggleChatMenu();
            showToast("System: Chat cleared successfully.");
        }).catch(err => showToast("Failed to clear chat: " + err.message, 'error'));
    });
};

window.unfriendCurrentContact = function () {
    if (!activeRecipient) return;
    showConfirm(`Are you sure you want to unfriend @${activeRecipient}? You will no longer see them in your contacts list.`, () => {
        // Remove from my contacts list
        database.ref(`users/${myName}/contacts/${activeRecipient}`).remove().then(() => {
            resetViewport();
            toggleChatMenu();
            showToast(`System: You have unfriended @${activeRecipient}.`);
        });
    });
};

window.onload = () => {
    const savedName = localStorage.getItem('secureChatUsername');
    const savedEmail = localStorage.getItem('secureChatUserEmail');

    if (savedName && savedEmail) {
        myName = savedName;
        const authContainer = document.getElementById('auth-container');
        if (authContainer) authContainer.style.display = 'none';

        const chatApp = document.getElementById('chat-app');
        if (chatApp) chatApp.style.display = 'flex';

        bootSystems();
    }
};

