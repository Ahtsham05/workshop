const express = require('express');
const auth = require('../../middlewares/auth');
const branchController = require('../../controllers/branch.controller');

const router = express.Router();

// GET /v1/branches/my — branches the current user can access
router.get('/my', auth(), branchController.getMyBranches);

// POST /v1/branches — create a branch
router.post('/', auth('manageBranches'), branchController.createBranch);

// GET /v1/branches — list all branches in org (names only matter to pickers on many screens)
router.get('/', auth(), branchController.getBranches);

// GET /v1/branches/:branchId
router.get('/:branchId', auth(), branchController.getBranch);

// PATCH /v1/branches/:branchId — the Branches page, plus print settings and branch colours
router.patch('/:branchId', auth('manageBranches', 'editSettings'), branchController.updateBranch);

// DELETE /v1/branches/:branchId
router.delete('/:branchId', auth('manageBranches'), branchController.deleteBranch);

module.exports = router;
