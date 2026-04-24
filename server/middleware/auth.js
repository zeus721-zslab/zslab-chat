'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

/**
 * Socket.io 인증 미들웨어
 * handshake.auth.token 에서 JWT를 읽어 socket.user 에 페이로드를 주입한다.
 */
function authMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload  = jwt.verify(token, JWT_SECRET);
    socket.user    = {
      id  : String(payload.userId ?? payload.sub ?? payload.id),
      type: payload.userType ?? payload.role ?? 'user',
    };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}

/**
 * JWT 발급 헬퍼 (서버 사이드 연동용)
 * @param {string|number} userId
 * @param {'user'|'admin'} userType
 * @param {string|number} expiresIn  기본 7d
 */
function generateToken(userId, userType = 'user', expiresIn = '7d') {
  return jwt.sign({ userId, userType }, JWT_SECRET, { expiresIn });
}

module.exports = { authMiddleware, generateToken };
