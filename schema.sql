-- zslab-chat 스키마
-- MySQL / MariaDB 호환

CREATE TABLE IF NOT EXISTS chat_rooms (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type       ENUM('1to1', 'group') NOT NULL DEFAULT '1to1',
  name       VARCHAR(255)          NULL,
  created_at DATETIME              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type (type)
);

CREATE TABLE IF NOT EXISTS chat_participants (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id     BIGINT UNSIGNED NOT NULL,
  user_id     VARCHAR(64)     NOT NULL,
  user_type   ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  joined_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at DATETIME       NULL,
  UNIQUE KEY uk_room_user (room_id, user_id),
  INDEX idx_user_id (user_id),
  CONSTRAINT fk_participants_room FOREIGN KEY (room_id) REFERENCES chat_rooms (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id     BIGINT UNSIGNED NOT NULL,
  sender_id   VARCHAR(64)     NOT NULL,
  sender_type ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  message     TEXT            NOT NULL,
  is_read     TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_created (room_id, created_at),
  CONSTRAINT fk_messages_room FOREIGN KEY (room_id) REFERENCES chat_rooms (id) ON DELETE CASCADE
);
