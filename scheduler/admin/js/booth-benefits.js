/**
 * booth-benefits.js — 부스 등급별 혜택 (편집 가능한 표)
 * 데이터: /adminBoothBenefits = { columns:[], grades:[], cells:{grade:{col:value}} }
 */

const BOOTH_REF = database.ref('/adminBoothBenefits');
// 기본값으로 시작 → 권한/데이터가 없어도 표가 비지 않음
let BOOTH = {
    columns: DEFAULT_BOOTH_COLUMNS.slice(),
    grades: DEFAULT_BOOTH_GRADES.slice(),
    cells: JSON.parse(JSON.stringify(DEFAULT_BOOTH_CELLS))
};

document.getElementById('sidebarMount').innerHTML = renderSidebar('booth');
renderTable();   // 기본 표 먼저 표시

BOOTH_REF.on('value', snap => {
    const v = snap.val();
    if (v && Array.isArray(v.columns) && Array.isArray(v.grades)) {
        BOOTH = { columns: v.columns, grades: v.grades, cells: v.cells || {} };
        // 기존 데이터 마이그레이션: 정규강의(일) → 정규강의(일,20분)/(일,15분)
        if (migrateColumns() && AdminAuth.canEdit()) { saveAll(); return; }
    } else if (AdminAuth.canEdit()) {
        BOOTH_REF.set(BOOTH).catch(() => { });   // 최초 시드(권한 있으면)
    }
    renderTable();
}, err => {
    console.warn('부스 혜택 읽기 실패(규칙에 /adminBoothBenefits 필요):', err.code);
    renderTable();   // 기본값 유지
});

function cellVal(g, c) { return (BOOTH.cells[g] && BOOTH.cells[g][c] != null) ? BOOTH.cells[g][c] : ''; }

// 정규강의(일) 열을 정규강의(일,20분)/(일,15분) 두 열로 분리 (셀 값은 양쪽에 복제 → 수동 수정)
function migrateColumns() {
    const OLD = '정규강의(일)';
    const NEW = ['정규강의(일,20분)', '정규강의(일,15분)'];
    const idx = BOOTH.columns.indexOf(OLD);
    if (idx === -1) return false;   // 이미 분리됨 / 없음
    if (NEW.some(n => BOOTH.columns.includes(n))) {
        // 새 열이 이미 있으면 옛 열만 제거
        BOOTH.columns.splice(idx, 1);
        Object.values(BOOTH.cells).forEach(r => { if (r) delete r[OLD]; });
        return true;
    }
    BOOTH.columns.splice(idx, 1, ...NEW);
    Object.values(BOOTH.cells).forEach(r => {
        if (r && r[OLD] != null) { NEW.forEach(n => { if (r[n] == null) r[n] = r[OLD]; }); delete r[OLD]; }
    });
    return true;
}

function renderTable() {
    const t = document.getElementById('boothTable');
    const head = `<thead><tr>
        <th class="booth-th booth-corner">부스등급</th>
        ${BOOTH.columns.map((c, ci) => `<th class="booth-th">
            <span class="booth-colname" contenteditable="true" data-col="${ci}">${escapeHtml(c)}</span>
            <button class="booth-del" title="열 삭제" onclick="delColumn(${ci})">×</button>
        </th>`).join('')}
    </tr></thead>`;

    const body = `<tbody>${BOOTH.grades.map((g, gi) => `<tr>
        <td class="booth-grade-td">
            <b class="booth-gradename" contenteditable="true" data-grade="${gi}">${escapeHtml(g)}</b>
            <button class="booth-del" title="행 삭제" onclick="delGrade(${gi})">×</button>
        </td>
        ${BOOTH.columns.map(c => `<td class="booth-cell-td">
            <input class="booth-cell" type="text" value="${escapeHtml(cellVal(g, c))}"
                   data-grade="${escapeHtml(g)}" data-col="${escapeHtml(c)}" placeholder="-">
        </td>`).join('')}
    </tr>`).join('')}</tbody>`;

    t.innerHTML = head + body;
    bindEditing();
}

function bindEditing() {
    // 셀 값
    document.querySelectorAll('#boothTable .booth-cell').forEach(inp => {
        inp.addEventListener('change', () => {
            if (!AdminAuth.requireEdit()) { renderTable(); return; }
            const g = inp.dataset.grade, c = inp.dataset.col;
            BOOTH_REF.child('cells').child(g).child(c).set(inp.value.trim())
                .catch(e => Toast.error('저장 실패: ' + e.message));
        });
    });
    // 컬럼명
    document.querySelectorAll('#boothTable .booth-colname').forEach(el => {
        el.addEventListener('blur', () => {
            const ci = Number(el.dataset.col);
            const name = el.textContent.trim();
            if (!name || name === BOOTH.columns[ci]) { el.textContent = BOOTH.columns[ci]; return; }
            if (!AdminAuth.requireEdit()) { renderTable(); return; }
            renameColumn(ci, name);
        });
    });
    // 등급명
    document.querySelectorAll('#boothTable .booth-gradename').forEach(el => {
        el.addEventListener('blur', () => {
            const gi = Number(el.dataset.grade);
            const name = el.textContent.trim();
            if (!name || name === BOOTH.grades[gi]) { el.textContent = BOOTH.grades[gi]; return; }
            if (!AdminAuth.requireEdit()) { renderTable(); return; }
            renameGrade(gi, name);
        });
    });
}

function saveAll() { BOOTH_REF.set(BOOTH).catch(e => Toast.error('저장 실패: ' + e.message)); }

window.addColumn = function () {
    if (!AdminAuth.requireEdit()) return;
    let n = '새 혜택', i = 2;
    while (BOOTH.columns.includes(n)) { n = '새 혜택 ' + i++; }
    BOOTH.columns.push(n);
    saveAll();
};
window.delColumn = async function (ci) {
    if (!AdminAuth.requireEdit()) return;
    const c = BOOTH.columns[ci];
    const ok = await confirmDialog(`"${c}" 열을 삭제할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    BOOTH.columns.splice(ci, 1);
    Object.values(BOOTH.cells).forEach(row => { if (row) delete row[c]; });
    saveAll();
};
window.renameColumn = function (ci, name) {
    const old = BOOTH.columns[ci];
    if (BOOTH.columns.includes(name)) { Toast.warning('이미 있는 혜택명입니다.'); renderTable(); return; }
    BOOTH.columns[ci] = name;
    Object.values(BOOTH.cells).forEach(row => {
        if (row && row[old] != null) { row[name] = row[old]; delete row[old]; }
    });
    saveAll();
};

window.addGrade = function () {
    if (!AdminAuth.requireEdit()) return;
    let n = '새 등급', i = 2;
    while (BOOTH.grades.includes(n)) { n = '새 등급 ' + i++; }
    BOOTH.grades.push(n);
    saveAll();
};
window.delGrade = async function (gi) {
    if (!AdminAuth.requireEdit()) return;
    const g = BOOTH.grades[gi];
    const ok = await confirmDialog(`"${g}" 등급을 삭제할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    BOOTH.grades.splice(gi, 1);
    if (BOOTH.cells[g]) delete BOOTH.cells[g];
    saveAll();
};
window.renameGrade = function (gi, name) {
    const old = BOOTH.grades[gi];
    if (BOOTH.grades.includes(name)) { Toast.warning('이미 있는 등급명입니다.'); renderTable(); return; }
    BOOTH.grades[gi] = name;
    if (BOOTH.cells[old]) { BOOTH.cells[name] = BOOTH.cells[old]; delete BOOTH.cells[old]; }
    saveAll();
};
