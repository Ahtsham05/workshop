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
    // Set when the user clicked Stop mid-stream — content holds whatever had streamed by then.
    interrupted: {
      type: Boolean,
      default: false,
    },
    // A write-tool call (e.g. create_invoice) that only produced a preview, awaiting the user
    // clicking Confirm/Cancel in the UI — see aiAssistant.service.js#confirmAction/cancelAction.
    // A real subdocument (not Mixed) for `kind`/`status`/`error` so reassigning those primitive
    // fields is change-tracked by Mongoose without needing markModified(); `params`/`preview`/
    // `result` stay Mixed since their shape depends on `kind`.
    pendingAction: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: ['create_invoice'] },
          status: {
            type: String,
            enum: ['pending', 'executed', 'cancelled', 'failed'],
            default: 'pending',
          },
          params: mongoose.Schema.Types.Mixed,
          preview: mongoose.Schema.Types.Mixed,
          result: mongoose.Schema.Types.Mixed,
          error: String,
        },
        { _id: false }
      ),
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
