window.registerUserFromPage = function () {
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
        const authEmail = userCredential.user.email;
        log("Auth: Success. Email: " + authEmail);

        log("DB: Querying searchIndex...");
        let snap = await database.ref('users').orderByChild('searchIndex').equalTo(authEmail.toLowerCase()).once('value');
        log("DB: searchIndex snap exists? " + snap.exists());
        if (snap.exists()) { proceedLogin(snap, authEmail); resetBtn(); return; }

        log("DB: Querying exact authEmail...");
        snap = await database.ref('users').orderByChild('email').equalTo(authEmail).once('value');
        log("DB: authEmail snap exists? " + snap.exists());
        if (snap.exists()) { proceedLogin(snap, authEmail); resetBtn(); return; }

        log("DB: Querying raw typed email...");
        snap = await database.ref('users').orderByChild('email').equalTo(email).once('value');
        log("DB: typed email snap exists? " + snap.exists());
        if (snap.exists()) { proceedLogin(snap, authEmail); resetBtn(); return; }

        resetBtn();
        log("Error: Handle missing in DB.");
        alert("System Error: Handle association missing.");
        await auth.signOut();
    } catch (err) {
        resetBtn();
        log("<span style='color:#f15c6d'>Exception: " + err.message + "</span>");
        alert("Auth/DB Failed: " + err.message);
    }
};

function proceedLogin(snapshot, finalEmail) {
    snapshot.forEach(child => {
        myName = child.key;
        localStorage.setItem('secureChatUserEmail', finalEmail);
        localStorage.setItem('secureChatUsername', myName);

        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('chat-app').style.display = 'flex';

        bootSystems();
    });
}

window.logoutUser = function () {
    localStorage.removeItem('secureChatUsername');
    localStorage.removeItem('secureChatUserEmail');
    location.reload();
};

window.changeMyUsername = async function() {
    const newUsername = prompt("Enter new username (no spaces):");
    if (!newUsername) return;
    
    const cleanNew = newUsername.trim().toLowerCase().replace(/[\.\#\$\[\]\s]/g, "_");
    if (!cleanNew || cleanNew === myName) return;

    try {
        const check = await database.ref('users/' + cleanNew).once('value');
        if (check.exists()) {
            alert("This username is already taken.");
            return;
        }

        if (!confirm(`Are you sure? Your friends will need to re-add you as @${cleanNew}.`)) return;

        showToast("Migrating account...", "info");
        
        // 1. Get old data
        const oldDataSnap = await database.ref('users/' + myName).once('value');
        const data = oldDataSnap.val();
        
        // 2. Update username in data
        data.username = cleanNew;
        
        // 3. Write to new node
        await database.ref('users/' + cleanNew).set(data);
        
        // 4. Delete old node
        await database.ref('users/' + myName).remove();
        
        // 5. Update local storage
        localStorage.setItem('secureChatUsername', cleanNew);
        
        alert("Username changed successfully! The app will now reload.");
        location.reload();
    } catch (e) {
        console.error("Migration Error:", e);
        alert("Failed to change username: " + e.message);
    }
};
