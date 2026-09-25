const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Personal / shared notepad note.
 *
 * Scoped to an organization always, and to a branch when the note was written
 * while a branch was active. `visibility` decides who else can read it:
 *   private      → only the owner (default; this is the "Windows Notepad" case)
 *   branch       → everyone working in the same branch
 *   organization → everyone in the organization
 *
 * `content` holds sanitized HTML from the editor; `plainText` is kept in sync on
 * every write so search and the list previews never have to strip tags at read
 * time (list views render hundreds of previews).
 */
const noteSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    // Nullable on purpose: notes written before a branch is picked still belong
    // to the user, and a branch-visible note needs a branch to match against.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      default: '',
    },
    plainText: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      enum: ['default', 'yellow', 'green', 'blue', 'purple', 'pink', 'orange', 'red'],
      default: 'default',
    },
    tags: {
      type: [String],
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Soft delete — the Trash tab restores from here until it is emptied.
    isTrashed: {
      type: Boolean,
      default: false,
      index: true,
    },
    trashedAt: {
      type: Date,
      default: null,
    },
    visibility: {
      type: String,
      enum: ['private', 'branch', 'organization'],
      default: 'private',
    },
    // Optional link back to the record the note was taken about.
    relatedType: {
      type: String,
      enum: ['Customer', 'Supplier', 'Lead', 'Product', 'Invoice', 'Purchase'],
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    relatedLabel: {
      type: String,
      trim: true,
    },
    // Purely a hint for which AI actions/icon to surface (see notesAi.service.js) —
    // never required at creation time, defaults to a plain note.
    noteType: {
      type: String,
      enum: ['general', 'meeting', 'task', 'idea', 'code', 'project', 'research'],
      default: 'general',
      index: true,
    },
    // Free-text, AI-suggested-or-user-typed grouping — deliberately not an enum/ref:
    // "Organize with AI" (notesAi.service.js#organizeNote) suggests one from the note's
    // own content, so it can't be constrained to a fixed list the way tags are curated.
    category: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    // Cached result of the last "Summarize" AI action, so re-opening a note doesn't
    // require a fresh Gemini call just to show what was already generated once.
    aiSummary: {
      type: String,
      default: '',
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Client-supplied id used to de-duplicate offline drafts that sync late.
    clientId: {
      type: String,
      trim: true,
      index: true,
    },
  },
  { timestamps: true, keepTimestampsInJSON: true },
);

noteSchema.plugin(toJSON);
noteSchema.plugin(paginate);

// The list query: my notes in this org, newest first, pinned hoisted client-side.
noteSchema.index({ organizationId: 1, ownerId: 1, isTrashed: 1, isArchived: 1, updatedAt: -1 });
// Shared-note lookups.
noteSchema.index({ organizationId: 1, branchId: 1, visibility: 1, isTrashed: 1, updatedAt: -1 });
// Free-text search over title + body.
noteSchema.index({ title: 'text', plainText: 'text', tags: 'text' });

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;
