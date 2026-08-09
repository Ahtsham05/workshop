const express = require('express');
const auth = require('../../middlewares/auth');
const branchOverviewController = require('../../controllers/branchOverview.controller');

const router = express.Router();

// Deliberately no branchScope() here — this endpoint aggregates across every branch
// in the organization regardless of the caller's active x-branch-id header, so a
// superAdmin can stay on their main branch while viewing all branches at once.
router.use(auth());

router.route('/summary').get(branchOverviewController.getSummary);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: BranchOverview
 *   description: Org-wide, per-branch performance snapshot for super admins
 */

/**
 * @swagger
 * /branch-overview/summary:
 *   get:
 *     summary: Get per-branch performance summary
 *     description: Superadmin/system_admin only — aggregates sales, purchases, expenses, cash-in-hand, staff, and customers per branch for a date range.
 *     tags: [BranchOverview]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, custom]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: OK
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */
