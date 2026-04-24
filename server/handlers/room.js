'use strict';

const Room    = require('../models/Room');
const Message = require('../models/Message');
const config  = require('../config');

/**
 * join_room 이벤트 핸들러
 *
 * 권한 정책:
 *  - user  : 본인이 참여자로 등록된 방만 입장 가능
 *  - admin : 모든 방 입장 가능, 최초 입장 시 참여자 자동 등록
 */
function registerRoomHandlers(io, socket) {
  socket.on('join_room', async ({ roomId }) => {
    if (!roomId) return;

    try {
      const isParticipant = await Room.isParticipant(roomId, socket.user.id);

      if (socket.user.type !== 'admin' && !isParticipant) {
        socket.emit('error', { message: 'Forbidden' });
        return;
      }

      if (socket.user.type === 'admin' && !isParticipant) {
        await Room.addParticipant(roomId, socket.user.id, 'admin');
      }

      socket.join(`room:${roomId}`);
      socket.currentRoomId = roomId;

      const [room, messages] = await Promise.all([
        Room.findById(roomId),
        Message.findByRoom(roomId, 100),
      ]);

      socket.emit('room_joined', { room, messages });
    } catch (err) {
      console.error('[room] join_room error:', err.message);
      socket.emit('error', { message: 'Internal server error' });
    }
  });
}

module.exports = { registerRoomHandlers };
