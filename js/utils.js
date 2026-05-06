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

window.playTikSound = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
    } catch (e) {}
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

window.uploadToCloudinary = function(file, isAuto = false, onProgress = null) {
    if (!file) {
        console.warn("Media: No binary data provided.");
        return Promise.resolve(null);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    let resourceType = 'auto';
    if (file.type.startsWith('image/')) resourceType = 'image';
    else if (file.type.startsWith('video/') || isAuto) resourceType = 'video';
    else resourceType = 'raw';

    const uploadEndpoint = CLOUDINARY_URL.replace("/image/upload", `/${resourceType}/upload`);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadEndpoint);
        
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                const percent = Math.round((e.loaded / e.total) * 100);
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                console.log("Media: Success. HTTPS Endpoint:", data.secure_url);
                resolve(data.secure_url || null);
            } else {
                console.error("Media Error:", xhr.statusText);
                reject(new Error(`Media Error: ${xhr.status}`));
            }
        };

        xhr.onerror = () => {
            console.error("Media Engine Fault");
            reject(new Error("Network Error"));
        };
        
        xhr.send(formData);
    });
};
