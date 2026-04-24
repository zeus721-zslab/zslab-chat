'use strict';

const pool   = require('../db');
const config = require('../config');
const T      = config.tables;

const Message = {
  /**
   * 메시지 목록 조회 (오래된 순)
   */
  async findByRoom(roomId, limit = 100) {
    const [rows] = await pool.query(
      `SELECT * FROM ${T.messages} WHERE room_id = ? ORDER BY created_at ASC LIMIT ?`,
      [roomId, limit]
    );
    return rows;
  },

  /**
   * 메시지 저장
   */
  async create(roomId, senderId, senderType, message) {
    const [result] = await pool.query(
      `INSERT INTO ${T.messages} (room_id, sender_id, sender_type, message, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [roomId, senderId, senderType, message]
    );
    const [[row]] = await pool.query(
      `SELECT * FROM ${T.messages} WHERE id = ?`,
      [result.insertId]
    );
    return row;
  },

  /**
   * 읽음 처리 — 상대방이 보낸 메시지를 읽음으로 표시
   * @param {string} roomId
   * @param {'user'|'admin'} readerType  읽는 사람의 타입 (상대방 메시지를 읽음 처리)
   */
  async markAsRead(roomId, readerType) {
    const senderType = readerType === 'admin' ? 'user' : 'admin';
    await pool.query(
      `UPDATE ${T.messages} SET is_read = 1
       WHERE room_id = ? AND sender_type = ? AND is_read = 0`,
      [roomId, senderType]
    );
  },

  /**
   * 안읽은 메시지 수
   * @param {string} roomId
   * @param {'user'|'admin'} readerType
   */
  async countUnread(roomId, readerType) {
    const senderType = readerType === 'admin' ? 'user' : 'admin';
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM ${T.messages}
       WHERE room_id = ? AND sender_type = ? AND is_read = 0`,
      [roomId, senderType]
    );
    return Number(cnt);
  },
};

module.exports = Message;
