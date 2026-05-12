let systemsBooted = false;
async function bootSystems() {

    if (systemsBooted)
        return;

    systemsBooted = true;

    if (typeof requestAndroidPermissions === "function") {
        requestAndroidPermissions().catch(err => console.warn("Permission request error:", err));
    }

    if (typeof createNotificationChannels === "function") {
        createNotificationChannels().catch(err => console.warn("Channel creation error:", err));
    }

    /* ONLINE */

    const userRef = database.ref("users/" + myUid);
    userRef.update({
        status: "Online",
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).then(() => console.log("Status set to Online"))
    .catch(err => console.error("Status update error:", err));

    userRef.onDisconnect().update({
        status: "Offline",
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });

    /* PROFILE */

    userRef.child("photo")
        .on("value", async snap => {

            const img =
                document.getElementById(
                    "display-pic"
                );

            if (img) {

                const photoUrl = snap.val() || defaultPic;
                console.log("Profile photo updated:", photoUrl);
                myPic = photoUrl;
                img.src = photoUrl;

                // Removed direct onclick for photo change (now handled in modal)
                img.style.cursor = "pointer";
                img.onclick = () => openProfilePhotoModal('me');

                // Also update username and status display
                const usernameDisplay = document.getElementById("my-username-display");
                if (usernameDisplay) {
                    usernameDisplay.innerText = myName || "User";
                }
                const statusDisplay = document.getElementById("my-status-display");
                if (statusDisplay) {
                    statusDisplay.innerText = "Online";
                }
            }
        });

    /* CONTACTS */

    initializeSidebar();

    /* REQUESTS */

    listenForRequests();

    /* STATUS */

    if (
        typeof loadStatuses ===
        "function"
    ) {

        loadStatuses();
    }

    /* FILE */

    const mediaInput = document.getElementById("media-input");
    const docInput = document.getElementById("document-input");

    const onFileChange = async e => {
        const file = e.target.files[0];
        if (file) {
            await sendFile(file);
            e.target.value = ""; // Clear for next upload
        }
    };

    if (mediaInput) mediaInput.addEventListener("change", onFileChange);
    if (docInput) docInput.addEventListener("change", onFileChange);

    /* NOTIFICATION */

    if (
        typeof initializeNotifications ===
        "function"
    ) {

        initializeNotifications();
    }

    if (
        typeof listenMessageNotifications ===
        "function"
    ) {

        listenMessageNotifications();
    }

    console.log(
        "System Ready"
    );
}

/* REQUESTS */

function listenForRequests() {

    database
        .ref(
            `users/${myUid}/requests`
        )
        .on("value", snap => {

            const list =
                document.getElementById(
                    "requests-list"
                );

            const requestBtn =
                document.querySelector(
                    ".sidebar-actions button:nth-child(2)"
                );

            if (!list)
                return;

            list.innerHTML = "";

            let count = 0;

            if (!snap.exists()) {

                if (requestBtn) {

                    requestBtn.innerText =
                        "Requests";
                }

                list.innerHTML =
                    `
                    <div style="
                        text-align:center;
                        color:#8696a0;
                    ">
                        No Requests
                    </div>
                    `;

                return;
            }

            snap.forEach(req => {

                count++;

                const uid =
                    req.key;

                const data =
                    req.val();

                const card =
                    document.createElement(
                        "div"
                    );

                card.style.cssText =
                    `
                    background:#202c33;
                    padding:15px;
                    border-radius:15px;
                    margin-bottom:10px;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    `;

                card.innerHTML =
                    `
                    <div>

                        <strong>
                            @${data.username}
                        </strong>

                    </div>

                    <div style="
                        display:flex;
                        gap:10px;
                    ">

                        <button
                            onclick="acceptRequest('${uid}')"
                            style="
                                background:#00a884;
                                color:white;
                                padding:8px 12px;
                                border-radius:8px;
                            "
                        >
                            Accept
                        </button>

                        <button
                            onclick="rejectRequest('${uid}')"
                            style="
                                background:#f15c6d;
                                color:white;
                                padding:8px 12px;
                                border-radius:8px;
                            "
                        >
                            Reject
                        </button>

                    </div>
                    `;

                list.appendChild(card);
            });

            /* COUNT */

            if (requestBtn) {

                requestBtn.innerText =
                    `Requests (${count})`;
            }

            /* NOTIFICATION */

            if (count > 0) {

                playNotificationSound();

                showBrowserNotification(
                    "New Request",
                    `${count} pending request`
                );
            }
        });
}

/* CONTACTS */

function initializeSidebar() {

    const list =
        document.getElementById(
            "contact-list"
        );

    if (!list)
        return;

    list.innerHTML = "";

    renderSidebarRow(
        myUid,
        true
    );

    database.ref(`users/${myUid}/contacts`).on("child_added", snap => {
        if (snap.val() === true || typeof snap.val() === 'object') {
            renderSidebarRow(snap.key);
        }
    });

    database.ref(`users/${myUid}/contacts`).on("child_changed", snap => {
        renderSidebarRow(snap.key);
        sortContactsList();
    });

    database.ref(`users/${myUid}/contacts`).on("child_removed", snap => {
        const row = document.getElementById(`row-${snap.key}`);
        if (row) row.remove();
    });
}

/* SORT CONTACTS BY RECENT MESSAGE */

function sortContactsList() {
    const list = document.getElementById("contact-list");
    if (!list) return;

    const rows = Array.from(list.children);
    
    rows.sort((rowA, rowB) => {
        // Keep "You" at the top
        if (rowA.id === `row-${myUid}`) return -1;
        if (rowB.id === `row-${myUid}`) return 1;
        
        const timeA = parseInt(rowA.dataset.lastMessageAt || 0);
        const timeB = parseInt(rowB.dataset.lastMessageAt || 0);
        
        return timeB - timeA; // Most recent first
    });
    
    rows.forEach(row => list.appendChild(row));
}


function renderSidebarRow(
    uid,
    self = false
) {

    database
        .ref(
            "users/" + uid
        )
        .on("value", snap => {

            const user =
                snap.val();

            if (!user)
                return;

            let row = document.getElementById(`row-${uid}`);
            let isNew = false;

            if (!row) {
                isNew = true;
                row = document.createElement("div");
                row.className = "contact-item";
                row.id = `row-${uid}`;

                row.innerHTML = `
                    <img src="${user.photo || defaultPic}" class="row-pic">
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="row-name">
                                ${self ? `${myName} (You)` : user.username}
                            </span>
                            <span class="unread-badge" id="unread-${uid}" style="display:none;"></span>
                        </div>
                        <div class="contact-status">
                            Offline
                        </div>
                    </div>
                `;

                row.onclick = () => {
                    startChat(uid, user.username, user.photo, self);
                };

                document.getElementById("contact-list").appendChild(row);
            }

            // TARGETED UPDATES (Avoids destroying listeners)
            const statusEl = row.querySelector(".contact-status");
            const picEl = row.querySelector(".row-pic");
            const nameEl = row.querySelector(".row-name");

            let statusStr = user.status || "Offline";
            if (user.typing === myUid) {
                statusStr = "typing...";
            } else if (user.status === "Offline" && user.lastSeen) {
                statusStr = "Last seen " + getTS(user.lastSeen);
            }

            if (statusEl) statusEl.innerText = statusStr;
            if (picEl) picEl.src = user.photo || defaultPic;
            if (nameEl) nameEl.innerText = self ? `${myName} (You)` : (user.username || "User");

            // Listen for unread count only once
            if (!self && isNew) {
                database.ref(`users/${myUid}/contacts/${uid}/unreadCount`).on("value", snap => {
                    const count = snap.val() || 0;
                    const badge = document.getElementById(`unread-${uid}`);
                    if (badge) {
                        if (count > 0) {
                            badge.innerText = count;
                            badge.style.display = "flex";
                        } else {
                            badge.style.display = "none";
                        }
                    }
                });

                // Track last message timestamp for sorting
                database.ref(`users/${myUid}/contacts/${uid}/lastMessageAt`).on("value", snap => {
                    const timestamp = snap.val() || 0;
                    row.dataset.lastMessageAt = timestamp;
                    sortContactsList();
                });

                // DELIVERED LOGIC: Listen for incoming messages to mark as delivered
                const roomId = [myUid, uid].sort().join("_");
                database.ref(`chats/${roomId}`).limitToLast(10).on("child_added", snap => {
                    const msg = snap.val();
                    if (msg && msg.senderUid === uid && msg.status === "sent") {
                        // Only mark as delivered if it's currently "sent" (don't overwrite "seen")
                        database.ref(`chats/${roomId}/${snap.key}/status`).transaction(currentStatus => {
                            if (currentStatus === "sent") {
                                return "delivered";
                            }
                            return; // Abort if already delivered or seen
                        });
                        
                        // Update last message timestamp
                        database.ref(`users/${myUid}/contacts/${uid}/lastMessageAt`).set(firebase.database.ServerValue.TIMESTAMP);
                    }
                });
            }
        });
}

/* ACCEPT */

window.acceptRequest =
async function (
    senderUid
) {

    await database
        .ref(
            `users/${myUid}/contacts/${senderUid}`
        )
        .set(true);

    await database
        .ref(
            `users/${senderUid}/contacts/${myUid}`
        )
        .set(true);

    await database
        .ref(
            `users/${myUid}/requests/${senderUid}`
        )
        .remove();

    showToast(
        "Request accepted"
    );
};

/* REJECT */

window.rejectRequest =
async function (
    senderUid
) {

    await database
        .ref(
            `users/${myUid}/requests/${senderUid}`
        )
        .remove();

    showToast(
        "Request rejected"
    );
};

window.blockUser = async function() {
    if (!activeRecipientUid) return;
    if (!confirm(`Are you sure you want to block ${activeRecipient}?`)) return;

    try {
        await database.ref(`users/${myUid}/blocked/${activeRecipientUid}`).set(true);
        showToast("User blocked");
        closeChat();
    } catch (e) {
        console.error(e);
        showToast("Failed to block user", "error");
    }
};

window.unblockUser = async function(uid) {
    try {
        await database.ref(`users/${myUid}/blocked/${uid}`).remove();
        showToast("User unblocked");
        openBlockedList(); // Refresh list
    } catch (e) {
        console.error(e);
        showToast("Failed to unblock user", "error");
    }
};

window.openBlockedList = async function() {
    const modal = document.getElementById("blocked-list-modal");
    const list = document.getElementById("blocked-users-list");
    if (!modal || !list) return;

    modal.style.display = "flex";
    list.innerHTML = "Loading...";

    try {
        const snap = await database.ref(`users/${myUid}/blocked`).once("value");
        if (!snap.exists()) {
            list.innerHTML = `<div style="text-align:center; color:#8696a0; padding:20px;">No blocked users</div>`;
            return;
        }

        list.innerHTML = "";
        const uids = Object.keys(snap.val());

        for (const uid of uids) {
            const userSnap = await database.ref(`users/${uid}`).once("value");
            const user = userSnap.val();
            if (user) {
                const item = document.createElement("div");
                item.className = "contact-item";
                item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                item.innerHTML = `
                    <img src="${user.photo || defaultPic}" class="contact-pic">
                    <div class="contact-info">
                        <strong>${user.username}</strong>
                    </div>
                    <button onclick="unblockUser('${uid}')" style="background:#f15c6d; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; margin-left:auto;">Unblock</button>
                `;
                list.appendChild(item);
            }
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = "Error loading blocked users";
    }
};

window.closeBlockedList = function() {
    const modal = document.getElementById("blocked-list-modal");
    if (modal) modal.style.display = "none";
};

console.log(
    "Main Ready"
);