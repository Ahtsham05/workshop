const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * One message in an AiConversation. `toolCalls` records which business-data
 * tools the assistant invoked to answer, kept for debugging/audit — never
 * shown verbatim to the user.
 */
const aiMessageSchema = mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiConversation',
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 8000,
    },
    toolCalls: {
      type: [
        {
          name: String,
          args: mongoose.Schema.Types.Mixed,
          result: mongoose.Schema.Types.Mixed,
        },
      ],
      default: undefined,
    },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

aiMessageSchema.plugin(toJSON);
aiMessageSchema.plugin(paginate);

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });

const AiMessage = mongoose.model('AiMessage', aiMessageSchema);
module.exports = AiMessage;
