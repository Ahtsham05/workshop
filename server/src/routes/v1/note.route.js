const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const { notesAiLimiter } = require('../../middlewares/notesAiRateLimit');
const noteValidation = require('../../validations/note.validation');
const notesAiValidation = require('../../validations/notesAi.validation');
const noteController = require('../../controllers/note.controller');
const notesAiController = require('../../controllers/notesAi.controller');

const router = express.Router();
// No permission gate: the notepad is personal scratch space that every signed-in
// user gets, the same way /profile is. Sharing is opt-in per note and reads are
// filtered by ownership + visibility in the service.
router.use(auth(), branchScope());

router
  .route('/')
  .post(validate(noteValidation.createNote), noteController.createNote)
  .get(validate(noteValidation.getNotes), noteController.getNotes);

router.route('/tags').get(noteController.getTags);

router.route('/trash/empty').post(noteController.emptyTrash);

// AI: kept ahead of the generic "/:id" routes below purely for readability — Express
// matches by literal segments first ("ai") so route order here doesn't actually matter,
// but /:id/ai/... reads clearly as "AI actions scoped to one note".
router.route('/ai/ask').post(notesAiLimiter, validate(notesAiValidation.ask), notesAiController.ask);

router
  .route('/:id')
  .get(validate(noteValidation.getNote), noteController.getNote)
  .patch(validate(noteValidation.updateNote), noteController.updateNote)
  .delete(validate(noteValidation.deleteNote), noteController.deleteNote);

router.route('/:id/restore').post(validate(noteValidation.getNote), noteController.restoreNote);

router.route('/:id/duplicate').post(validate(noteValidation.getNote), noteController.duplicateNote);

router.route('/:id/ai/action').post(notesAiLimiter, validate(notesAiValidation.runAction), notesAiController.runAction);

router.route('/:id/ai/organize').post(notesAiLimiter, validate(notesAiValidation.organize), notesAiController.organize);

router.route('/:id/related').get(validate(notesAiValidation.related), notesAiController.related);

module.exports = router;
