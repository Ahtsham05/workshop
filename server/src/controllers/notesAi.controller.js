const catchAsync = require('../utils/catchAsync');
const notesAiService = require('../services/notesAi.service');
const noteService = require('../services/note.service');

const getScope = (req) => ({
  organizationId: req.organizationId || req.user.organizationId,
  branchId: req.branchId || null,
  userId: req.user.id,
});

const runAction = catchAsync(async (req, res) => {
  const result = await notesAiService.runNoteAction({
    actionKey: req.body.action,
    noteId: req.params.id,
    options: req.body.options,
    scope: getScope(req),
  });
  res.send(result);
});

const organize = catchAsync(async (req, res) => {
  const result = await notesAiService.organizeNote({ noteId: req.params.id, scope: getScope(req) });
  res.send(result);
});

const related = catchAsync(async (req, res) => {
  const note = await noteService.getNote(req.params.id, getScope(req));
  const results = await noteService.findRelatedNotes(note, getScope(req));
  res.send({ results });
});

const ask = catchAsync(async (req, res) => {
  const result = await notesAiService.askNotes({ question: req.body.question, scope: getScope(req) });
  res.send(result);
});

module.exports = {
  runAction,
  organize,
  related,
  ask,
};
