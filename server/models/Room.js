'use strict';

const pool   = require('../db');
const config = require('../config');
const T      = config.tables;

const Room = {
  /**
   * 단일 채팅방 조회
   */
  async findById(roomId) {
    const [[row]] = await pool.query(
      `SELECT * FROM ${T.rooms} WHERE id = ?`,
      [roomId]
    );
    return row ?? null;
  },

  /**
   * 1:1 채팅방 조회 또는 생성
   * @param {string} userIdA
   * @param {string} userIdB
   */
  async findOrCreate1to1(userIdA, userIdB) {
    // 두 참여자가 공통으로 속한 방 조회
    const [rows] = await pool.query(
      `SELECT r.* FROM ${T.rooms} r
       JOIN ${T.participants} pa ON pa.room_id = r.id AND pa.user_id = ?
       JOIN ${T.participants} pb ON pb.room_id = r.id AND pb.user_id = ?
       WHERE r.type = '1to1'
       LIMIT 1`,
      [userIdA, userIdB]
    );
    if (rows.length > 0) return rows[0];

    // 방 생성
    const [result] = await pool.query(
      `INSERT INTO ${T.rooms} (type, created_at) VALUES ('1to1', NOW())`
    );
    const roomId = result.insertId;
    await pool.query(
      `INSERT INTO ${T.participants} (room_id, user_id, user_type, joined_at) VALUES (?, ?, 'user', NOW()), (?, ?, 'admin', NOW())`,
      [roomId, userIdA, roomId, userIdB]
    );
    const [[room]] = await pool.query(`SELECT * FROM ${T.rooms} WHERE id = ?`, [roomId]);
    return room;
  },

  /**
   * 참여자 목록 조회
   */
  async getParticipants(roomId) {
    const [rows] = await pool.query(
      `SELECT * FROM ${T.participants} WHERE room_id = ?`,
      [roomId]
    );
    return rows;
  },

  /**
   * 특정 유저가 해당 방의 참여자인지 확인
   */
  async isParticipant(roomId, userId) {
    const [rows] = await pool.query(
      `SELECT 1 FROM ${T.participants} WHERE room_id = ? AND user_id = ? LIMIT 1`,
      [roomId, userId]
    );
    return rows.length > 0;
  },

  /**
   * 참여자 추가 (중복 무시)
   */
  async addParticipant(roomId, userId, userType = 'user') {
    await pool.query(
      `INSERT IGNORE INTO ${T.participants} (room_id, user_id, user_type, joined_at) VALUES (?, ?, ?, NOW())`,
      [roomId, userId, userType]
    );
  },

  /**
   * 참여자 last_read_at 업데이트
   */
  async updateLastRead(roomId, userId) {
    await pool.query(
      `UPDATE ${T.participants} SET last_read_at = NOW() WHERE room_id = ? AND user_id = ?`,
      [roomId, userId]
    );
  },
};

module.exports = Room;
