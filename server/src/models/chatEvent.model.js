const mongoose = require('mongoose');

/**
 * Cross-process relay for live chat events.
 *
 * A socket lives in exactly one server process, but more than one process can serve the
 * same database (a local dev server next to the deployed one, or several instances behind
 * a load balancer — see the SMS gateway notes in index.js). Every process emits to its own
 * sockets directly AND writes the event here; every other process tails this collection
 * and replays events it did not originate. Rows expire after 10 minutes — they are a
 * delivery pipe, not history (history is ChatMessage).
 */
const chatEventSchema = mongoose.Schema(
  {
    origin: { type: String, required: true },
    event: { type: String, required: true },
    rooms: [{ type: String }],
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, expires: 600 },
  },
  { versionKey: false }
);

const ChatEvent = mongoose.model('ChatEvent', chatEventSchema);

module.exports = ChatEvent;
