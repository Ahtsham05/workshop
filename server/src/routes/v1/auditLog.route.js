const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const auditLogValidation = require('../../validations/auditLog.validation');
const auditLogController = require('../../controllers/auditLog.controller');

const router = express.Router();
router.use(auth(), branchScope());

router.route('/').get(auth('viewAuditLogs'), validate(auditLogValidation.getAuditLogs), auditLogController.getAuditLogs);
router.route('/modules').get(auth('viewAuditLogs'), auditLogController.getAuditModules);

module.exports = router;
