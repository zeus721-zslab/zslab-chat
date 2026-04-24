'use strict';

const Message = require('../models/Message');
const Room    = require('../models/Room');

/**
 * send_message, mark_read 이벤트 핸들러
 */
function registerChatHandlers(io, socket) {
  // ── 메시지 전송 ─────────────────────────────────────────────
  socket.on('send_message', async ({ roomId, message }) => {
    if (!roomId || !message?.trim()) return;

    try {
      const msg = await Message.create(
        roomId,
        socket.user.id,
        socket.user.type,
        message.trim()
      );
      io.to(`room:${roomId}`).emit('message_received', msg);
    } catch (err) {
      console.error('[chat] send_message error:', err.message);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // ── 읽음 처리 ───────────────────────────────────────────────
  socket.on('mark_read', async ({ roomId }) => {
    if (!roomId) return;

    try {
      await Message.markAsRead(roomId, socket.user.type);
      await Room.updateLastRead(roomId, socket.user.id);
      socket.to(`room:${roomId}`).emit('messages_read', {
        roomId,
        readBy: socket.user.id,
      });
    } catch (err) {
      console.error('[chat] mark_read error:', err.message);
    }
  });
}

module.exports = { registerChatHandlers };
