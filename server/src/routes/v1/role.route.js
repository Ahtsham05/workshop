const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const roleValidation = require('../../validations/role.validation');
const roleController = require('../../controllers/role.controller');
const { checkPermission } = require('../../middlewares/permission');

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    checkPermission('createRoles'),
    validate(roleValidation.createRole),
    roleController.createRole
  )
  .get(
    auth(),
    checkPermission('viewRoles'),
    validate(roleValidation.getRoles),
    roleController.getRoles
  );

router
  .route('/:roleId')
  .get(
    auth(),
    checkPermission('viewRoles'),
    validate(roleValidation.getRole),
    roleController.getRole
  )
  .patch(
    auth(),
    checkPermission('editRoles'),
    validate(roleValidation.updateRole),
    roleController.updateRole
  )
  .delete(
    auth(),
    checkPermission('deleteRoles'),
    validate(roleValidation.deleteRole),
    roleController.deleteRole
  );

router
  .route('/:roleId/permissions')
  .get(
    auth(),
    checkPermission('viewRoles'),
    validate(roleValidation.getRole),
    roleController.getRolePermissions
  )
  .patch(
    auth(),
    checkPermission('editRoles'),
    validate(roleValidation.updateRolePermissions),
    roleController.updateRolePermissions
  );

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role management and permissions
 */

/**
 * @swagger
 * /roles:
 *   post:
 *     summary: Create a role
 *     description: Only admins with createRoles permission can create roles.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               permissions:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *     responses:
 *       "201":
 *         description: Created
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *
 *   get:
 *     summary: Get all roles
 *     description: Only admins with viewRoles permission can retrieve all roles.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Role name
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Role active status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: sort by query in the form of field:desc/asc (ex. name:asc)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         default: 10
 *         description: Maximum number of roles
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /roles/{id}:
 *   get:
 *     summary: Get a role
 *     description: Only admins with viewRoles permission can fetch role details.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update a role
 *     description: Only admins with editRoles permission can update roles.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               permissions:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *     responses:
 *       "200":
 *         description: OK
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Delete a role
 *     description: Only admins with deleteRoles permission can delete roles.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
