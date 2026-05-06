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
    
    if (typeof loadStatuses === 'function') {
        loadStatuses();
    }
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
            
            const cardId = `request-card-${sender}`;
            list.innerHTML += `
                <div id="${cardId}" style="background: var(--bg-hover); border-radius: 12px; padding: 15px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--border-color); text-align: left;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img id="req-pic-${sender}" src="${defaultPic}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">
                        <div style="display: flex; flex-direction: column; overflow: hidden;">
                            <span style="font-weight: bold; color: var(--text-main); font-size: 15px;">@${sender}</span>
                            <span id="req-bio-${sender}" style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">User profile...</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="acceptRequest('${sender}')" style="flex: 1; background: var(--accent); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">Accept</button>
                        <button onclick="rejectRequest('${sender}')" style="flex: 1; background: var(--bg-app); color: #f15c6d; border: 1px solid #f15c6d; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">Reject</button>
                    </div>
                </div>
            `;

            database.ref('users/' + sender).once('value', s => {
                const u = s.val();
                if (u) {
                    const pic = document.getElementById(`req-pic-${sender}`);
                    const bio = document.getElementById(`req-bio-${sender}`);
                    if (pic && u.photo) pic.src = u.photo;
                    if (bio) bio.innerText = u.bio || "No bio available";
                }
            });
        });

        if (!isInitialRequestLoad && count > previousRequestCount) {
            playTikSound(); // Play the requested tik sound
        }
        previousRequestCount = count;
        isInitialRequestLoad = false;

        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
}

function initializeSidebar() {
    const list = document.getElementById('contact-list');
    list.innerHTML = "";
    renderSidebarRow(myName, true);

    const contactsRef = database.ref(`users/${myName}/contacts`);

    contactsRef.on('value', snap => {
        const existingItems = document.querySelectorAll('.contact-item');
        existingItems.forEach(item => {
            if (item.id !== `row-${myName}`) item.remove();
        });

        if (!snap.exists()) {
            console.log("Sidebar: Empty contact list.");
            return;
        }

        snap.forEach(entry => {
            if (entry.val() === true && entry.key !== myName) {
                renderSidebarRow(entry.key, false);
            }
        });
    });
}

function renderSidebarRow(cid, isSelfChat = false) {
    database.ref('users/' + cid).on('value', uSnap => {
        const u = uSnap.val();
        if (!u && !isSelfChat) return;

        const existing = document.getElementById(`row-${cid}`);
        if (existing) existing.remove();

        const row = document.createElement('div');
        row.className = 'contact-item';
        row.id = `row-${cid}`;

        const isTyping = u && u.typing === myName && !isSelfChat;
        const color = isTyping || (u && u.status === 'Online') ? '#25d366' : '#8696a0';

        let displayStatus = u ? (u.status || 'Offline') : 'Offline';
        if (isSelfChat) {
            displayStatus = "Message yourself";
        } else if (u && u.status === 'Offline' && u.lastSeen) {
            displayStatus = "Last seen: " + getTS(u.lastSeen);
        }

        const avatarSrc = u && u.photo ? u.photo : defaultPic;
        const dispName = isSelfChat ? `${u ? u.username : cid} (You)` : (u ? u.username : cid);

        row.innerHTML = `
            <div class="sidebar-avatar-frame">
                <img src="${avatarSrc}" class="avatar" onclick="event.stopPropagation(); openFullImage('${avatarSrc}')">
            </div>
            <div class="sidebar-info-frame" onclick="startChat('${cid}', '${avatarSrc}', ${isSelfChat})">
                <div class="contact-top">
                    <div class="contact-name">${dispName}</div>
                    <div class="contact-time" id="time-${cid}"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="contact-status" id="status-${cid}" style="color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${isTyping ? 'typing...' : displayStatus}</div>
                    <div id="unread-${cid}" style="display: none; background: var(--accent); color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; font-weight: bold;">0</div>
                </div>
            </div>
        `;

        const list = document.getElementById('contact-list');
        if (isSelfChat) {
            list.prepend(row);
        } else {
            list.appendChild(row);
        }

        let isInitialMsgLoad = true;
        let previousUnread = 0;
        const roomPath = [myName, cid].sort().join("_");
        
        database.ref(`users/${myName}/clearedChats/${cid}`).on('value', clearSnap => {
            const clearedAt = clearSnap.val() || 0;
            
            database.ref('chats/' + roomPath).off('value'); // Prevent memory leak when re-rendering
            database.ref('chats/' + roomPath).on('value', chatSnap => {
                let unreadCount = 0;
                let lastMsg = null;

                chatSnap.forEach(msgSnap => {
                    const ts = getTimestampFromPushId(msgSnap.key);
                    if (ts <= clearedAt) return;

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
                    else if (lastMsg.type === 'video') preview = "📹 Video";
                    else if (lastMsg.type === 'file') preview = "📄 Document";
                    else preview = decodeMsg(lastMsg.text);

                    if (unreadCount > 0 && activeRecipient !== cid) {
                        unreadBadge.innerText = unreadCount;
                        unreadBadge.style.display = 'block';
                        statusDiv.innerText = preview;
                        statusDiv.style.fontWeight = "bold";
                        statusDiv.style.color = "var(--text-main)";

                        if (list.firstChild !== rowEl && !isSelfChat) {
                            list.insertBefore(rowEl, list.children[1] || null);
                        }
                    } else {
                        unreadBadge.style.display = 'none';
                        statusDiv.innerText = (u && u.typing === myName && !isSelfChat) ? 'typing...' : preview;
                        statusDiv.style.fontWeight = "normal";
                        statusDiv.style.color = "var(--text-muted)";

                        if (list.firstChild !== rowEl && !isSelfChat) {
                            list.insertBefore(rowEl, list.children[1] || null);
                        }
                    }
                }
            });
        });
    });
}
