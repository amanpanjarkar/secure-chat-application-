// js/status.js

let statusesByContact = {};
let currentStatusUser = null;
let currentStatusIndex = 0;
let statusTimer = null;
let statusProgressInterval = null;
const STATUS_DURATION = 5000; // 5 seconds

window.loadStatuses = function() {
    console.log("Status Engine: Initializing for", myName);
    const tray = document.getElementById('status-tray');
    if (!tray) {
        console.error("Status Engine: 'status-tray' not found in DOM! (Is index.html cached?)");
    }

    const contactsRef = database.ref(`users/${myName}/contacts`);
    contactsRef.on('value', snap => {
        let contacts = [myName];
        if (snap.exists()) {
            snap.forEach(c => {
                if (c.val() === true && c.key !== myName) contacts.push(c.key);
            });
        }
        
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        
        // Listen to each contact's statuses
        contacts.forEach(contact => {
            database.ref(`users/${contact}/statuses`).on('value', statusSnap => {
                const s = statusSnap.val();
                if (s) {
                    let activeStatuses = [];
                    let hasUnseen = false;
                    for (let key in s) {
                        if (s[key].timestamp > oneDayAgo) {
                            activeStatuses.push({id: key, ...s[key]});
                            if (contact !== myName && (!s[key].views || !s[key].views[myName])) {
                                hasUnseen = true;
                            }
                        }
                    }
                    if (activeStatuses.length > 0) {
                        activeStatuses.sort((a,b) => a.timestamp - b.timestamp);
                        statusesByContact[contact] = activeStatuses;
                    } else {
                        delete statusesByContact[contact];
                    }
                } else {
                    delete statusesByContact[contact];
                }
                renderStatusTray();
            });
        });
    });
};

function renderStatusTray() {
    const trayElement = document.getElementById('status-tray');
    if(!trayElement) return;

    // Reset with base button
    trayElement.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; min-width: 60px;" onclick="document.getElementById('status-upload-modal').style.display='flex'">
            <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--accent); position: relative; border: 2px solid transparent;" id="my-status-ring">
                <img src="${defaultPic}" id="my-status-avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:none;">
                <span id="my-status-plus" style="position: absolute; bottom: -2px; right: -2px; background: var(--accent); color: white; border-radius: 50%; width: 16px; height: 16px; font-size: 12px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--bg-app);">＋</span>
            </div>
            <span style="font-size: 11px; margin-top: 5px; color: var(--text-main);">My Status</span>
        </div>
    `;

    Object.keys(statusesByContact).forEach(contact => {
        const statuses = statusesByContact[contact];
        let hasUnseen = false;
        if (contact !== myName) {
            hasUnseen = statuses.some(st => !st.views || !st.views[myName]);
        } else {
            // Update my avatar if I have a status
            database.ref(`users/${myName}/photo`).once('value', pSnap => {
                const p = pSnap.val() || defaultPic;
                const avatar = document.getElementById('my-status-avatar');
                if(avatar) {
                    avatar.src = p;
                    avatar.style.display = 'block';
                    document.getElementById('my-status-ring').style.border = '2px solid var(--border-color)';
                    document.getElementById('my-status-ring').onclick = (e) => {
                        e.stopPropagation();
                        openStatusViewer(myName);
                    };
                }
            });
            return; // Already rendered the "My Status" block
        }

        database.ref('users/'+contact+'/photo').once('value', photoSnap => {
            const p = photoSnap.val() || defaultPic;
            const div = document.createElement('div');
            div.className = 'status-avatar-item';
            div.style.cssText = "display: flex; flex-direction: column; align-items: center; cursor: pointer; min-width: 60px;";
            div.onclick = () => openStatusViewer(contact);
            div.innerHTML = `
                <div style="width: 50px; height: 50px; border-radius: 50%; padding: 2px; border: 2px solid ${hasUnseen ? 'var(--accent)' : 'var(--border-color)'};">
                    <img src="${p}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                </div>
                <span style="font-size: 11px; margin-top: 5px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px;">${contact}</span>
            `;
            trayElement.appendChild(div);
        });
    });
}

window.uploadStatus = async function() {
    const textInput = document.getElementById('status-text-input');
    const fileInput = document.getElementById('status-file-input');
    const btn = document.getElementById('status-post-btn');
    
    const text = textInput.value.trim();
    const file = fileInput.files[0];
    
    if (!text && !file) {
        showToast("Please enter text or attach a file.", "error");
        return;
    }
    
    btn.innerText = "Posting...";
    btn.disabled = true;
    
    try {
        let payload = {
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        if (file) {
            const url = await window.uploadToCloudinary(file, true);
            if (!url) throw new Error("Media server rejected the file.");
            payload.type = file.type.startsWith('video/') ? 'video' : 'image';
            payload.content = url;
            if (text) payload.caption = text;
        } else {
            payload.type = 'text';
            payload.content = text;
        }
        
        const newRef = database.ref(`users/${myName}/statuses`).push();
        await newRef.set(payload);
        
        showToast("Status posted successfully!");
        
        document.getElementById('status-upload-modal').style.display = 'none';
        textInput.value = "";
        fileInput.value = "";
        const label = document.getElementById('status-file-label');
        if(label) label.innerText = "";
    } catch (e) {
        console.error("Status Upload Error:", e);
        const path = `users/${myName}/statuses`;
        showToast(`Failed (Path: ${path}): ` + e.message, "error");
    } finally {
        btn.innerText = "Post Status";
        btn.disabled = false;
    }
};

window.openStatusViewer = function(contact) {
    if (!statusesByContact[contact] || statusesByContact[contact].length === 0) return;
    currentStatusUser = contact;
    currentStatusIndex = 0;
    
    document.getElementById('status-viewer-modal').style.display = 'flex';
    document.getElementById('status-viewer-name').innerText = contact === myName ? 'My Status' : contact;
    
    database.ref(`users/${contact}/photo`).once('value', s => {
        document.getElementById('status-viewer-avatar').src = s.val() || defaultPic;
    });
    
    renderCurrentStatus();
};

window.closeStatusViewer = function() {
    document.getElementById('status-viewer-modal').style.display = 'none';
    clearTimeout(statusTimer);
    clearInterval(statusProgressInterval);
    const area = document.getElementById('status-content-area');
    // Clear video if playing
    const vids = area.getElementsByTagName('video');
    for(let v of vids) { v.pause(); v.src = ""; }
};

window.nextStatus = function() {
    if (currentStatusIndex < statusesByContact[currentStatusUser].length - 1) {
        currentStatusIndex++;
        renderCurrentStatus();
    } else {
        closeStatusViewer();
    }
};

window.prevStatus = function() {
    if (currentStatusIndex > 0) {
        currentStatusIndex--;
        renderCurrentStatus();
    }
};

function renderCurrentStatus() {
    clearTimeout(statusTimer);
    clearInterval(statusProgressInterval);
    
    const statuses = statusesByContact[currentStatusUser];
    const status = statuses[currentStatusIndex];
    
    // Update progress bars
    const progressContainer = document.getElementById('status-progress-bars');
    progressContainer.innerHTML = "";
    for (let i = 0; i < statuses.length; i++) {
        const bar = document.createElement('div');
        bar.style.flex = "1";
        bar.style.height = "2px";
        bar.style.background = "rgba(255,255,255,0.3)";
        bar.style.borderRadius = "2px";
        
        const inner = document.createElement('div');
        inner.style.height = "100%";
        inner.style.background = "white";
        inner.style.borderRadius = "2px";
        
        if (i < currentStatusIndex) {
            inner.style.width = "100%";
        } else if (i === currentStatusIndex) {
            inner.style.width = "0%";
            inner.id = "active-status-progress";
        } else {
            inner.style.width = "0%";
        }
        
        bar.appendChild(inner);
        progressContainer.appendChild(bar);
    }
    
    // Mark as viewed
    if (currentStatusUser !== myName) {
        database.ref(`users/${currentStatusUser}/statuses/${status.id}/views/${myName}`).set(firebase.database.ServerValue.TIMESTAMP);
    }
    
    document.getElementById('status-viewer-time').innerText = getTS(status.timestamp);
    
    // Render content
    const area = document.getElementById('status-content-area');
    // Clear previous dynamic content but keep click zones
    Array.from(area.children).forEach(c => {
        if (!c.onclick) c.remove(); 
    });
    
    const contentDiv = document.createElement('div');
    contentDiv.style.width = "100%";
    contentDiv.style.height = "100%";
    contentDiv.style.display = "flex";
    contentDiv.style.alignItems = "center";
    contentDiv.style.justifyContent = "center";
    contentDiv.style.flexDirection = "column";
    
    let duration = STATUS_DURATION;
    
    if (status.type === 'text') {
        contentDiv.innerHTML = `<div style="padding: 40px; text-align: center; color: white; font-size: 28px; font-weight: bold; font-family: sans-serif; text-shadow: 0 2px 5px rgba(0,0,0,0.5);">${status.content}</div>`;
        area.appendChild(contentDiv);
        startProgress(duration);
    } else if (status.type === 'image') {
        contentDiv.innerHTML = `<img src="${status.content}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
        if (status.caption) {
            contentDiv.innerHTML += `<div style="position: absolute; bottom: 80px; left: 20px; right: 20px; text-align: center; color: white; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px;">${status.caption}</div>`;
        }
        area.appendChild(contentDiv);
        startProgress(duration);
    } else if (status.type === 'video') {
        const vid = document.createElement('video');
        vid.src = status.content;
        vid.style.maxWidth = "100%";
        vid.style.maxHeight = "100%";
        vid.autoplay = true;
        vid.playsInline = true;
        
        vid.onloadedmetadata = () => {
            duration = vid.duration * 1000;
            startProgress(duration);
        };
        vid.onended = () => {
            nextStatus();
        };
        
        contentDiv.appendChild(vid);
        if (status.caption) {
            const cap = document.createElement('div');
            cap.style.cssText = "position: absolute; bottom: 80px; left: 20px; right: 20px; text-align: center; color: white; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px;";
            cap.innerText = status.caption;
            contentDiv.appendChild(cap);
        }
        area.appendChild(contentDiv);
    }
    
    // Bottom bar actions
    if (currentStatusUser === myName) {
        document.getElementById('status-reactions').style.display = 'none';
        document.getElementById('status-views-container').style.display = 'block';
        const viewsCount = status.views ? Object.keys(status.views).length : 0;
        document.getElementById('status-view-count').innerText = viewsCount;
    } else {
        document.getElementById('status-reactions').style.display = 'flex';
        document.getElementById('status-views-container').style.display = 'none';
    }
}

function startProgress(duration) {
    const bar = document.getElementById('active-status-progress');
    let startTime = Date.now();
    
    statusProgressInterval = setInterval(() => {
        let elapsed = Date.now() - startTime;
        let percent = (elapsed / duration) * 100;
        if (percent >= 100) percent = 100;
        if (bar) bar.style.width = percent + '%';
    }, 50);
    
    statusTimer = setTimeout(() => {
        clearInterval(statusProgressInterval);
        nextStatus();
    }, duration);
}

window.reactToStatus = function(emoji) {
    if (!currentStatusUser) return;
    const statuses = statusesByContact[currentStatusUser];
    const status = statuses[currentStatusIndex];
    
    database.ref(`users/${currentStatusUser}/statuses/${status.id}/reactions/${myName}`).set(emoji);
    
    // Also send a chat message
    const roomPath = [myName, currentStatusUser].sort().join("_");
    database.ref(`chats/${roomPath}`).push().set({
        sender: myName,
        text: encodeMsg(`Reacted ${emoji} to your status.`),
        type: 'text',
        time: getTS(),
        status: 'sent'
    });
    
    showToast("Reaction sent!");
    nextStatus();
};

window.showStatusViews = function() {
    clearTimeout(statusTimer);
    clearInterval(statusProgressInterval);
    
    const statuses = statusesByContact[currentStatusUser];
    const status = statuses[currentStatusIndex];
    
    const list = document.getElementById('status-viewers-list');
    list.innerHTML = "";
    
    if (!status.views || Object.keys(status.views).length === 0) {
        list.innerHTML = "<div style='color: var(--text-muted); text-align: center;'>No views yet</div>";
    } else {
        for (let viewer in status.views) {
            const time = getTS(status.views[viewer]);
            list.innerHTML += `
                <div style="display: flex; justify-content: space-between; padding: 10px; background: var(--bg-hover); border-radius: 8px;">
                    <span style="color: var(--text-main); font-weight: bold;">@${viewer}</span>
                    <span style="color: var(--text-muted); font-size: 12px;">${time}</span>
                </div>
            `;
        }
    }
    
    document.getElementById('status-views-modal').style.display = 'flex';
};
