# zslab-chat

범용 실시간 1:1 채팅 서버.  
Socket.io + MySQL + Redis 기반으로, **.env 파일 하나만 바꾸면 어떤 프로젝트에도 붙일 수 있습니다.**

---

## 특징

- JWT 인증 (user / admin 권한 분기)
- 1:1 채팅 (그룹 채팅 확장 가능)
- Redis pub/sub 기반 멀티 인스턴스 지원
- 메시지 영속 저장 (MySQL / MariaDB)
- 타이핑 인디케이터 (자동 해제 타이머 포함)
- 읽음 처리 (mark_read)

---

## 설치

```bash
git clone https://github.com/zeus721-zslab/zslab-chat.git
cd zslab-chat
npm install
cp .env.example .env   # .env 편집
mysql -u root -p your_database < schema.sql
npm run dev
```

---

## 환경변수 (.env)

| 변수           | 설명                              | 기본값            |
|----------------|-----------------------------------|-------------------|
| `PORT`         | 서버 포트                         | `3001`            |
| `JWT_SECRET`   | JWT 서명 비밀키 **(반드시 변경)** | —                 |
| `DB_HOST`      | DB 호스트                         | `localhost`       |
| `DB_PORT`      | DB 포트                           | `3306`            |
| `DB_DATABASE`  | 데이터베이스명                    | —                 |
| `DB_USERNAME`  | DB 사용자                         | —                 |
| `DB_PASSWORD`  | DB 비밀번호                       | —                 |
| `REDIS_URL`    | Redis URL (없으면 단일 인스턴스)  | `(비활성화)`      |

---

## 연동 방법

### 1. JWT 발급 (백엔드 → zslab-chat)

백엔드 서버에서 `JWT_SECRET` 동일한 키로 토큰을 생성하거나,  
개발 편의용 REST 엔드포인트를 사용합니다.

```bash
# 개발/테스트용 토큰 발급
curl -X POST http://localhost:3001/api/token \
  -H 'Content-Type: application/json' \
  -d '{"userId": "42", "userType": "user"}'
# → { "token": "eyJ..." }
```

토큰 페이로드:
```json
{ "userId": "42", "userType": "user" }
```

### 2. 클라이언트 연결

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: 'eyJ...' },
  transports: ['websocket', 'polling'],
});
```

---

## Socket.io 이벤트

### 클라이언트 → 서버 (emit)

| 이벤트         | 페이로드                       | 설명              |
|----------------|--------------------------------|-------------------|
| `join_room`    | `{ roomId }`                   | 채팅방 입장       |
| `send_message` | `{ roomId, message }`          | 메시지 전송       |
| `mark_read`    | `{ roomId }`                   | 읽음 처리         |
| `typing_start` | `{ roomId }`                   | 타이핑 시작       |
| `typing_stop`  | `{ roomId }`                   | 타이핑 종료       |

### 서버 → 클라이언트 (on)

| 이벤트            | 페이로드                                        | 설명                 |
|-------------------|-------------------------------------------------|----------------------|
| `room_joined`     | `{ room, messages[] }`                          | 입장 성공, 이전 메시지|
| `message_received`| `{ id, room_id, sender_id, sender_type, message, is_read, created_at }` | 새 메시지 |
| `messages_read`   | `{ roomId, readBy }`                            | 상대방 읽음 확인      |
| `typing`          | `{ isTyping, userId }`                          | 타이핑 상태           |
| `error`           | `{ message }`                                   | 에러                  |

---

## 권한 정책

| 역할    | 채팅방 접근                    |
|---------|-------------------------------|
| `user`  | 본인이 참여자로 등록된 방만    |
| `admin` | 모든 방 (최초 입장 시 자동 등록) |

---

## config.js

채팅 동작 설정은 `server/config.js` 에서 변경합니다.

```js
module.exports = {
  chat: {
    mode      : '1to1',   // '1to1' | 'group'
    groupChat : false,
    typing    : true,
    readReceipt: true,
  },
  tables: {
    rooms       : 'chat_rooms',
    participants: 'chat_participants',
    messages    : 'chat_messages',
  },
};
```

테이블명을 바꾸면 기존 프로젝트의 스키마와 충돌 없이 연동할 수 있습니다.

---

## Docker 연동 예시

```yaml
services:
  zslab-chat:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./zslab-chat:/app
    command: sh -c "npm install && npm start"
    environment:
      PORT: 3001
      JWT_SECRET: ${CHAT_JWT_SECRET}
      DB_HOST: mariadb
      DB_DATABASE: your_db
      DB_USERNAME: your_user
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_URL: redis://redis:6379
    networks:
      - your_network
```
