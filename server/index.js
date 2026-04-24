'use strict';

require('dotenv').config();

const express = require('express');
const http    = require('http');
const { Server }       = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis   = require('ioredis');

const config = require('./config');
const { authMiddleware, generateToken } = require('./middleware/auth');
const { registerRoomHandlers }    = require('./handlers/room');
const { registerChatHandlers }    = require('./handlers/chat');
const { registerTypingHandlers }  = require('./handlers/typing');

// ── 환경변수 ──────────────────────────────────────────────────
const PORT      = parseInt(process.env.PORT ?? '3001', 10);
const REDIS_URL = process.env.REDIS_URL ?? '';

// ── Express ───────────────────────────────────────────────────
const app = express();
app.use(require('cors')());
app.use(express.json());

// 헬스체크
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'zslab-chat' }));

// JWT 발급 (서버 사이드 연동 편의 엔드포인트 — 개발/테스트용)
app.post('/api/token', (req, res) => {
  const { userId, userType } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const token = generateToken(userId, userType ?? 'user');
  res.json({ token });
});

// ── HTTP 서버 + Socket.io ─────────────────────────────────────
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors      : { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Redis 어댑터 (멀티 인스턴스 지원 — REDIS_URL 설정 시 활성화)
if (REDIS_URL) {
  try {
    const pub = new Redis(REDIS_URL);
    const sub = pub.duplicate();
    pub.on('error', (err) => console.error('[redis] pub error:', err.message));
    sub.on('error', (err) => console.error('[redis] sub error:', err.message));
    io.adapter(createAdapter(pub, sub));
    console.log('[redis] adapter connected:', REDIS_URL);
  } catch (err) {
    console.warn('[redis] adapter 연결 실패, 단일 인스턴스로 실행:', err.message);
  }
}

// ── 소켓 인증 + 이벤트 등록 ──────────────────────────────────
io.use(authMiddleware);

io.on('connection', (socket) => {
  console.log(`[socket] connect  id=${socket.id} user=${socket.user.id} type=${socket.user.type}`);

  registerRoomHandlers(io, socket);
  registerChatHandlers(io, socket);
  registerTypingHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnect id=${socket.id} reason=${reason}`);
  });
});

// ── 서버 시작 ─────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[zslab-chat] listening on :${PORT}`);
  console.log(`  mode       : ${config.chat.mode}`);
  console.log(`  groupChat  : ${config.chat.groupChat}`);
  console.log(`  typing     : ${config.chat.typing}`);
  console.log(`  readReceipt: ${config.chat.readReceipt}`);
  console.log(`  redis      : ${REDIS_URL || '(disabled — single instance)'}`);
});

module.exports = { app, io, httpServer };
