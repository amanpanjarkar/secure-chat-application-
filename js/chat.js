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

    database.ref(`users/${myName}/clearedChats/${target}`).on('value', s => {
        chatClearedAtTimestamp = s.val() || 0;
    });

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
        const ts = getTimestampFromPushId(snap.key);
        if (ts <= chatClearedAtTimestamp) return;

        const d = snap.val();
        if (d.sender !== myName && d.status !== 'seen') {
            currentChatRef.child(snap.key).update({ status: 'seen' });
        }

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

    if (data.type === 'system') {
        msgDiv.className = 'system-message';
        msgDiv.innerHTML = `<div class="system-message-inner">${decodeMsg(data.text)}</div>`;
        box.appendChild(msgDiv);
        box.scrollTop = box.scrollHeight;
        return;
    }

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

window.sendMessage = async function () {
    const inp = document.getElementById('message-input');
    const val = inp.value.trim();
    if (!val || !currentChatRef) return;

    const snap = await database.ref(`users/${myName}/contacts/${activeRecipient}`).once('value');
    if (!snap.exists() || snap.val() !== true) {
        showToast("You cannot send a message. You are no longer friends.", "error");
        return;
    }

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
    playTikSound();

    inp.value = "";
    if (typeof cancelReply === 'function') cancelReply();
    if (typeof handleTyping === 'function') handleTyping();
    database.ref('users/' + myName).update({ typing: "" });
};

window.sendImageFile = async function () {
    const fInput = document.getElementById('image-input');
    const file = fInput.files[0];
    if (!file || !currentChatRef) return;

    const snap = await database.ref(`users/${myName}/contacts/${activeRecipient}`).once('value');
    if (!snap.exists() || snap.val() !== true) {
        showToast("You cannot send an image. You are no longer friends.", "error");
        fInput.value = "";
        return;
    }

    const url = await uploadToCloudinary(file);
    if (url) {
        currentChatRef.push().set({
            sender: myName,
            text: url,
            type: 'image',
            time: getTS(),
            status: 'sent'
        });
        playTikSound();
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
