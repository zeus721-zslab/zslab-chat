# zslab-chat 개발 진행 현황

## 완료된 작업

### 서버 (server/)
- [x] `server/index.js` — Express + Socket.io 서버 진입점 (범용, .env 기반)
- [x] `server/config.js` — 채팅 동작 설정 (mode, groupChat, typing, readReceipt, 테이블명)
- [x] `server/db.js` — MySQL 커넥션 풀 (.env 환경변수 전용)
- [x] `server/middleware/auth.js` — JWT 인증 미들웨어 + generateToken 헬퍼
- [x] `server/models/Room.js` — 채팅방 CRUD (findOrCreate1to1, 참여자 관리)
- [x] `server/models/Message.js` — 메시지 CRUD (markAsRead, countUnread)
- [x] `server/handlers/room.js` — join_room 이벤트 핸들러 (권한 체크)
- [x] `server/handlers/chat.js` — send_message, mark_read 이벤트 핸들러
- [x] `server/handlers/typing.js` — typing_start, typing_stop 핸들러 (자동 해제 타이머)

### 설정 파일
- [x] `package.json` — 의존성 정의
- [x] `.env.example` — 환경변수 템플릿
- [x] `schema.sql` — MySQL 스키마 (chat_rooms, chat_participants, chat_messages)
- [x] `README.md` — 설치·연동·이벤트 문서

## 변경 이력

### 2026-04-24 — 범용 채팅 솔루션으로 재설계
- 쇼핑몰 종속 코드 전면 제거
- DB/Redis 연결을 .env 환경변수만으로 처리
- config.js: 쇼핑몰 전용 설정 제거, tables 섹션 추가 (테이블명 변경 가능)
- server/index.js: REDIS_URL 환경변수로만 Redis 어댑터 활성화 여부 결정
- 권한 분기: user (참여자 방만) / admin (전체 방, 최초 입장 시 자동 등록)
- typing 핸들러: 5초 자동 해제 타이머 추가
- README.md: 범용 연동 가이드 (이벤트 문서, Docker 예시 포함)

### 2026-04-24 — 이전 작업 (원복됨)
- Redis pub/sub 클라이언트 error 이벤트 핸들러 추가
- 쇼핑몰 연동 버전 커밋 (이후 범용화를 위해 reset)

## 아키텍처

```
클라이언트
  │  Socket.io (JWT 인증)
  ▼
zslab-chat :3001
  ├── Express (/health, /api/token)
  ├── Redis Adapter (REDIS_URL 있을 때 멀티 인스턴스)
  └── 이벤트 핸들러
       ├── room    : join_room
       ├── chat    : send_message, mark_read
       └── typing  : typing_start, typing_stop
           │
           ▼
        MySQL (chat_rooms, chat_participants, chat_messages)
```

## 사용 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 에서 JWT_SECRET, DB_*, REDIS_URL 설정

# 3. DB 초기화
mysql -u root -p your_database < schema.sql

# 4. 서버 실행
npm run dev   # 개발
npm start     # 프로덕션
```
