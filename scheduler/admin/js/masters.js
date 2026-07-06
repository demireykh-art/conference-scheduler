/**
 * masters.js — 연자/파트너사 마스터 데이터 구독 (전역 공유)
 * 데이터: /adminSpeakers/<id>, /adminPartners/<id>
 * 강의 모달에서 미리 등록된 값만 선택하도록 제공.
 */

window.Masters = {
    speakers: [],
    partners: [],
    ready: false,

    init() {
        database.ref('/adminSpeakers').on('value', snap => {
            this.speakers = toOrderedArray(snap.val())
                .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));
            this.ready = true;
            document.dispatchEvent(new CustomEvent('masters-change'));
        });
        database.ref('/adminPartners').on('value', snap => {
            this.partners = toOrderedArray(snap.val())
                .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));
            document.dispatchEvent(new CustomEvent('masters-change'));
        });
    },

    speaker(id) { return this.speakers.find(s => s.id === id) || null; },
    partner(id) { return this.partners.find(p => p.id === id) || null; }
};

console.log('✅ masters.js 로드 완료');
