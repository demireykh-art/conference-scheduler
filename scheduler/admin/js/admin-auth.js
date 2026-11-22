/**
 * admin-auth.js — Google 로그인 (기존 Firebase 프로젝트 재사용)
 * - 편집은 로그인 필요, 조회는 열람 가능
 * - 기존 /users 승인 체계(admin/editor/pending)와 호환
 * 의존: config.js (window.auth, window.database, AppConfig)
 */

window.AdminAuth = {
    user: null,
    role: null,        // 'admin' | 'editor' | 'pending' | null
    canPublishFlag: false,   // /users/<uid>/canPublish — 홈페이지 공개 조작 권한
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

    /** 홈페이지 공개(연결) 버튼을 조작할 수 있는가 — 관리자이거나 권한 부여된 계정 */
    canPublish() {
        if (!this.user) return false;
        if (this.role === 'pending') return false;
        if (this.isAdmin()) return true;
        return this.canPublishFlag === true;
    },

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
    // 항상 계정 선택창을 띄워 다른 구글 계정으로 로그인할 수 있게 함(이전 계정 자동 로그인 방지)
    provider.setCustomParameters({ prompt: 'select_account' });
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

// 이메일 → Firebase 키 안전 문자열 (사전승인 조회용)
window.emailKey = function (email) {
    return (email || '').trim().toLowerCase().replace(/[.#$/\[\]]/g, ',');
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
            return;
        }
        const base = {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        };
        if (user.email === AppConfig.SUPER_ADMIN_EMAIL) {
            ref.set({ ...base, role: 'admin' });
            return;
        }
        // 사전 승인(preApproved) 확인 — 있으면 그 역할로 바로 승인
        const pRef = database.ref('/preApproved/' + emailKey(user.email));
        pRef.once('value').then(ps => {
            const pv = ps.val();
            const role = (pv && (pv.role === 'admin' || pv.role === 'editor')) ? pv.role : 'pending';
            ref.set({ ...base, role }).then(() => {
                if (role !== 'pending') pRef.remove().catch(() => { });   // 사용됨 → 정리
            });
        }).catch(() => { ref.set({ ...base, role: 'pending' }); });   // 조회 불가 시 승인대기
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
                <h2>ASLS 행사 관리</h2>
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
        database.ref(`/users/${user.uid}/canPublish`).on('value', snap => {
            AdminAuth.canPublishFlag = snap.val() === true;
            document.dispatchEvent(new CustomEvent('admin-auth-change'));
        });
    } else {
        AdminAuth.role = null;
        AdminAuth.canPublishFlag = false;
        updateSidebarUser();
        document.dispatchEvent(new CustomEvent('admin-auth-change'));
    }
    updateSidebarUser();
    AdminAuth._cbs.forEach(cb => cb());
    AdminAuth._cbs = [];
});

/* ---------- 연락처 비공개 저장소 (2026-11) ----------
 * 연자 이메일·전화 → /adminSpeakerContacts/<speakerId> = { email, phone }
 * 참여사 담당자     → /adminPartnerContacts/<confId>/<partnerId> = [{ name, phone, email }]
 * 두 경로는 DB 규칙에서 관리자·편집자만 읽고 쓴다. (/adminSpeakers, /adminConferences 는 홈페이지용 공개 읽기)
 * 규칙이 아직 없으면(읽기 거부) ready=false → 예전 위치(공개 레코드)에 그대로 저장해 기능이 끊기지 않게 한다.
 */
window.Contacts = {
    ready: false, spk: {}, partner: {}, _on: false,
    watch() {
        const ok = !!(AdminAuth.user && (AdminAuth.role === 'admin' || AdminAuth.role === 'editor'));
        if (ok && !this._on) {
            this._on = true;
            database.ref('/adminSpeakerContacts').on('value', s => { this.spk = s.val() || {}; this.ready = true; this._emit(); },
                () => { this.ready = false; this._on = false; this._emit(); });
            database.ref('/adminPartnerContacts').on('value', s => { this.partner = s.val() || {}; this._emit(); }, () => { });
        } else if (!ok && this._on) {
            database.ref('/adminSpeakerContacts').off(); database.ref('/adminPartnerContacts').off();
            this._on = false; this.ready = false; this.spk = {}; this.partner = {}; this._emit();
        }
    },
    _emit() { document.dispatchEvent(new CustomEvent('contacts-change')); },
    of(s) { const c = (s && this.spk[s.id]) || {}; return { email: c.email || (s && s.email) || '', phone: c.phone || (s && s.phone) || '' }; },
    merge(arr) { (arr || []).forEach(s => { const c = this.of(s); s.email = c.email; s.phone = c.phone; }); return arr; },
    // 연자 저장 직전: 비공개 칸이 열려 있으면 연락처를 거기 쓰고, 공개 레코드에서는 지운 data 를 돌려준다
    async splitSpeaker(id, data) {
        if (!this.ready || !data || !('email' in data || 'phone' in data)) return data;
        const cur = this.spk[id] || {};
        const c = { email: 'email' in data ? (data.email || '') : (cur.email || ''), phone: 'phone' in data ? (data.phone || '') : (cur.phone || '') };
        await database.ref('/adminSpeakerContacts/' + id).set((c.email || c.phone) ? c : null);
        return Object.assign({}, data, { email: null, phone: null });
    },
    partnerOf(cid, conf) { return Object.assign({}, (conf && conf.partnerContacts) || {}, (cid && this.partner[cid]) || {}); },
    async savePartner(cid, pid, list) {
        const v = (list && list.length) ? list : null;
        if (this.ready) {
            await database.ref(`/adminPartnerContacts/${cid}/${pid}`).set(v);
            await database.ref(`/adminConferences/${cid}/partnerContacts/${pid}`).remove();
        } else await database.ref(`/adminConferences/${cid}/partnerContacts/${pid}`).set(v);
    },
    // 1회 이전: 공개 레코드에 남은 연락처를 비공개 칸으로 옮기고 원본에서 삭제 (관리자)
    async migrate() {
        if (!AdminAuth.isAdmin()) { Toast.error('관리자만 실행할 수 있습니다.'); return; }
        if (!this.ready) { Toast.error('DB 규칙에 adminSpeakerContacts·adminPartnerContacts 가 아직 없습니다. 규칙을 먼저 추가해 주세요.'); return; }
        const spk = (await database.ref('/adminSpeakers').once('value')).val() || {};
        const confs = (await database.ref('/adminConferences').once('value')).val() || {};
        const up = {}; let ns = 0, np = 0;
        Object.entries(spk).forEach(([id, s]) => {
            if (!s || (s.email == null && s.phone == null)) return;
            const cur = this.spk[id] || {}, c = { email: cur.email || s.email || '', phone: cur.phone || s.phone || '' };
            if (c.email || c.phone) up['adminSpeakerContacts/' + id] = c;
            up['adminSpeakers/' + id + '/email'] = null; up['adminSpeakers/' + id + '/phone'] = null; ns++;
        });
        Object.entries(confs).forEach(([cid, c]) => {
            const pc = c && c.partnerContacts; if (!pc) return;
            Object.entries(pc).forEach(([pid, list]) => { if (!(this.partner[cid] || {})[pid]) up[`adminPartnerContacts/${cid}/${pid}`] = list; np++; });
            up[`adminConferences/${cid}/partnerContacts`] = null;
        });
        if (!Object.keys(up).length) { Toast.info('옮길 연락처가 없습니다. 이미 비공개입니다.'); return; }
        const ok = await confirmDialog(`공개 레코드에 남은 연락처를 비공개 칸으로 옮깁니다.\n- 연자 ${ns}명 이메일·전화\n- 참여사 담당자 ${np}건\n(먼저 💾 연자 백업을 받아두세요)`, { okText: '이전 실행' });
        if (!ok) return;
        await database.ref().update(up);
        if (window.logActivity) logActivity('update', 'speaker', `연락처 비공개 이전 — 연자 ${ns}명, 참여사 담당자 ${np}건`, {});
        Toast.success(`연락처를 비공개로 옮겼습니다. (연자 ${ns}명 · 참여사 ${np}건)`);
    }
};
document.addEventListener('admin-auth-change', () => Contacts.watch());
window.migrateContacts = () => Contacts.migrate().catch(e => Toast.error('이전 실패: ' + (e.message || e)));

console.log('✅ admin-auth.js 로드 완료');
