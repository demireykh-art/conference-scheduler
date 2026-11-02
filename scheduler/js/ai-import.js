// ============================================
// ai-import.js - AI 강의 입력 (캡처·PDF·텍스트 → 강의 항목)
// 서버 함수 aiExtractLectures(functions/index.js)를 호출하고
// 결과를 기존 '강의 일괄 업로드' 미리보기에 올린다. 저장은 '업로드 확정'에서만.
// ============================================

(function() {
    'use strict';

    const MAX_FILES = 10;
    const MAX_IMAGE_EDGE = 1568; // Claude 비전 권장 최대 변 길이
    let aiFiles = []; // { name, mediaType, data(base64), previewUrl }

    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    // 큰 캡처는 줄여서 보냄 (속도·비용 절약)
    function shrinkImage(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async function addFiles(fileList) {
        for (const file of Array.from(fileList || [])) {
            if (aiFiles.length >= MAX_FILES) {
                Toast.warning(`파일은 ${MAX_FILES}개까지 넣을 수 있어요.`);
                break;
            }
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            const isImage = /^image\//.test(file.type);
            if (!isPdf && !isImage) {
                Toast.warning(`${file.name}: 이미지나 PDF만 가능합니다. (엑셀은 기존 파일 업로드를 써주세요)`);
                continue;
            }
            let dataUrl = await readAsDataUrl(file);
            let mediaType = isPdf ? 'application/pdf' : file.type;
            if (isImage) {
                dataUrl = await shrinkImage(dataUrl);
                mediaType = 'image/jpeg';
            }
            aiFiles.push({
                name: file.name || '붙여넣은 이미지',
                mediaType,
                data: dataUrl.split(',')[1],
                previewUrl: isImage ? dataUrl : ''
            });
        }
        renderFileChips();
    }

    function renderFileChips() {
        const box = document.getElementById('aiImportFiles');
        if (!box) return;
        box.innerHTML = aiFiles.map((f, i) => `
            <span style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:2px 6px;font-size:0.75rem;">
                ${f.previewUrl ? `<img src="${f.previewUrl}" style="width:24px;height:24px;object-fit:cover;border-radius:4px;">` : '📄'}
                ${f.name.length > 18 ? f.name.slice(0, 18) + '…' : f.name}
                <button type="button" onclick="removeAiImportFile(${i})" style="border:none;background:none;cursor:pointer;color:#999;">×</button>
            </span>`).join('');
    }

    function removeAiImportFile(i) {
        aiFiles.splice(i, 1);
        renderFileChips();
    }

    function clearAiImport() {
        aiFiles = [];
        renderFileChips();
        const t = document.getElementById('aiImportText');
        if (t) t.value = '';
    }

    function buildContext() {
        const S = window.AppState || {};
        return {
            categories: (S.categories || []).filter(Boolean),
            speakers: (S.speakers || []).map(s => {
                if (!s) return '';
                const extra = [s.affiliation].filter(Boolean).join(' ');
                return extra ? `${s.name}(${extra})` : s.name;
            }).filter(Boolean),
            companies: (S.companies || []).map(c => (typeof c === 'string' ? c : c && c.name)).filter(Boolean)
        };
    }

    async function runAiImport() {
        if (!window.checkEditPermission()) return;
        const text = (document.getElementById('aiImportText')?.value || '').trim();
        if (!text && aiFiles.length === 0) {
            Toast.warning('캡처·PDF를 넣거나 텍스트를 붙여넣어 주세요.');
            return;
        }
        if (!firebase.functions) {
            Toast.error('AI 기능 스크립트가 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.');
            return;
        }
        const btn = document.getElementById('aiImportBtn');
        const original = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ AI가 읽는 중… (10~30초)'; }
        try {
            const call = firebase.app().functions('asia-northeast3').httpsCallable('aiExtractLectures', { timeout: 130000 });
            const res = await call({
                text,
                files: aiFiles.map(f => ({ mediaType: f.mediaType, data: f.data })),
                context: buildContext()
            });
            const lectures = (res.data && res.data.lectures) || [];
            if (lectures.length === 0) {
                Toast.warning('자료에서 강의를 찾지 못했어요. 제목·연자가 보이게 다시 넣어주세요.');
                return;
            }
            window.previewAiLectures(lectures);
            Toast.success(`AI가 ${lectures.length}개 강의를 찾았어요. 미리보기를 확인하고 '업로드 확정'을 눌러주세요.`);
        } catch (e) {
            console.error('AI 입력 오류:', e);
            Toast.error('AI 입력 실패: ' + (e && e.message ? e.message : e));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = original; }
        }
    }

    function setupAiImport() {
        const zone = document.getElementById('aiImportZone');
        if (!zone || zone.dataset.ready) return;
        zone.dataset.ready = '1';
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.style.borderColor = '';
            addFiles(e.dataTransfer.files);
        });
        // 캡처를 Ctrl/Cmd+V로 바로 붙여넣기
        const ta = document.getElementById('aiImportText');
        if (ta) {
            ta.addEventListener('paste', e => {
                const imgs = Array.from(e.clipboardData?.items || [])
                    .filter(it => it.kind === 'file')
                    .map(it => it.getAsFile())
                    .filter(Boolean);
                if (imgs.length) {
                    e.preventDefault();
                    addFiles(imgs);
                }
            });
        }
    }

    // 업로드 모달이 열릴 때 AI 영역도 초기화
    const originalOpen = window.openUploadModal;
    if (typeof originalOpen === 'function') {
        window.openUploadModal = function() {
            originalOpen.apply(this, arguments);
            clearAiImport();
            setupAiImport();
        };
    }

    window.addAiImportFiles = addFiles;
    window.removeAiImportFile = removeAiImportFile;
    window.runAiImport = runAiImport;
    window.clearAiImport = clearAiImport;
})();
