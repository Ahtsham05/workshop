const express = require('express');
const unitsController = require('../../controllers/units.controller');

const router = express.Router();

router.get('/', unitsController.getUnits);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Units
 *   description: Unit of measurement management
 */

/**
 * @swagger
 * /units:
 *   get:
 *     summary: Get all available units
 *     description: Retrieve list of all supported units of measurement
 *     tags: [Units]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 units:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       value:
 *                         type: string
 *                       label:
 *                         type: string
 *                 defaultUnit:
 *                   type: string
 */
