/**
 * trip-inbox.js — 해외 연자 여행·강의 제출함 (검토·승인)
 *   + ASLS 이사회 앱(국내 연자) 강의 제출: source:'board', travel.status:'domestic' — 여행 일정 저장 없이 강의풀만 생성
 * 데이터: /tripSubmissions/<id> = { confId, speakerId, nameEn, nameKo, affiliationEn, nationality, email, phone,
 *           travel{...}, lectures[], note, lang, status, submittedAt }
 * 승인 시:
 *   - /adminSpeakerTrips/<confId>/<speakerId> = { ...travel, nameEn, email, phone, cvFileUrl, updatedAt }  (비공개)
 *   - 강의 제목 → /adminConferences/<confId>/lecturePool/<newId> (연자 연결)
 *   - /adminConferences/<confId>/confSpeakers/<speakerId> = { role:'연자', order }
 */
document.getElementById('sidebarMount').innerHTML = renderSidebar('tripinbox');

const TI_REF = database.ref('/tripSubmissions');
let SUBS = [];
const CONF_TITLES = {};
let tiSub = null;

function setNotice(html) { const n = document.getElementById('tiNotice'); if (n) { n.innerHTML = html || ''; n.style.display = html ? '' : 'none'; } }

function gate() {
    const stop = () => { if (tiSub) { tiSub.off(); tiSub = null; } };
    if (!AdminAuth.user) {
        setNotice('이 페이지는 로그인이 필요합니다. <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="openLoginGate && openLoginGate()">로그인</button>');
        document.getElementById('tiList').innerHTML = ''; stop(); return;
    }
    if (AdminAuth.role && !AdminAuth.canEdit()) {
        setNotice('편집 권한이 있는 사용자만 볼 수 있습니다.'); document.getElementById('tiList').innerHTML = ''; stop(); return;
    }
    if (!AdminAuth.role) { setNotice('권한 확인 중…'); return; }
    setNotice('');
    if (!tiSub) {
        tiSub = TI_REF.orderByChild('submittedAt').limitToLast(300);
        tiSub.on('value', snap => {
            const arr = []; snap.forEach(ch => arr.push({ ...ch.val(), id: ch.key }));   // 키가 항상 id (값 안의 id 필드에 덮이지 않게)
            arr.reverse(); SUBS = arr;
            [...new Set(arr.map(s => s.confId).filter(Boolean))].forEach(cid => {
                if (CONF_TITLES[cid] == null) database.ref('/adminConferences/' + cid + '/title').once('value').then(s => { CONF_TITLES[cid] = s.val() || cid; render(); }).catch(() => { });
            });
            render();
        }, err => { setNotice('불러올 수 없습니다: ' + err.message); });
    }
}
document.addEventListener('admin-auth-change', gate);

function fmtTs(ts) { if (!ts) return '-'; const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
const lecsOf = s => { const l = s && s.lectures; return Array.isArray(l) ? l.filter(Boolean) : (l && typeof l === 'object' ? Object.values(l).filter(Boolean) : []); };
const isBoard = s => !!s && (s.source === 'board' || (s.travel && s.travel.status === 'domestic') || /^\[ASLS 이사회 앱\]/.test(s.note || ''));
function travelLine(t, s) {
    if (s && s.source === 'link') return '🏠 <b>국내 연자</b> · 연자 개인 링크로 제출 (여행 일정 없음)';
    if (isBoard(s)) return '🏠 <b>국내 연자</b> · ASLS 이사회 앱에서 제출 (여행 일정 없음)';
    if (!t) return '-';
    if (t.status !== 'confirmed') return '✈️ <b>미정</b>' + (t.nights ? ` · ${t.nights}박 예정` : '') + (t.companions ? ` · 동반 ${t.companions}` : '');
    const seg = [];
    if (t.arriveDate) seg.push(`도착 ${t.arriveDate}${t.arriveTime ? ' ' + t.arriveTime : ''}`);
    if (t.departDate) seg.push(`출발 ${t.departDate}${t.departTime ? ' ' + t.departTime : ''}`);
    if (t.nights) seg.push(`<b>${t.nights}박</b>`);
    if (t.companions) seg.push(`동반 ${t.companions}`);
    if (t.flight) seg.push(escapeHtml(t.flight));
    return '✈️ ' + (seg.join(' · ') || '확정');
}

function render() {
    const host = document.getElementById('tiList');
    const pending = SUBS.filter(s => s.status !== 'approved' && s.status !== 'rejected');
    const done = SUBS.filter(s => s.status === 'approved' || s.status === 'rejected');
    let html = `<div class="ss-summary" style="margin-bottom:10px">검토 대기 <b>${pending.length}</b>건 · 처리됨 ${done.length}건</div>`;
    if (!pending.length) html += `<div class="card empty-state">검토할 제출이 없습니다.</div>`;
    const safeCard = s => { try { return card(s); } catch (e) { console.error('trip-inbox card', s && s.id, e); return `<div class="card ti-card"><b>${escapeHtml((s && (s.nameKo || s.nameEn)) || s.id)}</b> — 표시 오류(${escapeHtml(e.message)}) <button class="btn btn-sm btn-danger-ghost" onclick="rejectTrip('${s.id}')">반려</button></div>`; } };
    html += pending.map(safeCard).join('');
    if (done.length) html += `<details style="margin-top:16px"><summary style="cursor:pointer;color:var(--text-dim)">처리된 제출 ${done.length}건 보기</summary>${done.slice(0, 60).map(safeCard).join('')}</details>`;
    host.innerHTML = html;
}

function card(s) {
    const name = escapeHtml(s.nameEn || s.nameKo || '(이름 없음)') + (s.nameKo && s.nameEn ? ` <span class="dim">${escapeHtml(s.nameKo)}</span>` : '');
    const aff = [s.affiliationEn, s.nationality].filter(Boolean).map(escapeHtml).join(' · ');
    const contact = [s.email, s.phone].filter(Boolean).map(escapeHtml).join(' · ');
    const lecLine = l => {
        const t = escapeHtml(l.title || (l.type ? '[' + l.type + ']' : '(제목 미정)'));
        const bits = [];
        if (l.type && l.title) bits.push('종류: ' + escapeHtml(l.type));
        if (l.sponsor) bits.push('스폰서: ' + escapeHtml(l.sponsor));
        if (l.duration) bits.push(l.duration + '분');
        if (l.lang) bits.push(escapeHtml(l.lang));
        const abs = l.abstractUrl ? ` <a href="${escapeHtml(l.abstractUrl)}" target="_blank" rel="noopener">📎 초록</a>` : '';
        return `<li>🎤 <b>${t}</b>${bits.length ? ' · ' + bits.join(' · ') : ''}${l.note ? ` <span class="dim">(${escapeHtml(l.note)})</span>` : ''}${abs}</li>`;
    };
    const lecs = lecsOf(s).length
        ? `<ul class="ti-lecs">${lecsOf(s).map(lecLine).join('')}</ul>`
        : '<div class="dim" style="margin:6px 0">강의 없음</div>';
    const docs = [];
    if (s.travel && s.travel.ticketUrl) docs.push(`<a href="${escapeHtml(s.travel.ticketUrl)}" target="_blank" rel="noopener">✈️ 항공권</a>`);
    if (s.cvFileUrl) docs.push(`<a href="${escapeHtml(s.cvFileUrl)}" target="_blank" rel="noopener">📄 CV</a>`);
    const docsLine = docs.length ? `<div class="ti-docs" style="font-size:0.84rem;margin-top:4px">첨부: ${docs.join(' · ')}</div>` : '';
    const badge = s.status === 'approved' ? '<span class="badge badge-ongoing">반영됨</span>' : (s.status === 'rejected' ? '<span class="badge badge-ended">반려</span>' : '');
    const actions = (s.status === 'approved' || s.status === 'rejected')
        ? `<div class="ti-actions"><button class="btn btn-sm btn-danger-ghost" title="제출 기록만 지웁니다 (강의 관리에 들어간 강의는 그대로 — 강의는 강의 관리에서 삭제)" onclick="deleteTripSub('${s.id}')">🗑 기록 삭제</button></div>`
        : `<div class="ti-actions"><button class="btn btn-sm btn-success" onclick="approveTrip('${s.id}')">✔ 승인·반영</button>
           <button class="btn btn-sm btn-danger-ghost" onclick="rejectTrip('${s.id}')">반려</button></div>`;
    return `<div class="card ti-card">
        <div class="ti-head"><div><b style="font-size:1rem">${name}</b> ${badge}<div class="dim" style="font-size:0.82rem">${aff}${contact ? ' · ' + contact : ''}</div></div>
            <div class="dim" style="font-size:0.78rem;text-align:right">${escapeHtml(CONF_TITLES[s.confId] || s.confId || '')}<br>${fmtTs(s.submittedAt)} · ${s.lang === 'ko' ? '국문' : 'EN'}</div></div>
        <div class="ti-travel">${travelLine(s.travel, s)}</div>
        ${(isBoard(s) && !s.speakerId) ? `<div class="dim" style="font-size:0.84rem;margin-top:4px">⚠ 연자 연결 없음 — 승인 시 연자 리스트에서 같은 이름(${escapeHtml(s.nameKo || '')})을 찾아 연결합니다.</div>` : ''}
        ${(s.travel && s.travel.requests) ? `<div class="dim" style="font-size:0.84rem;margin-top:4px">요청: ${escapeHtml(s.travel.requests)}</div>` : ''}
        ${docsLine}
        ${lecs}
        ${s.note ? `<div class="dim" style="font-size:0.84rem">메모: ${escapeHtml(s.note)}</div>` : ''}
        ${actions}
    </div>`;
}

window.deleteTripSub = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SUBS.find(x => x.id === id); if (!s) return;
    const ok = await confirmDialog(`"${s.nameKo || s.nameEn || ''}" 제출 기록을 삭제할까요?\n(강의 관리에 들어간 강의는 지워지지 않습니다 — 필요하면 강의 관리에서 삭제)\n이사회 앱의 해당 제출 표시도 사라집니다.`, { okText: '기록 삭제' });
    if (!ok) return;
    try {
        await TI_REF.child(id).remove();
        const still = (await TI_REF.child(id).once('value')).exists();   // 실제로 지워졌는지 서버에서 다시 확인
        if (still) { Toast.error('삭제가 반영되지 않았습니다. 새로고침 후 다시 시도해 주세요.'); return; }
        SUBS = SUBS.filter(x => x.id !== id); render();
        logActivity('delete', 'lecture', `제출 기록 삭제 "${s.nameKo || s.nameEn || ''}"`, { confId: s.confId || '' });
        Toast.success('제출 기록을 삭제했습니다.');
    } catch (e) { Toast.error('삭제 실패: ' + e.message); }
};

window.rejectTrip = function (id) {
    if (!AdminAuth.requireEdit()) return;
    TI_REF.child(id + '/status').set('rejected').then(() => Toast.info('반려 처리했습니다.'));
};

window.approveTrip = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SUBS.find(x => x.id === id); if (!s) return;
    const board = isBoard(s);
    // 이사회 앱 제출인데 연자 연결이 없으면 연자 리스트에서 같은 한글 이름 1명을 찾아 연결
    if (board && !s.speakerId && s.nameKo) {
        const all = (await database.ref('/adminSpeakers').once('value')).val() || {};
        const hit = Object.entries(all).filter(([, v]) => v && (v.nameKo || '').trim() === s.nameKo.trim());
        if (hit.length === 1) { s.speakerId = hit[0][0]; await TI_REF.child(id + '/speakerId').set(s.speakerId); }
        else { Toast.error(hit.length ? `연자 리스트에 "${s.nameKo}"가 ${hit.length}명 있어 자동 연결할 수 없습니다.` : `연자 리스트에 "${s.nameKo}"가 없습니다. 연자 리스트에 먼저 등록해 주세요.`); return; }
    }
    if (!s.confId || !s.speakerId) { Toast.error('행사/연자 정보가 없어 반영할 수 없습니다. (제출 링크 확인)'); return; }
    const lecList = lecsOf(s).filter(l => l.title || l.type);
    const ok = await confirmDialog(`"${s.nameEn || s.nameKo}" 제출을 승인·반영할까요?\n${board ? '' : '- 여행 일정·항공권·CV 저장\n'}- 강의 ${lecList.length}건 강의풀 생성\n- 이 행사 연자로 등록`, { okText: '승인·반영' });
    if (!ok) return;
    const base = '/adminConferences/' + s.confId;
    const updates = {};
    // 여행 일정(+ 항공권·CV·연락처) → 비공개 칸 /adminSpeakerTrips/<confId>/<speakerId> (관리자·편집자만 읽음)
    // 이사회 앱(국내 연자) 제출은 여행 일정이 없으므로 건너뜀
    const trip = board ? null : Object.assign({}, s.travel || {}, {
        nameEn: s.nameEn || '', nameKo: s.nameKo || '', email: s.email || '', phone: s.phone || '',
        cvFileUrl: s.cvFileUrl || '',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    // 연자 참여 등록
    updates['confSpeakers/' + s.speakerId] = { role: '연자', order: 0 };
    if (board) {   // 이미 이 행사 연자면 기존 역할·순서 유지
        const cur = (await database.ref(base + '/confSpeakers/' + s.speakerId).once('value')).val();
        if (cur) delete updates['confSpeakers/' + s.speakerId];
        else updates['confSpeakers/' + s.speakerId] = { role: '연자', order: 999 };
    }
    // 강의풀 생성 (제목 없으면 종류를 제목 대신 사용, 종류→카테고리, 스폰서→파트너명, 초록 URL 보관)
    const spk = { id: s.speakerId, nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: '', affiliationEn: s.affiliationEn || '' };
    lecList.forEach((l, i) => {
        const lid = database.ref(base + '/lecturePool').push().key;
        updates['lecturePool/' + lid] = {
            titleKo: l.title || l.type || '(제목 미정)', titleEn: '', duration: Number(l.duration) || 0,
            categories: l.type ? [l.type] : [], tags: [], types: [], speakers: [spk],
            partnerId: '', partnerKo: l.sponsor || '', partnerEn: '', productKo: '', productEn: '', productCategory: '', productDesc: '',
            abstractUrl: l.abstractUrl || '',
            memo: l.note || '', order: 9000 + i,
            createdAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
    });
    try {
        if (trip) {   // 비공개 칸 저장이 막히면(규칙 미추가) 공개 위치로 대신 쓰지 않고 중단
            try { await database.ref(`/adminSpeakerTrips/${s.confId}/${s.speakerId}`).set(trip); }
            catch (e) { Toast.error('여행 일정 저장 실패 — DB 규칙에 adminSpeakerTrips 가 있는지 확인해 주세요. (' + (e.message || e) + ')'); return; }
            // 연락처는 연자 비공개 연락처에도 채움 (기존 값이 있으면 유지)
            const cur = (window.Contacts && Contacts.spk[s.speakerId]) || {};
            const c = { email: cur.email || s.email || '', phone: cur.phone || s.phone || '' };
            if ((c.email || c.phone) && window.Contacts && Contacts.ready) await database.ref('/adminSpeakerContacts/' + s.speakerId).set(c).catch(() => { });
        }
        await database.ref(base).update(updates);
        await TI_REF.child(id + '/status').set('approved');
        logActivity('update', 'speaker', board ? `이사회 앱 강의 제출 "${s.nameKo || s.nameEn}" 승인·반영` : `해외 연자 "${s.nameEn || s.nameKo}" 일정·강의 제출 승인·반영`, { confId: s.confId, confTitle: CONF_TITLES[s.confId] || '', entityId: s.speakerId });
        Toast.success('승인·반영 완료. 강의풀/연자/여행일정에 저장되었습니다.');
    } catch (e) { Toast.error('반영 실패: ' + (e.message || e)); }
};

AdminAuth.onReady(gate);
