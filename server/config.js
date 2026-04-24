'use strict';

module.exports = {
  chat: {
    mode: '1to1',       // '1to1' | 'group'
    groupChat: false,
    typing: true,
    readReceipt: true,
  },
  tables: {
    rooms:        'chat_rooms',
    participants: 'chat_participants',
    messages:     'chat_messages',
  },
};
