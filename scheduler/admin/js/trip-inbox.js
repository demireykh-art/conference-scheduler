/**
 * trip-inbox.js — 해외 연자 여행·강의 제출함 (검토·승인)
 * 데이터: /tripSubmissions/<id> = { confId, speakerId, nameEn, nameKo, affiliationEn, nationality, email, phone,
 *           travel{...}, lectures[], note, lang, status, submittedAt }
 * 승인 시:
 *   - /adminConferences/<confId>/speakerTrips/<speakerId> = { ...travel, nameEn, companions, updatedAt }
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
            const arr = []; snap.forEach(ch => arr.push({ id: ch.key, ...ch.val() }));
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
function travelLine(t) {
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
    html += pending.map(card).join('');
    if (done.length) html += `<details style="margin-top:16px"><summary style="cursor:pointer;color:var(--text-dim)">처리된 제출 ${done.length}건 보기</summary>${done.slice(0, 60).map(card).join('')}</details>`;
    host.innerHTML = html;
}

function card(s) {
    const name = escapeHtml(s.nameEn || s.nameKo || '(이름 없음)') + (s.nameKo && s.nameEn ? ` <span class="dim">${escapeHtml(s.nameKo)}</span>` : '');
    const aff = [s.affiliationEn, s.nationality].filter(Boolean).map(escapeHtml).join(' · ');
    const contact = [s.email, s.phone].filter(Boolean).map(escapeHtml).join(' · ');
    const lecs = (s.lectures || []).length
        ? `<ul class="ti-lecs">${s.lectures.map(l => `<li>🎤 <b>${escapeHtml(l.title)}</b>${l.duration ? ` · ${l.duration}분` : ''}${l.lang ? ` · ${escapeHtml(l.lang)}` : ''}${l.note ? ` <span class="dim">(${escapeHtml(l.note)})</span>` : ''}</li>`).join('')}</ul>`
        : '<div class="dim" style="margin:6px 0">강의 제목 없음</div>';
    const badge = s.status === 'approved' ? '<span class="badge badge-ongoing">반영됨</span>' : (s.status === 'rejected' ? '<span class="badge badge-ended">반려</span>' : '');
    const actions = (s.status === 'approved' || s.status === 'rejected') ? ''
        : `<div class="ti-actions"><button class="btn btn-sm btn-success" onclick="approveTrip('${s.id}')">✔ 승인·반영</button>
           <button class="btn btn-sm btn-danger-ghost" onclick="rejectTrip('${s.id}')">반려</button></div>`;
    return `<div class="card ti-card">
        <div class="ti-head"><div><b style="font-size:1rem">${name}</b> ${badge}<div class="dim" style="font-size:0.82rem">${aff}${contact ? ' · ' + contact : ''}</div></div>
            <div class="dim" style="font-size:0.78rem;text-align:right">${escapeHtml(CONF_TITLES[s.confId] || s.confId || '')}<br>${fmtTs(s.submittedAt)} · ${s.lang === 'ko' ? '국문' : 'EN'}</div></div>
        <div class="ti-travel">${travelLine(s.travel)}</div>
        ${(s.travel && s.travel.requests) ? `<div class="dim" style="font-size:0.84rem;margin-top:4px">요청: ${escapeHtml(s.travel.requests)}</div>` : ''}
        ${lecs}
        ${s.note ? `<div class="dim" style="font-size:0.84rem">메모: ${escapeHtml(s.note)}</div>` : ''}
        ${actions}
    </div>`;
}

window.rejectTrip = function (id) {
    if (!AdminAuth.requireEdit()) return;
    TI_REF.child(id + '/status').set('rejected').then(() => Toast.info('반려 처리했습니다.'));
};

window.approveTrip = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SUBS.find(x => x.id === id); if (!s) return;
    if (!s.confId || !s.speakerId) { Toast.error('행사/연자 정보가 없어 반영할 수 없습니다. (제출 링크 확인)'); return; }
    const ok = await confirmDialog(`"${s.nameEn || s.nameKo}" 제출을 승인·반영할까요?\n- 여행 일정 저장\n- 강의 ${(s.lectures || []).filter(l => l.title).length}건 강의풀 생성\n- 이 행사 연자로 등록`, { okText: '승인·반영' });
    if (!ok) return;
    const base = '/adminConferences/' + s.confId;
    const updates = {};
    // 여행 일정
    updates['speakerTrips/' + s.speakerId] = Object.assign({}, s.travel || {}, {
        nameEn: s.nameEn || '', nameKo: s.nameKo || '', email: s.email || '', phone: s.phone || '',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    // 연자 참여 등록
    updates['confSpeakers/' + s.speakerId] = { role: '연자', order: 0 };
    // 강의풀 생성
    const spk = { id: s.speakerId, nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: '', affiliationEn: s.affiliationEn || '' };
    (s.lectures || []).filter(l => l.title).forEach((l, i) => {
        const lid = database.ref(base + '/lecturePool').push().key;
        updates['lecturePool/' + lid] = {
            titleKo: l.title, titleEn: '', duration: Number(l.duration) || 0,
            categories: [], tags: [], types: [], speakers: [spk],
            partnerId: '', partnerKo: '', partnerEn: '', productKo: '', productEn: '', productCategory: '', productDesc: '',
            memo: l.note || '', order: 9000 + i,
            createdAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
    });
    try {
        await database.ref(base).update(updates);
        await TI_REF.child(id + '/status').set('approved');
        logActivity('update', 'speaker', `해외 연자 "${s.nameEn || s.nameKo}" 일정·강의 제출 승인·반영`, { confId: s.confId, confTitle: CONF_TITLES[s.confId] || '', entityId: s.speakerId });
        Toast.success('승인·반영 완료. 강의풀/연자/여행일정에 저장되었습니다.');
    } catch (e) { Toast.error('반영 실패: ' + (e.message || e)); }
};

AdminAuth.onReady(gate);
