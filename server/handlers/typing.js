'use strict';

const TYPING_TIMEOUT_MS = 5000;

/**
 * typing_start, typing_stop 이벤트 핸들러
 * 클라이언트가 일정 시간 내에 typing_stop 을 보내지 않으면 자동 해제
 */
function registerTypingHandlers(io, socket) {
  const timers = new Map(); // roomId → timeoutId

  function clearTyping(roomId) {
    const t = timers.get(roomId);
    if (t) {
      clearTimeout(t);
      timers.delete(roomId);
    }
  }

  socket.on('typing_start', ({ roomId }) => {
    if (!roomId) return;
    clearTyping(roomId);

    socket.to(`room:${roomId}`).emit('typing', {
      isTyping: true,
      userId  : socket.user.id,
    });

    // 자동 해제 타이머
    timers.set(
      roomId,
      setTimeout(() => {
        socket.to(`room:${roomId}`).emit('typing', {
          isTyping: false,
          userId  : socket.user.id,
        });
        timers.delete(roomId);
      }, TYPING_TIMEOUT_MS)
    );
  });

  socket.on('typing_stop', ({ roomId }) => {
    if (!roomId) return;
    clearTyping(roomId);

    socket.to(`room:${roomId}`).emit('typing', {
      isTyping: false,
      userId  : socket.user.id,
    });
  });

  socket.on('disconnect', () => {
    // 연결 해제 시 모든 타이머 정리
    for (const [roomId] of timers) {
      socket.to(`room:${roomId}`).emit('typing', {
        isTyping: false,
        userId  : socket.user.id,
      });
    }
    timers.clear();
  });
}

module.exports = { registerTypingHandlers };
