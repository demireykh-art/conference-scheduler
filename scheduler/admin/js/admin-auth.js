/**
 * admin-auth.js — Google 로그인 (기존 Firebase 프로젝트 재사용)
 * - 편집은 로그인 필요, 조회는 열람 가능
 * - 기존 /users 승인 체계(admin/editor/pending)와 호환
 * 의존: config.js (window.auth, window.database, AppConfig)
 */

window.AdminAuth = {
    user: null,
    role: null,        // 'admin' | 'editor' | 'pending' | null
    _ready: false,
    _cbs: [],

    onReady(cb) {
        if (this._ready) cb();
        else this._cbs.push(cb);
    },

    canEdit() {
        if (!this.user) return false;
        if (this.role === 'pending') return false;
        return true; // admin / editor / (역할 로딩 전 신뢰)
    },

    isAdmin() { return this.role === 'admin'; },

    /** 편집 시도 시 게이트 */
    requireEdit() {
        if (this.canEdit()) return true;
        if (!this.user) {
            openLoginGate();
        } else if (this.role === 'pending') {
            Toast.info('⏳ 승인 대기 중입니다. 관리자 승인 후 편집할 수 있습니다.');
        }
        return false;
    }
};

window.signInWithGoogle = function () {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(res => {
            registerOrCheckUser(res.user);
            closeLoginGate();
        })
        .catch(err => Toast.error('로그인 실패: ' + err.message));
};

window.signOutAdmin = function () {
    auth.signOut().then(() => Toast.info('로그아웃되었습니다.'));
};

function registerOrCheckUser(user) {
    const ref = database.ref(`/users/${user.uid}`);
    ref.once('value').then(snap => {
        if (snap.exists()) {
            ref.update({
                lastLogin: firebase.database.ServerValue.TIMESTAMP,
                displayName: user.displayName,
                photoURL: user.photoURL
            });
        } else {
            const isSuper = user.email === AppConfig.SUPER_ADMIN_EMAIL;
            ref.set({
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                role: isSuper ? 'admin' : 'pending',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastLogin: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }).catch(() => {/* 규칙상 읽기 불가 시 무시 */ });
}

/* ---------- 로그인 게이트 ---------- */
window.openLoginGate = function () {
    let gate = document.getElementById('loginGate');
    if (!gate) {
        gate = document.createElement('div');
        gate.id = 'loginGate';
        gate.className = 'login-gate';
        gate.innerHTML = `
            <div class="login-card">
                <div style="font-size:2.2rem">📅</div>
                <h2>KAFC 행사 관리</h2>
                <p>편집하려면 Google 계정으로 로그인하세요.<br>승인된 사용자만 수정할 수 있습니다.</p>
                <button class="google-btn" onclick="signInWithGoogle()">
                    <img src="https://www.google.com/favicon.ico" alt="G">Google 계정으로 로그인
                </button>
                <div style="margin-top:16px"><button class="btn btn-sm" onclick="closeLoginGate()">닫기</button></div>
            </div>`;
        document.body.appendChild(gate);
    }
    gate.classList.add('open');
};
window.closeLoginGate = function () {
    const g = document.getElementById('loginGate');
    if (g) g.classList.remove('open');
};

/* ---------- 사이드바 유저 영역 ---------- */
function updateSidebarUser() {
    const footer = document.getElementById('sideLogout');
    if (!footer) return;
    if (AdminAuth.user) {
        const name = AdminAuth.user.displayName || AdminAuth.user.email || '';
        const roleLabel = AdminAuth.role === 'admin' ? '👑 관리자'
            : AdminAuth.role === 'editor' ? '✏️ 편집자'
            : AdminAuth.role === 'pending' ? '⏳ 승인대기' : '';
        footer.innerHTML = `
            <div class="side-user" title="클릭하여 로그아웃">
                <img src="${AdminAuth.user.photoURL || 'https://via.placeholder.com/26'}" alt="">
                <div style="line-height:1.3;overflow:hidden">
                    <div style="color:#fff;font-size:0.8rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${escapeHtml(name)}</div>
                    <div style="font-size:0.7rem">${roleLabel}</div>
                </div>
            </div>`;
        footer.onclick = () => signOutAdmin();
    } else {
        footer.textContent = '로그인';
        footer.onclick = () => openLoginGate();
    }
}

/* ---------- 인증 상태 ---------- */
auth.onAuthStateChanged(user => {
    AdminAuth.user = user;
    AdminAuth._ready = true;
    if (user) {
        registerOrCheckUser(user);
        database.ref(`/users/${user.uid}/role`).on('value', snap => {
            AdminAuth.role = snap.val();
            updateSidebarUser();
            document.dispatchEvent(new CustomEvent('admin-auth-change'));
        });
    } else {
        AdminAuth.role = null;
        updateSidebarUser();
        document.dispatchEvent(new CustomEvent('admin-auth-change'));
    }
    updateSidebarUser();
    AdminAuth._cbs.forEach(cb => cb());
    AdminAuth._cbs = [];
});

console.log('✅ admin-auth.js 로드 완료');
