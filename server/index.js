require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');

const config = require('./config');
const { authMiddleware } = require('./middleware/auth');
const { registerRoomHandlers } = require('./handlers/room');
const { registerChatHandlers } = require('./handlers/chat');
const { registerTypingHandlers } = require('./handlers/typing');

// ── Express 앱 ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 토큰 발급 엔드포인트 (개발/연동 편의용)
const { generateToken } = require('./middleware/auth');
app.post('/api/token', (req, res) => {
  const { userId, userType } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const token = generateToken(userId, userType || 'user');
  res.json({ token });
});

// ── HTTP 서버 ────────────────────────────────────────────────
const httpServer = http.createServer(app);

// ── Socket.io ───────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Redis 어댑터 (선택적 — REDIS_URL 환경변수가 있을 때만 활성화)
if (config.server.redisUrl) {
  try {
    const pubClient = new Redis(config.server.redisUrl);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      console.error('[redis] pub error:', err.message);
    });
    subClient.on('error', (err) => {
      console.error('[redis] sub error:', err.message);
    });

    io.adapter(createAdapter(pubClient, subClient));
    console.log('[redis] adapter connected:', config.server.redisUrl);
  } catch (err) {
    console.warn('[redis] adapter 연결 실패, 단일 인스턴스로 실행:', err.message);
  }
}

// 인증 미들웨어
io.use(authMiddleware);

// 소켓 연결 처리
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id} (user=${socket.user.id}, type=${socket.user.type})`);

  registerRoomHandlers(io, socket);
  registerChatHandlers(io, socket);
  registerTypingHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} reason=${reason}`);
  });
});

// ── 서버 시작 ────────────────────────────────────────────────
const PORT = config.server.port;
httpServer.listen(PORT, () => {
  console.log(`zslab-chat server running on port ${PORT}`);
  console.log(`  mode      : ${config.chat.mode}`);
  console.log(`  groupChat : ${config.chat.groupChat}`);
  console.log(`  typing    : ${config.chat.typing}`);
  console.log(`  readReceipt: ${config.chat.readReceipt}`);
});

module.exports = { app, io, httpServer };
