# AI 강의 입력 서버 함수 (aiExtractLectures)

카톡 캡처·PDF·텍스트를 Claude가 읽어 강의 항목(분류·제목·연자·소속·업체·제품·시간)으로 바꿔
`강의 일괄 업로드` 미리보기에 올립니다. **자동 저장은 하지 않습니다.** 미리보기 확인 후 `업로드 확정`을 눌러야 저장됩니다.

## 구조
- `functions/index.js` — Firebase Cloud Function (서울 리전, `asia-northeast3`)
  - 로그인 + `/users/{uid}/role`이 `admin`/`editor`인 계정만 호출 가능
  - Claude API 키는 Secret Manager(`ANTHROPIC_API_KEY`)에만 보관 — 브라우저 코드에 없음
- `scheduler/js/ai-import.js` — 업로드 모달의 "🤖 AI로 입력" 영역
- `scheduler/js/upload.js` — `previewAiLectures()` 추가 (기존 미리보기·중복감지·확정 로직 재사용)

## 최초 1회 배포 (원장님 PC에서)
1. Firebase 콘솔 → 프로젝트 `conference-scheduler-a5656` → 요금제를 **Blaze(종량제)** 로 변경
   - Cloud Functions·Secret Manager 사용에 필요. 이 정도 사용량이면 Firebase 쪽 비용은 거의 0원 수준
2. Claude API 키 발급: https://console.anthropic.com → API Keys (학회 결제수단 등록)
3. 터미널:
   ```bash
   npm install -g firebase-tools
   firebase login                      # demire.ykh@gmail.com 등 프로젝트 소유 계정
   cd conference-scheduler
   firebase functions:secrets:set ANTHROPIC_API_KEY   # 2번 키 붙여넣기
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
4. 테스트 페이지(`/scheduler/test/`) → 설정 → 📤 강의업로드 → 🤖 AI로 입력

## 비용 감
- 모델: `claude-sonnet-5-5` (index.js의 `MODEL`에서 변경 가능)
- 캡처 1~3장 기준 1회 수십 원 수준. 사용량은 Anthropic 콘솔 Usage에서 확인

## 주의
- AI는 원문에 없는 내용을 지어낼 수 있음 → 원문에 없으면 빈칸으로 두도록 지시했지만, 미리보기의 ⚠️·"신규 연자?" 표시는 반드시 확인
- 시간 칸 "(기본값)"은 원문에 강의 시간이 없어 15분으로 넣은 것
