// ============================================
// 오타 검증 모듈 (typo-check.js)
// ============================================

(function() {
    'use strict';

    // 한글 맞춤법 검사 패턴
    const typoPatterns = [
        // 띄어쓰기 오류
        { pattern: /([가-힣])(및|와|과|의|을|를|이|가|은|는|에|로|으로|에서)([가-힣])/g, suggestion: '조사 띄어쓰기 확인', type: 'spacing' },
        
        // 자주 틀리는 표현
        { wrong: '되어지다', correct: '되다', type: 'grammar' },
        { wrong: '되어진', correct: '된', type: 'grammar' },
        { wrong: '되어져', correct: '되어', type: 'grammar' },
        { wrong: '되어질', correct: '될', type: 'grammar' },
        { wrong: '할려고', correct: '하려고', type: 'grammar' },
        { wrong: '갈려고', correct: '가려고', type: 'grammar' },
        { wrong: '볼려고', correct: '보려고', type: 'grammar' },
        { wrong: '웬지', correct: '왠지', type: 'grammar' },
        { wrong: '왠만하면', correct: '웬만하면', type: 'grammar' },
        { wrong: '몇일', correct: '며칠', type: 'grammar' },
        { wrong: '어떻게 해야될', correct: '어떻게 해야 될', type: 'spacing' },
        { wrong: '금새', correct: '금세', type: 'grammar' },
        { wrong: '설레임', correct: '설렘', type: 'grammar' },
        { wrong: '어의없', correct: '어이없', type: 'grammar' },
        { wrong: '희안', correct: '희한', type: 'grammar' },
        { wrong: '구지', correct: '굳이', type: 'grammar' },
        { wrong: '빈번히', correct: '빈번하게', type: 'grammar' },
        
        // 한글 맞춤법 오류 (률/율)
        { wrong: '냉각율', correct: '냉각률', type: 'spelling' },
        { wrong: '확율', correct: '확률', type: 'spelling' },
        { wrong: '합격율', correct: '합격률', type: 'spelling' },
        { wrong: '성공율', correct: '성공률', type: 'spelling' },
        { wrong: '능율', correct: '능률', type: 'spelling' },
        { wrong: '출현율', correct: '출현률', type: 'spelling' },
        { wrong: '생존율', correct: '생존률', type: 'spelling' },
        
        // 의학 용어 오타
        { wrong: '필러주입', correct: '필러 주입', type: 'spacing' },
        { wrong: '레이져', correct: '레이저', type: 'spelling' },
        { wrong: '랴이저', correct: '레이저', type: 'spelling' },
        { wrong: '콜라겐자극', correct: '콜라겐 자극', type: 'spacing' },
        { wrong: '스킨케어', correct: '스킨 케어', type: 'spacing' },
        { wrong: '보톡스주사', correct: '보톡스 주사', type: 'spacing' },
        { wrong: '리프팅시술', correct: '리프팅 시술', type: 'spacing' },
        
        // 영문 오타 (의학 용어)
        { wrong: 'Filller', correct: 'Filler', type: 'spelling' },
        { wrong: 'Fillier', correct: 'Filler', type: 'spelling' },
        { wrong: 'Hyalurnic', correct: 'Hyaluronic', type: 'spelling' },
        { wrong: 'Hyaluroinc', correct: 'Hyaluronic', type: 'spelling' },
        { wrong: 'dermatolgoy', correct: 'dermatology', type: 'spelling' },
        { wrong: 'aeshtetic', correct: 'aesthetic', type: 'spelling' },
        { wrong: 'aesthtic', correct: 'aesthetic', type: 'spelling' },
        { wrong: 'procedrue', correct: 'procedure', type: 'spelling' },
        { wrong: 'treatmnet', correct: 'treatment', type: 'spelling' },
        { wrong: 'patinet', correct: 'patient', type: 'spelling' },
        { wrong: 'injeciton', correct: 'injection', type: 'spelling' },
        { wrong: 'botulinum', correct: 'botulinum', type: 'ok' },
        { wrong: 'botulinim', correct: 'botulinum', type: 'spelling' },
        { wrong: 'collagen', correct: 'collagen', type: 'ok' },
        { wrong: 'colagen', correct: 'collagen', type: 'spelling' },
        { wrong: 'collagen', correct: 'collagen', type: 'ok' },
        { wrong: 'regeneraiton', correct: 'regeneration', type: 'spelling' },
        { wrong: 'rejuvenaiton', correct: 'rejuvenation', type: 'spelling' },
    ];

    // 오타 검증 모달 열기
    function openTypoCheckModal() {
        document.getElementById('typoCheckModal').classList.add('active');
        document.getElementById('typoResults').innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">🔍 검사 시작 버튼을 눌러주세요</p>';
        document.getElementById('typoCheckProgress').style.display = 'none';
    }

    // 오타 검증 모달 닫기
    function closeTypoCheckModal() {
        document.getElementById('typoCheckModal').classList.remove('active');
    }

    // 오타 검사 실행
    async function runTypoCheck() {
        const resultsDiv = document.getElementById('typoResults');
        const progressDiv = document.getElementById('typoCheckProgress');
        const progressBar = document.getElementById('typoProgressBar');
        const progressText = document.getElementById('typoProgressText');
        
        progressDiv.style.display = 'block';
        resultsDiv.innerHTML = '';
        
        // 모든 날짜의 강의 수집 (중복 제거)
        let allLectures = [];
        const lectureIds = new Set();
        
        // 현재 강의 목록
        if (AppState.lectures) {
            AppState.lectures.forEach(l => {
                if (!lectureIds.has(l.id)) {
                    allLectures.push({ ...l, date: AppState.currentDate });
                    lectureIds.add(l.id);
                }
            });
        }
        
        // 다른 날짜의 강의도 추가
        if (AppState.dataByDate) {
            Object.keys(AppState.dataByDate).forEach(date => {
                const dateLectures = AppState.dataByDate[date].lectures || [];
                dateLectures.forEach(l => {
                    if (!lectureIds.has(l.id)) {
                        allLectures.push({ ...l, date });
                        lectureIds.add(l.id);
                    }
                });
            });
        }
        
        const total = allLectures.length;
        let issues = [];
        
        for (let i = 0; i < total; i++) {
            const lecture = allLectures[i];
            const progress = Math.round((i / total) * 100);
            progressBar.style.width = progress + '%';
            progressText.textContent = `검사 중... ${i + 1}/${total}`;
            
            // 제목 검사
            const titleIssues = checkTextForTypos(lecture.titleKo || '', '제목(한글)');
            const titleEnIssues = checkTextForTypos(lecture.titleEn || '', '제목(영문)');
            const speakerIssues = checkTextForTypos(lecture.speakerKo || '', '연자');
            
            const allIssues = [...titleIssues, ...titleEnIssues, ...speakerIssues];
            
            if (allIssues.length > 0) {
                issues.push({
                    lecture,
                    issues: allIssues
                });
            }
            
            // UI 업데이트를 위한 작은 딜레이
            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        progressBar.style.width = '100%';
        progressText.textContent = `검사 완료! ${total}개 강의 검사`;
        
        // 결과 표시
        displayTypoResults(issues, total, resultsDiv);
    }

    // 텍스트에서 오타 검사
    function checkTextForTypos(text, field) {
        if (!text || text.trim() === '') return [];
        
        const issues = [];
        
        typoPatterns.forEach(pattern => {
            if (pattern.type === 'ok') return;
            
            if (pattern.wrong && typeof pattern.wrong === 'string') {
                if (text.toLowerCase().includes(pattern.wrong.toLowerCase())) {
                    issues.push({
                        field,
                        wrong: pattern.wrong,
                        correct: pattern.correct,
                        type: pattern.type,
                        note: pattern.note
                    });
                }
            } else if (pattern.wrong instanceof RegExp) {
                const match = text.match(pattern.wrong);
                if (match && match[0].toLowerCase() !== pattern.correct.toLowerCase()) {
                    issues.push({
                        field,
                        wrong: match[0],
                        correct: pattern.correct,
                        type: pattern.type,
                        note: pattern.note
                    });
                }
            }
        });
        
        return issues;
    }

    // 결과 표시
    function displayTypoResults(issues, total, resultsDiv) {
        if (issues.length === 0) {
            resultsDiv.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #10B981;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
                    <h3>오타가 발견되지 않았습니다!</h3>
                    <p style="color: #666;">총 ${total}개 강의를 검사했습니다.</p>
                </div>
            `;
            return;
        }
        
        let html = `<div style="margin-bottom: 1rem; padding: 0.75rem; background: #FEF3C7; border-radius: 8px;">
            <strong>⚠️ ${issues.length}개 강의에서 ${issues.reduce((sum, i) => sum + i.issues.length, 0)}개의 의심 항목 발견</strong>
        </div>`;
        
        issues.forEach((item, idx) => {
            html += `
                <div style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 0.75rem; overflow: hidden;">
                    <div style="background: #f5f5f5; padding: 0.5rem 0.75rem; font-weight: 600; font-size: 0.85rem;">
                        📝 ${item.lecture.titleKo || item.lecture.titleEn || '제목 없음'}
                        <span style="font-weight: normal; color: #666; margin-left: 0.5rem;">(${item.lecture.speakerKo || '연자 미정'})</span>
                    </div>
                    <div style="padding: 0.75rem;">
            `;
            
            item.issues.forEach(issue => {
                const typeColors = {
                    'spelling': '#EF4444',
                    'grammar': '#F97316',
                    'spacing': '#3B82F6',
                    'capitalization': '#8B5CF6',
                    'medical': '#10B981'
                };
                const typeLabels = {
                    'spelling': '철자',
                    'grammar': '문법',
                    'spacing': '띄어쓰기',
                    'capitalization': '대소문자',
                    'medical': '의학용어'
                };
                
                html += `
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0.5rem; background: #fafafa; border-radius: 4px;">
                        <span style="background: ${typeColors[issue.type] || '#666'}; color: white; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.65rem;">${typeLabels[issue.type] || issue.type}</span>
                        <span style="font-size: 0.85rem;"><strong>${issue.field}:</strong> "${issue.wrong}" → "${issue.correct}"</span>
                        <button class="btn btn-small btn-primary" onclick="applyTypoFix(${item.lecture.id}, '${issue.field}', '${escapeString(issue.wrong)}', '${escapeString(issue.correct)}')" style="margin-left: auto; padding: 0.2rem 0.5rem; font-size: 0.7rem;">수정</button>
                        <button class="btn btn-small btn-secondary" onclick="this.parentElement.remove()" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">무시</button>
                    </div>
                `;
            });
            
            html += '</div></div>';
        });
        
        resultsDiv.innerHTML = html;
    }

    // 문자열 이스케이프
    function escapeString(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
    }

    // 오타 수정 적용
    function applyTypoFix(lectureId, field, wrong, correct) {
        let found = false;
        
        const fieldMap = {
            '제목(한글)': 'titleKo',
            '제목(영문)': 'titleEn',
            '연자': 'speakerKo'
        };
        const key = fieldMap[field];
        
        // 모든 날짜에서 해당 강의 찾아서 수정
        if (AppState.dataByDate) {
            Object.keys(AppState.dataByDate).forEach(date => {
                const dateLectures = AppState.dataByDate[date].lectures || [];
                const lecture = dateLectures.find(l => l.id === lectureId);
                if (lecture && key && lecture[key]) {
                    lecture[key] = lecture[key].replace(wrong, correct);
                    found = true;
                }
            });
        }
        
        // 현재 lectures에서도 수정
        if (AppState.lectures) {
            const currentLecture = AppState.lectures.find(l => l.id === lectureId);
            if (currentLecture && key && currentLecture[key]) {
                currentLecture[key] = currentLecture[key].replace(wrong, correct);
                found = true;
            }
        }
        
        if (found) {
            if (typeof saveAndSync === 'function') saveAndSync();
            if (typeof updateLectureList === 'function') updateLectureList();
            if (typeof updateScheduleDisplay === 'function') updateScheduleDisplay();
            Toast.success(`"${wrong}" → "${correct}" 수정 완료`);
        } else {
            Toast.error('해당 강의를 찾을 수 없습니다.');
        }
    }

    // 전역 함수로 노출
    window.openTypoCheckModal = openTypoCheckModal;
    window.closeTypoCheckModal = closeTypoCheckModal;
    window.runTypoCheck = runTypoCheck;
    window.applyTypoFix = applyTypoFix;

})();
