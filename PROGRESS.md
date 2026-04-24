# zslab-chat 개발 진행 현황

## 완료된 작업

### 서버 (server/)
- [x] `server/index.js` — Express + Socket.io 서버 진입점
- [x] `server/config.js` — 환경변수 기반 설정 (mode, groupChat, typing, readReceipt)
- [x] `server/db.js` — MySQL 커넥션 풀
- [x] `server/middleware/auth.js` — JWT Socket.io 인증 미들웨어 + generateToken 헬퍼
- [x] `server/models/Room.js` — 채팅방 CRUD (findOrCreate1to1 포함)
- [x] `server/models/Message.js` — 메시지 CRUD (markAsRead, countUnread 포함)
- [x] `server/handlers/room.js` — join_room 이벤트 핸들러
- [x] `server/handlers/chat.js` — send_message, mark_read 이벤트 핸들러
- [x] `server/handlers/typing.js` — typing_start, typing_stop 이벤트 핸들러 (디바운스 포함)

### 클라이언트 (client/)
- [x] `client/hooks/useChat.ts` — Socket.io 연결 + 채팅 상태 관리 커스텀 훅
- [x] `client/components/MessageList.tsx` — 메시지 목록 컴포넌트 (자동 스크롤)
- [x] `client/components/MessageInput.tsx` — 메시지 입력 컴포넌트 (타이핑 디바운스)
- [x] `client/components/TypingIndicator.tsx` — 타이핑 인디케이터 애니메이션 컴포넌트
- [x] `client/index.ts` — 클라이언트 SDK 진입점 (exports)

### 설정 파일
- [x] `package.json` — 의존성 정의 (`@socket.io/redis-adapter` 추가 완료)
- [x] `tsconfig.json` — TypeScript 컴파일 설정
- [x] `.env.example` — 환경변수 템플릿
- [x] `schema.sql` — MySQL 스키마 (chat_rooms, chat_participants, chat_messages)
- [x] `README.md` — 설치·사용법 문서

## 변경 이력

### 2026-04-24
- `server/index.js` — Redis pubClient/subClient에 `error` 이벤트 핸들러 추가
  (증상: `missing 'error' handler on this Redis client` 경고 반복)

## 남은 작업

없음 — 프로젝트 완성.

## 사용 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수
cp .env.example .env

# 3. DB 초기화
mysql -u root -p < schema.sql

# 4. 서버 실행
npm run dev
```
