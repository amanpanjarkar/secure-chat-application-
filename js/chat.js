/* START CHAT */

window.startChat =
function (
    uid,
    username,
    avatar,
    self = false
) {

    console.log("startChat called with UID:", uid);

    // Show containers immediately
    document.getElementById("chat-box").style.display = "flex";
    document.querySelector(".chat-input-area").style.display = "flex";
    document.querySelector(".chat-topbar").style.visibility = "visible";
    const welcome = document.getElementById("welcome-screen");
    if (welcome) welcome.style.display = "none";

    activeRecipientUid = uid;
    activeRecipient = username;

    if (window.innerWidth < 900) {
        document.querySelector(".chat-area").classList.add("active");
        const backBtn = document.getElementById("back-btn");
        if (backBtn) backBtn.style.display = "flex";
    }

    document.getElementById("active-chat-name").innerText = self ? "Saved Messages" : username;
    document.getElementById("active-user-pic").src = avatar || defaultPic;

    /* LIVE STATUS */
    database.ref(`users/${uid}`).off(); // Clean old listener
    database.ref(`users/${uid}`).on("value", snap => {
        const user = snap.val();
        if (!user) return;
        let status = user.status || "Offline";
        if (user.typing === myUid) status = "typing...";
        else if (user.status === "Offline" && user.lastSeen) status = "Last seen " + getTS(user.lastSeen);
        document.getElementById("active-chat-status").innerText = status;
    });

    const roomId = [myUid, uid].sort().join("_");
    currentChatRef = database.ref("chats/" + roomId);

    loadMessages();
    markAllMessagesAsSeen();
    database.ref(`users/${myUid}/contacts/${uid}/unreadCount`).set(0);
    
    console.log("startChat finished for UID:", uid);
};

window.closeChat = function() {
    if (currentChatRef) {
        currentChatRef.off();
        currentChatRef = null;
    }
    activeRecipientUid = "";
    activeRecipient = "";
    
    document.getElementById("chat-box").style.display = "none";
    document.querySelector(".chat-input-area").style.display = "none";
    document.querySelector(".chat-topbar").style.visibility = "hidden";
    const welcome = document.getElementById("welcome-screen");
    if (welcome) welcome.style.display = "flex";
    
    document.querySelector(".chat-area").classList.remove("active");
};

/* LOAD */

function loadMessages() {
    console.log("loadMessages triggered");
    const box = document.getElementById("chat-box");
    if (!box || !currentChatRef) {
        console.error("loadMessages aborted: box or ref missing", !!box, !!currentChatRef);
        return;
    }

    // 1. Initial UI Setup
    box.innerHTML = "";
    lastRenderedDate = null;
    currentChatRef.off();

    // 2. Show UI immediately
    box.style.display = "flex";
    document.querySelector(".chat-input-area").style.display = "flex";
    document.querySelector(".chat-topbar").style.visibility = "visible";
    const welcome = document.getElementById("welcome-screen");
    if (welcome) welcome.style.display = "none";

    // 3. Fetch Clear Timestamp and Start Listener
    const clearPath = activeRecipientUid ? `users/${myUid}/contacts/${activeRecipientUid}/clearChatAt` : `users/${myUid}/clearChatAt`;
    
    database.ref(clearPath).once("value").then(clearSnap => {
        const clearTime = clearSnap.val() || 0;

        currentChatRef.on("child_added", snap => {
            const data = snap.val();
            if (!data || (data.timestamp && data.timestamp < clearTime)) return;

            renderMessage(snap.key, data);
            setTimeout(() => { box.scrollTop = box.scrollHeight; }, 50);

            // Seen logic
            if (data.senderUid !== myUid && data.status !== "seen") {
                currentChatRef.child(snap.key).update({ status: "seen" });
            }
        });

        currentChatRef.on("child_changed", snap => {
            const el = document.getElementById(`msg-${snap.key}`);
            if (el) renderMessage(snap.key, snap.val(), el);
        });

        currentChatRef.on("child_removed", snap => {
            const el = document.getElementById(`msg-${snap.key}`);
            if (el) el.remove();
        });
    }).catch(err => {
        console.error("Load messages error:", err);
        // Fallback: Start listener without clear filter
        currentChatRef.on("child_added", snap => {
            const data = snap.val();
            if (!data) return;
            renderMessage(snap.key, data);
            setTimeout(() => { box.scrollTop = box.scrollHeight; }, 50);
        });
    });
}

window.clearChat = async function() {
    if (!confirm("Are you sure you want to clear this chat? This cannot be undone.")) return;
    
    try {
        await database.ref(`users/${myUid}/contacts/${activeRecipientUid}`).update({
            clearChatAt: firebase.database.ServerValue.TIMESTAMP
        });
        showToast("Chat cleared");
        loadMessages(); // Refresh UI
    } catch (e) {
        console.error(e);
        showToast("Failed to clear chat", "error");
    }
};

window.toggleChatSettingsMenu = function() {
    const menu = document.getElementById("chat-settings-menu");
    if (menu) {
        menu.style.display = menu.style.display === "flex" ? "none" : "flex";
    }
};

/* MARK ALL MESSAGES AS SEEN */

function markAllMessagesAsSeen() {

    if (!currentChatRef) return;

    console.log("Checking for unread messages to mark as seen");

    currentChatRef.once("value", snap => {

        if (!snap.exists()) {
            console.log("No messages in chat");
            return;
        }

        const updates = {};
        let hasUpdates = false;

        snap.forEach(messageSnap => {

            const data = messageSnap.val();

            if (
                data &&
                data.senderUid !== myUid &&
                data.status !== "seen"
            ) {

                updates[messageSnap.key + "/status"] = "seen";
                hasUpdates = true;
                console.log("Will mark message", messageSnap.key, "as seen");
            }
        });

        if (hasUpdates) {

            console.log("Updating", Object.keys(updates).length, "messages to seen status");

            currentChatRef.update(updates)
                .then(() => {
                    console.log("All messages marked as seen successfully");
                })
                .catch(error => {
                    console.error("Error marking all messages as seen:", error);

                    // Fallback: try individual updates
                    console.log("Trying individual updates as fallback");
                    Object.keys(updates).forEach(path => {
                        const messageKey = path.split('/')[0];
                        currentChatRef.child(messageKey).update({status: "seen"})
                            .then(() => console.log("Fallback: marked", messageKey, "as seen"))
                            .catch(err => console.error("Fallback failed for", messageKey, err));
                    });
                });
        } else {
            console.log("No unread messages to mark as seen");
        }
    });
}

/* RENDER */

function renderMessage(key, data, existingEl = null) {

    const box =
        document.getElementById(
            "chat-box"
        );

    if (
        !box
    ) return;

    const mine =
        data.senderUid ===
        myUid;

    const div = existingEl || document.createElement("div");

    if (!existingEl) {
        const msgDate =
            formatDateSeparator(
                getTimestampFromPushId(
                    key
                )
            );

        if (
            lastRenderedDate !==
            msgDate
        ) {

            lastRenderedDate =
                msgDate;

            const sep =
                document.createElement(
                    "div"
                );

            sep.style.cssText =
                `
                align-self:center;
                background:#202c33;
                color:#8696a0;
                padding:6px 14px;
                border-radius:10px;
                font-size:12px;
                margin:10px 0;
                `;

            sep.innerText =
                msgDate;

            box.appendChild(sep);
        }
    }

    div.className =
        `message ${
            mine
            ?
            "out"
            :
            "in"
        }`;

    div.id =
        `msg-${key}`;

    let content = "";

    if (
        data.type === "deleted"
    ) {
        content = `<i style="opacity:0.6;">🚫 This message was deleted</i>`;
    }

    else if (
        data.type ===
        "image"
    ) {

        content =
            `
            <img
                src="${data.text}"
                onclick="openFullImage('${data.text}')"
                onerror="this.src='assets/icons/icon-192.png'; this.style.opacity='0.5';"
                style="
                    max-width:250px;
                    border-radius:12px;
                    cursor:pointer;
                "
            >
            `;
    }

    else if (
        data.type ===
        "video"
    ) {

        content =
            `
            <video
                src="${data.text}"
                controls
                style="
                    max-width:260px;
                    border-radius:12px;
                "
            ></video>
            `;
    }

    else if (
        data.type ===
        "audio"
    ) {

        content =
            `
            <audio
                controls
                src="${data.text}"
            ></audio>
            `;
    }

    else if (
        data.type === "document"
    ) {
        content = `
            <div style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:10px;">
                <span style="font-size:24px;">📄</span>
                <div style="display:flex; flex-direction:column; overflow:hidden; flex:1;">
                    <span style="font-size:13px; font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${data.fileName || 'Document'}</span>
                    <a href="${data.text}" target="_blank" rel="noopener noreferrer" style="color:#00a884; font-size:12px; text-decoration:none; margin-top:4px; font-weight:bold;">View / Download Document</a>
                </div>
            </div>
        `;
    }

    else {

        content =
            `
            <div>
                ${decodeMsg(data.text)}${data.edited ? ' <small style="opacity:0.5; font-size:10px;">(edited)</small>' : ''}
            </div>
            `;
    }

    let ticks = "";
    if (mine) {
        const isSeen = data.status === "seen";
        const isDelivered = data.status === "delivered";
        const tickContent = (isSeen || isDelivered) ? "✓✓" : "✓";
        ticks = `<span class="tick ${isSeen ? 'seen' : ''}">${tickContent}</span>`;
    }

    div.innerHTML =
        `
        ${content}
        <div class="message-time" style="display:flex; justify-content:flex-end; align-items:center; gap:4px; font-size:11px; margin-top:4px; opacity:0.6;">
            ${data.time}
            ${ticks}
        </div>
        `;

    div.oncontextmenu = (e) => {
        if (data.type === 'deleted') {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        showMsgMenu(e, key, data);
    };

    if (!existingEl) {
        box.appendChild(div);
    }
}

/* SEND */

window.sendMessage =
async function () {

    const input =
        document.getElementById(
            "message-input"
        );

    const text =
        input.value.trim();

    if (!text || !currentChatRef) return;

        // Check if I have blocked them
        const myBlock = await database.ref(`users/${myUid}/blocked/${activeRecipientUid}`).once("value");
        if (myBlock.exists()) {
            showToast("Unblock user to send messages", "error");
            return;
        }
        
        // Check if they have blocked me
        const theirBlock = await database.ref(`users/${activeRecipientUid}/blocked/${myUid}`).once("value");
        if (theirBlock.exists()) {
            showToast("Message could not be sent", "error"); // Don't explicitly say "blocked" for privacy, but block the send
            return;
        }

        const payload = {

        sender:
            myName,

        senderUid:
            myUid,

        text:
            encodeMsg(text),

        type:
            "text",

        time:
            getTS(),

        status:
            "sent",

        timestamp:
            firebase.database.ServerValue.TIMESTAMP
    };

    try {

        await currentChatRef
            .push()
            .set(payload);

        // Increment unread count for recipient
        database.ref(`users/${activeRecipientUid}/contacts/${myUid}/unreadCount`).transaction(c => (c || 0) + 1);

        // playTikSound(); // Removed irritating tap sound

        input.value = "";

        handleTyping();

    } catch (e) {

        console.error(e);

        showToast(
            "Message failed",
            "error"
        );
    }
};

/* TYPING */

window.handleTyping =
function () {

    const input =
        document.getElementById(
            "message-input"
        );

    const sendBtn =
        document.getElementById(
            "send-btn"
        );

    const voiceBtn =
        document.getElementById(
            "voice-btn"
        );

    if (
        input.value.trim()
    ) {

        sendBtn.style.display =
            "flex";

        voiceBtn.style.display =
            "none";

    } else {

        sendBtn.style.display =
            "none";

        voiceBtn.style.display =
            "flex";
    }

    if (
        !activeRecipientUid
    ) return;

    database
        .ref(
            `users/${myUid}`
        )
        .update({

            typing:
                activeRecipientUid
        });

    clearTimeout(
        typingTimeout
    );

    typingTimeout =
        setTimeout(() => {

            database
                .ref(
                    `users/${myUid}`
                )
                .update({

                    typing: ""
                });

        }, 1200);
};

window.sendFile = async function(file) {
    if (!file || !currentChatRef) return;

    try {
        // Check if blocked
        const myBlock = await database.ref(`users/${myUid}/blocked/${activeRecipientUid}`).once("value");
        if (myBlock.exists()) {
            showToast("Unblock user to send files", "error");
            return;
        }
        const theirBlock = await database.ref(`users/${activeRecipientUid}/blocked/${myUid}`).once("value");
        if (theirBlock.exists()) {
            showToast("File could not be sent", "error");
            return;
        }

        showToast("Uploading file...");
        
        let type = "document";
        let preset = "document_media";

        if (file.type.startsWith("image/")) {
            type = "image";
            preset = "chat_media";
        } else if (file.type.startsWith("video/")) {
            type = "video";
            preset = "chat_media";
        } else if (file.type.startsWith("audio/")) {
            type = "audio";
            preset = "voice_media";
        }

        const url = await uploadToCloudinary(file, preset);
        
        await currentChatRef.push().set({
            sender: myName,
            senderUid: myUid,
            text: url,
            fileName: file.name,
            type: type,
            time: getTS(),
            status: "sent",
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // Increment unread count for recipient
        database.ref(`users/${activeRecipientUid}/contacts/${myUid}/unreadCount`).transaction(c => (c || 0) + 1);
        
        showToast("File sent");
    } catch (e) {
        console.error(e);
        showToast("Failed to send file", "error");
    }
};

window.showMsgMenu = function(e, msgId, data) {
    // Remove existing
    const old = document.querySelector(".msg-menu");
    if (old) old.remove();

    const menu = document.createElement("div");
    menu.className = "msg-menu";
    
    const isMine = data.senderUid === myUid;
    
    let html = ``;
    
    if (isMine && data.type === 'text') {
        html += `<button onclick="startEditMsg('${msgId}', '${data.text}')">Edit Message</button>`;
    }

    html += `<button onclick="deleteMsg('${msgId}', 'me')">Delete for me</button>`;
    
    if (isMine) {
        html += `<button onclick="deleteMsg('${msgId}', 'everyone')" class="danger">Delete for everyone</button>`;
    }

    menu.innerHTML = html;
    menu.style.top = e.clientY + "px";
    menu.style.left = e.clientX + "px";
    
    document.body.appendChild(menu);
};

window.deleteMsg = async function(msgId, mode) {
    const menu = document.querySelector(".msg-menu");
    if (menu) menu.remove();

    try {
        if (mode === 'everyone') {
            await currentChatRef.child(msgId).update({
                type: "deleted",
                text: "",
                edited: false
            });
            showToast("Message deleted for everyone");
        } else {
            // Delete for me (local removal from UI)
            const el = document.getElementById(`msg-${msgId}`);
            if (el) el.remove();
            showToast("Message deleted for you");
        }
    } catch (e) {
        console.error(e);
        showToast("Delete failed", "error");
    }
};

window.startEditMsg = function(msgId, encryptedText) {
    const menu = document.querySelector(".msg-menu");
    if (menu) menu.remove();

    const text = decodeMsg(encryptedText);
    const input = document.getElementById("message-input");
    input.value = text;
    input.focus();
    
    currentEditMessageId = msgId;
    
    const sendBtn = document.getElementById("send-btn");
    sendBtn.innerText = "✓"; // Change to save icon
};

// Update sendMessage to handle edits
const originalSendMessage = window.sendMessage;
window.sendMessage = async function() {
    if (currentEditMessageId) {
        const input = document.getElementById("message-input");
        const text = input.value.trim();
        if (!text) return;
        
        try {
            await currentChatRef.child(currentEditMessageId).update({
                text: encodeMsg(text),
                edited: true
            });
            input.value = "";
            currentEditMessageId = null;
            document.getElementById("send-btn").innerText = "➤";
            showToast("Message updated");
        } catch (e) {
            console.error(e);
            showToast("Update failed", "error");
        }
    } else {
        await originalSendMessage();
    }
};

console.log(
    "Chat Ready"
);