# zslab-chat 운영 매뉴얼

범용 실시간 채팅 솔루션 — 설치부터 운영까지 완전 가이드

---

## 목차

1. [솔루션 개요](#1-솔루션-개요)
2. [설치 및 설정](#2-설치-및-설정)
3. [Nginx 연동 설정](#3-nginx-연동-설정)
4. [사용자 위젯 연동](#4-사용자-위젯-연동)
5. [관리자 패널](#5-관리자-패널)
6. [운영 및 트러블슈팅](#6-운영-및-트러블슈팅)
7. [PM2 프로덕션 운영](#7-pm2-프로덕션-운영)
8. [멀티 인스턴스 스케일 아웃](#8-멀티-인스턴스-스케일-아웃)

---

## 1. 솔루션 개요

### 1-1. 아키텍처 구조

```
[브라우저]
    │  WebSocket / polling
    ▼
[Nginx]  ← TLS 종료, /socket.io/ 프록시
    │  HTTP 업그레이드 (1-hop 직접 연결)
    ▼
[zslab-chat :3001]  ← Express + Socket.io
    ├── /health          헬스체크 REST
    ├── /api/token       JWT 발급 (개발용)
    └── Socket.io 이벤트
         ├── room    : join_room
         ├── chat    : send_message, mark_read
         └── typing  : typing_start, typing_stop
              │
              ├── MySQL  (채팅방·메시지 영속 저장)
              └── Redis  (멀티 인스턴스 pub/sub — REDIS_URL 설정 시 활성화)
```

**중요: Nginx → zslab-chat 은 반드시 1-hop 직접 연결이어야 합니다.**  
Caddy, 다른 Nginx, 혹은 어떤 역방향 프록시도 중간에 끼우면 WebSocket 업그레이드 헤더가 유실되어 소켓 연결이 실패합니다.

### 1-2. 기술 스택

| 컴포넌트       | 버전        | 역할                              |
|---------------|-------------|-----------------------------------|
| Node.js        | 20 LTS      | 런타임                            |
| Express        | ^4.18        | REST 엔드포인트                   |
| Socket.io      | ^4.7         | WebSocket / long-polling 처리     |
| mysql2         | ^3.9         | MySQL / MariaDB 커넥션 풀          |
| ioredis        | ^5.3         | Redis 클라이언트                  |
| @socket.io/redis-adapter | ^8.3 | 멀티 인스턴스 pub/sub   |
| jsonwebtoken   | ^9.0         | JWT 인증                          |
| dotenv         | ^16.4        | 환경변수 로드                     |

### 1-3. 디렉토리 구조

```
zslab-chat/
├── server/
│   ├── index.js          — 서버 진입점 (Express + Socket.io 초기화)
│   ├── config.js         — 채팅 동작 설정 (mode, tables 등)
│   ├── db.js             — MySQL 커넥션 풀
│   ├── middleware/
│   │   └── auth.js       — JWT 인증 미들웨어 + generateToken 헬퍼
│   ├── models/
│   │   ├── Room.js       — 채팅방 CRUD
│   │   └── Message.js    — 메시지 CRUD
│   └── handlers/
│       ├── room.js       — join_room 이벤트 핸들러
│       ├── chat.js       — send_message, mark_read 이벤트 핸들러
│       └── typing.js     — typing_start, typing_stop 핸들러
├── schema.sql            — MySQL 초기 스키마
├── .env.example          — 환경변수 템플릿
├── package.json
└── README.md
```

---

## 2. 설치 및 설정

### 2-1. 사전 요구사항

| 항목           | 최소 버전    | 비고                        |
|---------------|-------------|----------------------------|
| Node.js        | 18 LTS 이상 | 20 LTS 권장                |
| npm            | 9 이상      | Node.js 번들               |
| MySQL / MariaDB | 8.0 / 10.6 | —                          |
| Redis          | 6 이상      | 단일 인스턴스 시 선택 사항  |

### 2-2. GitHub clone

```bash
git clone https://github.com/zeus721-zslab/zslab-chat.git
cd zslab-chat
npm install
```

### 2-3. .env 설정

```bash
cp .env.example .env
vi .env
```

**.env 항목 전체 설명**

```dotenv
# 서버 포트 (기본: 3001)
PORT=3001

# JWT 서명 비밀키 — 반드시 강력한 랜덤 문자열로 변경
# 예: openssl rand -hex 32
JWT_SECRET=your_jwt_secret

# MySQL / MariaDB 연결 정보
DB_HOST=localhost          # DB 호스트 (Docker라면 서비스명)
DB_PORT=3306               # DB 포트
DB_DATABASE=your_database  # 데이터베이스명
DB_USERNAME=your_username  # 사용자명
DB_PASSWORD=your_password  # 비밀번호

# Redis URL (멀티 인스턴스 시 설정, 단일 인스턴스면 주석 처리)
REDIS_URL=redis://localhost:6379
```

> **JWT_SECRET 생성 예시**
> ```bash
> openssl rand -hex 32
> # → e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
> ```

### 2-4. DB 초기화

```bash
mysql -u root -p your_database < schema.sql
```

생성되는 테이블:
- `chat_rooms` — 채팅방 (type, name)
- `chat_participants` — 방별 참여자 (user_id, user_type, last_read_at)
- `chat_messages` — 메시지 (sender_id, sender_type, message, is_read)

### 2-5. 서버 실행

```bash
npm run dev    # 개발 (nodemon, 파일 변경 시 자동 재시작)
npm start      # 프로덕션
```

### 2-6. Docker 연동

#### docker-compose.yml 예시

```yaml
services:
  zslab-chat:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./zslab-chat:/app
    command: sh -c "npm install && npm start"
    ports:
      - "3001:3001"          # Nginx가 직접 접근 — 외부 노출 불필요 시 제거
    environment:
      PORT: 3001
      JWT_SECRET: ${CHAT_JWT_SECRET}
      DB_HOST: mariadb        # 같은 Docker 네트워크 내 DB 서비스명
      DB_PORT: 3306
      DB_DATABASE: ${DB_DATABASE}
      DB_USERNAME: ${DB_USERNAME}
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_URL: redis://redis:6379
    networks:
      - gateway_net           # Nginx 컨테이너와 공유하는 네트워크
      - internal_net          # DB, Redis 와 공유하는 내부 네트워크
    restart: unless-stopped

networks:
  gateway_net:
    external: true   # Nginx 컨테이너가 이미 속해 있는 네트워크
  internal_net:
    driver: bridge
```

#### gateway_net 연결 핵심

Nginx가 `zslab-chat` 컨테이너에 프록시하려면 **두 컨테이너가 같은 Docker 네트워크에 있어야** 합니다.

```bash
# 기존 Nginx 컨테이너의 네트워크 확인
docker inspect nginx-container --format '{{json .NetworkSettings.Networks}}'

# zslab-chat 컨테이너를 해당 네트워크에 연결
docker network connect gateway_net zslab-chat
```

`docker-compose.yml`에 `external: true` 로 선언하면 `docker compose up` 시 자동 연결됩니다.

---

## 3. Nginx 연동 설정

### 3-1. WebSocket 프록시 필수 설정

WebSocket 연결은 HTTP Upgrade 헤더를 통해 이루어집니다.  
Nginx에서 이를 처리하려면 아래 설정이 **반드시** 포함되어야 합니다.

```nginx
# /etc/nginx/conf.d/chat.conf (또는 기존 server 블록에 추가)

# connection_upgrade map — http_upgrade 값에 따라 Connection 헤더 결정
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    # SSL 설정 (기존 인증서 경로 사용)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Socket.io 엔드포인트 프록시
    location /socket.io/ {
        proxy_pass         http://zslab-chat:3001;   # Docker 서비스명 또는 IP

        # WebSocket 업그레이드 헤더 — 이 3줄이 없으면 소켓 연결 불가
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;

        # 실제 클라이언트 IP 전달
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # 타임아웃 (WebSocket 장기 연결 유지)
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }

    # REST 엔드포인트 (헬스체크, 토큰 발급)
    location /chat-api/ {
        proxy_pass       http://zslab-chat:3001/;
        proxy_set_header Host            $host;
        proxy_set_header X-Real-IP       $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 3-2. connection_upgrade map 설명

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;  # Upgrade 헤더 있음 → Connection: upgrade
    ''      close;    # Upgrade 헤더 없음 → Connection: close
}
```

`$http_upgrade`가 빈 문자열이면(`''`) 일반 HTTP 요청이므로 `Connection: close`,  
`websocket` 등 값이 있으면 `Connection: upgrade`로 WebSocket 핸드셰이크를 진행합니다.

### 3-3. 2-hop 구조 금지 사항

**절대 하지 말 것:**

```
# 잘못된 구조 (WebSocket 연결 실패)
클라이언트 → Nginx → Caddy → zslab-chat   ❌
클라이언트 → Nginx → Nginx(다른) → zslab-chat  ❌
```

중간 프록시가 추가되면:
- Upgrade 헤더가 중간에서 소비되거나 누락됨
- 첫 번째 프록시에서 WebSocket 핸드셰이크가 완료되어 두 번째 프록시로 전달 불가
- Socket.io가 polling으로 폴백하지만 연결이 불안정해짐

**올바른 구조:**

```
클라이언트 → Nginx → zslab-chat   ✓ (1-hop)
```

---

## 4. 사용자 위젯 연동

### 4-1. Socket.io 클라이언트 연결

```js
import { io } from 'socket.io-client';

// JWT 토큰 획득 (백엔드에서 발급받아야 함)
const token = await fetchTokenFromYourBackend();

const socket = io('https://yourdomain.com', {
  path: '/socket.io/',
  auth: { token },
  transports: ['websocket', 'polling'],  // websocket 우선, 실패 시 polling 폴백
});

socket.on('connect', () => {
  console.log('연결됨:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('연결 실패:', err.message);
});
```

### 4-2. JWT 토큰 발급

**프로덕션** — 백엔드 서버에서 `JWT_SECRET` 동일 키로 직접 생성:

```js
// 백엔드 (Node.js 예시)
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: user.id, userType: 'user' },  // userType: 'user' | 'admin'
  process.env.CHAT_JWT_SECRET,
  { expiresIn: '7d' }
);
```

**개발/테스트** — zslab-chat REST 엔드포인트 사용:

```bash
curl -X POST https://yourdomain.com/chat-api/api/token \
  -H 'Content-Type: application/json' \
  -d '{"userId": "42", "userType": "user"}'
# → { "token": "eyJhbGci..." }
```

> 이 엔드포인트는 개발/테스트 전용입니다. 프로덕션에서는 백엔드에서 직접 JWT를 생성하세요.

### 4-3. Next.js 연동 주의사항

#### NEXT_PUBLIC_CHAT_URL은 빌드 타임에 고정됨

Next.js에서 `NEXT_PUBLIC_` 접두사 환경변수는 **빌드 시점에 번들에 인라인**됩니다.  
컨테이너 실행 시 환경변수를 바꿔도 이미 빌드된 번들에는 반영되지 않습니다.

```bash
# 잘못된 예: 빌드 후 환경변수 변경은 무효
docker run -e NEXT_PUBLIC_CHAT_URL=https://new-url.com my-nextjs-app  # ❌ 무시됨
```

**올바른 방법:** 환경변수를 확정한 뒤 빌드:

```bash
# .env.production 또는 빌드 시 --build-arg 로 전달
NEXT_PUBLIC_CHAT_URL=https://yourdomain.com npm run build
```

#### standalone 빌드에서 런타임 환경변수가 무시되는 이유

`next.config.js`에서 `output: 'standalone'`을 사용하면 Next.js는 서버 코드를 단일 번들로 패키징합니다.  
이 과정에서 `NEXT_PUBLIC_*` 변수가 문자열 리터럴로 치환되어 런타임 주입이 불가능합니다.

```js
// next.config.js
module.exports = {
  output: 'standalone',
  // NEXT_PUBLIC_CHAT_URL은 빌드 시점에 번들에 삽입됨
};
```

**해결책:** 런타임 설정이 필요한 값은 `NEXT_PUBLIC_` 대신 API 라우트를 통해 전달하거나,  
`getServerSideProps`에서 `process.env`로 읽어 클라이언트에 prop으로 내려보냅니다.

```js
// pages/chat.js
export async function getServerSideProps() {
  return {
    props: {
      chatUrl: process.env.CHAT_URL,  // 런타임에 읽힘
    },
  };
}
```

### 4-4. 채팅 이벤트 코드 예시

```js
// 채팅방 입장
socket.emit('join_room', { roomId: 1 });
socket.on('room_joined', ({ room, messages }) => {
  console.log('입장:', room);
  console.log('이전 메시지:', messages);
});

// 메시지 전송
socket.emit('send_message', { roomId: 1, message: '안녕하세요!' });
socket.on('message_received', (msg) => {
  console.log(`[${msg.sender_id}]: ${msg.message}`);
});

// 읽음 처리
socket.emit('mark_read', { roomId: 1 });
socket.on('messages_read', ({ roomId, readBy }) => {
  console.log(`room ${roomId} - ${readBy}가 읽음`);
});

// 타이핑 인디케이터
socket.emit('typing_start', { roomId: 1 });
socket.emit('typing_stop',  { roomId: 1 });
socket.on('typing', ({ isTyping, userId }) => {
  console.log(`${userId} 타이핑 ${isTyping ? '중' : '완료'}`);
});

// 에러 처리
socket.on('error', ({ message }) => {
  console.error('소켓 에러:', message);
});
```

### 4-5. 전체 Socket.io 이벤트 레퍼런스

#### 클라이언트 → 서버 (emit)

| 이벤트         | 페이로드              | 설명                        |
|--------------|----------------------|-----------------------------|
| `join_room`    | `{ roomId }`          | 채팅방 입장 및 이전 메시지 수신 |
| `send_message` | `{ roomId, message }` | 메시지 전송                  |
| `mark_read`    | `{ roomId }`          | 읽음 처리                    |
| `typing_start` | `{ roomId }`          | 타이핑 시작 알림             |
| `typing_stop`  | `{ roomId }`          | 타이핑 종료 알림             |

#### 서버 → 클라이언트 (on)

| 이벤트             | 페이로드                                                                         | 설명                   |
|------------------|---------------------------------------------------------------------------------|------------------------|
| `room_joined`     | `{ room, messages[] }`                                                           | 입장 성공 + 이전 메시지  |
| `message_received`| `{ id, room_id, sender_id, sender_type, message, is_read, created_at }`         | 새 메시지               |
| `messages_read`   | `{ roomId, readBy }`                                                             | 상대방 읽음 확인         |
| `typing`          | `{ isTyping, userId }`                                                           | 타이핑 상태 변경         |
| `error`           | `{ message }`                                                                    | 에러 알림               |

---

## 5. 관리자 패널

### 5-1. 관리자 토큰 발급

관리자는 `userType: 'admin'`으로 JWT를 발급받아야 합니다.

```bash
curl -X POST https://yourdomain.com/chat-api/api/token \
  -H 'Content-Type: application/json' \
  -d '{"userId": "admin1", "userType": "admin"}'
```

### 5-2. 관리자 권한 정책

| 역할    | 채팅방 접근                          |
|--------|-------------------------------------|
| `user`  | 본인이 참여자로 등록된 방만 입장 가능  |
| `admin` | 모든 방 입장 가능, 최초 입장 시 참여자로 자동 등록 |

admin은 `join_room` 이벤트 수신 시 방에 자동으로 participant로 등록되므로,  
별도 DB 작업 없이 모든 사용자 채팅방에 참여하여 답변할 수 있습니다.

### 5-3. 1:1 채팅방 생성 흐름

1. 사용자가 문의를 시작하면 백엔드에서 `Room.findOrCreate1to1(userId, adminId)` 호출
2. 기존 방이 있으면 기존 방 ID 반환, 없으면 새 방 생성
3. 사용자와 관리자 모두 해당 `roomId`로 `join_room` emit

```js
// 백엔드에서 방 생성 (zslab-chat 코드를 백엔드에서 import하거나 별도 API 구현)
const Room = require('./zslab-chat/server/models/Room');
const room = await Room.findOrCreate1to1(userId, 'admin1');
// room.id 를 프론트엔드에 전달
```

### 5-4. 헬스체크 엔드포인트

```bash
curl https://yourdomain.com/chat-api/health
# → {"status":"ok","service":"zslab-chat"}
```

---

## 6. 운영 및 트러블슈팅

### 6-1. 컨테이너 로그 확인

```bash
# 실시간 로그 스트림
docker logs -f zslab-chat

# 최근 100줄
docker logs --tail=100 zslab-chat

# 특정 시간 이후 로그
docker logs --since="2026-04-24T00:00:00" zslab-chat
```

**정상 기동 로그 예시:**

```
[zslab-chat] listening on :3001
  mode       : 1to1
  groupChat  : false
  typing     : true
  readReceipt: true
  redis      : redis://redis:6379
[redis] adapter connected: redis://redis:6379
[socket] connect  id=abc123 user=42 type=user
```

### 6-2. 소켓 연결 실패 시 체크리스트

연결이 안 될 때 순서대로 확인하세요.

#### Step 1. 헬스체크 응답 확인

```bash
curl https://yourdomain.com/chat-api/health
```
- 응답 없음 → zslab-chat 컨테이너 미기동 or Nginx 프록시 설정 오류

#### Step 2. Docker 네트워크 확인

```bash
# Nginx와 zslab-chat이 같은 네트워크에 있는지 확인
docker network inspect gateway_net | grep -E '"Name"|"IPv4Address"'
```

두 컨테이너가 같은 네트워크에 없으면 `Connection refused` 발생.

```bash
docker network connect gateway_net zslab-chat
```

#### Step 3. Nginx 설정 확인

```bash
nginx -t  # 또는
docker exec nginx-container nginx -t

# 필수 헤더 확인
grep -n "Upgrade\|Connection\|proxy_http_version" /etc/nginx/conf.d/chat.conf
```

`proxy_http_version 1.1`, `Upgrade`, `Connection` 3줄이 모두 있어야 합니다.

#### Step 4. Socket.io transport 확인

브라우저 개발자도구 → Network 탭에서 `/socket.io/` 요청 확인:
- `101 Switching Protocols` → WebSocket 연결 성공
- `200 OK` (polling 반복) → WebSocket 업그레이드 실패, Nginx 헤더 문제

#### Step 5. 인증 오류 확인

```
# 로그에서 unauthorized 확인
docker logs zslab-chat | grep "unauthorized\|error"
```

JWT 토큰이 없거나 만료됐을 때 소켓 연결이 즉시 끊깁니다.  
토큰을 재발급하고 `socket.auth.token`에 올바르게 전달되는지 확인하세요.

### 6-3. 자주 발생하는 문제와 해결책

#### 문제 1: WebSocket 연결 후 즉시 끊김

**증상:** `connect` 이벤트 후 바로 `disconnect`

**원인:** JWT 인증 실패

**해결:**
```bash
# 토큰 검증
curl -X POST http://localhost:3001/api/token \
  -d '{"userId":"test","userType":"user"}' \
  -H 'Content-Type: application/json'

# 클라이언트에서 토큰 전달 확인
const socket = io(url, { auth: { token: '...' } });  # auth 객체 필수
```

---

#### 문제 2: polling만 작동하고 websocket 업그레이드 안 됨

**증상:** Network 탭에서 `/socket.io/?EIO=4&transport=polling` 요청만 반복

**원인:** Nginx에 WebSocket 업그레이드 헤더 누락

**해결:**
```nginx
# 반드시 이 3줄 확인
proxy_http_version 1.1;
proxy_set_header   Upgrade    $http_upgrade;
proxy_set_header   Connection $connection_upgrade;
```

---

#### 문제 3: 중간 프록시(Caddy 등)를 통한 연결 실패

**증상:** WebSocket 연결 반복 실패, `400 Bad Request` 또는 `502 Bad Gateway`

**원인:** 2-hop 프록시 구조에서 WebSocket 헤더 유실

**해결:** 중간 프록시 제거 후 Nginx → zslab-chat 직접 연결로 변경

```nginx
# 수정 전 (잘못된 구조)
location /socket.io/ {
    proxy_pass http://caddy:8080;  # Caddy를 경유
}

# 수정 후 (올바른 구조)
location /socket.io/ {
    proxy_pass http://zslab-chat:3001;  # 직접 연결
}
```

---

#### 문제 4: Next.js에서 채팅 URL이 빌드 환경 URL로 고정됨

**증상:** 배포 후 채팅 소켓이 로컬호스트 또는 빌드 서버에 연결 시도

**원인:** `NEXT_PUBLIC_CHAT_URL`이 빌드 타임에 번들에 인라인됨

**해결:** 환경변수를 확정한 뒤 빌드 실행
```bash
NEXT_PUBLIC_CHAT_URL=https://yourdomain.com npm run build
```

런타임 주입이 필요하면 `getServerSideProps`를 통해 서버 환경변수를 prop으로 전달하는 구조로 변경하세요.

---

#### 문제 5: Redis 연결 실패로 서버가 뜨지 않음

**증상:** `[redis] adapter 연결 실패, 단일 인스턴스로 실행` 로그 후 계속 동작

Redis 연결 실패는 **경고(warn)** 처리되어 서버는 단일 인스턴스 모드로 계속 실행됩니다.  
단일 인스턴스로 충분하다면 `.env`에서 `REDIS_URL`을 주석 처리하세요.

```dotenv
# REDIS_URL=redis://localhost:6379   # 주석 처리 시 비활성화
```

---

#### 문제 6: Redis 클라이언트 error 이벤트 핸들러 누락 → 프로세스 강제 종료

**증상:** Redis가 잠시 끊기거나 재시작하면 zslab-chat 프로세스 자체가 크래시됨

```
events.js:292
  throw er;  // Unhandled 'error' event
Error: connect ECONNREFUSED 127.0.0.1:6379
    at Redis.<anonymous> (ioredis/built/redis/index.js:...)
```

**원인:**  
ioredis는 연결 실패 시 `'error'` 이벤트를 emit합니다.  
Node.js에서 `'error'` 이벤트에 핸들러가 없으면 **Unhandled Error**로 처리되어 프로세스가 즉시 종료됩니다.  
`pub.duplicate()`로 생성한 `sub` 클라이언트도 별도 인스턴스이므로 각각 핸들러를 달아야 합니다.

**해결:** `server/index.js`에서 pub/sub 클라이언트 생성 직후 error 핸들러 등록

```js
// 수정 전 — error 핸들러 없음 → Redis 장애 시 프로세스 크래시
const pub = new Redis(REDIS_URL);
const sub = pub.duplicate();
io.adapter(createAdapter(pub, sub));

// 수정 후 — error 핸들러 등록 → Redis 장애를 로그로만 처리
const pub = new Redis(REDIS_URL);
const sub = pub.duplicate();
pub.on('error', (err) => console.error('[redis] pub error:', err.message));
sub.on('error', (err) => console.error('[redis] sub error:', err.message));
io.adapter(createAdapter(pub, sub));
```

> **교훈:** ioredis를 포함해 EventEmitter 기반 클라이언트는 항상 `'error'` 이벤트 핸들러를 등록하세요.  
> `duplicate()`로 생성한 클라이언트도 독립 인스턴스이므로 **원본과 복사본 모두** 핸들러가 필요합니다.

---

#### 문제 7: DB 연결 실패

**증상:** `send_message` 시 `Failed to send message` 에러

**해결:**
```bash
# 컨테이너 내부에서 DB 접속 테스트
docker exec -it zslab-chat sh -c \
  "node -e \"require('./server/db').query('SELECT 1').then(()=>console.log('OK')).catch(e=>console.error(e.message))\""

# .env의 DB_HOST가 컨테이너 서비스명과 일치하는지 확인
# Docker: DB_HOST=mariadb  (서비스명)
# 로컬: DB_HOST=localhost
```

### 6-4. config.js 채팅 동작 변경

```js
// server/config.js
module.exports = {
  chat: {
    mode      : '1to1',   // '1to1' | 'group'
    groupChat : false,    // true 로 변경 시 그룹 채팅 활성화
    typing    : true,     // false 시 타이핑 인디케이터 비활성화
    readReceipt: true,    // false 시 읽음 표시 비활성화
  },
  tables: {
    rooms       : 'chat_rooms',        // 기존 프로젝트 테이블명과 충돌 시 변경
    participants: 'chat_participants',
    messages    : 'chat_messages',
  },
};
```

테이블명을 바꾼 경우 `schema.sql`의 `CREATE TABLE` 이름도 동일하게 수정 후 재실행하세요.

---

## 7. PM2 프로덕션 운영

Docker 없이 직접 서버에서 Node.js를 운영할 때 PM2를 사용합니다.

### 7-1. PM2 설치

```bash
npm install -g pm2
```

### 7-2. ecosystem.config.js 작성

```js
// ecosystem.config.js (프로젝트 루트)
module.exports = {
  apps: [
    {
      name   : 'zslab-chat',
      script : 'server/index.js',
      cwd    : '/path/to/zslab-chat',
      instances: 1,              // Redis 없이 단일 인스턴스
      // instances: 'max',       // Redis 있을 때 CPU 코어 수만큼
      // exec_mode: 'cluster',   // Redis 있을 때 클러스터 모드
      env: {
        NODE_ENV  : 'production',
        PORT      : 3001,
        JWT_SECRET: 'your_jwt_secret_here',
        DB_HOST   : 'localhost',
        DB_PORT   : 3306,
        DB_DATABASE : 'your_db',
        DB_USERNAME : 'your_user',
        DB_PASSWORD : 'your_pass',
        // REDIS_URL: 'redis://localhost:6379',  // 멀티 인스턴스 시 활성화
      },
      error_file : '/var/log/zslab-chat/error.log',
      out_file   : '/var/log/zslab-chat/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M',
    },
  ],
};
```

> **보안:** `ecosystem.config.js`에 비밀번호가 들어가므로 `.gitignore`에 추가하거나  
> `env_file` 옵션 대신 `.env` 파일을 사용하고 `require('dotenv').config()`로 로드하세요.

### 7-3. PM2 시작·관리 명령어

```bash
# 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 list
pm2 show zslab-chat

# 로그 실시간 확인
pm2 logs zslab-chat
pm2 logs zslab-chat --lines 200

# 재시작 / 정지 / 삭제
pm2 restart zslab-chat
pm2 stop    zslab-chat
pm2 delete  zslab-chat

# 서버 재부팅 후 자동 시작 등록
pm2 startup
pm2 save
```

### 7-4. PM2 로그 로테이션

```bash
# logrotate 플러그인 설치
pm2 install pm2-logrotate

# 설정 (예시: 10MB마다 로테이션, 30일 보관)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

---

## 8. 멀티 인스턴스 스케일 아웃

### 8-1. Redis 어댑터 동작 원리

Socket.io는 기본적으로 **단일 프로세스 내에서만** 이벤트를 브로드캐스트합니다.  
인스턴스가 2개 이상이면 서로 다른 프로세스에 연결된 클라이언트 간 메시지 전달이 안 됩니다.

Redis 어댑터를 사용하면:

```
[클라이언트 A] → [인스턴스 1]
                    │ pub → Redis channel
[클라이언트 B] → [인스턴스 2]
                    │ sub ← Redis channel
                    └── 클라이언트 B에게 전달
```

모든 인스턴스가 Redis pub/sub 채널을 공유하므로 어느 인스턴스로 연결해도 같은 방 이벤트를 수신합니다.

### 8-2. 설정 방법

**1단계: `.env`에 REDIS_URL 설정**

```dotenv
REDIS_URL=redis://localhost:6379
```

서버 시작 시 아래 로그가 출력되면 정상입니다:

```
[redis] adapter connected: redis://localhost:6379
```

**2단계: PM2 클러스터 모드 활성화 (PM2 사용 시)**

```js
// ecosystem.config.js
instances : 'max',    // CPU 코어 수만큼 프로세스 생성
exec_mode : 'cluster',
```

**3단계: Nginx upstream 설정 (로드 밸런서 역할)**

```nginx
upstream zslab_chat {
    least_conn;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    # PM2 클러스터는 포트를 공유하므로 단일 서버 블록으로도 가능
}

location /socket.io/ {
    proxy_pass http://zslab_chat;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    # Sticky session — 같은 클라이언트는 같은 인스턴스로 (polling 폴백 시 필요)
    ip_hash;
}
```

> **주의:** Socket.io의 HTTP long-polling 모드에서는 같은 클라이언트의 요청이 항상 같은 인스턴스로 가야 합니다.  
> `ip_hash` 또는 `sticky` 모듈을 사용하거나, `transports: ['websocket']`으로 polling을 비활성화하세요.

### 8-3. Redis 연결 실패 시 폴백 동작

`REDIS_URL`이 설정되어 있지만 Redis에 연결할 수 없는 경우:

```
[redis] adapter 연결 실패, 단일 인스턴스로 실행: connect ECONNREFUSED 127.0.0.1:6379
```

서버는 **단일 인스턴스 모드로 계속 실행**됩니다.  
이 경우 멀티 인스턴스 환경에서는 클라이언트 간 메시지 전달이 안 되므로,  
Redis를 반드시 복구하거나 단일 인스턴스로 운영해야 합니다.

---

## 부록: 빠른 참조

### 핵심 명령어

```bash
# 서버 기동 확인
curl http://localhost:3001/health

# 개발용 토큰 발급
curl -X POST http://localhost:3001/api/token \
  -H 'Content-Type: application/json' \
  -d '{"userId":"1","userType":"user"}'

# 로그 확인
docker logs -f zslab-chat

# 재시작
docker restart zslab-chat

# Nginx 설정 리로드
docker exec nginx-container nginx -s reload
```

### 포트 정리

| 서비스      | 포트   | 용도                         |
|------------|--------|------------------------------|
| zslab-chat  | 3001   | Socket.io + REST (내부)       |
| Nginx       | 443    | TLS 종료 + 외부 노출           |
| MySQL       | 3306   | DB (내부 네트워크만)           |
| Redis       | 6379   | pub/sub (내부 네트워크만)      |
