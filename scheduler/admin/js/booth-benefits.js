/**
 * booth-benefits.js — 부스 등급별 혜택 (편집 가능한 표)
 * 데이터: /adminBoothBenefits = { columns:[], grades:[], cells:{grade:{col:value}} }
 */

const BOOTH_REF = database.ref('/adminBoothBenefits');
let BOOTH = { columns: [], grades: [], cells: {} };

document.getElementById('sidebarMount').innerHTML = renderSidebar('booth');

BOOTH_REF.on('value', snap => {
    const v = snap.val();
    if (!v || !Array.isArray(v.columns) || !Array.isArray(v.grades)) {
        // 최초 진입 → 기본값 시드
        BOOTH = { columns: DEFAULT_BOOTH_COLUMNS.slice(), grades: DEFAULT_BOOTH_GRADES.slice(), cells: DEFAULT_BOOTH_CELLS };
        if (AdminAuth.canEdit()) BOOTH_REF.set(BOOTH);
    } else {
        BOOTH = { columns: v.columns || [], grades: v.grades || [], cells: v.cells || {} };
    }
    renderTable();
});

function cellVal(g, c) { return (BOOTH.cells[g] && BOOTH.cells[g][c] != null) ? BOOTH.cells[g][c] : ''; }

function renderTable() {
    const t = document.getElementById('boothTable');
    const head = `<thead><tr>
        <th style="min-width:120px">부스등급</th>
        ${BOOTH.columns.map((c, ci) => `<th>
            <div style="display:flex;align-items:center;gap:6px;justify-content:space-between">
                <span class="booth-colname" contenteditable="true" data-col="${ci}">${escapeHtml(c)}</span>
                <button class="booth-del" title="열 삭제" onclick="delColumn(${ci})">✕</button>
            </div></th>`).join('')}
    </tr></thead>`;

    const body = `<tbody>${BOOTH.grades.map((g, gi) => `<tr>
        <td>
            <div style="display:flex;align-items:center;gap:6px;justify-content:space-between">
                <b class="booth-gradename" contenteditable="true" data-grade="${gi}">${escapeHtml(g)}</b>
                <button class="booth-del" title="행 삭제" onclick="delGrade(${gi})">✕</button>
            </div>
        </td>
        ${BOOTH.columns.map(c => `<td>
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
