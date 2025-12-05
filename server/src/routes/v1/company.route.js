const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const companyValidation = require('../../validations/company.validation');
const companyController = require('../../controllers/company.controller');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(companyValidation.createCompany), companyController.createCompany)
  .get(companyController.getCompany)
  .patch(auth(), validate(companyValidation.updateCompany), companyController.updateCompany)
  .delete(auth(), companyController.deleteCompany);

router
  .route('/change-password')
  .post(auth(), validate(companyValidation.changePassword), companyController.changePassword);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Company
 *   description: Company profile management
 */

/**
 * @swagger
 * /company:
 *   post:
 *     summary: Create company profile
 *     tags: [Company]
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
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               country:
 *                 type: string
 *               taxNumber:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Created
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *
 *   get:
 *     summary: Get company profile
 *     tags: [Company]
 *     responses:
 *       "200":
 *         description: OK
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update company profile
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       "200":
 *         description: OK
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
