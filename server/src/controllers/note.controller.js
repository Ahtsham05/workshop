const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const noteService = require('../services/note.service');

const getScope = (req) => ({
  organizationId: req.organizationId || req.user.organizationId,
  branchId: req.branchId || null,
  userId: req.user.id,
});

const createNote = catchAsync(async (req, res) => {
  const note = await noteService.createNote(req.body, getScope(req));
  res.status(httpStatus.CREATED).send(note);
});

const getNotes = catchAsync(async (req, res) => {
  const result = await noteService.listNotes(req.query, getScope(req));
  res.send(result);
});

const getNote = catchAsync(async (req, res) => {
  const note = await noteService.getNote(req.params.id, getScope(req));
  res.send(note);
});

const updateNote = catchAsync(async (req, res) => {
  const note = await noteService.updateNote(req.params.id, req.body, getScope(req));
  res.send(note);
});

const deleteNote = catchAsync(async (req, res) => {
  const note = await noteService.deleteNote(
    req.params.id,
    { permanent: req.query.permanent === 'true' || req.query.permanent === true },
    getScope(req),
  );
  // Soft delete returns the trashed note so the client can offer Undo.
  if (note) return res.send(note);
  return res.status(httpStatus.NO_CONTENT).send();
});

const restoreNote = catchAsync(async (req, res) => {
  const note = await noteService.restoreNote(req.params.id, getScope(req));
  res.send(note);
});

const duplicateNote = catchAsync(async (req, res) => {
  const note = await noteService.duplicateNote(req.params.id, getScope(req));
  res.status(httpStatus.CREATED).send(note);
});

const emptyTrash = catchAsync(async (req, res) => {
  const result = await noteService.emptyTrash(getScope(req));
  res.send(result);
});

const getTags = catchAsync(async (req, res) => {
  const tags = await noteService.listTags(getScope(req));
  res.send(tags);
});

module.exports = {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
  restoreNote,
  duplicateNote,
  emptyTrash,
  getTags,
};
