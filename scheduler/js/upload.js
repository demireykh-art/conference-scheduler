// ============================================
// upload.js - 강의 일괄 업로드 모듈
// ============================================

(function() {
    'use strict';
    
    let pendingUploadData = [];
    let pendingAiNotes = null; // AI 입력일 때만: 강의별 확인 메모 [{note, speakerMatched, durationGuessed}]
    
    // ============================================
    // 모달 관리
    // ============================================
    
    function openUploadModal() {
        if (!window.checkEditPermission()) {
            Toast.warning('편집 권한이 없습니다.');
            return;
        }
        document.getElementById('uploadModal').classList.add('active');
        clearUploadPreview();
        setupDropZone();
    }
    
    function closeUploadModal() {
        document.getElementById('uploadModal').classList.remove('active');
        clearUploadPreview();
    }
    
    function clearUploadPreview() {
        pendingUploadData = [];
        pendingAiNotes = null;
        const uploadPreview = document.getElementById('uploadPreview');
        const previewTableBody = document.getElementById('previewTableBody');
        const previewCount = document.getElementById('previewCount');
        const uploadFileInput = document.getElementById('uploadFileInput');
        const duplicateWarning = document.getElementById('duplicateWarning');
        const duplicateOptionsSection = document.getElementById('duplicateOptionsSection');
        
        if (uploadPreview) uploadPreview.style.display = 'none';
        if (previewTableBody) previewTableBody.innerHTML = '';
        if (previewCount) previewCount.textContent = '0';
        if (uploadFileInput) uploadFileInput.value = '';
        if (duplicateWarning) duplicateWarning.style.display = 'none';
        if (duplicateOptionsSection) duplicateOptionsSection.style.display = 'none';
    }
    
    // ============================================
    // 드롭존 설정
    // ============================================
    
    function setupDropZone() {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;
        
        // 드래그 오버 이벤트
        dropZone.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = 'var(--accent)';
            dropZone.style.background = 'rgba(255, 107, 157, 0.1)';
        };
        
        // 드래그 떠날 때 이벤트
        dropZone.ondragleave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'var(--bg)';
        };
        
        // 드롭 이벤트
        dropZone.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'var(--bg)';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                processUploadFile(files[0]);
            }
        };
        
        // 파일 선택 버튼 연결
        const selectBtn = document.getElementById('selectFileBtn');
        if (selectBtn) {
            selectBtn.onclick = () => document.getElementById('uploadFileInput').click();
        }
    }
    
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            processUploadFile(file);
        }
    }
    
    // ============================================
    // 파일 처리
    // ============================================
    
    function processUploadFile(file) {
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        const fileName = file.name.toLowerCase();
        const isValid = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!isValid) {
            Toast.warning('지원되지 않는 파일 형식입니다.\n지원 형식: Excel (.xlsx, .xls), CSV (.csv)');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
                
                parseAndPreviewData(jsonData);
            } catch (error) {
                console.error('파일 파싱 오류:', error);
                Toast.error('파일을 읽는 중 오류가 발생했습니다.\n' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    // ============================================
    // 데이터 파싱
    // ============================================
    
    function parseAndPreviewData(jsonData) {
        // 강의 시간 컬럼 매핑
        const durationMapping = {
            '정규\n강의\n(일/15분)': 15,
            '일반\n강의\n(토/20분)': 20,
            '추가강의\n(토요일)': 20,
            '런천\n강의\n(정규/일)': 20,
            '런천\n강의\n(토)': 20,
            '일반\n강의\n(일/10분)': 10,
            '런천\n강의\n(일/20분)': 20,
            '런천\n강의\n(일반/토)': 20,
            '엑스퍼트써밋': 30,
            '오픈\n렉처\n(일/10분)': 10
        };
        
        // 런천강의 여부 컬럼
        const luncheonColumns = [
            '런천\n강의\n(정규/일)',
            '런천\n강의\n(토)',
            '런천\n강의\n(일/20분)',
            '런천\n강의\n(일반/토)'
        ];
        
        pendingUploadData = [];
        let lastCategory = '';
        let lastCompanyName = '';
        let lastBoothCount = 0;
        
        // 파트너사 정보 수집 (업체명, 부스갯수)
        const sponsorInfo = {};
        
        jsonData.forEach((row, index) => {
            // 업체명과 부스갯수 추적
            const companyName = (row['업체명'] || '').toString().trim();
            const boothCount = parseInt(row['부스갯수']) || 0;
            
            if (companyName) {
                lastCompanyName = companyName;
                lastBoothCount = boothCount || lastBoothCount;
                // 파트너사 정보 저장
                if (!sponsorInfo[companyName] || boothCount > 0) {
                    sponsorInfo[companyName] = boothCount || sponsorInfo[companyName] || 0;
                }
            }
            
            // 제목이 있는 행만 처리
            const titleKo = (row['제목(국문)'] || row['제목'] || '').toString().trim();
            const titleEn = (row['제목(영문)'] || '').toString().trim();
            
            if (!titleKo && !titleEn) return;
            if (titleKo === '미정' || titleEn === '미정') return;
            
            // 분류 처리 (비어있으면 이전 값 사용)
            let category = (row['분류'] || '').toString().trim();
            if (category) {
                lastCategory = category;
            } else {
                category = lastCategory;
            }
            
            // 강의 시간 결정
            let duration = 15; // 기본값
            let isLuncheon = false;
            
            for (const [col, dur] of Object.entries(durationMapping)) {
                if (row[col] && row[col] !== '' && !isNaN(row[col])) {
                    duration = dur;
                    // 런천강의 컬럼인지 확인
                    if (luncheonColumns.includes(col)) {
                        isLuncheon = true;
                    }
                    break;
                }
            }
            
            // 강의시간 컬럼 직접 확인
            if (row['강의시간']) {
                const parsed = parseInt(row['강의시간']);
                if (!isNaN(parsed) && parsed > 0) {
                    duration = parsed;
                }
            }
            
            const speakerName = (row['연자'] || row['연자명'] || '').toString().trim();
            const hospitalName = (row['병원명'] || row['소속'] || '').toString().trim();
            const productInfo = (row['제품세부'] || row['제품명'] || '').toString().trim();
            
            // 연자가 '미정'이면 빈 값으로 처리
            const finalSpeaker = speakerName === '미정' ? '' : speakerName;
            
            const lecture = {
                id: Date.now() + index,
                category: category || 'Others',
                titleKo: titleKo || titleEn,
                titleEn: titleEn,
                speakerKo: finalSpeaker,
                speakerEn: '',
                affiliation: hospitalName,
                affiliationEn: '',
                duration: duration,
                // 파트너사 관련 정보 추가
                companyName: lastCompanyName,
                productName: productInfo,
                isLuncheon: isLuncheon
            };
            
            pendingUploadData.push(lecture);
        });
        
        // 파트너사 정보를 AppState.companies에 저장
        updateCompaniesFromUpload(sponsorInfo);
        
        displayUploadPreview();
    }
    
    // 업로드된 파트너사 정보를 companies에 반영
    function updateCompaniesFromUpload(sponsorInfo) {
        if (!AppState.companies) {
            AppState.companies = [];
        }
        
        for (const [companyName, boothCount] of Object.entries(sponsorInfo)) {
            if (!companyName) continue;
            
            const existingIndex = AppState.companies.findIndex(c => 
                (typeof c === 'string' ? c : c.name) === companyName
            );
            
            if (existingIndex >= 0) {
                // 기존 업체 업데이트
                if (typeof AppState.companies[existingIndex] === 'string') {
                    AppState.companies[existingIndex] = {
                        name: companyName,
                        boothCount: boothCount
                    };
                } else {
                    AppState.companies[existingIndex].boothCount = boothCount || AppState.companies[existingIndex].boothCount;
                }
            } else {
                // 새 업체 추가
                AppState.companies.push({
                    name: companyName,
                    boothCount: boothCount
                });
            }
        }
    }
    
    // ============================================
    // 중복 감지
    // ============================================
    
    function detectDuplicates(uploadData) {
        const lectures = window.AppState.lectures;
        
        return uploadData.map(newLecture => {
            return lectures.some(existingLecture => {
                const normalizedNewTitle = window.normalizeTitle(newLecture.titleKo);
                const normalizedExistingTitle = window.normalizeTitle(existingLecture.titleKo);
                
                const titleMatch = normalizedNewTitle === normalizedExistingTitle ||
                                  window.calculateSimilarity(normalizedNewTitle, normalizedExistingTitle) > 0.8;
                
                const speakerMatch = !newLecture.speakerKo || !existingLecture.speakerKo ||
                                    newLecture.speakerKo === existingLecture.speakerKo;
                
                return titleMatch && speakerMatch;
            });
        });
    }
    
    // ============================================
    // 미리보기 표시
    // ============================================
    
    function displayUploadPreview() {
        if (pendingUploadData.length === 0) {
            Toast.warning('업로드 가능한 강의 데이터가 없습니다.');
            return;
        }
        
        // 중복 감지
        const duplicates = detectDuplicates(pendingUploadData);
        const duplicateCount = duplicates.filter(d => d).length;
        
        // 중복 옵션 섹션 표시
        document.getElementById('duplicateWarning').style.display = duplicateCount > 0 ? 'block' : 'none';
        document.getElementById('duplicateCount').textContent = duplicateCount;
        const duplicateSection = document.getElementById('duplicateOptionsSection');
        if (duplicateSection) {
            duplicateSection.style.display = duplicateCount > 0 ? 'block' : 'none';
        }
        document.getElementById('skipDuplicateCount').textContent = duplicateCount;
        
        document.getElementById('uploadPreview').style.display = 'block';
        document.getElementById('previewCount').textContent = pendingUploadData.length;
        
        // 테이블 헤더
        document.getElementById('previewTableHeader').innerHTML = `
            <th style="padding: 0.5rem; text-align: left; width: 30px;"></th>
            <th style="padding: 0.5rem; text-align: left;">분류</th>
            <th style="padding: 0.5rem; text-align: left;">제목(국문)</th>
            <th style="padding: 0.5rem; text-align: left;">연자</th>
            <th style="padding: 0.5rem; text-align: left;">시간</th>
        `;
        
        const tbody = document.getElementById('previewTableBody');
        tbody.innerHTML = pendingUploadData.map((lecture, index) => {
            const isDuplicate = duplicates[index];
            const bgColor = isDuplicate ? '#FFF8E1' : (index % 2 ? '#f9f9f9' : 'white');
            return `
            <tr style="border-bottom: 1px solid var(--border); background: ${bgColor};" data-index="${index}" data-duplicate="${isDuplicate}">
                <td style="padding: 0.4rem; text-align: center;">
                    ${isDuplicate ? '<span title="중복 항목">🔄</span>' : ''}
                </td>
                <td style="padding: 0.4rem;">${lecture.category}</td>
                <td style="padding: 0.4rem;">${esc(lecture.titleKo.substring(0, 40))}${lecture.titleKo.length > 40 ? '...' : ''}${aiInfoHtml(index, lecture)}</td>
                <td style="padding: 0.4rem;">${esc(lecture.speakerKo || '-')}${aiSpeakerBadge(index, lecture)}</td>
                <td style="padding: 0.4rem;">${lecture.duration}분${pendingAiNotes && pendingAiNotes[index] && pendingAiNotes[index].durationGuessed ? '<br><span style="color:#999;font-size:0.7rem;">(기본값)</span>' : ''}</td>
            </tr>
        `}).join('');
    }

    function esc(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // AI 입력 미리보기 보조 표시 (영문 제목·업체·확인 메모)
    function aiInfoHtml(index, lecture) {
        if (!pendingAiNotes || !pendingAiNotes[index]) return '';
        const parts = [];
        if (lecture.titleEn) parts.push(`<div style="color:#666;font-size:0.72rem;">${esc(lecture.titleEn)}</div>`);
        if (lecture.companyName || lecture.productName) {
            parts.push(`<div style="color:#1565C0;font-size:0.72rem;">🏢 ${esc([lecture.companyName, lecture.productName].filter(Boolean).join(' · '))}</div>`);
        }
        if (pendingAiNotes[index].note) {
            parts.push(`<div style="color:#E65100;font-size:0.72rem;">⚠️ ${esc(pendingAiNotes[index].note)}</div>`);
        }
        return parts.join('');
    }

    function aiSpeakerBadge(index, lecture) {
        if (!pendingAiNotes || !pendingAiNotes[index] || !lecture.speakerKo) return '';
        return pendingAiNotes[index].speakerMatched
            ? ' <span title="기존 연자 목록과 일치" style="color:#27ae60;">✓</span>'
            : '<br><span style="color:#E65100;font-size:0.7rem;">신규 연자?</span>';
    }

    /**
     * AI가 뽑은 강의를 기존 업로드 미리보기에 올림 (ai-import.js에서 호출)
     * 저장은 하지 않음 — 사람이 '업로드 확정'을 눌러야 저장
     */
    function previewAiLectures(aiLectures) {
        const categories = window.AppState.categories || [];
        const baseId = Date.now();
        pendingAiNotes = [];
        pendingUploadData = (aiLectures || [])
            .filter(l => l && (String(l.titleKo || '').trim() || String(l.titleEn || '').trim()))
            .map((l, i) => {
                const dur = parseInt(l.duration, 10);
                const cat = String(l.category || '').trim();
                pendingAiNotes.push({
                    note: String(l.note || '').trim() + (cat && !categories.includes(cat) ? ` (분류 '${cat}'는 목록에 없음)` : ''),
                    speakerMatched: !!l.speakerMatched,
                    durationGuessed: !(dur > 0)
                });
                const titleKo = String(l.titleKo || '').trim();
                const titleEn = String(l.titleEn || '').trim();
                return {
                    id: baseId + i,
                    category: cat || 'Others',
                    titleKo: titleKo || titleEn,
                    titleEn: titleEn,
                    speakerKo: String(l.speakerKo || '').trim(),
                    speakerEn: String(l.speakerEn || '').trim(),
                    affiliation: String(l.affiliation || '').trim(),
                    affiliationEn: String(l.affiliationEn || '').trim(),
                    duration: dur > 0 ? dur : 15,
                    companyName: String(l.companyName || '').trim(),
                    productName: String(l.productName || '').trim(),
                    isLuncheon: !!l.isLuncheon
                };
            });
        displayUploadPreview();
        const preview = document.getElementById('uploadPreview');
        if (preview && preview.scrollIntoView) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // ============================================
    // 업로드 확정
    // ============================================
    
    async function confirmUpload() {
        if (pendingUploadData.length === 0) {
            Toast.warning('업로드할 데이터가 없습니다.');
            return;
        }
        
        const replaceAllMode = document.getElementById('replaceAllMode')?.checked || false;
        
        const lectures = window.AppState.lectures;
        const dataByDate = window.AppState.dataByDate;
        const speakers = window.AppState.speakers;
        const categories = window.AppState.categories;
        const schedule = window.AppState.schedule;
        
        // 전체 교체 모드
        if (replaceAllMode) {
            if (!confirm(`⚠️ 기존 강의 ${lectures.length}개를 모두 삭제하고 새로운 ${pendingUploadData.length}개로 대체합니다.\n\n⚠️ 시간표 배치도 모두 초기화됩니다!\n\n계속하시겠습니까?`)) {
                return;
            }
            // 강의 목록 초기화
            window.AppState.lectures = [];
            // 모든 날짜의 시간표도 초기화
            Object.keys(dataByDate).forEach(date => {
                if (dataByDate[date]) {
                    dataByDate[date].lectures = [];
                    dataByDate[date].schedule = {};
                }
            });
            window.AppState.schedule = {};
        }
        
        // 중복 감지 (제목 기준)
        const duplicates = detectDuplicates(pendingUploadData);
        let skippedCount = 0;
        let addedCount = 0;
        let updatedCount = 0;
        
        // 강의 ID 재할당 (충돌 방지)
        const baseId = Date.now();
        pendingUploadData.forEach((lecture, index) => {
            const isDuplicate = duplicates[index];
            
            // 중복인 경우: 항상 업데이트 (새 UI에서는 자동으로 업데이트)
            if (isDuplicate) {
                // 기존 강의 업데이트
                const existingLecture = findExistingLecture(lecture);
                if (existingLecture) {
                    // 기존 강의 정보 업데이트 (ID와 배치 정보는 유지)
                    existingLecture.category = lecture.category || existingLecture.category;
                    existingLecture.titleKo = lecture.titleKo || existingLecture.titleKo;
                    existingLecture.titleEn = lecture.titleEn || existingLecture.titleEn;
                    existingLecture.speakerKo = lecture.speakerKo || existingLecture.speakerKo;
                    existingLecture.speakerEn = lecture.speakerEn || existingLecture.speakerEn;
                    existingLecture.affiliation = lecture.affiliation || existingLecture.affiliation;
                    existingLecture.duration = lecture.duration || existingLecture.duration;
                    // 파트너사 정보 업데이트
                    existingLecture.companyName = lecture.companyName || existingLecture.companyName;
                    existingLecture.productName = lecture.productName || existingLecture.productName;
                    existingLecture.isLuncheon = lecture.isLuncheon || existingLecture.isLuncheon;
                    
                    // 배치된 스케줄에도 동일하게 업데이트
                    const lectureId = existingLecture.id;
                    const lectureTitleKo = existingLecture.titleKo;
                    
                    // 현재 날짜 스케줄 업데이트 (id 또는 제목으로 매칭)
                    Object.keys(window.AppState.schedule).forEach(key => {
                        const scheduledLecture = window.AppState.schedule[key];
                        const isMatch = scheduledLecture.id === lectureId || 
                                       scheduledLecture.titleKo === lectureTitleKo ||
                                       (window.normalizeTitle && window.calculateSimilarity && 
                                        window.calculateSimilarity(window.normalizeTitle(scheduledLecture.titleKo || ''), window.normalizeTitle(lectureTitleKo || '')) > 0.8);
                        
                        if (isMatch) {
                            window.AppState.schedule[key].category = existingLecture.category;
                            window.AppState.schedule[key].titleKo = existingLecture.titleKo;
                            window.AppState.schedule[key].titleEn = existingLecture.titleEn;
                            window.AppState.schedule[key].speakerKo = existingLecture.speakerKo;
                            window.AppState.schedule[key].speakerEn = existingLecture.speakerEn;
                            window.AppState.schedule[key].affiliation = existingLecture.affiliation;
                            window.AppState.schedule[key].duration = existingLecture.duration;
                            window.AppState.schedule[key].companyName = existingLecture.companyName;
                            window.AppState.schedule[key].productName = existingLecture.productName;
                            window.AppState.schedule[key].isLuncheon = existingLecture.isLuncheon;
                            console.log(`[업데이트] 스케줄 강의: ${lectureTitleKo}, 회사: ${existingLecture.companyName}`);
                        }
                    });
                    
                    // 모든 날짜의 스케줄도 업데이트
                    Object.keys(dataByDate).forEach(date => {
                        const dateSchedule = dataByDate[date]?.schedule || {};
                        Object.keys(dateSchedule).forEach(key => {
                            const scheduledLecture = dateSchedule[key];
                            const isMatch = scheduledLecture.id === lectureId || 
                                           scheduledLecture.titleKo === lectureTitleKo ||
                                           (window.normalizeTitle && window.calculateSimilarity && 
                                            window.calculateSimilarity(window.normalizeTitle(scheduledLecture.titleKo || ''), window.normalizeTitle(lectureTitleKo || '')) > 0.8);
                            
                            if (isMatch) {
                                dateSchedule[key].category = existingLecture.category;
                                dateSchedule[key].titleKo = existingLecture.titleKo;
                                dateSchedule[key].titleEn = existingLecture.titleEn;
                                dateSchedule[key].speakerKo = existingLecture.speakerKo;
                                dateSchedule[key].speakerEn = existingLecture.speakerEn;
                                dateSchedule[key].affiliation = existingLecture.affiliation;
                                dateSchedule[key].duration = existingLecture.duration;
                                dateSchedule[key].companyName = existingLecture.companyName;
                                dateSchedule[key].productName = existingLecture.productName;
                                dateSchedule[key].isLuncheon = existingLecture.isLuncheon;
                            }
                        });
                    });
                    
                    updatedCount++;
                    return;
                }
                // 기존 강의를 찾지 못한 경우 새로 추가
            }
            
            // 새 강의 추가
            lecture.id = baseId + addedCount;
            window.AppState.lectures.push(lecture);
            addedCount++;
        });
        
        // 새 카테고리 자동 추가
        const newCategories = [...new Set(pendingUploadData.map(l => l.category))];
        newCategories.forEach(cat => {
            if (cat && !categories.includes(cat)) {
                window.AppState.categories.push(cat);
            }
        });
        
        // 새 연자 자동 추가
        pendingUploadData.forEach(lecture => {
            if (lecture.speakerKo && !speakers.find(s => s.name === lecture.speakerKo)) {
                window.AppState.speakers.push({
                    name: lecture.speakerKo,
                    nameEn: lecture.speakerEn || '',
                    affiliation: lecture.affiliation || '',
                    affiliationEn: lecture.affiliationEn || ''
                });
            }
        });
        
        // 강의 목록은 전역이므로 모든 날짜에 동일하게 저장
        Object.keys(dataByDate).forEach(date => {
            if (dataByDate[date]) {
                dataByDate[date].lectures = [...window.AppState.lectures];
            }
        });
        
        // 현재 날짜의 스케줄을 AppState.schedule과 동기화 (중요!)
        const currentDate = window.AppState.currentDate;
        if (dataByDate[currentDate] && dataByDate[currentDate].schedule) {
            window.AppState.schedule = dataByDate[currentDate].schedule;
        }
        
        // UI 먼저 업데이트
        window.updateCategoryDropdowns();
        window.createCategoryFilters();
        window.updateLectureList();
        window.updateScheduleDisplay();
        
        // undefined 값을 제거하는 함수 (Firebase는 undefined 저장 불가)
        function sanitizeForFirebase(obj) {
            if (obj === undefined) return null;
            if (obj === null) return null;
            if (typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) {
                return obj.map(item => sanitizeForFirebase(item));
            }
            const sanitized = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const value = obj[key];
                    if (value !== undefined) {
                        sanitized[key] = sanitizeForFirebase(value);
                    }
                }
            }
            return sanitized;
        }
        
        // Firebase에 저장 (동기적으로 기다림)
        try {
            // dataByDate 전체를 저장
            window.AppState.dataByDate[currentDate] = {
                lectures: window.AppState.lectures,
                schedule: window.AppState.schedule,
                sessions: window.AppState.sessions
            };
            
            // undefined 값 제거 후 저장
            const sanitizedDataByDate = sanitizeForFirebase(window.AppState.dataByDate);
            const sanitizedSpeakers = sanitizeForFirebase(window.AppState.speakers);
            const sanitizedCompanies = sanitizeForFirebase(window.AppState.companies);
            const sanitizedCategories = sanitizeForFirebase(window.AppState.categories);
            
            await firebase.database().ref('/data/dataByDate').set(sanitizedDataByDate);
            await firebase.database().ref('/data/speakers').set(sanitizedSpeakers);
            await firebase.database().ref('/data/companies').set(sanitizedCompanies);
            await firebase.database().ref('/data/categories').set(sanitizedCategories);
            await firebase.database().ref('/data/lastModified').set(firebase.database.ServerValue.TIMESTAMP);
            await firebase.database().ref('/data/lastModifiedBy').set(window.AppState.currentUser ? window.AppState.currentUser.email : 'unknown');
            
            console.log('✅ Firebase 저장 완료');
            
            // 결과 메시지
            let message = `✅ 업로드 및 저장 완료!\n\n`;
            message += `📥 새로 추가: ${addedCount}개\n`;
            if (updatedCount > 0) message += `🔄 업데이트: ${updatedCount}개\n`;
            if (skippedCount > 0) message += `⏭️ 건너뜀: ${skippedCount}개\n`;
            message += `\n📚 현재 총 강의: ${window.AppState.lectures.length}개`;
            
            Toast.info(message, 5000);
        } catch (error) {
            console.error('❌ Firebase 저장 실패:', error);
            Toast.error(`저장 중 오류 발생!\n\n${error.message}\n\n데이터가 저장되지 않았을 수 있습니다.`);
        }
        
        closeUploadModal();
    }
    
    // 제목으로 기존 강의 찾기
    function findExistingLecture(newLecture) {
        const normalizedNewTitle = window.normalizeTitle(newLecture.titleKo);
        
        return window.AppState.lectures.find(existingLecture => {
            const normalizedExistingTitle = window.normalizeTitle(existingLecture.titleKo);
            return normalizedNewTitle === normalizedExistingTitle ||
                   window.calculateSimilarity(normalizedNewTitle, normalizedExistingTitle) > 0.8;
        });
    }
    
    // ============================================
    // 배치 완료 파일 업로드
    // ============================================
    
    function openScheduleUploadModal() {
        if (!window.checkEditPermission()) {
            Toast.warning('편집 권한이 없습니다.');
            return;
        }
        document.getElementById('scheduleUploadModal').classList.add('active');
        clearScheduleUploadPreview();
        setupScheduleDropZone();
    }
    
    function closeScheduleUploadModal() {
        document.getElementById('scheduleUploadModal').classList.remove('active');
        clearScheduleUploadPreview();
    }
    
    function clearScheduleUploadPreview() {
        document.getElementById('scheduleUploadPreview').style.display = 'none';
        document.getElementById('schedulePreviewContent').innerHTML = '';
        document.getElementById('scheduleUploadFileInput').value = '';
    }
    
    // 배치 파일 드롭존 설정
    function setupScheduleDropZone() {
        const dropZone = document.getElementById('scheduleDropZone');
        if (!dropZone) return;
        
        // 기존 이벤트 리스너 제거 후 재설정
        const newDropZone = dropZone.cloneNode(true);
        dropZone.parentNode.replaceChild(newDropZone, dropZone);
        
        newDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            newDropZone.style.borderColor = 'var(--accent)';
            newDropZone.style.background = 'rgba(255, 107, 157, 0.1)';
        });
        
        newDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            newDropZone.style.borderColor = 'var(--border)';
            newDropZone.style.background = 'var(--bg)';
        });
        
        newDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            newDropZone.style.borderColor = 'var(--border)';
            newDropZone.style.background = 'var(--bg)';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                processScheduleFile(files[0]);
            }
        });
        
        // 파일 선택 버튼 재연결
        const selectBtn = newDropZone.querySelector('button');
        if (selectBtn) {
            selectBtn.onclick = () => document.getElementById('scheduleUploadFileInput').click();
        }
    }
    
    // 배치 파일 처리
    function processScheduleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            Toast.warning('Excel 파일(.xlsx, .xls)만 지원됩니다.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'HH:mm' });
                
                parseScheduleData(jsonData, file.name);
            } catch (error) {
                console.error('파일 파싱 오류:', error);
                Toast.error('파일 파싱 중 오류가 발생했습니다:\n' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    function handleScheduleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        processScheduleFile(file);
    }
    
    let pendingScheduleData = { room: '', sessions: [], lectures: [] };
    
    function parseScheduleData(rows, fileName) {
        if (rows.length < 2) {
            Toast.warning('데이터가 없습니다.');
            return;
        }
        
        // 첫 번째 행은 헤더
        const header = rows[0];
        const dataRows = rows.slice(1);
        
        // 룸 이름 추출 (첫 번째 데이터 행의 A열에서) - 그대로 사용
        let roomName = '';
        if (dataRows.length > 0 && dataRows[0][0]) {
            roomName = String(dataRows[0][0]).trim();
        }
        
        // 세션 및 강의 파싱
        const sessions = {};
        const lectures = [];
        
        dataRows.forEach((row, idx) => {
            if (!row || row.length < 8) return;
            
            const duration = parseFloat(row[1]) || 20;
            const startTimeRaw = row[2];
            const endTimeRaw = row[3];
            const moderator = row[5] || '';
            const sessionName = row[6] || '';
            const title = row[7] || '';
            const hospital = row[8] || '';
            const speaker = row[9] || '미정';
            const product = row[10] || '';
            const company = row[11] || '';
            
            // 시간 파싱
            let startTime = '';
            if (startTimeRaw) {
                if (typeof startTimeRaw === 'string') {
                    // "15:00" 형태
                    const match = startTimeRaw.match(/(\d{1,2}):(\d{2})/);
                    if (match) {
                        startTime = `${match[1].padStart(2, '0')}:${match[2]}`;
                    }
                } else if (startTimeRaw instanceof Date) {
                    startTime = `${String(startTimeRaw.getHours()).padStart(2, '0')}:${String(startTimeRaw.getMinutes()).padStart(2, '0')}`;
                } else if (typeof startTimeRaw === 'number') {
                    // Excel 시간 숫자 (0.625 = 15:00)
                    const totalMinutes = Math.round(startTimeRaw * 24 * 60);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    startTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                }
            }
            
            if (!startTime || !title) return;
            
            // 세션 정보 수집 (중복 제거)
            if (sessionName && !sessions[sessionName]) {
                sessions[sessionName] = {
                    name: sessionName,
                    time: startTime,
                    moderator: moderator,
                    room: roomName
                };
            }
            
            // 강의 정보 수집
            lectures.push({
                titleKo: title.replace(/\\n/g, ' ').replace(/\n/g, ' '),
                speakerKo: speaker || '미정',
                affiliation: hospital || '',
                company: company || '',
                duration: duration,
                startTime: startTime,
                sessionName: sessionName,
                category: guessCategory(title, company)
            });
        });
        
        // 세션 시작 시간 정렬 (각 세션의 첫 번째 강의 시간으로)
        const sessionList = Object.values(sessions);
        sessionList.forEach(session => {
            const firstLecture = lectures.find(l => l.sessionName === session.name);
            if (firstLecture) {
                session.time = firstLecture.startTime;
            }
        });
        
        pendingScheduleData = {
            room: roomName,
            sessions: sessionList,
            lectures: lectures
        };
        
        // 미리보기 표시
        showSchedulePreview();
    }
    
    function guessCategory(title, company) {
        // 제목이나 업체명으로 카테고리 추측
        const titleLower = (title + ' ' + company).toLowerCase();
        
        if (titleLower.includes('injectable') || titleLower.includes('filler') || titleLower.includes('필러')) return 'Injectables';
        if (titleLower.includes('laser') || titleLower.includes('레이저') || titleLower.includes('ebd')) return 'Laser & EBDs';
        if (titleLower.includes('bio-stim') || titleLower.includes('바이오') || titleLower.includes('콜라겐')) return 'Bio-Stimulators';
        if (titleLower.includes('thread') || titleLower.includes('실리프팅')) return 'Threads';
        if (titleLower.includes('body') || titleLower.includes('바디') || titleLower.includes('dca')) return 'Body Contouring';
        if (titleLower.includes('derma') || titleLower.includes('피부') || titleLower.includes('진피')) return 'Dermatology';
        if (titleLower.includes('hair') || titleLower.includes('모발')) return 'Hair';
        if (titleLower.includes('학회')) return 'ASLS';
        if (titleLower.includes('anatomy') || titleLower.includes('해부')) return 'Anatomy';
        if (titleLower.includes('regen') || titleLower.includes('재생')) return 'Regeneratives';
        
        return 'Others';
    }
    
    // 유사 강의 찾기
    function findSimilarLectures(newLecture) {
        const similar = [];
        const newTitle = (newLecture.titleKo || '').toLowerCase().trim();
        const newSpeaker = (newLecture.speakerKo || '').trim();
        
        if (!newTitle && !newSpeaker) return similar;
        
        AppState.lectures.forEach(existing => {
            const existingTitle = (existing.titleKo || '').toLowerCase().trim();
            const existingSpeaker = (existing.speakerKo || '').trim();
            
            let similarity = 0;
            let reason = [];
            
            // 1. 완전 일치 체크
            if (newTitle === existingTitle && newSpeaker === existingSpeaker) {
                similarity = 100;
                reason.push('완전 일치');
            } else {
                // 2. 제목 유사도 체크
                if (newTitle && existingTitle) {
                    if (newTitle === existingTitle) {
                        similarity += 60;
                        reason.push('제목 일치');
                    } else if (newTitle.includes(existingTitle) || existingTitle.includes(newTitle)) {
                        similarity += 40;
                        reason.push('제목 유사');
                    } else {
                        // 단어 기반 유사도
                        const newWords = newTitle.split(/\s+/).filter(w => w.length > 1);
                        const existingWords = existingTitle.split(/\s+/).filter(w => w.length > 1);
                        const commonWords = newWords.filter(w => existingWords.some(ew => ew.includes(w) || w.includes(ew)));
                        if (commonWords.length >= 2) {
                            similarity += 30;
                            reason.push('키워드 유사');
                        }
                    }
                }
                
                // 3. 연자 유사도 체크
                if (newSpeaker && existingSpeaker && newSpeaker !== '미정' && existingSpeaker !== '미정') {
                    if (newSpeaker === existingSpeaker) {
                        similarity += 40;
                        reason.push('연자 일치');
                    } else if (newSpeaker.includes(existingSpeaker) || existingSpeaker.includes(newSpeaker)) {
                        similarity += 25;
                        reason.push('연자 유사');
                    }
                }
            }
            
            if (similarity >= 40) {
                similar.push({
                    lecture: existing,
                    similarity: similarity,
                    reason: reason.join(', ')
                });
            }
        });
        
        // 유사도 높은 순으로 정렬
        similar.sort((a, b) => b.similarity - a.similarity);
        return similar.slice(0, 3); // 최대 3개만 반환
    }
    
    function showSchedulePreview() {
        const preview = document.getElementById('scheduleUploadPreview');
        const content = document.getElementById('schedulePreviewContent');
        
        const { room, sessions, lectures } = pendingScheduleData;
        
        // 각 강의에 대해 유사 강의 찾기
        let similarCount = 0;
        lectures.forEach((lecture, idx) => {
            lecture._similar = findSimilarLectures(lecture);
            lecture._index = idx;
            lecture._useExisting = null; // null: 새로 추가, id: 기존 강의 사용
            if (lecture._similar.length > 0) similarCount++;
        });
        
        let html = `
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #E8F4FD; border-radius: 8px;">
                <strong>📍 강의룸:</strong> ${room}<br>
                <strong>📌 세션:</strong> ${sessions.length}개<br>
                <strong>📚 강의:</strong> ${lectures.length}개
                ${similarCount > 0 ? `<br><span style="color: #F57C00;">⚠️ 유사 강의 ${similarCount}개 발견</span>` : ''}
            </div>
        `;
        
        // 세션 목록
        if (sessions.length > 0) {
            html += '<div style="margin-bottom: 1rem;"><strong>세션 목록:</strong></div>';
            html += '<div style="max-height: 120px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px; margin-bottom: 1rem;">';
            sessions.forEach((session, idx) => {
                const color = getSessionColor(idx);
                html += `<div style="padding: 0.5rem; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 12px; height: 12px; background: ${color}; border-radius: 50%;"></span>
                    <span><strong>${session.name}</strong> (${session.time}~)</span>
                </div>`;
            });
            html += '</div>';
        }
        
        // 강의 목록 (유사 강의 선택 포함)
        html += '<div style="margin-bottom: 0.5rem;"><strong>강의 목록:</strong></div>';
        html += '<div style="max-height: 300px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">';
        
        lectures.forEach((lecture, idx) => {
            const categoryColor = AppConfig.categoryColors[lecture.category] || '#9B59B6';
            const hasSimilar = lecture._similar && lecture._similar.length > 0;
            const bgColor = hasSimilar ? '#FFF8E1' : 'white';
            
            html += `<div style="padding: 0.75rem; border-bottom: 1px solid #eee; background: ${bgColor};">`;
            html += `<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: ${hasSimilar ? '0.5rem' : '0'};">`;
            html += `<span style="font-size: 0.75rem; color: #666; min-width: 45px;">${lecture.startTime}</span>`;
            html += `<span style="flex: 1; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lecture.titleKo}">${lecture.titleKo}</span>`;
            html += `<span style="font-size: 0.8rem; color: #666; min-width: 60px;">${lecture.speakerKo}</span>`;
            html += `<span style="background: ${categoryColor}; color: white; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.65rem;">${lecture.category}</span>`;
            html += `</div>`;
            
            // 유사 강의가 있으면 선택 옵션 표시
            if (hasSimilar) {
                html += `<div style="margin-left: 50px; padding: 0.5rem; background: #fff; border: 1px solid #FFB74D; border-radius: 6px;">`;
                html += `<div style="font-size: 0.75rem; color: #E65100; margin-bottom: 0.5rem;">⚠️ 유사한 기존 강의 발견:</div>`;
                
                // 새로 추가 옵션
                html += `<label style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem; cursor: pointer; padding: 0.25rem;">`;
                html += `<input type="radio" name="similar_${idx}" value="new" checked onchange="window.setLectureChoice(${idx}, null)" style="margin-top: 3px;">`;
                html += `<span style="font-size: 0.8rem;"><strong>새로 추가</strong> - "${lecture.titleKo}"</span>`;
                html += `</label>`;
                
                // 기존 강의 옵션들
                lecture._similar.forEach((sim, simIdx) => {
                    html += `<label style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem; cursor: pointer; padding: 0.25rem; background: #f9f9f9; border-radius: 4px;">`;
                    html += `<input type="radio" name="similar_${idx}" value="${sim.lecture.id}" onchange="window.setLectureChoice(${idx}, '${sim.lecture.id}')" style="margin-top: 3px;">`;
                    html += `<span style="font-size: 0.8rem;">`;
                    html += `<strong>기존 사용</strong> - "${sim.lecture.titleKo}"`;
                    html += `<br><span style="font-size: 0.7rem; color: #666;">연자: ${sim.lecture.speakerKo || '미정'} | ${sim.reason} (${sim.similarity}%)</span>`;
                    html += `</span>`;
                    html += `</label>`;
                });
                
                html += `</div>`;
            }
            
            html += `</div>`;
        });
        
        html += '</div>';
        
        // 중복 체크 버튼 추가
        html += `
            <div style="margin-top: 1rem; padding: 0.75rem; background: #E3F2FD; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.85rem; color: #1565C0;">
                    🔍 업로드 전 연자 시간 충돌을 미리 확인할 수 있습니다.
                </span>
                <button class="btn btn-secondary" onclick="window.checkScheduleConflicts()" style="white-space: nowrap;">
                    🔍 중복 체크
                </button>
            </div>
        `;
        
        content.innerHTML = html;
        preview.style.display = 'block';
    }
    
    // 연자 시간 충돌 체크
    window.checkScheduleConflicts = function() {
        const { room, lectures } = pendingScheduleData;
        const conflicts = [];
        
        // Panel Discussion 세션의 패널리스트 정보 수집
        const panelSessions = getPanelSessionsInfo();
        
        // 업로드할 강의들과 기존 시간표 전체 비교
        lectures.forEach((newLecture, idx) => {
            const speakerName = (newLecture.speakerKo || '').trim();
            if (!speakerName || speakerName === '미정' || speakerName === '') return;
            
            const newStartMin = timeToMinutes(newLecture.startTime);
            const newDuration = newLecture.duration || 15;
            const newEndMin = newStartMin + newDuration;
            
            // 1. 기존 시간표와 비교
            Object.entries(AppState.schedule).forEach(([scheduleKey, existingLecture]) => {
                const existingSpeaker = (existingLecture.speakerKo || '').trim();
                if (!existingSpeaker || existingSpeaker === '미정') return;
                if (existingSpeaker !== speakerName) return;
                
                const [existingTime, existingRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
                
                // 같은 룸이면 체크 불필요
                if (existingRoom === room) return;
                
                const existingStartMin = timeToMinutes(existingTime);
                const existingDuration = existingLecture.duration || 15;
                const existingEndMin = existingStartMin + existingDuration;
                
                // 시간 겹침 체크 (이동 시간 포함)
                const transferTime = AppConfig.SPEAKER_TRANSFER_TIME || 20;
                const gapAfterExisting = newStartMin - existingEndMin;
                const gapBeforeExisting = existingStartMin - newEndMin;
                
                if (gapAfterExisting < transferTime && gapBeforeExisting < transferTime) {
                    conflicts.push({
                        type: 'existing',
                        newLecture: newLecture,
                        newRoom: room,
                        existingLecture: existingLecture,
                        existingRoom: existingRoom,
                        existingTime: existingTime,
                        speaker: speakerName
                    });
                }
            });
            
            // 2. Panel Discussion 세션과 충돌 체크
            panelSessions.forEach(panelInfo => {
                // 같은 룸이면 체크 불필요
                if (panelInfo.room === room) return;
                
                // 패널리스트인지 확인
                if (!panelInfo.panelists.includes(speakerName)) return;
                
                const sessionStartMin = timeToMinutes(panelInfo.sessionTime);
                const sessionEndMin = sessionStartMin + (panelInfo.sessionDuration || 60);
                
                // 시간 겹침 체크 (이동 시간 포함)
                const transferTime = AppConfig.SPEAKER_TRANSFER_TIME || 20;
                const gapAfterSession = newStartMin - sessionEndMin;
                const gapBeforeSession = sessionStartMin - newEndMin;
                
                if (gapAfterSession < transferTime && gapBeforeSession < transferTime) {
                    conflicts.push({
                        type: 'panel',
                        newLecture: newLecture,
                        newRoom: room,
                        sessionName: panelInfo.sessionName,
                        sessionRoom: panelInfo.room,
                        sessionTime: panelInfo.sessionTime,
                        sessionEndTime: minutesToTime(sessionEndMin),
                        speaker: speakerName
                    });
                }
            });
            
            // 3. 업로드할 강의들 간 비교 (같은 연자가 다른 시간대에 여러 번 있을 수 있음)
            lectures.forEach((otherLecture, otherIdx) => {
                if (idx >= otherIdx) return; // 중복 체크 방지
                
                const otherSpeaker = (otherLecture.speakerKo || '').trim();
                if (otherSpeaker !== speakerName) return;
                
                const otherStartMin = timeToMinutes(otherLecture.startTime);
                const otherDuration = otherLecture.duration || 15;
                const otherEndMin = otherStartMin + otherDuration;
                
                // 같은 룸 내에서 시간 겹침 체크
                if (!(newEndMin <= otherStartMin || otherEndMin <= newStartMin)) {
                    conflicts.push({
                        type: 'internal',
                        newLecture: newLecture,
                        otherLecture: otherLecture,
                        room: room,
                        speaker: speakerName
                    });
                }
            });
        });
        
        // 결과 표시
        showConflictResults(conflicts);
    };
    
    function timeToMinutes(time) {
        if (!time) return 0;
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }
    
    function minutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    
    // 유사한 룸 이름 찾기
    function findSimilarRoom(roomName) {
        if (!roomName) return null;
        
        const normalize = (str) => {
            return str
                .toLowerCase()
                .replace(/\s+/g, '') // 공백 제거
                .replace(/[_\-]/g, '') // 언더스코어, 하이픈 제거
                .replace(/[()（）]/g, ''); // 괄호 제거
        };
        
        const normalizedInput = normalize(roomName);
        
        for (const existingRoom of AppState.rooms) {
            const normalizedExisting = normalize(existingRoom);
            
            // 1. 정규화 후 동일
            if (normalizedInput === normalizedExisting) {
                return existingRoom;
            }
            
            // 2. 한쪽이 다른 쪽을 포함
            if (normalizedInput.includes(normalizedExisting) || normalizedExisting.includes(normalizedInput)) {
                // 길이 차이가 크지 않으면 유사로 판단
                if (Math.abs(normalizedInput.length - normalizedExisting.length) <= 5) {
                    return existingRoom;
                }
            }
            
            // 3. 레벤슈타인 거리 기반 유사도 (간단 버전)
            const similarity = calculateSimilarity(normalizedInput, normalizedExisting);
            if (similarity > 0.8) { // 80% 이상 유사
                return existingRoom;
            }
        }
        
        return null;
    }
    
    // 간단한 문자열 유사도 계산 (Jaccard 유사도)
    function calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (str1.length === 0 || str2.length === 0) return 0;
        
        // 2-gram 기반 유사도
        const getBigrams = (str) => {
            const bigrams = new Set();
            for (let i = 0; i < str.length - 1; i++) {
                bigrams.add(str.substring(i, i + 2));
            }
            return bigrams;
        };
        
        const bigrams1 = getBigrams(str1);
        const bigrams2 = getBigrams(str2);
        
        let intersection = 0;
        bigrams1.forEach(bg => {
            if (bigrams2.has(bg)) intersection++;
        });
        
        const union = bigrams1.size + bigrams2.size - intersection;
        return union > 0 ? intersection / union : 0;
    }
    
    // Panel Discussion 세션 정보 수집
    function getPanelSessionsInfo() {
        const panelSessions = [];
        
        // Panel Discussion이 배치된 모든 항목 찾기
        Object.entries(AppState.schedule).forEach(([scheduleKey, lecture]) => {
            if (lecture.category !== 'Panel Discussion' && !lecture.isPanelDiscussion) return;
            
            const [panelTime, panelRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
            
            // 해당 Panel Discussion이 속한 세션 찾기
            const session = findSessionForPanel(panelTime, panelRoom);
            if (!session) return;
            
            // 세션의 패널리스트 수집
            const panelists = getSessionPanelists(session, panelTime, panelRoom);
            
            panelSessions.push({
                sessionName: session.name || '세션',
                sessionTime: session.time,
                sessionDuration: session.duration || 60,
                room: panelRoom,
                panelists: panelists,
                moderator: session.moderator || ''
            });
        });
        
        return panelSessions;
    }
    
    function findSessionForPanel(time, room) {
        const timeIndex = AppState.timeSlots.indexOf(time);
        
        for (let i = timeIndex; i >= 0; i--) {
            const checkTime = AppState.timeSlots[i];
            const session = AppState.sessions.find(s => s.time === checkTime && s.room === room);
            if (session) {
                if (session.duration) {
                    const sessionEndIndex = i + Math.ceil(session.duration / (AppConfig.TIME_UNIT || 5));
                    if (timeIndex < sessionEndIndex) {
                        return session;
                    }
                } else {
                    return session;
                }
            }
        }
        return null;
    }
    
    function getSessionPanelists(session, panelTime, room) {
        const panelists = [];
        
        if (session.moderator) {
            panelists.push(session.moderator);
        }
        
        const sessionTimeIndex = AppState.timeSlots.indexOf(session.time);
        const panelTimeIndex = AppState.timeSlots.indexOf(panelTime);
        
        // 세션 시작부터 Panel Discussion 시작 전까지의 강의 연자 수집
        Object.entries(AppState.schedule).forEach(([key, lecture]) => {
            if (!key.endsWith(`-${room}`)) return;
            if (lecture.isBreak || lecture.category === 'Panel Discussion') return;
            
            const lectureTime = key.substring(0, 5);
            const lectureTimeIndex = AppState.timeSlots.indexOf(lectureTime);
            
            if (lectureTimeIndex >= sessionTimeIndex && lectureTimeIndex < panelTimeIndex) {
                if (lecture.speakerKo && lecture.speakerKo.trim() && lecture.speakerKo !== '미정') {
                    panelists.push(lecture.speakerKo);
                }
            }
        });
        
        // 중복 제거
        return [...new Set(panelists)];
    }
    
    function showConflictResults(conflicts) {
        if (conflicts.length === 0) {
            Toast.success(' 충돌이 발견되지 않았습니다!\n\n모든 강의를 안전하게 배치할 수 있습니다.');
            return;
        }
        
        // 충돌 모달 표시
        let modalHtml = `
            <div class="modal active" id="conflictModal" style="z-index: 2000;">
                <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
                    <div class="modal-header" style="background: #FFEBEE;">
                        <h2 style="color: #C62828;">⚠️ 연자 시간 충돌 발견 (${conflicts.length}건)</h2>
                        <button class="modal-close" onclick="document.getElementById('conflictModal').remove()">×</button>
                    </div>
                    <div style="padding: 1rem; overflow-y: auto; max-height: calc(80vh - 120px);">
                        <p style="margin-bottom: 1rem; color: #666;">
                            아래 강의들은 연자 시간이 충돌합니다. 업로드 전에 시간을 조정하거나, 충돌을 인지한 상태로 진행할 수 있습니다.
                        </p>
        `;
        
        conflicts.forEach((conflict, idx) => {
            if (conflict.type === 'existing') {
                modalHtml += `
                    <div style="background: #FFF8E1; border-left: 4px solid #F57C00; padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 0 8px 8px 0;">
                        <div style="font-weight: bold; color: #E65100; margin-bottom: 0.5rem;">
                            #${idx + 1} 기존 시간표와 충돌
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>연자:</strong> ${conflict.speaker}<br>
                            <strong>업로드 강의:</strong> ${conflict.newLecture.titleKo}<br>
                            <span style="color: #666;">룸: ${conflict.newRoom} | 시간: ${conflict.newLecture.startTime} (${conflict.newLecture.duration}분)</span><br>
                            <strong>기존 강의:</strong> ${conflict.existingLecture.titleKo}<br>
                            <span style="color: #666;">룸: ${conflict.existingRoom} | 시간: ${conflict.existingTime} (${conflict.existingLecture.duration || 15}분)</span>
                        </div>
                    </div>
                `;
            } else if (conflict.type === 'panel') {
                modalHtml += `
                    <div style="background: #F3E5F5; border-left: 4px solid #7B1FA2; padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 0 8px 8px 0;">
                        <div style="font-weight: bold; color: #7B1FA2; margin-bottom: 0.5rem;">
                            #${idx + 1} 📋 Panel Discussion 세션 참여자 충돌
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>연자:</strong> ${conflict.speaker}<br>
                            <strong>업로드 강의:</strong> ${conflict.newLecture.titleKo}<br>
                            <span style="color: #666;">룸: ${conflict.newRoom} | 시간: ${conflict.newLecture.startTime} (${conflict.newLecture.duration}분)</span><br>
                            <strong>패널 세션:</strong> ${conflict.sessionName}<br>
                            <span style="color: #666;">룸: ${conflict.sessionRoom} | 시간: ${conflict.sessionTime} ~ ${conflict.sessionEndTime}</span><br>
                            <span style="color: #7B1FA2; font-size: 0.8rem;">※ 패널리스트는 세션 전체 시간 동안 참석 필요</span>
                        </div>
                    </div>
                `;
            } else {
                modalHtml += `
                    <div style="background: #FFEBEE; border-left: 4px solid #C62828; padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 0 8px 8px 0;">
                        <div style="font-weight: bold; color: #C62828; margin-bottom: 0.5rem;">
                            #${idx + 1} 업로드 파일 내 충돌
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>연자:</strong> ${conflict.speaker}<br>
                            <strong>강의 1:</strong> ${conflict.newLecture.titleKo} (${conflict.newLecture.startTime})<br>
                            <strong>강의 2:</strong> ${conflict.otherLecture.titleKo} (${conflict.otherLecture.startTime})<br>
                            <span style="color: #666;">같은 연자가 같은 시간대에 두 강의에 배정됨</span>
                        </div>
                    </div>
                `;
            }
        });
        
        modalHtml += `
                        <div style="margin-top: 1rem; padding: 0.75rem; background: #E8F4FD; border-radius: 8px; font-size: 0.85rem;">
                            💡 <strong>참고:</strong> 이동 시간 ${AppConfig.SPEAKER_TRANSFER_TIME || 20}분이 고려됩니다. 충돌이 있어도 업로드는 가능하지만, 실제 학회 진행 시 문제가 될 수 있습니다.
                        </div>
                    </div>
                    <div style="padding: 1rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="document.getElementById('conflictModal').remove()">닫기</button>
                    </div>
                </div>
            </div>
        `;
        
        // 기존 모달 제거 후 새로 추가
        const existingModal = document.getElementById('conflictModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // 강의 선택 처리
    window.setLectureChoice = function(lectureIndex, existingId) {
        if (pendingScheduleData.lectures[lectureIndex]) {
            pendingScheduleData.lectures[lectureIndex]._useExisting = existingId;
        }
    };
    
    function getSessionColor(index) {
        const colors = ['#9B59B6', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#1ABC9C', '#E91E63', '#00BCD4'];
        return colors[index % colors.length];
    }
    
    function confirmScheduleUpload() {
        let { room, sessions, lectures } = pendingScheduleData;
        
        if (lectures.length === 0) {
            Toast.warning('업로드할 강의가 없습니다.');
            return;
        }
        
        // 룸 존재 여부 확인
        if (!AppState.rooms.includes(room)) {
            // 유사한 룸 찾기
            const similarRoom = findSimilarRoom(room);
            
            if (similarRoom) {
                // 유사한 룸이 있으면 사용자에게 확인
                const choice = confirm(
                    `"${room}" 룸이 없습니다.\n\n` +
                    `유사한 룸 발견: "${similarRoom}"\n\n` +
                    `[확인] → "${similarRoom}" 룸에 배치\n` +
                    `[취소] → "${room}" 새 룸 추가`
                );
                
                if (choice) {
                    // 기존 유사 룸 사용
                    room = similarRoom;
                    pendingScheduleData.room = room;
                } else {
                    // 새 룸 추가
                    AppState.rooms.push(room);
                    window.saveRoomsToStorage();
                    window.createScheduleTable();
                }
            } else {
                // 유사한 룸도 없으면 새로 추가
                if (confirm(`"${room}" 룸이 없습니다. 새로 추가할까요?`)) {
                    AppState.rooms.push(room);
                    window.saveRoomsToStorage();
                    window.createScheduleTable();
                } else {
                    return;
                }
            }
        }
        
        // 세션 추가
        let sessionCount = 0;
        sessions.forEach((session, idx) => {
            // 중복 체크
            const exists = AppState.sessions.some(s => 
                s.name === session.name && s.room === room && s.time === session.time
            );
            
            if (!exists) {
                AppState.sessions.push({
                    name: session.name,
                    time: session.time,
                    room: room,
                    moderator: session.moderator || '',
                    color: getSessionColor(idx)
                });
                sessionCount++;
            }
        });
        
        // 덮어쓰기 옵션 확인
        const overwriteCheckbox = document.getElementById('scheduleOverwriteCheckbox');
        const shouldOverwrite = overwriteCheckbox ? overwriteCheckbox.checked : true;
        
        // 강의 추가 및 배치
        let lectureCount = 0;
        let scheduleCount = 0;
        let overwriteCount = 0;
        let reusedCount = 0;
        
        lectures.forEach(lecture => {
            let lectureToPlace;
            
            // 유사 강의 선택 여부 확인
            if (lecture._useExisting) {
                // 기존 강의 사용
                const existingLecture = AppState.lectures.find(l => String(l.id) === String(lecture._useExisting));
                if (existingLecture) {
                    lectureToPlace = { ...existingLecture };
                    reusedCount++;
                } else {
                    // 기존 강의를 찾지 못한 경우 새로 추가
                    lectureToPlace = createNewLecture(lecture);
                    AppState.lectures.push(lectureToPlace);
                    lectureCount++;
                }
            } else {
                // 새 강의 추가
                lectureToPlace = createNewLecture(lecture);
                
                // 중복 체크 (제목+연자)
                const exists = AppState.lectures.some(l => 
                    l.titleKo === lectureToPlace.titleKo && l.speakerKo === lectureToPlace.speakerKo
                );
                
                if (!exists) {
                    AppState.lectures.push(lectureToPlace);
                    lectureCount++;
                } else {
                    // 이미 있는 강의 찾아서 사용
                    const existingLecture = AppState.lectures.find(l => 
                        l.titleKo === lectureToPlace.titleKo && l.speakerKo === lectureToPlace.speakerKo
                    );
                    if (existingLecture) {
                        lectureToPlace = { ...existingLecture };
                    }
                }
            }
            
            // 시간표에 배치
            const scheduleKey = `${lecture.startTime}-${room}`;
            
            if (AppState.schedule[scheduleKey]) {
                // 이미 강의가 있는 경우
                if (shouldOverwrite) {
                    // 덮어쓰기
                    AppState.schedule[scheduleKey] = {
                        ...lectureToPlace,
                        time: lecture.startTime,
                        room: room
                    };
                    overwriteCount++;
                }
                // 덮어쓰기 옵션이 꺼져있으면 스킵
            } else {
                // 새로 배치
                AppState.schedule[scheduleKey] = {
                    ...lectureToPlace,
                    time: lecture.startTime,
                    room: room
                };
                scheduleCount++;
            }
        });
        
        // 저장 및 UI 업데이트
        window.saveAndSync();
        window.createScheduleTable();
        window.updateScheduleDisplay();
        window.updateLectureList();
        
        let resultMsg = `✅ 업로드 완료!\n\n📌 세션 ${sessionCount}개 추가\n📚 강의 ${lectureCount}개 새로 추가`;
        if (reusedCount > 0) {
            resultMsg += `\n🔗 ${reusedCount}개 기존 강의 재사용`;
        }
        resultMsg += `\n📅 시간표 ${scheduleCount}개 배치`;
        if (overwriteCount > 0) {
            resultMsg += `\n🔄 ${overwriteCount}개 덮어쓰기`;
        }
        Toast.success(resultMsg, 5000);
        
        closeScheduleUploadModal();
    }
    
    // 새 강의 객체 생성 헬퍼 함수
    function createNewLecture(lecture) {
        return {
            id: Date.now() + Math.random(),
            titleKo: lecture.titleKo,
            titleEn: '',
            speakerKo: lecture.speakerKo,
            speakerEn: '',
            affiliation: lecture.affiliation,
            company: lecture.company,
            duration: lecture.duration,
            category: lecture.category
        };
    }
    
    // ============================================
    // 전역 함수 등록
    // ============================================
    
    window.openUploadModal = openUploadModal;
    window.closeUploadModal = closeUploadModal;
    window.handleFileSelect = handleFileSelect;
    window.clearUploadPreview = clearUploadPreview;
    window.confirmUpload = confirmUpload;
    window.previewAiLectures = previewAiLectures;
    
    window.openScheduleUploadModal = openScheduleUploadModal;
    window.closeScheduleUploadModal = closeScheduleUploadModal;
    window.handleScheduleFileSelect = handleScheduleFileSelect;
    window.confirmScheduleUpload = confirmScheduleUpload;
    
})();
