/* LOGIN / REGISTER */

window.showRegister = function () {

    document.getElementById(
        "login-card"
    ).style.display = "none";

    document.getElementById(
        "register-card"
    ).style.display = "flex";
};

let cameraStream = null;
let currentCameraFacing = "user"; // "user" or "environment"
let capturedBlob = null;

window.openCamera = async function() {
    document.getElementById("camera-modal").style.display = "flex";
    await startCameraStream();
};

async function startCameraStream() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentCameraFacing },
            audio: false
        });
        document.getElementById("camera-video").srcObject = cameraStream;
    } catch (e) {
        console.error(e);
        showToast("Camera access denied", "error");
        closeCamera();
    }
}

window.closeCamera = function() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById("camera-modal").style.display = "none";
    document.getElementById("photo-preview-overlay").style.display = "none";
};

window.flipCamera = async function() {
    currentCameraFacing = currentCameraFacing === "user" ? "environment" : "user";
    await startCameraStream();
};

window.capturePhoto = function() {
    const video = document.getElementById("camera-video");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    
    // If front camera, flip horizontally for natural look
    if (currentCameraFacing === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(blob => {
        capturedBlob = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById("captured-image-preview").src = url;
        document.getElementById("photo-preview-overlay").style.display = "block";
    }, "image/jpeg", 0.9);
};

window.cancelPhotoPreview = function() {
    document.getElementById("photo-preview-overlay").style.display = "none";
    capturedBlob = null;
};

window.sendCapturedPhoto = async function() {
    if (!capturedBlob) return;
    
    const file = new File([capturedBlob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    closeCamera();
    await sendFile(file);
};

window.showLogin = function () {

    document.getElementById(
        "register-card"
    ).style.display = "none";

    document.getElementById(
        "login-card"
    ).style.display = "flex";
};

/* ADD CONTACT */

window.promptAddContact =
function () {

    document.getElementById(
        "add-contact-modal"
    ).style.display = "flex";

    document.getElementById(
        "new-contact-username"
    ).value = "";

    document.getElementById(
        "add-contact-error"
    ).style.display = "none";
};

window.triggerProfileUpload = function() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                showToast("Uploading photo...");
                const url = await uploadToCloudinary(file, "profile_media");
                await database.ref("users/" + myUid).update({
                    photo: url
                });
                showToast("Profile photo updated");
                // Update modal view immediately
                document.getElementById("profile-photo-view").src = url;
            } catch (error) {
                console.error("Photo upload error:", error);
                showToast("Failed to update photo", "error");
            }
        }
    };
    input.click();
};

window.closeAddContactModal =
function () {

    document.getElementById(
        "add-contact-modal"
    ).style.display = "none";
};

/* SEND REQUEST */

window.confirmAddContact =
async function () {

    const raw =
        document.getElementById(
            "new-contact-username"
        ).value;

    const username =
        cleanName(raw);

    const error =
        document.getElementById(
            "add-contact-error"
        );

    if (!username) {

        error.innerText =
            "Enter username";

        error.style.display =
            "block";

        return;
    }

    if (
        username === myName
    ) {

        error.innerText =
            "Cannot add yourself";

        error.style.display =
            "block";

        return;
    }

    try {

        const snap =
            await database
                .ref(
                    "usernames/" +
                    username
                )
                .once("value");

        if (!snap.exists()) {

            error.innerText =
                "User not found";

            error.style.display =
                "block";

            return;
        }

        const targetUid =
            snap.val();

        const already =
            await database
                .ref(
                    `users/${myUid}/contacts/${targetUid}`
                )
                .once("value");

        if (
            already.exists()
        ) {

            showToast(
                "Already added",
                "error"
            );

            return;
        }

        await database
            .ref(
                `users/${targetUid}/requests/${myUid}`
            )
            .set({

                username:
                    myName,

                timestamp:
                    firebase.database.ServerValue.TIMESTAMP
            });

        closeAddContactModal();

        showToast(
            "Request sent"
        );

    } catch (e) {

        console.error(e);

        showToast(
            "Request failed",
            "error"
        );
    }
};

/* REQUESTS */

window.openRequestsModal =
function () {

    document.getElementById(
        "requests-modal"
    ).style.display =
        "flex";
};

window.closeRequestsModal =
function () {

    document.getElementById(
        "requests-modal"
    ).style.display =
        "none";
};

/* IMAGE */

window.openFullImage =
function (url) {

    document.getElementById(
        "image-modal"
    ).style.display =
        "flex";

    const img = document.getElementById(
        "full-image"
    );
    img.src = url;
    img.onerror = function() {
        this.src = 'assets/icons/icon-192.png';
        this.style.opacity = '0.5';
    };
};

document
    .getElementById(
        "image-modal"
    )
    .onclick =
    function () {

        this.style.display =
            "none";
    };

/* FILTER */

window.filterContacts =
function () {

    const term =
        document
            .getElementById(
                "contact-search"
            )
            .value
            .toLowerCase();

    const rows =
        document.querySelectorAll(
            ".contact-item"
        );

    rows.forEach(row => {

        const text =
            row.innerText
            .toLowerCase();

        row.style.display =
            text.includes(term)
            ?
            "flex"
            :
            "none";
    });
};

/* ENTER SEND */

document.addEventListener(
    "keydown",
    e => {

        const input =
            document.getElementById(
                "message-input"
            );

        if (
            e.key === "Enter" &&
            document.activeElement === input
        ) {

            e.preventDefault();

            sendMessage();
        }
    }
);

/* VOICE RECORD */

window.toggleVoiceRecord =
async function () {

    const btn =
        document.getElementById(
            "voice-btn"
        );

    if (!isRecording) {

        try {

            const stream =
                await navigator
                    .mediaDevices
                    .getUserMedia({

                        audio: true
                    });

            mediaRecorder =
                new MediaRecorder(
                    stream
                );

            audioChunks = [];

            mediaRecorder.ondataavailable =
                e => {

                    audioChunks.push(
                        e.data
                    );
                };

            mediaRecorder.onstop =
                async () => {

                    const blob =
                        new Blob(
                            audioChunks,
                            {
                                type:
                                    "audio/webm"
                            }
                        );

                    const file =
                        new File(
                            [blob],
                            "voice.webm",
                            {
                                type:
                                    "audio/webm"
                            }
                        );

                    await sendFile(
                        file
                    );

                    stream
                        .getTracks()
                        .forEach(track =>
                            track.stop()
                        );
                };

            mediaRecorder.start();

            isRecording = true;

            btn.innerText =
                "⏹";

            btn.style.background =
                "#f15c6d";

            showToast(
                "Recording..."
            );

        } catch (e) {

            console.error(e);

            showToast(
                "Mic permission denied",
                "error"
            );
        }
    }

    else {

        mediaRecorder.stop();

        isRecording = false;

        btn.innerText =
            "🎤";

        btn.style.background =
            "";
    }
};

/* SCREENSHOT DETECT */

window.addEventListener(
    "keyup",
    e => {

        if (
            e.key ===
            "PrintScreen"
        ) {

            if (
                isSensitiveChatEnabled
            ) {

                showToast(
                    "Screenshot detected",
                    "error"
                );
            }
        }
    }
);

/* MOBILE BACK */

window.addEventListener(
    "popstate",
    () => {

        const chat =
            document.querySelector(
                ".chat-area"
            );

        if (
            window.innerWidth < 900
        ) {

            chat.classList.remove(
                "active"
            );
        }
    }
);

/* BACK BUTTON */

window.goBackToContacts =
function () {

    const chat =
        document.querySelector(
            ".chat-area"
        );

    if (chat) {
        chat.classList.remove("active");
    }

    // Hide back button
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.style.display = "none";
    }

    activeRecipientUid = "";
    activeRecipient = "";

    // Show welcome screen, hide chat box, input area and topbar
    document.getElementById("chat-box").style.display = "none";
    document.querySelector(".chat-input-area").style.display = "none";
    document.querySelector(".chat-topbar").style.visibility = "hidden";
    const welcome = document.getElementById("welcome-screen");
    if (welcome) welcome.style.display = "flex";
};

/* PROFILE PHOTO MODAL */

let profilePhotoModal_uid = "";
let profilePhotoModal_username = "";

window.openProfilePhotoModal =
function (uid) {

    const targetUid = (uid === 'me') ? myUid : activeRecipientUid;

    if (!targetUid) return;

    const modal = document.getElementById("profile-photo-modal");
    if (!modal) return;

    modal.style.display = "flex";

    // Get target user's data
    database.ref("users/" + targetUid).once("value", snap => {

        const user = snap.val();
        if (!user) return;

        document.getElementById("profile-photo-view").src = user.photo || defaultPic;
        document.getElementById("profile-name").innerText = (targetUid === myUid) ? user.username + " (You)" : user.username || "User";

        // Show/hide upload button
        const actions = document.getElementById("profile-actions-container");
        if (actions) {
            actions.style.display = (targetUid === myUid) ? "flex" : "none";
        }

        let status = user.status || "Offline";
        if (targetUid !== myUid && user.typing === myUid) {
            status = "typing...";
        }
        if (user.status === "Offline" && user.lastSeen) {
            status = "Last seen " + getTS(user.lastSeen);
        }

        document.getElementById("profile-status").innerText = status;
    });
};

// Close profile photo modal on click outside
document.addEventListener("click", (e) => {

    const modal = document.getElementById("profile-photo-modal");
    if (modal && e.target === modal) {
        modal.style.display = "none";
    }
});

/* SETTINGS MENU */

window.openSettingsMenu =
function () {

    const menu = document.getElementById("settings-menu");
    if (!menu) return;

    const isVisible = menu.style.display !== "none";
    menu.style.display = isVisible ? "none" : "flex";
    menu.style.flexDirection = "column";
};

// Close settings menu when clicking outside
document.addEventListener("click", (e) => {

    // Close sidebar settings menu
    const btn = document.querySelector(".sidebar-top .settings-btn");
    const menu = document.getElementById("settings-menu");

    if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = "none";
    }

    // Also close chat settings menu
    const chatMenu = document.getElementById("chat-settings-menu");
    const chatBtn = document.querySelector(".chat-topbar .settings-btn");
    if (chatMenu && chatBtn && !chatBtn.contains(e.target) && !chatMenu.contains(e.target)) {
        chatMenu.style.display = "none";
    }

    // Close message menu
    const msgMenu = document.querySelector(".msg-menu");
    if (msgMenu && !msgMenu.contains(e.target)) {
        msgMenu.remove();
    }
});

window.toggleChatSettingsMenu = function() {
    const menu = document.getElementById("chat-settings-menu");
    if (!menu) return;
    const isVisible = menu.style.display === "flex";
    menu.style.display = isVisible ? "none" : "flex";
};

window.confirmUnfriend = function() {
    if (!activeRecipientUid) return;
    
    if (confirm(`Are you sure you want to remove ${activeRecipient} from your contacts?`)) {
        unfriendContact();
    }
};

window.unfriendContact = async function() {
    const uid = activeRecipientUid;
    if (!uid) return;

    try {
        await database.ref(`users/${myUid}/contacts/${uid}`).remove();
        await database.ref(`users/${uid}/contacts/${myUid}`).remove();
        
        showToast("Contact removed");
        goBackToContacts();
        
        // Settings menu should close
        document.getElementById("chat-settings-menu").style.display = "none";
    } catch (e) {
        console.error(e);
        showToast("Failed to remove contact", "error");
    }
};

console.log(
    "System: UI Ready"
);