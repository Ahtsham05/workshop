const express = require('express');
const auth = require('../../middlewares/auth');
const branchController = require('../../controllers/branch.controller');

const router = express.Router();

// GET /v1/branches/my — branches the current user can access
router.get('/my', auth(), branchController.getMyBranches);

// POST /v1/branches — create a branch (superAdmin only enforced by systemRole check in controller)
router.post('/', auth(), branchController.createBranch);

// GET /v1/branches — list all branches in org
router.get('/', auth(), branchController.getBranches);

// GET /v1/branches/:branchId
router.get('/:branchId', auth(), branchController.getBranch);

// PATCH /v1/branches/:branchId
router.patch('/:branchId', auth(), branchController.updateBranch);

// DELETE /v1/branches/:branchId
router.delete('/:branchId', auth(), branchController.deleteBranch);

module.exports = router;
