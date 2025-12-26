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
    // 배치 완료 파일 업로드
    // ============================================
    
    function openScheduleUploadModal() {
        if (!window.checkEditPermission()) {
            alert('편집 권한이 없습니다.');
            return;
        }
        document.getElementById('scheduleUploadModal').classList.add('active');
        clearScheduleUploadPreview();
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
    
    function handleScheduleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            alert('Excel 파일(.xlsx, .xls)만 지원됩니다.');
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
                alert('파일 파싱 중 오류가 발생했습니다:\n' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    let pendingScheduleData = { room: '', sessions: [], lectures: [] };
    
    function parseScheduleData(rows, fileName) {
        if (rows.length < 2) {
            alert('데이터가 없습니다.');
            return;
        }
        
        // 첫 번째 행은 헤더
        const header = rows[0];
        const dataRows = rows.slice(1);
        
        // 룸 이름 추출 (첫 번째 데이터 행의 A열에서)
        let roomName = '';
        if (dataRows.length > 0 && dataRows[0][0]) {
            // "(토)1층 전시장B Regional Blueprint0" 에서 숫자 제거
            roomName = String(dataRows[0][0]).replace(/\d+$/, '').trim();
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
    
    function showSchedulePreview() {
        const preview = document.getElementById('scheduleUploadPreview');
        const content = document.getElementById('schedulePreviewContent');
        
        const { room, sessions, lectures } = pendingScheduleData;
        
        let html = `
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #E8F4FD; border-radius: 8px;">
                <strong>📍 강의룸:</strong> ${room}<br>
                <strong>📌 세션:</strong> ${sessions.length}개<br>
                <strong>📚 강의:</strong> ${lectures.length}개
            </div>
        `;
        
        // 세션 목록
        if (sessions.length > 0) {
            html += '<div style="margin-bottom: 1rem;"><strong>세션 목록:</strong></div>';
            html += '<div style="max-height: 150px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px; margin-bottom: 1rem;">';
            sessions.forEach((session, idx) => {
                const color = getSessionColor(idx);
                html += `<div style="padding: 0.5rem; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 12px; height: 12px; background: ${color}; border-radius: 50%;"></span>
                    <span><strong>${session.name}</strong> (${session.time}~)</span>
                </div>`;
            });
            html += '</div>';
        }
        
        // 강의 목록
        html += '<div style="margin-bottom: 0.5rem;"><strong>강의 목록:</strong></div>';
        html += '<div style="max-height: 250px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">';
        html += '<table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">';
        html += '<thead style="background: #f5f5f5; position: sticky; top: 0;"><tr><th style="padding: 0.5rem; text-align: left;">시간</th><th style="padding: 0.5rem; text-align: left;">제목</th><th style="padding: 0.5rem; text-align: left;">연자</th><th style="padding: 0.5rem; text-align: left;">분류</th></tr></thead>';
        html += '<tbody>';
        lectures.forEach(lecture => {
            const categoryColor = AppConfig.categoryColors[lecture.category] || '#9B59B6';
            html += `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 0.4rem;">${lecture.startTime}</td>
                <td style="padding: 0.4rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lecture.titleKo}</td>
                <td style="padding: 0.4rem;">${lecture.speakerKo}</td>
                <td style="padding: 0.4rem;"><span style="background: ${categoryColor}; color: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.7rem;">${lecture.category}</span></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        
        content.innerHTML = html;
        preview.style.display = 'block';
    }
    
    function getSessionColor(index) {
        const colors = ['#9B59B6', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#1ABC9C', '#E91E63', '#00BCD4'];
        return colors[index % colors.length];
    }
    
    function confirmScheduleUpload() {
        const { room, sessions, lectures } = pendingScheduleData;
        
        if (lectures.length === 0) {
            alert('업로드할 강의가 없습니다.');
            return;
        }
        
        // 룸 존재 여부 확인
        if (!AppState.rooms.includes(room)) {
            if (confirm(`"${room}" 룸이 없습니다. 새로 추가할까요?`)) {
                AppState.rooms.push(room);
                window.saveRoomsToStorage();
                window.createScheduleTable();
            } else {
                return;
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
        
        // 강의 추가 및 배치
        let lectureCount = 0;
        let scheduleCount = 0;
        
        lectures.forEach(lecture => {
            // 강의 목록에 추가
            const newLecture = {
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
            
            // 중복 체크
            const exists = AppState.lectures.some(l => 
                l.titleKo === newLecture.titleKo && l.speakerKo === newLecture.speakerKo
            );
            
            if (!exists) {
                AppState.lectures.push(newLecture);
                lectureCount++;
            }
            
            // 시간표에 배치
            const scheduleKey = `${lecture.startTime}-${room}`;
            if (!AppState.schedule[scheduleKey]) {
                AppState.schedule[scheduleKey] = {
                    ...newLecture,
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
        
        alert(`✅ 업로드 완료!\n\n📌 세션 ${sessionCount}개 추가\n📚 강의 ${lectureCount}개 추가\n📅 시간표 ${scheduleCount}개 배치`);
        
        closeScheduleUploadModal();
    }
    
    // ============================================
    // 전역 함수 등록
    // ============================================
    
    window.openUploadModal = openUploadModal;
    window.closeUploadModal = closeUploadModal;
    window.handleFileSelect = handleFileSelect;
    window.clearUploadPreview = clearUploadPreview;
    window.confirmUpload = confirmUpload;
    
    window.openScheduleUploadModal = openScheduleUploadModal;
    window.closeScheduleUploadModal = closeScheduleUploadModal;
    window.handleScheduleFileSelect = handleScheduleFileSelect;
    window.confirmScheduleUpload = confirmScheduleUpload;
    
})();
