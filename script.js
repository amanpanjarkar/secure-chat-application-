
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


const getTS = () => {
    return new Date().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });
};


async function uploadToCloudinary(file) {
    if (!file) {
        console.warn("Media: No binary data provided.");
        return null;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    try {
        console.log("Media: Initiating Cloudinary POST stream...");
        const response = await fetch(CLOUDINARY_URL, { 
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


window.registerUserFromPage = function() {
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


window.loginUser = function () {
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    
    if (!email || !pass) return alert("Login: Missing required fields.");

    console.log("Auth: Validating session...");
    auth.signInWithEmailAndPassword(email, pass).then(() => {
    
        database.ref('users').orderByChild('email').equalTo(email).once('value', snap => {
            if (!snap.exists()) {
                alert("System Error: Handle association missing.");
                auth.signOut();
                return;
            }
            
            snap.forEach(child => {
                myName = child.key; 
                localStorage.setItem('secureChatUserEmail', email);
                localStorage.setItem('secureChatUsername', myName);
                
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('chat-app').style.display = 'flex';

                bootSystems();
            });
        });
    }).catch(error => alert("Auth Failed: " + error.message));
};


function bootSystems() {
    
    const pRef = database.ref('users/' + myName);
    pRef.update({ status: "Online", typing: "" });
    pRef.onDisconnect().update({ status: "Last seen: " + getTS(), typing: "" });

    
    database.ref(`users/${myName}/photo`).on('value', s => {
        const url = s.val() || defaultPic;
        const pImg = document.getElementById('display-pic');
        if (pImg) pImg.src = url;
    });

   
    database.ref(".info/connected").on("value", (snap) => {
        networkStatus = snap.val();
        if (!networkStatus) console.warn("System: Connection Latency detected.");
    });

    initializeSidebar();
}


function initializeSidebar() {
    const list = document.getElementById('contact-list');
    list.innerHTML = ""; 

    const usersRef = database.ref('users');
    
    usersRef.on('child_added', snap => {
        if (snap.key !== myName) {
            renderSidebarRow(snap.key);
        }
    });

    usersRef.on('child_removed', snap => {
        const existing = document.getElementById(`row-${snap.key}`);
        if (existing) existing.remove();
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

        row.innerHTML = `
            <div class="sidebar-avatar-frame">
                <img src="${u.photo || defaultPic}" class="avatar" onclick="event.stopPropagation(); openFullImage('${u.photo || defaultPic}')">
            </div>
            <div class="sidebar-info-frame" onclick="startChat('${u.username}', '${u.photo || defaultPic}')">
                <div class="contact-top">
                    <div class="contact-name">${u.username}</div>
                    <div class="contact-time"></div>
                </div>
                <div class="contact-status" style="color: ${color}">${isTyping ? 'typing...' : (u.status || 'Offline')}</div>
            </div>
        `;

        
        let timer;
        const triggerDelete = () => timer = setTimeout(() => {
            if (confirm(`Clean-Break Delete @${u.username}? (This action is mutual)`)) {
                
                database.ref(`users/${myName}/contacts/${cid}`).set(false);
                
                database.ref(`users/${cid}/contacts/${myName}`).set(false);
                
                
                if(activeRecipient === cid) resetViewport();
            }
        }, 1100);

        row.onmousedown = triggerDelete;
        row.ontouchstart = triggerDelete;
        row.onmouseup = () => clearTimeout(timer);
        row.ontouchend = () => clearTimeout(timer);

        document.getElementById('contact-list').appendChild(row);
    });
}

const resetViewport = () => {
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
            sLabel.innerText = u.status || "";
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
            setTimeout(() => { window.onclick = () => { if(menu) menu.remove(); }; }, 100);
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
            // Add mutual relationship
            database.ref(`users/${myName}/contacts/${h}`).set(true);
            database.ref(`users/${h}/contacts/${myName}`).set(true);
            
            closeAddContactModal();
            
            // Instantly open the chat with this new contact so they can message them immediately!
            const u = s.val();
            startChat(h, u.photo || defaultPic);
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

window.toggleMenu = () => {
    const m = document.getElementById("options-menu");
    if(m) m.classList.toggle("show");
};



window.addEventListener('click', (e) => {
    if (!e.target.matches('.three-dots')) {
        const m = document.getElementById("options-menu");
        if (m && m.classList.contains('show')) m.classList.remove('show');
    }
    const modal = document.getElementById("image-modal");
    if (e.target === modal) modal.style.display = "none";
});

window.initiateReply = function(key, data) {
    currentReplyTo = {
        key: key,
        sender: data.sender,
        text: data.type === 'image' ? '📷 Photo' : decodeMsg(data.text)
    };
    document.getElementById('reply-preview-sender').innerText = data.sender === myName ? 'You' : data.sender;
    document.getElementById('reply-preview-text').innerText = currentReplyTo.text;
    document.getElementById('reply-preview-container').style.display = 'block';
    document.getElementById('message-input').focus();
};

window.cancelReply = function() {
    currentReplyTo = null;
    const container = document.getElementById('reply-preview-container');
    if (container) container.style.display = 'none';
};

window.scrollToMessage = function(key) {
    const el = document.getElementById(`msg-${key}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-pulse');
        setTimeout(() => el.classList.remove('highlight-pulse'), 1500);
    }
};

window.toggleDarkMode = function() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
};

window.handleTyping = function() {
    updateTypingStatus();
    const val = document.getElementById('message-input').value.trim();
    const sendBtn = document.getElementById('send-btn');
    const voiceBtn = document.getElementById('voice-btn');
    if(sendBtn && voiceBtn) {
        if(val) {
            sendBtn.style.display = 'block';
            voiceBtn.style.display = 'none';
        } else {
            sendBtn.style.display = 'none';
            voiceBtn.style.display = 'block';
        }
    }
};

window.filterContacts = function() {
    const term = document.getElementById('contact-search').value.toLowerCase();
    const items = document.querySelectorAll('.contact-item');
    items.forEach(item => {
        const name = item.querySelector('.contact-name').innerText.toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
    });
};

window.logoutUser = function() {
    auth.signOut().then(() => {
        localStorage.removeItem('secureChatUsername');
        localStorage.removeItem('secureChatUserEmail');
        location.reload();
    }).catch(() => {
        localStorage.clear();
        location.reload();
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

