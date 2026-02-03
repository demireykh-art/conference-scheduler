/**
 * auth.js - Firebase 인증 및 사용자 관리
 */

let sessionTimeoutId = null;
let lastActivityTime = Date.now();

/**
 * Google 로그인
 */
window.signInWithGoogle = function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            console.log('로그인 성공:', result.user.email);
            registerOrCheckUser(result.user);
        })
        .catch((error) => {
            console.error('로그인 에러:', error);
            Toast.error('로그인 실패: ' + error.message);
        });
};

/**
 * 로그아웃
 */
window.signOut = function() {
    auth.signOut().then(() => {
        console.log('로그아웃됨');
        AppState.currentUserRole = null;
    });
};

/**
 * 사용자 등록 또는 확인
 */
window.registerOrCheckUser = function(user) {
    const userRef = database.ref(`/users/${user.uid}`);

    userRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            userRef.update({
                lastLogin: firebase.database.ServerValue.TIMESTAMP,
                displayName: user.displayName,
                photoURL: user.photoURL
            });
        } else {
            const isSuperAdmin = user.email === AppConfig.SUPER_ADMIN_EMAIL;
            userRef.set({
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                role: isSuperAdmin ? 'admin' : 'pending',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastLogin: firebase.database.ServerValue.TIMESTAMP
            });

            if (!isSuperAdmin) {
                console.log('새 사용자 - 승인 대기 중');
            }
        }
    });
};

/**
 * 세션 타임아웃 리셋
 */
window.resetSessionTimeout = function() {
    lastActivityTime = Date.now();

    if (sessionTimeoutId) {
        clearTimeout(sessionTimeoutId);
    }

    sessionTimeoutId = setTimeout(() => {
        if (AppState.currentUser) {
            Toast.warning('⏰ 보안을 위해 2시간 동안 활동이 없어 자동 로그아웃됩니다.');
            signOut();
        }
    }, AppConfig.SESSION_TIMEOUT);
};

/**
 * 사용자 활동 감지 설정
 */
window.setupActivityListeners = function() {
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
        document.addEventListener(event, () => {
            if (Date.now() - lastActivityTime > 60000) {
                resetSessionTimeout();
            }
        }, { passive: true });
    });
};

/**
 * 인증 상태 리스너
 */
auth.onAuthStateChanged((user) => {
    AppState.currentUser = user;

    if (user) {
        document.getElementById('loginOverlay').classList.add('hidden');
        resetSessionTimeout();
        listenToUserRole(user);
        registerOnlinePresence(user);
        startRealtimeListeners();
        registerOrCheckUser(user);
        console.log('로그인됨:', user.email);
    } else {
        document.getElementById('loginOverlay').classList.remove('hidden');
        AppState.currentUserRole = null;
        updateAuthUI(null);

        if (sessionTimeoutId) {
            clearTimeout(sessionTimeoutId);
            sessionTimeoutId = null;
        }
    }
});

/**
 * 사용자 역할 실시간 리스너
 */
window.listenToUserRole = function(user) {
    database.ref(`/users/${user.uid}/role`).on('value', (snapshot) => {
        AppState.currentUserRole = snapshot.val();
        updateAuthUI(user);
        updatePendingBadge();
        console.log('사용자 역할:', AppState.currentUserRole);
    });
};

/**
 * 인증 UI 업데이트
 */
window.updateAuthUI = function(user) {
    const authStatus = document.getElementById('authStatus');
    const adminOnlyBtns = document.querySelectorAll('.admin-only-btn');

    if (user) {
        let roleText = '';
        let roleColor = '';

        switch (AppState.currentUserRole) {
            case 'admin':
                roleText = '👑 관리자';
                roleColor = '#f39c12';
                adminOnlyBtns.forEach(btn => btn.style.display = '');
                break;
            case 'editor':
                roleText = '✏️ 편집자';
                roleColor = '#27ae60';
                adminOnlyBtns.forEach(btn => btn.style.display = 'none');
                break;
            case 'pending':
                roleText = '⏳ 승인대기';
                roleColor = '#e74c3c';
                adminOnlyBtns.forEach(btn => btn.style.display = 'none');
                break;
            default:
                roleText = '로딩...';
                roleColor = '#999';
                adminOnlyBtns.forEach(btn => btn.style.display = 'none');
        }

        authStatus.innerHTML = `
            <img class="user-photo" src="${user.photoURL || 'https://via.placeholder.com/28'}" alt="">
            <span class="user-name">${user.displayName || user.email}</span>
            <span style="color:${roleColor}; font-size:0.7rem;">${roleText}</span>
            <button class="logout-btn" onclick="signOut()">로그아웃</button>
        `;
    } else {
        authStatus.innerHTML = `
            <button class="login-btn" onclick="signInWithGoogle()">
                🔐 로그인
            </button>
        `;
        adminOnlyBtns.forEach(btn => btn.style.display = 'none');
    }
};

/**
 * 편집 권한 확인
 */
window.canEdit = function() {
    if (!AppState.currentUser) return false;
    if (AppState.currentUserRole === 'pending') return false;
    if (!AppState.currentUserRole) return true;
    return AppState.currentUserRole === 'admin' || AppState.currentUserRole === 'editor';
};

/**
 * 편집 시도 시 권한 체크
 */
window.checkEditPermission = function() {
    if (!AppState.currentUser) {
        Toast.warning('로그인이 필요합니다.');
        return false;
    }
    if (AppState.currentUserRole === 'pending') {
        Toast.info('⏳ 승인 대기 중입니다.\n관리자의 승인 후 편집이 가능합니다.');
        return false;
    }
    return true;
};

/**
 * 관리자 권한 확인
 */
window.isAdmin = function() {
    return AppState.currentUserRole === 'admin';
};

/**
 * 대기 중인 사용자 수 배지 업데이트
 */
window.updatePendingBadge = function() {
    if (!isAdmin()) {
        document.getElementById('pendingBadge').style.display = 'none';
        return;
    }

    database.ref('/users').orderByChild('role').equalTo('pending').once('value', (snapshot) => {
        const count = snapshot.numChildren();
        const badge = document.getElementById('pendingBadge');

        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
};

/**
 * 온라인 상태 등록
 */
window.registerOnlinePresence = function(user) {
    const userStatusRef = database.ref(`/presence/${user.uid}`);
    const connectedRef = database.ref('.info/connected');

    connectedRef.on('value', (snapshot) => {
        if (snapshot.val() === false) {
            updateSyncStatus('offline');
            return;
        }

        userStatusRef.onDisconnect().remove().then(() => {
            userStatusRef.set({
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            updateSyncStatus('synced');
        });
    });
};

/**
 * 온라인 사용자 리스너
 */
window.listenToOnlineUsers = function() {
    database.ref('/presence').on('value', (snapshot) => {
        const users = snapshot.val() || {};
        const userList = Object.values(users);

        const avatarsDiv = document.getElementById('userAvatars');
        const countSpan = document.getElementById('onlineCount');

        avatarsDiv.innerHTML = userList.slice(0, 5).map(u =>
            `<img class="user-avatar" src="${u.photoURL || 'https://via.placeholder.com/24'}" title="${u.displayName || u.email}">`
        ).join('');

        countSpan.textContent = `${userList.length}명 접속`;
    });
};

/**
 * 동기화 상태 업데이트
 */
window.updateSyncStatus = function(status, text) {
    const statusDiv = document.getElementById('syncStatus');
    const textSpan = document.getElementById('syncText');

    if (!statusDiv || !textSpan) {
        console.log('syncStatus 업데이트:', status, text);
        return;
    }

    statusDiv.className = 'sync-status ' + status;

    switch (status) {
        case 'synced':
            textSpan.textContent = text || '동기화됨';
            break;
        case 'syncing':
            textSpan.textContent = text || '저장 중...';
            break;
        case 'offline':
            textSpan.textContent = text || '오프라인';
            break;
        default:
            textSpan.textContent = text || status;
    }
};

// 초기화
setupActivityListeners();

console.log('✅ auth.js 로드 완료');
