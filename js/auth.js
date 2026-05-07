window.registerUserFromPage = function () {
    const handle = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;

    if (!handle) return alert("Register: Please choose a username.");
    if (!email || pass.length < 6) {
        return alert("Register: Requires valid email and 6+ character password.");
    }

    const username = cleanName(handle);

    // Check if username is taken using the 'usernames' index node
    console.log("Auth: Checking if username is taken:", username);
    database.ref('usernames/' + username).once('value').then(snapshot => {
        if (snapshot.exists()) {
            console.warn("Auth: Username taken:", username);
            throw new Error(`Username @${username} is taken.`);
        }
        console.log("Auth: Username available. Creating Firebase Auth account...");
        return auth.createUserWithEmailAndPassword(email, pass);
    }).then(userCredential => {
        const uid = userCredential.user.uid;
        console.log("Auth: Account created. UID:", uid);
        console.log("DB: Provisioning user and indexing username...");
        
        const userData = {
            uid: uid,
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
        };

        // Also update Auth profile display name
        userCredential.user.updateProfile({ displayName: username }).catch(e => console.warn("Auth: Could not update profile display name", e));

        // Atomic write to both nodes
        const updates = {};
        updates['users/' + uid] = userData;
        updates['usernames/' + username] = uid;

        return database.ref().update(updates).then(() => {
            console.log("DB: Registration success for", username);
            return userData;
        }).catch(dbErr => {
            console.error("DB Error during registration:", dbErr);
            throw new Error("Failed to save user profile: " + dbErr.message);
        });
    }).then(() => {
        console.log("Auth: Registration complete. Redirecting...");
        alert(`Account Verified! Welcome @${username}. Please log in now.`);
        window.location.href = "index.html";
    }).catch(error => {
        console.error("Registration Process Exception:", error);
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
        const uid = userCredential.user.uid;
        const authEmail = userCredential.user.email;
        log("Auth: Success. UID: " + uid);

        log("DB: Fetching user profile...");
        const snap = await database.ref('users/' + uid).once('value');
        
        if (snap.exists()) {
            const userData = snap.val();
            proceedLogin(uid, userData.username, authEmail);
            resetBtn();
            return;
        }

        // Fallback for old users registered with username as key
        log("DB: Profile not found by UID, checking legacy searchIndex...");
        let legacySnap = await database.ref('users').orderByChild('searchIndex').equalTo(authEmail.toLowerCase()).once('value');
        if (legacySnap.exists()) {
            legacySnap.forEach(child => {
                const oldUsername = child.key;
                const oldData = child.val();
                log("DB: Legacy profile found (@" + oldUsername + "). Migrating...");
                
                // Migrate to UID-based node
                const updates = {};
                updates['users/' + uid] = {
                    ...oldData,
                    uid: uid,
                    username: oldUsername
                };
                updates['usernames/' + oldUsername] = uid;
                updates['users/' + oldUsername] = null; // Equivalent to remove()
                
                database.ref().update(updates);
                
                // Update Auth profile display name
                userCredential.user.updateProfile({ displayName: oldUsername }).catch(e => console.warn("Auth: Could not update legacy profile name", e));
                
                proceedLogin(uid, oldUsername, authEmail);
            });
            resetBtn();
            return;
        }

        resetBtn();
        log("Error: Profile missing in DB.");
        alert("System Error: Profile association missing.");
        await auth.signOut();
    } catch (err) {
        resetBtn();
        log("<span style='color:#f15c6d'>Exception: " + err.message + "</span>");
        alert("Auth/DB Failed: " + err.message);
    }
};

function proceedLogin(uid, username, finalEmail) {
    myUid = uid;
    myName = username || "User"; // Fallback to avoid empty username
    localStorage.setItem('secureChatUserEmail', finalEmail);
    localStorage.setItem('secureChatUsername', myName);
    localStorage.setItem('secureChatUid', myUid);

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-app').style.display = 'flex';

    bootSystems();
}

window.logoutUser = function () {
    localStorage.removeItem('secureChatUsername');
    localStorage.removeItem('secureChatUserEmail');
    localStorage.removeItem('secureChatUid');
    location.reload();
};

window.changeMyUsername = async function() {
    const newUsername = prompt("Enter new username (no spaces):");
    if (!newUsername) return;

    const cleanNew = newUsername.trim().toLowerCase().replace(/[\.\#\$\[\]\s]/g, "_");
    if (!cleanNew || cleanNew === myName) return;

    try {
        // Check if new username is taken using the 'usernames' index
        const check = await database.ref('usernames/' + cleanNew).once('value');
        if (check.exists()) {
            alert("This username is already taken.");
            return;
        }

        if (!confirm(`Are you sure you want to change your username to @${cleanNew}? Your permanent ID remains the same, so your chats will not be lost.`)) return;

        showToast("Updating username...", "info");

        const oldName = myName;
        const updates = {};
        updates['users/' + myUid + '/username'] = cleanNew;
        updates['usernames/' + cleanNew] = myUid;
        updates['usernames/' + oldName] = null; // Free up the old username

        await database.ref().update(updates);

        // Update local storage and global variable
        localStorage.setItem('secureChatUsername', cleanNew);
        myName = cleanNew; // Update global variable

        alert("Username changed successfully! The app will now reload.");
        location.reload();
    } catch (e) {
        console.error("Update Error:", e);
        alert("Failed to change username: " + e.message);
    }
};
