/**
 * users.js — 사용자 관리 (승인/역할)
 * 데이터: /users/<uid> = { email, displayName, photoURL, role, createdAt, lastLogin }
 * 관리자(admin)만 접근. 최고관리자: AppConfig.SUPER_ADMIN_EMAIL
 */

document.getElementById('sidebarMount').innerHTML = renderSidebar('users');

let USERS = [];
let USER_SEARCH = '';
let usersSub = null;

document.getElementById('userSearch').addEventListener('input', e => {
    USER_SEARCH = e.target.value.trim().toLowerCase();
    renderUsers();
});

const ROLE_LABEL = { admin: '관리자', editor: '편집자', pending: '승인대기' };
const ROLE_BADGE = { admin: 'role-admin', editor: 'role-editor', pending: 'role-pending' };

function gate() {
    const notice = document.getElementById('usersNotice');
    const area = document.getElementById('usersArea');
    const stop = () => { if (usersSub) { usersSub.off(); usersSub = null; } };

    if (!AdminAuth.user) {
        notice.innerHTML = '이 페이지는 로그인이 필요합니다. <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="openLoginGate()">로그인</button>';
        notice.style.display = ''; area.style.display = 'none'; stop(); return;
    }
    if (AdminAuth.role && !AdminAuth.isAdmin()) {
        notice.innerHTML = `승인 권한이 있는 <b>관리자</b>만 접근할 수 있습니다.<br>현재 계정: ${escapeHtml(AdminAuth.user.email || '')} (${ROLE_LABEL[AdminAuth.role] || AdminAuth.role})`;
        notice.style.display = ''; area.style.display = 'none'; stop(); return;
    }
    if (!AdminAuth.role) { // 역할 로딩 중
        notice.textContent = '권한 확인 중…';
        notice.style.display = ''; area.style.display = 'none'; return;
    }
    // admin
    notice.style.display = 'none'; area.style.display = '';
    if (!usersSub) {
        usersSub = database.ref('/users');
        usersSub.on('value', snap => {
            USERS = Object.entries(snap.val() || {}).map(([uid, u]) => ({ uid, ...u }));
            renderUsers();
        }, err => {
            notice.textContent = '사용자 목록을 불러올 수 없습니다: ' + err.message;
            notice.style.display = ''; area.style.display = 'none';
        });
    }
}
document.addEventListener('admin-auth-change', gate);
AdminAuth.onReady(gate);

function roleRank(r) { return r === 'pending' ? 0 : r === 'admin' ? 1 : r === 'editor' ? 2 : 3; }

function fmtTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderUsers() {
    const superEmail = AppConfig.SUPER_ADMIN_EMAIL;
    const meUid = AdminAuth.user ? AdminAuth.user.uid : '';
    const pending = USERS.filter(u => u.role === 'pending').length;
    document.getElementById('userCount').textContent = USERS.length;
    document.getElementById('pendingCount').textContent = pending;

    const q = USER_SEARCH;
    let list = USERS.slice().sort((a, b) =>
        roleRank(a.role) - roleRank(b.role) || (a.displayName || '').localeCompare(b.displayName || '', 'ko'));
    if (q) list = list.filter(u => [u.displayName, u.email].some(v => (v || '').toLowerCase().includes(q)));

    const body = document.getElementById('userBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:40px">사용자가 없습니다.</td></tr>`;
        return;
    }
    body.innerHTML = list.map(u => {
        const isSuper = u.email === superEmail;
        const isSelf = u.uid === meUid;
        const locked = isSuper || isSelf;   // 최고관리자/본인은 역할변경·삭제 불가(잠금)
        const photo = u.photoURL
            ? `<img src="${escapeHtml(u.photoURL)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" alt="">`
            : `<span class="spk-avatar" style="width:32px;height:32px">${escapeHtml((u.displayName || u.email || '?').charAt(0))}</span>`;

        const approveBtn = (u.role === 'pending')
            ? `<button class="btn btn-sm btn-success" onclick="setRole('${u.uid}','editor')">승인</button>` : '';
        const roleSelect = locked
            ? `<span style="font-size:0.8rem;color:var(--text-dim)">${isSuper ? '최고관리자' : '본인'}</span>`
            : `<select onchange="setRole('${u.uid}', this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.82rem">
                    <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>승인대기</option>
                    <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>편집자</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>관리자</option>
               </select>`;
        const delBtn = locked ? '' : `<button class="btn btn-sm btn-danger-ghost" onclick="deleteUser('${u.uid}')">삭제</button>`;

        return `
        <tr${u.role === 'pending' ? ' style="background:#fff8f2"' : ''}>
            <td><div style="display:flex;align-items:center;gap:9px">${photo}<b>${escapeHtml(u.displayName || '(이름 없음)')}</b></div></td>
            <td class="dim" style="font-size:0.85rem">${escapeHtml(u.email || '-')}</td>
            <td style="text-align:center"><span class="badge ${ROLE_BADGE[u.role] || ''}">${ROLE_LABEL[u.role] || u.role || '-'}</span></td>
            <td class="dim" style="font-size:0.82rem">${fmtTime(u.lastLogin)}</td>
            <td>
                <div class="row-actions">${approveBtn}${roleSelect}${delBtn}</div>
            </td>
        </tr>`;
    }).join('');
}

window.setRole = function (uid, role) {
    if (!AdminAuth.isAdmin()) { Toast.error('권한이 없습니다.'); return; }
    database.ref('/users/' + uid + '/role').set(role)
        .then(() => Toast.success(`역할이 "${ROLE_LABEL[role] || role}"(으)로 변경되었습니다.`))
        .catch(e => Toast.error('변경 실패: ' + e.message));
};

window.deleteUser = async function (uid) {
    if (!AdminAuth.isAdmin()) { Toast.error('권한이 없습니다.'); return; }
    const u = USERS.find(x => x.uid === uid);
    const ok = await confirmDialog(`"${u ? (u.displayName || u.email) : ''}" 사용자를 삭제할까요?\n(다시 로그인하면 승인대기로 재등록됩니다.)`, { danger: true, okText: '삭제' });
    if (!ok) return;
    database.ref('/users/' + uid).remove()
        .then(() => Toast.success('삭제되었습니다.'))
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};
