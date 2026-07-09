/**
 * asls-week.js — ASLS Week 진행상황 보드 (파트너사별, 행사별)
 * 데이터: /adminConferences/<confId>/aslsWeek/<partnerId> = { director, join, foreign, status,
 *          ownDate, ownDirector, payment, clinicTour, clinicInfo, wishProduct }
 */

let CONFS = [];
let CONF_ID = new URLSearchParams(location.search).get('id') || '';
let AW = {};          // { partnerId: {fields} }
let awSub = null;

const awRef = () => database.ref('/adminConferences/' + CONF_ID + '/aslsWeek');

const STATUS_OPTIONS = ['', '확정', '진행중', '확인중', '미정', '보류', '취소', '어려움', '불가'];
const JOIN_OPTIONS = ['', 'O', 'X', '미정'];
const FIELDS = [
    { key: 'director', label: '담당이사' },
    { key: 'join', label: '참여', type: 'join' },
    { key: 'foreign', label: '참석 외국인 인원' },
    { key: 'status', label: '진행상황', type: 'status' },
    { key: 'ownDate', label: '자체행사 날짜' },
    { key: 'ownDirector', label: '자체행사 참석이사' },
    { key: 'payment', label: '결제' },
    { key: 'clinicTour', label: '클리닉투어' },
    { key: 'clinicInfo', label: '클리닉명/날짜' },
    { key: 'wishProduct', label: '희망제품' }
];

document.getElementById('sidebarMount').innerHTML = renderSidebar('aslsweek');
Masters.init();
document.addEventListener('masters-change', renderAW);
document.getElementById('awSearch').addEventListener('input', renderAW);

database.ref('/adminConferences').once('value').then(snap => {
    CONFS = toOrderedArray(snap.val());
    const sel = document.getElementById('awConfSelect');
    if (!CONFS.length) { sel.innerHTML = '<option value="">등록된 행사가 없습니다</option>'; return; }
    if (!CONF_ID) { try { CONF_ID = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { } }
    if (!CONF_ID || !CONFS.find(c => c.id === CONF_ID)) CONF_ID = CONFS[0].id;
    sel.innerHTML = CONFS.map(c => `<option value="${c.id}" ${c.id === CONF_ID ? 'selected' : ''}>${escapeHtml(c.title || '(제목 없음)')}</option>`).join('');
    subscribeAW();
});

window.onAWConfChange = function () {
    CONF_ID = document.getElementById('awConfSelect').value;
    try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
    const url = new URL(location); url.searchParams.set('id', CONF_ID); history.replaceState(null, '', url);
    subscribeAW();
};

function subscribeAW() {
    if (awSub) awSub.off();
    awSub = awRef();
    awSub.on('value', snap => { AW = snap.val() || {}; renderAW(); });
}

function rowOf(pid) { return AW[pid] || {}; }
function hasData(pid) { const r = rowOf(pid); return Object.keys(r).some(k => (r[k] || '').toString().trim() !== ''); }

function statusStyle(v) {
    if (v === '확정') return 'background:#e6f7ee;color:#12a150';
    if (v === '진행중' || v === '확인중') return 'background:#fff2e0;color:#b26a00';
    if (v === '취소' || v === '어려움' || v === '불가') return 'background:#fdecea;color:#c0392b';
    if (v === '미정' || v === '보류') return 'background:#eef0f3;color:#7b8494';
    return '';
}

/* ---------- 렌더 ---------- */
function renderAW() {
    if (!CONF_ID) return;
    const q = document.getElementById('awSearch').value.trim().toLowerCase();
    const onlyData = document.getElementById('awOnlyData').checked;

    let list = Masters.partners.slice();
    if (q) list = list.filter(p => [p.nameKo, p.nameEn].some(v => (v || '').toLowerCase().includes(q)));
    if (onlyData) list = list.filter(p => hasData(p.id));

    document.getElementById('awCount').textContent = Masters.partners.length;
    document.getElementById('awFilledCount').textContent = Masters.partners.filter(p => hasData(p.id)).length;

    const head = `<thead><tr>
        <th class="aw-th-name">업체명</th>
        ${FIELDS.map(f => `<th>${escapeHtml(f.label)}</th>`).join('')}
    </tr></thead>`;

    if (!list.length) {
        document.getElementById('awTable').innerHTML = head + `<tbody><tr><td colspan="${FIELDS.length + 1}" style="text-align:center;color:var(--text-dim);padding:36px">${Masters.partners.length ? '검색/필터 결과가 없습니다.' : '등록된 파트너사가 없습니다. 위에서 추가하거나 파트너사 관리에서 등록하세요.'}</td></tr></tbody>`;
        return;
    }

    const body = `<tbody>${list.map(p => {
        const r = rowOf(p.id);
        return `<tr class="${hasData(p.id) ? 'aw-filled' : ''}">
            <td class="aw-name">${escapeHtml(p.nameKo || p.nameEn || '')}</td>
            ${FIELDS.map(f => `<td>${cellHtml(p.id, f, r[f.key] || '')}</td>`).join('')}
        </tr>`;
    }).join('')}</tbody>`;

    document.getElementById('awTable').innerHTML = head + body;
}

function cellHtml(pid, f, val) {
    if (f.type === 'status') {
        return `<select class="aw-cell aw-select" style="${statusStyle(val)}" onchange="awSet('${pid}','status',this.value)">
            ${STATUS_OPTIONS.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o || '-'}</option>`).join('')}
        </select>`;
    }
    if (f.type === 'join') {
        return `<select class="aw-cell aw-select" onchange="awSet('${pid}','join',this.value)">
            ${JOIN_OPTIONS.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o || '-'}</option>`).join('')}
        </select>`;
    }
    return `<input class="aw-cell aw-input" value="${escapeHtml(val)}" onchange="awSet('${pid}','${f.key}',this.value)">`;
}

/* ---------- 저장 ---------- */
window.awSet = function (pid, key, value) {
    if (!AdminAuth.requireEdit()) { renderAW(); return; }
    value = (value || '').trim();
    awRef().child(pid).child(key).set(value || null)
        .catch(e => Toast.error('저장 실패: ' + e.message));
};

window.awAddPartner = function () {
    if (!AdminAuth.requireEdit()) return;
    const name = document.getElementById('awNewName').value.trim();
    if (!name) { Toast.warning('파트너사 이름을 입력하세요.'); return; }
    if (Masters.partners.some(p => (p.nameKo || '').trim() === name)) { Toast.info('이미 등록된 파트너사입니다.'); document.getElementById('awNewName').value = ''; return; }
    const id = uuid();
    database.ref('/adminPartners/' + id).set({ nameKo: name, nameEn: '', grade: '', products: [], order: Masters.partners.length, createdAt: firebase.database.ServerValue.TIMESTAMP })
        .then(() => { document.getElementById('awNewName').value = ''; Toast.success(`"${name}" 추가됨`); })
        .catch(e => Toast.error('추가 실패: ' + e.message));
};

/* ---------- 엑셀 ---------- */
window.exportAWExcel = function () {
    if (typeof XLSX === 'undefined') { Toast.error('엑셀 모듈 로드 실패'); return; }
    const header = ['업체명', ...FIELDS.map(f => f.label)];
    const rows = [header];
    Masters.partners.slice()
        .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'))
        .forEach(p => {
            const r = rowOf(p.id);
            rows.push([p.nameKo || p.nameEn || '', ...FIELDS.map(f => r[f.key] || '')]);
        });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ASLS Week');
    const title = (CONFS.find(c => c.id === CONF_ID) || {}).title || '행사';
    XLSX.writeFile(wb, `ASLSWeek_${title}.xlsx`);
};
