let notifiedMessages = {};
let notifiedRequests = 0;

const isNativeAndroid = () => {
    return typeof Capacitor !== "undefined" && Capacitor.getPlatform && Capacitor.getPlatform() === "android";
};

const getCapacitorPlugin = name => {
    if (typeof Capacitor === "undefined" || !Capacitor.Plugins) {
        return null;
    }
    return Capacitor.Plugins[name] || null;
};

window.createNotificationChannels = async function () {
    if (!isNativeAndroid()) {
        return;
    }

    const LocalNotifications = getCapacitorPlugin("LocalNotifications");

    if (!LocalNotifications || !LocalNotifications.createChannel) {
        return;
    }

    try {
        await LocalNotifications.createChannel({
            id: "messages",
            name: "Messages",
            description: "Secure Chat message notifications",
            importance: 4,
            sound: "default"
        });

        await LocalNotifications.createChannel({
            id: "calls",
            name: "Calls",
            description: "Incoming call alerts",
            importance: 5,
            sound: "default"
        });

        await LocalNotifications.createChannel({
            id: "missed_calls",
            name: "Missed Calls",
            description: "Missed call notifications",
            importance: 3,
            sound: "default"
        });
    } catch (e) {
        console.warn("Unable to create notification channels", e);
    }
};

window.requestAndroidPermissions = async function () {
    if (!isNativeAndroid()) {
        return;
    }

    const Permissions = getCapacitorPlugin("Permissions");
    const PushNotifications = getCapacitorPlugin("PushNotifications");

    if (Permissions && Permissions.request) {
        const permissionNames = [
            "camera",
            "microphone",
            "notifications",
            "bluetooth",
            "location"
        ];

        for (const name of permissionNames) {
            try {
                await Permissions.request({ name });
            } catch (e) {
                console.warn("Permission request failed:", name, e);
            }
        }
    }

    if (Notification.permission === "default") {
        try {
            await Notification.requestPermission();
        } catch (e) {
            console.warn("Notification permission error", e);
        }
    }

    try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (e) {
        console.warn("WebRTC permission request failed", e);
    }

    if (PushNotifications && PushNotifications.requestPermissions) {
        try {
            const permission = await PushNotifications.requestPermissions();
            if (permission.receive === "granted") {
                await registerPushNotifications();
            }
        } catch (e) {
            console.warn("Push notification permission error", e);
        }
    }
};

window.registerPushNotifications = async function () {
    const PushNotifications = getCapacitorPlugin("PushNotifications");

    if (!isNativeAndroid() || !PushNotifications) {
        return;
    }

    try {
        await PushNotifications.register();
    } catch (e) {
        console.warn("Push registration failed", e);
        return;
    }

    PushNotifications.addListener("registration", token => {
        console.log("Push registration token:", token.value);
        if (myUid && database) {
            database.ref(`users/${myUid}/fcmTokens/${token.value}`).set({
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });

    PushNotifications.addListener("registrationError", err => {
        console.error("Push registration error:", err);
    });

    PushNotifications.addListener("pushNotificationReceived", notification => {
        if (!appSettings.notifications) return;
        showBrowserNotification(
            notification.title || "Secure Chat",
            notification.body || "Incoming notification"
        );
    });

    PushNotifications.addListener("pushNotificationActionPerformed", event => {
        console.log("Push notification action performed", event);
    });
};

window.initializeNotifications =
async function () {
    if (isNativeAndroid()) {
        await createNotificationChannels();
        await requestAndroidPermissions();
        await registerPushNotifications();
        return;
    }

    if (!("Notification" in window)) {
        return;
    }

    if (Notification.permission === "default") {
        try {
            await Notification.requestPermission();
        } catch (e) {
            console.error(e);
        }
    }
};

/* SHOW */

window.showBrowserNotification =
function (
    title,
    body,
    icon = "assets/icons/icon-192.png"
) {

    if (
        !appSettings.notifications
    ) return;

    if (
        Notification.permission !==
        "granted"
    ) return;

    const notification =
        new Notification(
            title,
            {
                body,
                icon,
                badge: icon
            }
        );

    notification.onclick =
        () => {

            window.focus();

            notification.close();
        };
};

/* MESSAGE */

window.listenMessageNotifications =
function () {

    database
        .ref("chats")
        .on(
            "child_added",
            roomSnap => {

                const roomId =
                    roomSnap.key;

                if (
                    !roomId.includes(
                        myUid
                    )
                ) return;

                database
                    .ref(
                        `chats/${roomId}`
                    )
                    .limitToLast(1)
                    .on(
                        "child_added",
                        snap => {

                            const key =
                                snap.key;

                            const data =
                                snap.val();

                            if (
                                !data
                            ) return;

                            /* OWN */

                            if (
                                data.senderUid ===
                                myUid
                            ) return;

                            /* DUPLICATE */

                            if (
                                notifiedMessages[key]
                            ) return;

                            notifiedMessages[key] =
                                true;

                            /* NEW MESSAGE CHECK - Only notify if message is less than 10 seconds old */
                            const now = Date.now();
                            const msgTime = data.timestamp || 0;
                            if (now - msgTime > 10000) return;

                            /* ACTIVE CHAT */

                            if (
                                activeRecipientUid ===
                                data.senderUid
                            ) return;

                            let body =
                                "New Message";

                            if (
                                data.type ===
                                "image"
                            ) {

                                body =
                                    "📷 Photo";
                            }

                            else if (
                                data.type ===
                                "video"
                            ) {

                                body =
                                    "📹 Video";
                            }

                            else if (
                                data.type ===
                                "audio"
                            ) {

                                body =
                                    "🎤 Voice message";
                            }

                            else {

                                body =
                                    decodeMsg(
                                        data.text
                                    );
                            }

                            showBrowserNotification(
                                data.sender || "New Message",
                                body
                            );

                            playNotificationSound();
                        }
                    );
            }
        );

    /* REQUESTS */

    database
        .ref(
            `users/${myUid}/requests`
        )
        .on(
            "value",
            snap => {

                const count =
                    snap.exists()
                    ?
                    snap.numChildren()
                    :
                    0;

                if (
                    count >
                    notifiedRequests
                ) {

                    showBrowserNotification(

                        "New Request",

                        `${count} pending requests`
                    );

                    playNotificationSound();
                }

                notifiedRequests =
                    count;
            }
        );
};

/* CALL */

window.showIncomingCallNotification =
async function (
    caller
) {
    if (appSettings.notifications && isNativeAndroid()) {
        const LocalNotifications = getCapacitorPlugin("LocalNotifications");
        if (LocalNotifications && LocalNotifications.schedule) {
            try {
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title: "Incoming Call",
                            body: `${caller} is calling you`,
                            id: Date.now() % 100000,
                            channelId: "calls"
                        }
                    ]
                });
            } catch (e) {
                console.warn("Local notification failed", e);
            }
        }
    }

    showBrowserNotification(
        "Incoming Call",
        `${caller} is calling you`
    );

    /* SOUND */

    if (
        appSettings.callSound
    ) {

        try {

            const ctx =
                new (
                    window.AudioContext ||
                    window.webkitAudioContext
                )();

            const osc =
                ctx.createOscillator();

            const gain =
                ctx.createGain();

            osc.connect(gain);

            gain.connect(
                ctx.destination
            );

            osc.type =
                "triangle";

            osc.frequency
                .setValueAtTime(
                    500,
                    ctx.currentTime
                );

            osc.frequency
                .exponentialRampToValueAtTime(
                    900,
                    ctx.currentTime + 0.3
                );

            gain.gain
                .setValueAtTime(
                    0,
                    ctx.currentTime
                );

            gain.gain
                .linearRampToValueAtTime(
                    0.2,
                    ctx.currentTime + 0.1
                );

            gain.gain
                .linearRampToValueAtTime(
                    0,
                    ctx.currentTime + 0.5
                );

            osc.start();

            osc.stop(
                ctx.currentTime + 0.5
            );

        } catch (e) {}
    }
};

console.log(
    "Notifications Ready"
);