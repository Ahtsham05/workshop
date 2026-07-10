const { EventEmitter } = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

function channelKey(organizationId, branchId) {
  return `wa:${organizationId}:${branchId}`;
}

function emitConversationUpdate(organizationId, branchId, conversationId, payload = {}) {
  emitter.emit(channelKey(organizationId, branchId), {
    type: 'conversation_update',
    conversationId: String(conversationId),
    ...payload,
  });
}

function emitNewMessage(organizationId, branchId, conversationId, messageId) {
  emitter.emit(channelKey(organizationId, branchId), {
    type: 'new_message',
    conversationId: String(conversationId),
    messageId: String(messageId),
  });
}

function emitMessageStatusUpdate(organizationId, branchId, { conversationId, messageId, status, errorMessage }) {
  emitter.emit(channelKey(organizationId, branchId), {
    type: 'message_status_update',
    conversationId: conversationId ? String(conversationId) : undefined,
    messageId: String(messageId),
    status,
    errorMessage,
  });
}

function subscribe(organizationId, branchId, listener) {
  const key = channelKey(organizationId, branchId);
  emitter.on(key, listener);
  return () => emitter.off(key, listener);
}

module.exports = {
  emitConversationUpdate,
  emitNewMessage,
  emitMessageStatusUpdate,
  subscribe,
};
