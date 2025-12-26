// ============================================
// upload.js - 강의 일괄 업로드 모듈
// ============================================

(function() {
    'use strict';
    
    let pendingUploadData = [];
    
    // ============================================
    // 모달 관리
    // ============================================
    
    function openUploadModal() {
        if (!window.checkEditPermission()) {
            alert('편집 권한이 없습니다.');
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
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('previewTableBody').innerHTML = '';
        document.getElementById('previewCount').textContent = '0';
        document.getElementById('uploadFileInput').value = '';
        document.getElementById('duplicateWarning').style.display = 'none';
        document.getElementById('skipDuplicatesLabel').style.display = 'none';
    }
    
    // ============================================
    // 드롭존 설정
    // ============================================
    
    function setupDropZone() {
        const dropZone = document.getElementById('dropZone');
        
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
                processUploadFile(files[0]);
            }
        });
        
        // 파일 선택 버튼 재연결
        const selectBtn = newDropZone.querySelector('#selectFileBtn') || document.getElementById('selectFileBtn');
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
            alert('지원되지 않는 파일 형식입니다.\n지원 형식: Excel (.xlsx, .xls), CSV (.csv)');
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
                alert('파일을 읽는 중 오류가 발생했습니다.\n' + error.message);
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
        
        pendingUploadData = [];
        let lastCategory = '';
        
        jsonData.forEach((row, index) => {
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
            for (const [col, dur] of Object.entries(durationMapping)) {
                if (row[col] && row[col] !== '' && !isNaN(row[col])) {
                    duration = dur;
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
                duration: duration
            };
            
            pendingUploadData.push(lecture);
        });
        
        displayUploadPreview();
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
            alert('업로드 가능한 강의 데이터가 없습니다.');
            return;
        }
        
        // 중복 감지
        const duplicates = detectDuplicates(pendingUploadData);
        const duplicateCount = duplicates.filter(d => d).length;
        
        // 중복 경고 표시
        document.getElementById('duplicateWarning').style.display = duplicateCount > 0 ? 'block' : 'none';
        document.getElementById('duplicateCount').textContent = duplicateCount;
        document.getElementById('skipDuplicatesLabel').style.display = duplicateCount > 0 ? 'flex' : 'none';
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
                <td style="padding: 0.4rem;">${lecture.titleKo.substring(0, 40)}${lecture.titleKo.length > 40 ? '...' : ''}</td>
                <td style="padding: 0.4rem;">${lecture.speakerKo || '-'}</td>
                <td style="padding: 0.4rem;">${lecture.duration}분</td>
            </tr>
        `}).join('');
    }
    
    // ============================================
    // 업로드 확정
    // ============================================
    
    function confirmUpload() {
        if (pendingUploadData.length === 0) {
            alert('업로드할 데이터가 없습니다.');
            return;
        }
        
        const appendMode = document.getElementById('appendMode').checked;
        const skipDuplicates = document.getElementById('skipDuplicates')?.checked ?? true;
        
        const lectures = window.AppState.lectures;
        const dataByDate = window.AppState.dataByDate;
        const speakers = window.AppState.speakers;
        const categories = window.AppState.categories;
        const schedule = window.AppState.schedule;
        
        // 전체 교체 모드
        if (!appendMode) {
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
        
        // 중복 감지
        const duplicates = detectDuplicates(pendingUploadData);
        let skippedCount = 0;
        let addedCount = 0;
        
        // 강의 ID 재할당 (충돌 방지)
        const baseId = Date.now();
        pendingUploadData.forEach((lecture, index) => {
            // 중복 건너뛰기 옵션이 켜져있고, 이 항목이 중복이면 스킵
            if (skipDuplicates && duplicates[index]) {
                skippedCount++;
                return;
            }
            
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
        
        // 저장 및 UI 업데이트
        window.saveAndSync();
        window.updateCategoryDropdowns();
        window.createCategoryFilters();
        window.updateLectureList();
        
        // 결과 메시지
        let message = `✅ ${addedCount}개 강의가 ${appendMode ? '추가' : '업로드'}되었습니다!`;
        if (skippedCount > 0) {
            message += `\n\n🔄 ${skippedCount}개 중복 항목은 건너뛰었습니다.`;
        }
        alert(message);
        
        closeUploadModal();
    }
    
    // ============================================
    // 전역 함수 등록
    // ============================================
    
    window.openUploadModal = openUploadModal;
    window.closeUploadModal = closeUploadModal;
    window.handleFileSelect = handleFileSelect;
    window.clearUploadPreview = clearUploadPreview;
    window.confirmUpload = confirmUpload;
    
})();
