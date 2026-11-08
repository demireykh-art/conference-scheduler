/**
 * route-map.js — 연자별 강의 일정 › 연자 카드 "🗺 동선이미지"
 * 행사장 지도 위에 그날 일정 번호 배지 + 남은 이동 점선 + 아래 일정표를 그려 PNG로 만든다.
 * - 지도/핀: 행사별 기본값(VENUE_DEFAULTS) + DB 보정값(/adminConferences/<id>/venueMap/pins)
 * - 핀 키: 룸 이름 정규화(placeKey) — 날짜별로 따로 만든 같은 방은 핀 하나를 공유
 * 명세: route_map_spec.md
 */
(function () {
    const CO = '#D85A30', GR = '#96968F', DK = '#3C281E', RD = '#C62828', BG = '#FDF7F2';
    const FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    const COEX3F = {
        image: 'assets/venue-map-coex3f.png',
        pins: {
            a: [0.8773, 0.6551], b: [0.5995, 0.5295], c: [0.4022, 0.3833], d: [0.3566, 0.4205],
            e: [0.3043, 0.4590], f: [0.2081, 0.4436], g: [0.1575, 0.4026], h: [0.2338, 0.3577],
            i: [0.2587, 0.3244], j: [0.3317, 0.2692], k: [0.3748, 0.2346],
            ola: [0.6973, 0.6551], olb: [0.7579, 0.5936], 'c~e': [0.3566, 0.4205]
        }
    };
    // 행사 ID → 기본 지도 (2026 ASLS 추계학술대회 · 코엑스 3층)
    const VENUE_DEFAULTS = { 'fa976df5-fa3a-4ae0-b206-132e448769a8': COEX3F };
    const ALIAS = { ol1: 'ola', ol2: 'olb', '오픈렉처1': 'ola', '오픈렉처2': 'olb' };

    let VENUE_DB = null, venueRef = null, venueConf = '';
    const imgCache = {};
    let RM = null;   // 현재 모달 상태 { key, date, pinEdit }

    function placeKey(name) {
        let s = String(name || '').toLowerCase();
        s = s.replace(/\(.*?\)/g, ' ');
        s = s.replace(/^[a-z]{3}\s*\d{1,2}_/, '');
        s = s.replace(/^\s*(토|일|월|화|수|목|금)\s+/, '');
        s = s.replace(/오픈\s*렉처|open\s*lecture/g, 'ol');
        s = s.replace(/room|룸|hall|홀/g, '');
        s = s.replace(/[\s_\-·.]/g, '');
        return ALIAS[s] || s;
    }
    function roomLabel(name) {
        return String(name || '').replace(/\(.*?\)/g, '').replace(/^\s*(토|일|월|화|수|목|금)\s+/, '').trim() || '룸';
    }

    function watchVenue() {
        if (venueConf === CONF_ID) return;
        if (venueRef) venueRef.off();
        venueConf = CONF_ID; VENUE_DB = null;
        if (!CONF_ID) return;
        venueRef = database.ref('/adminConferences/' + CONF_ID + '/venueMap');
        venueRef.on('value', s => { VENUE_DB = s.val() || null; if (RM) draw(); });
    }
    function venue() {
        const def = VENUE_DEFAULTS[CONF_ID];
        const db = VENUE_DB || {};
        const image = db.imageUrl || (def && def.image);
        if (!image) return null;
        const pins = Object.assign({}, def ? def.pins : {});
        Object.entries(db.pins || {}).forEach(([k, v]) => { if (v && v.x != null) pins[k] = [v.x, v.y]; });
        return { image, pins };
    }
    function loadImg(src) {
        if (imgCache[src]) return imgCache[src];
        imgCache[src] = new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
        return imgCache[src];
    }

    function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    function personDates(p) { return [...new Set(p.items.filter(a => !a.unplaced && a.date && (a.kind === 'special' || a.start != null)).map(a => a.date))].sort(); }
    function pickDate(p) {
        const ds = personDates(p);
        if (FILTER_DATE && ds.includes(FILTER_DATE)) return FILTER_DATE;
        const t = todayStr();
        if (ds.includes(t)) return t;
        return ds.find(d => d >= t) || ds[0] || '';
    }
    function mdLabel(d) {
        const dt = new Date(d + 'T00:00:00');
        return `${dt.getMonth() + 1}/${dt.getDate()}(${DOW[dt.getDay()]})`;
    }

    /* ---------- 일정 → 그리기 데이터 ---------- */
    function plan(p, date, pins) {
        const t = todayStr(), nd = new Date();
        const nowMin = date < t ? Infinity : (date > t ? -Infinity : nd.getHours() * 60 + nd.getMinutes());
        const items = p.items.filter(a => a.date === date && !a.unplaced && a.start != null && (a.kind === 'lec' || a.kind === 'mod'))
            .slice().sort((a, b) => a.start - b.start || (a.kind === 'mod' ? -1 : 1));
        const rows = items.map((a, i) => {
            const pk = placeKey(a.roomName);
            return { n: i + 1, a, pk, pin: pins[pk] || null, done: a.end <= nowMin, room: roomLabel(a.roomName),
                title: (a.kind === 'mod' ? '좌장 · ' : '') + (a.title || '') };
        });
        if (rows.length) { const up = rows.filter(r => !r.done); if (up.length) up[up.length - 1].last = true; }
        const specials = p.items.filter(a => a.kind === 'special' && a.date === date);
        // 배지: 같은 장소 + 같은 상태끼리 묶음
        const groups = [];
        rows.forEach(r => {
            if (!r.pin) return;
            let g = groups.find(x => x.pk === r.pk && x.done === r.done);
            if (!g) { g = { pk: r.pk, done: r.done, pin: r.pin, nums: [] }; groups.push(g); }
            g.nums.push(r.n);
        });
        // 이동 점선: 마지막 완료 장소 → 남은 일정 순서
        const lastDone = rows.filter(r => r.done && r.pin).pop();
        const seq = (lastDone ? [lastDone] : []).concat(rows.filter(r => !r.done && r.pin));
        const legs = [];
        for (let i = 1; i < seq.length; i++) if (seq[i].pk !== seq[i - 1].pk) legs.push([seq[i - 1].pin, seq[i].pin]);
        // 경고
        const warns = [];
        for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1], b = rows[i];
            if (!b.done && a.pk !== b.pk && b.a.start - a.a.end <= SPEAKER_TRAVEL_MIN) { b.tight = true; warns.push(`${a.n}→${b.n} 이동 ${Math.max(0, b.a.start - a.a.end)}분`); }
        }
        const missing = [...new Set(rows.filter(r => !r.pin).map(r => r.room))];
        if (missing.length) warns.push(`지도 위치 미지정: ${missing.join(', ')}`);
        return { rows, specials, groups, legs, warns };
    }

    /* ---------- 캔버스 ---------- */
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function fit(ctx, s, maxW) {
        if (ctx.measureText(s).width <= maxW) return s;
        while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
        return s + '…';
    }
    function placeBadges(ctx, groups, W, H, allPins) {
        const R = 30, D = 62, O = 40, placed = [];
        const dirs = [[0, -1], [0.75, -0.75], [1, 0], [0.75, 0.75], [0, 1], [-0.75, 0.75], [-1, 0], [-0.75, -0.75]];
        ctx.font = `700 34px ${FONT}`;
        groups.forEach(g => {
            g.label = g.nums.join('·');
            g.w = Math.max(2 * R, ctx.measureText(g.label).width + 30);
            const px = g.pin[0] * W, py = g.pin[1] * H;
            // 다른 방 핀 위에는 배지를 놓지 않는다 (어느 방 배지인지 헷갈리지 않게)
            const obst = allPins.filter(q => Math.abs(q[0] * W - px) > 1 || Math.abs(q[1] * H - py) > 1)
                .map(q => [q[0] * W - O, q[1] * H - O, q[0] * W + O, q[1] * H + O]);
            let best = null;
            for (const [dx, dy] of dirs) {
                const cx = Math.min(W - g.w / 2 - 4, Math.max(g.w / 2 + 4, px + dx * D)), cy = Math.min(H - R - 4, Math.max(R + 4, py + dy * D));
                const box = [cx - g.w / 2 - 6, cy - R - 6, cx + g.w / 2 + 6, cy + R + 6];
                const hit = placed.concat(obst).some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]));
                if (!hit) { best = [cx, cy, box]; break; }
            }
            if (!best) { const cx = px, cy = py - D; best = [cx, cy, [cx - g.w / 2, cy - R, cx + g.w / 2, cy + R]]; }
            g.cx = best[0]; g.cy = best[1]; placed.push(best[2]);
        });
        return R;
    }

    async function render(canvas, p, date) {
        const v = venue();
        const img = await loadImg(v.image);
        try { await document.fonts.load(`700 30px ${FONT}`); } catch (e) { }
        const W = img.naturalWidth, H = img.naturalHeight;
        const P = plan(p, date, v.pins);
        const rowH = 82, nRows = P.rows.length + P.specials.length;
        const boxH = 125 + Math.max(1, nRows) * rowH + (P.warns.length ? 30 + P.warns.length * 44 : 0) - 20;
        canvas.width = W; canvas.height = H + 30 + boxH + 40;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        // 점선
        ctx.save(); ctx.strokeStyle = CO; ctx.lineWidth = Math.max(4, W * 0.005); ctx.setLineDash([18, 18]); ctx.lineCap = 'butt';
        P.legs.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(b[0] * W, b[1] * H); ctx.stroke(); });
        ctx.restore();
        // 배지
        const R = placeBadges(ctx, P.groups, W, H, Object.values(v.pins));
        P.groups.forEach(g => {   // 핀 점 + 배지까지 짧은 연결선
            const px = g.pin[0] * W, py = g.pin[1] * H, c = g.done ? GR : CO;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(g.cx, g.cy); ctx.lineWidth = 3; ctx.strokeStyle = c; ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        });
        P.groups.forEach(g => {
            rr(ctx, g.cx - g.w / 2, g.cy - R, g.w, 2 * R, R);
            ctx.fillStyle = g.done ? GR : CO; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = `700 34px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(g.label, g.cx, g.cy + 1);
        });
        // 일정표
        const x0 = 40, x1 = W - 40, y0 = H + 30;
        rr(ctx, x0, y0, x1 - x0, boxH, 28); ctx.fillStyle = BG; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = CO; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = DK; ctx.font = `700 46px ${FONT}`;
        ctx.fillText(fit(ctx, `${p.name || p.nameEn || ''} · ${mdLabel(date)} 동선`, x1 - x0 - 72), x0 + 36, y0 + 78);
        let y = y0 + 125;
        ctx.textBaseline = 'middle';
        P.rows.forEach(r => {
            const c = r.done ? GR : CO, tc = r.done ? GR : DK;
            ctx.beginPath(); ctx.arc(x0 + 62, y, 26, 0, Math.PI * 2); ctx.fillStyle = r.tight ? RD : c; ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 30px ${FONT}`; ctx.fillText(String(r.n), x0 + 62, y + 1);
            ctx.textAlign = 'left'; ctx.font = `700 38px ${FONT}`; ctx.fillStyle = tc; ctx.fillText(formatTime(r.a.start), x0 + 110, y);
            ctx.fillStyle = c; ctx.fillText(fit(ctx, r.room, 210), x0 + 245, y);
            const st = r.a.conflict ? '겹침' : (r.done ? '완료' : (r.last ? '마지막' : ''));
            ctx.font = `700 30px ${FONT}`; const stW = st ? ctx.measureText(st).width + 20 : 0;
            if (st) { ctx.textAlign = 'right'; ctx.fillStyle = r.a.conflict ? RD : c; ctx.fillText(st, x1 - 36, y); ctx.textAlign = 'left'; }
            ctx.font = `400 34px ${FONT}`; ctx.fillStyle = tc; ctx.fillText(fit(ctx, r.title, x1 - 36 - stW - (x0 + 470)), x0 + 470, y);
            y += rowH;
        });
        P.specials.forEach(a => {
            ctx.beginPath(); ctx.arc(x0 + 62, y, 26, 0, Math.PI * 2); ctx.fillStyle = GR; ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 26px ${FONT}`; ctx.fillText('특', x0 + 62, y + 1);
            ctx.textAlign = 'left'; ctx.fillStyle = DK; ctx.font = `700 34px ${FONT}`; ctx.fillText(fit(ctx, a.timeText || '특별행사', 330), x0 + 110, y);
            ctx.font = `400 34px ${FONT}`; ctx.fillText(fit(ctx, a.title || '', x1 - 36 - (x0 + 470)), x0 + 470, y);
            y += rowH;
        });
        if (!nRows) { ctx.font = `400 34px ${FONT}`; ctx.fillStyle = GR; ctx.fillText('이 날짜에 일정이 없습니다.', x0 + 36, y); y += rowH; }
        if (P.warns.length) {
            y += 10; ctx.font = `700 30px ${FONT}`; ctx.fillStyle = RD;
            P.warns.forEach(w => { ctx.fillText(fit(ctx, '※ ' + w, x1 - x0 - 72), x0 + 36, y); y += 44; });
        }
        return { W, H, P };
    }

    /* ---------- 모달 ---------- */
    function ensureModal() {
        let m = document.getElementById('rmModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'rmModal';
        m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px';
        m.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.25)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <b id="rmTitle" style="font-size:1rem;flex:1">동선이미지</b>
                <button class="btn btn-sm" onclick="rmClose()">닫기</button>
            </div>
            <div id="rmDates" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"></div>
            <div id="rmPinBar" style="display:none;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:.85rem;background:#FFF4E5;padding:8px;border-radius:8px">
                <span>룸 선택 후 지도를 탭하면 위치가 저장됩니다</span>
                <select id="rmPinSel"></select>
            </div>
            <canvas id="rmCanvas" style="width:100%;height:auto;border:1px solid #eee;border-radius:8px;display:block"></canvas>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
                <button class="btn btn-sm btn-primary" onclick="rmDownload()">⬇ PNG 저장</button>
                <button class="btn btn-sm" id="rmShareBtn" onclick="rmShare()">공유</button>
                <button class="btn btn-sm" id="rmPinBtn" onclick="rmTogglePin()" style="margin-left:auto">📍 위치 수정</button>
            </div>
        </div>`;
        m.addEventListener('click', e => { if (e.target === m) rmClose(); });
        document.body.appendChild(m);
        document.getElementById('rmCanvas').addEventListener('click', onCanvasClick);
        if (!(navigator.canShare)) document.getElementById('rmShareBtn').style.display = 'none';
        return m;
    }
    let LASTDRAW = null;
    async function draw() {
        if (!RM) return;
        const p = getPersonByKey(RM.key); if (!p) return;
        const v = venue(); if (!v) return;
        const ds = personDates(p);
        document.getElementById('rmTitle').textContent = `${p.name || p.nameEn || ''} 동선이미지`;
        document.getElementById('rmDates').innerHTML = ds.map(d => `<button class="btn btn-sm ${d === RM.date ? 'btn-primary' : ''}" onclick="rmSetDate('${d}')">${mdLabel(d)}</button>`).join('');
        try { LASTDRAW = await render(document.getElementById('rmCanvas'), p, RM.date); }
        catch (e) { console.error(e); if (window.Toast) Toast.error('지도 이미지를 불러오지 못했습니다.'); return; }
        // 위치 수정용 룸 목록 (이 행사 전체 룸, 핀 없는 방은 ⚠)
        const sel = document.getElementById('rmPinSel');
        const cur = sel.value;
        const keys = new Map();
        toOrderedArray(ROOMS).forEach(r => { const k = placeKey(r.name); if (k && !keys.has(k)) keys.set(k, roomLabel(r.name)); });
        sel.innerHTML = [...keys].map(([k, lb]) => `<option value="${escapeHtml(k)}">${v.pins[k] ? '' : '⚠ '}${escapeHtml(lb)}</option>`).join('');
        if (cur && keys.has(cur)) sel.value = cur;
        else { const miss = [...keys.keys()].find(k => !v.pins[k]); if (miss) sel.value = miss; }
    }
    function onCanvasClick(e) {
        if (!RM || !RM.pinEdit || !LASTDRAW) return;
        const c = e.currentTarget, rect = c.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (c.width / rect.width), y = (e.clientY - rect.top) * (c.height / rect.height);
        if (y > LASTDRAW.H) return;
        const k = document.getElementById('rmPinSel').value; if (!k) return;
        const val = { x: +(x / LASTDRAW.W).toFixed(4), y: +(y / LASTDRAW.H).toFixed(4) };
        database.ref('/adminConferences/' + CONF_ID + '/venueMap/pins/' + k.replace(/[.#$\[\]\/]/g, '_')).set(val)
            .then(() => { database.ref('/adminConferences/' + CONF_ID + '/venueMap/updatedAt').set(Date.now()); if (window.Toast) Toast.success('위치를 저장했습니다.'); })
            .catch(err => { if (window.Toast) Toast.error('저장 실패: ' + (err && err.message || err)); });
    }
    function fileName() {
        const p = getPersonByKey(RM.key) || {};
        return `ASLS_${RM.date.slice(5).replace('-', '')}_${(p.name || p.nameEn || '연자').replace(/[\\/:*?"<>|\s]/g, '')}_동선.png`;
    }

    window.ssRouteMap = function (key) {
        watchVenue();
        const p = getPersonByKey(key); if (!p) return;
        if (!venue()) { if (window.Toast) Toast.warning('이 행사는 동선 지도가 아직 설정되지 않았습니다.'); return; }
        const date = pickDate(p);
        if (!date) { if (window.Toast) Toast.info('배치된 일정이 없습니다.'); return; }
        RM = { key, date, pinEdit: false };
        const m = ensureModal(); m.style.display = 'flex';
        document.getElementById('rmPinBar').style.display = 'none';
        document.getElementById('rmPinBtn').classList.remove('btn-primary');
        draw();
    };
    window.rmClose = function () { RM = null; const m = document.getElementById('rmModal'); if (m) m.style.display = 'none'; };
    window.rmSetDate = function (d) { if (!RM) return; RM.date = d; draw(); };
    window.rmTogglePin = function () {
        if (!RM) return; RM.pinEdit = !RM.pinEdit;
        document.getElementById('rmPinBar').style.display = RM.pinEdit ? 'flex' : 'none';
        document.getElementById('rmPinBtn').classList.toggle('btn-primary', RM.pinEdit);
    };
    window.rmDownload = function () {
        const c = document.getElementById('rmCanvas');
        c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }, 'image/png');
    };
    window.rmShare = function () {
        const c = document.getElementById('rmCanvas');
        c.toBlob(async b => {
            const f = new File([b], fileName(), { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: fileName() }); } catch (e) { } }
            else rmDownload();
        }, 'image/png');
    };
    window.RouteMap = { placeKey, plan };
})();
