/**
 * chairs-patch.js
 * v51에 추가할 좌장/사회 기능 패치
 * 
 * 사용법: scheduler.html의 </body> 바로 위에 아래 한 줄 추가
 * <script src="chairs-patch.js"></script>
 */

(function() {
    'use strict';
    
    // 기존 state에 필드 추가
    if (typeof state !== 'undefined') {
        state.chairConflicts = state.chairConflicts || [];
    }

    // ========================================
    // 1. 좌장/사회 시간 충돌 체크
    // ========================================
    window.checkChairConflicts = function() {
        if (typeof state === 'undefined') return [];
        
        const conflicts = [];
        const chairSchedules = {};
        
        // 모든 좌장/사회의 스케줄 수집
        const sessionChairs = state.sessionChairs || {};
        
        Object.entries(sessionChairs).forEach(([sessionId, chairs]) => {
            if (!chairs || !Array.isArray(chairs)) return;
            
            // 해당 세션의 강의들 찾기
            const sessionLectures = (state.lectures || []).filter(l => l.sessionId === sessionId);
            if (sessionLectures.length === 0) return;
            
            // 세션 시간 범위 계산
            const times = sessionLectures.map(l => ({
                start: timeToMin(l.startTime || l.time),
                end: timeToMin(l.endTime) || (timeToMin(l.startTime || l.time) + (l.duration || 20))
            }));
            
            const sessionStart = Math.min(...times.map(t => t.start));
            const sessionEnd = Math.max(...times.map(t => t.end));
            const sessionDate = sessionLectures[0]?.date;
            
            // 세션명 찾기
            const session = (state.sessions || []).find(s => s.id === sessionId);
            const sessionName = session?.name || sessionId;
            
            chairs.forEach(chair => {
                const key = (chair.name || '').trim();
                if (!key) return;
                
                if (!chairSchedules[key]) chairSchedules[key] = [];
                chairSchedules[key].push({
                    sessionId,
                    sessionName,
                    date: sessionDate,
                    start: sessionStart,
                    end: sessionEnd,
                    role: chair.role
                });
            });
        });
        
        // 충돌 체크
        Object.entries(chairSchedules).forEach(([chairName, schedules]) => {
            for (let i = 0; i < schedules.length; i++) {
                for (let j = i + 1; j < schedules.length; j++) {
                    const a = schedules[i];
                    const b = schedules[j];
                    
                    // 같은 날짜에 시간이 겹치는지
                    if (a.date === b.date && !(a.end <= b.start || b.end <= a.start)) {
                        conflicts.push({
                            chairName,
                            session1: a.sessionName,
                            session2: b.sessionName,
                            date: a.date,
                            time1: `${minToTime(a.start)}-${minToTime(a.end)}`,
                            time2: `${minToTime(b.start)}-${minToTime(b.end)}`
                        });
                    }
                }
            }
        });
        
        state.chairConflicts = conflicts;
        return conflicts;
    };

    // 시간 변환 유틸 (기존 함수 없으면 추가)
    function timeToMin(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
    }
    
    function minToTime(m) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
    }

    // ========================================
    // 2. 충돌 경고 버튼 렌더링
    // ========================================
    window.renderConflictButton = function() {
        const conflicts = checkChairConflicts();
        if (conflicts.length > 0) {
            return `
                <button onclick="showConflictModal()" 
                    class="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 flex items-center gap-1 animate-pulse">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    좌장충돌 (${conflicts.length})
                </button>
            `;
        }
        return `
            <span class="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                충돌없음
            </span>
        `;
    };

    // ========================================
    // 3. 충돌 모달
    // ========================================
    window.showConflictModal = function() {
        const conflicts = state.chairConflicts || [];
        
        const html = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick="this.remove()">
                <div class="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onclick="event.stopPropagation()">
                    <div class="p-4 border-b bg-red-50 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-red-700 flex items-center gap-2">
                            ⚠️ 좌장/사회 시간 충돌
                        </h3>
                        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <div class="p-4 overflow-auto max-h-96">
                        ${conflicts.length === 0 ? 
                            '<p class="text-center text-gray-500 py-8">충돌이 없습니다 ✓</p>' : 
                            conflicts.map(c => `
                                <div class="p-3 bg-red-50 border border-red-200 rounded-lg mb-2">
                                    <div class="font-bold text-red-700">${c.chairName}</div>
                                    <div class="text-sm text-red-600 mt-1">
                                        <div>• ${c.session1} (${c.time1})</div>
                                        <div>• ${c.session2} (${c.time2})</div>
                                    </div>
                                    <div class="text-xs text-gray-500 mt-1">${c.date}</div>
                                </div>
                            `).join('')
                        }
                    </div>
                    <div class="p-4 border-t flex justify-end">
                        <button onclick="this.closest('.fixed').remove()" 
                            class="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">닫기</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', html);
    };

    // ========================================
    // 4. 좌장/사회 모달 (소속 필드 포함)
    // ========================================
    window.showChairModalWithAffiliation = function(sessionId, sessionName) {
        const chairs = (state.sessionChairs || {})[sessionId] || [];
        const color = (state.sessionColors || {})[sessionId] || { bg: '#8B5CF6', light: '#EDE9FE' };
        
        const html = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick="this.remove()" id="chairModal">
                <div class="bg-white rounded-2xl w-full max-w-xl max-h-[80vh] overflow-hidden" onclick="event.stopPropagation()">
                    <div class="p-4 border-b" style="background-color: ${color.light}; border-left: 4px solid ${color.bg};">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-bold" style="color: ${color.bg}">${sessionName}</h3>
                            <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <p class="text-sm text-gray-500 mt-1">좌장/사회 관리</p>
                    </div>
                    
                    <div class="p-4 overflow-auto max-h-96">
                        <!-- 기존 목록 -->
                        <div class="space-y-2 mb-4" id="chairListItems">
                            ${chairs.length === 0 ? 
                                '<p class="text-gray-400 text-sm text-center py-4">등록된 좌장/사회가 없습니다</p>' :
                                chairs.map((c, i) => `
                                    <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                        <select onchange="updateChairFieldPatch('${sessionId}', ${i}, 'role', this.value)" 
                                            class="px-2 py-1.5 border rounded text-sm w-20 bg-white">
                                            <option value="chair" ${c.role !== 'moderator' ? 'selected' : ''}>좌장</option>
                                            <option value="moderator" ${c.role === 'moderator' ? 'selected' : ''}>사회</option>
                                        </select>
                                        <input type="text" value="${c.name || ''}" 
                                            onchange="updateChairFieldPatch('${sessionId}', ${i}, 'name', this.value)"
                                            class="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="이름">
                                        <input type="text" value="${c.affiliation || ''}" 
                                            onchange="updateChairFieldPatch('${sessionId}', ${i}, 'affiliation', this.value)"
                                            class="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="소속">
                                        <button onclick="removeChairPatch('${sessionId}', ${i})" 
                                            class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                            </svg>
                                        </button>
                                    </div>
                                `).join('')
                            }
                        </div>
                        
                        <!-- 새로 추가 -->
                        <div class="border-t pt-4">
                            <h4 class="font-medium text-gray-700 mb-2">새로 추가</h4>
                            <div class="flex items-center gap-2">
                                <select id="newChairRolePatch" class="px-2 py-1.5 border rounded text-sm w-20">
                                    <option value="chair">좌장</option>
                                    <option value="moderator">사회</option>
                                </select>
                                <input type="text" id="newChairNamePatch" 
                                    class="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="이름">
                                <input type="text" id="newChairAffiliationPatch" 
                                    class="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="소속">
                                <button onclick="addChairPatch('${sessionId}', '${sessionName}')" 
                                    class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">
                                    추가
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-4 border-t flex justify-end">
                        <button onclick="this.closest('.fixed').remove()" 
                            class="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">닫기</button>
                    </div>
                </div>
            </div>
        `;
        
        // 기존 모달 제거 후 새로 추가
        document.getElementById('chairModal')?.remove();
        document.body.insertAdjacentHTML('beforeend', html);
    };

    // ========================================
    // 5. 좌장 CRUD 함수들
    // ========================================
    window.addChairPatch = async function(sessionId, sessionName) {
        const role = document.getElementById('newChairRolePatch')?.value || 'chair';
        const name = document.getElementById('newChairNamePatch')?.value?.trim();
        const affiliation = document.getElementById('newChairAffiliationPatch')?.value?.trim() || '';
        
        if (!name) {
            alert('이름을 입력하세요');
            return;
        }
        
        if (!state.sessionChairs) state.sessionChairs = {};
        if (!state.sessionChairs[sessionId]) state.sessionChairs[sessionId] = [];
        
        state.sessionChairs[sessionId].push({ role, name, affiliation });
        
        await saveSessionChairsPatch();
        showChairModalWithAffiliation(sessionId, sessionName);
        
        // 시간표 다시 렌더링 (기존 함수 호출)
        if (typeof renderSchedule === 'function') renderSchedule();
    };

    window.removeChairPatch = async function(sessionId, index) {
        if (!state.sessionChairs?.[sessionId]) return;
        
        const session = (state.sessions || []).find(s => s.id === sessionId);
        const sessionName = session?.name || sessionId;
        
        state.sessionChairs[sessionId].splice(index, 1);
        
        await saveSessionChairsPatch();
        showChairModalWithAffiliation(sessionId, sessionName);
        
        if (typeof renderSchedule === 'function') renderSchedule();
    };

    window.updateChairFieldPatch = async function(sessionId, index, field, value) {
        if (!state.sessionChairs?.[sessionId]?.[index]) return;
        
        state.sessionChairs[sessionId][index][field] = value;
        
        await saveSessionChairsPatch();
        
        if (typeof renderSchedule === 'function') renderSchedule();
    };

    window.saveSessionChairsPatch = async function() {
        if (typeof db === 'undefined') {
            console.error('Firebase db not found');
            return;
        }
        
        try {
            await db.collection('settings').doc('sessionChairs').set({
                data: state.sessionChairs,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to save session chairs:', err);
        }
    };

    // ========================================
    // 6. 좌장 표시 헬퍼 (세션 헤더용)
    // ========================================
    window.renderChairBadges = function(sessionId) {
        const chairs = (state.sessionChairs || {})[sessionId] || [];
        
        if (chairs.length === 0) {
            return '<span class="text-xs text-gray-400">좌장/사회 추가</span>';
        }
        
        return chairs.map(c => `
            <span class="px-2 py-0.5 rounded text-xs whitespace-nowrap
                ${c.role === 'moderator' ? 'bg-purple-200 text-purple-700' : 'bg-blue-200 text-blue-700'}">
                ${c.role === 'moderator' ? '사회' : '좌장'}: ${c.name}${c.affiliation ? ` (${c.affiliation})` : ''}
            </span>
        `).join(' ');
    };

    // ========================================
    // 초기화: 기존 함수 오버라이드 또는 보강
    // ========================================
    console.log('✅ chairs-patch.js loaded');
    
    // 페이지 로드 후 충돌 체크
    if (document.readyState === 'complete') {
        setTimeout(checkChairConflicts, 1000);
    } else {
        window.addEventListener('load', () => setTimeout(checkChairConflicts, 1000));
    }

})();
