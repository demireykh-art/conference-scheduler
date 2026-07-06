# ASLS 행사 관리 — 리스트형 컨퍼런스 시간표 모듈

학회 컨퍼런스 `conference-admin` 포맷을 재현한 **다중 컨퍼런스 + 리스트형 시간표** 관리자 모듈입니다.
기존 그리드형 스케줄러(`../`)와 별개로 동작하며, **같은 Firebase 프로젝트**를 재사용합니다.

## 화면

| 파일 | 대응 | 설명 |
|---|---|---|
| `index.html` | `conferences.php` | 행사 개설/관리 — 행사 목록(공개/비공개), 생성·수정·삭제, 포스터 업로드 |
| `timetable.html?id=<행사id>` | `conference-timetable.php` | 시간표 및 프로그램 구성 — 룸 탭 → 세션 → 강의 |
| `speakers.html` | — | 연자 관리 (마스터): 이름·소속 국문/영문 |
| `partners.html` | — | 파트너사 관리 (마스터): 이름 국문/영문 + 제품 목록 |

## 구조

```
행사(Conference)
 └ 룸(Room)      : 이름, 주제, 시작시간, 기본강의시간, 사용자공개, 순서
    └ 세션(Session): 이름(오전/점심/오후), 순서
       └ 강의(Lecture): 제목(국/영), 시간(분), 연자[](마스터참조), 파트너사(마스터참조), 제품(국/영), 순서

연자 마스터(Speaker) : 이름(국/영), 소속(국/영)   — /adminSpeakers
파트너사 마스터(Partner): 이름(국/영), 제품[]{국/영} — /adminPartners
```

- 강의의 **연자·파트너사는 미리 등록된 마스터에서만 선택**합니다(오타·중복 방지). 선택 시 국문/영문·소속·제품이 자동으로 채워집니다.

- **시작·종료 시각은 자동 계산**됩니다. 강의는 `시간(분)`만 저장하고, 룸 시작시간부터 세션·강의 순서대로 누적되어 뒤 시각이 자동으로 밀립니다.
- 룸/세션/강의는 **⋮⋮ 드래그**로 순서를 바꿀 수 있고, 강의는 **이동** 버튼으로 다른 세션/룸으로 옮깁니다.
- **엑셀 다운로드**로 전체 프로그램을 내려받을 수 있습니다.

## Firebase 데이터 경로

- 행사/시간표: `/adminConferences/<id>`
- 연자 마스터: `/adminSpeakers/<id>`
- 파트너사 마스터: `/adminPartners/<id>`
- 로그인/권한: 기존 `/users` 승인 체계(admin/editor/pending) 재사용
- (모두 기존 앱의 `/data`·`/settings`와 충돌하지 않음)

> ⚠️ Firebase 보안 규칙에서 `/adminConferences`, `/adminSpeakers`, `/adminPartners`
> 읽기/쓰기를 허용해야 합니다. (편집은 로그인 필요, 승인된 사용자만 저장 가능)

## 접속

- 목록: `/conference-scheduler/scheduler/admin/`
- 시간표: `/conference-scheduler/scheduler/admin/timetable.html?id=<행사id>`
