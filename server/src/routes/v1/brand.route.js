const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const brandValidation = require('../../validations/brand.validation');
const brandController = require('../../controllers/brand.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createBrands'),
    upload.single('image'),
    validate(brandValidation.createBrand),
    brandController.createBrand
  )
  .get(auth('viewBrands'), validate(brandValidation.getBrands), brandController.getBrands);

router
  .route('/all')
  .get(auth('viewBrands'), validate(brandValidation.getAllBrands), brandController.getAllBrands);

router
  .route('/upload-image')
  .post(auth('createBrands'), upload.single('image'), brandController.uploadBrandLogo);

router
  .route('/delete-image')
  .delete(auth('deleteBrands'), brandController.deleteBrandLogo);

router
  .route('/fetch-image-from-search')
  .post(
    auth('createBrands'),
    validate(brandValidation.fetchImageFromSearch),
    brandController.fetchImageFromSearch,
  );

// Registered before the `/:brandId` catch-all below so `/bulk`/`/bulk-delete` aren't
// swallowed as a brandId.
router
  .route('/bulk')
  .post(auth('createBrands'), validate(brandValidation.bulkAddBrands), brandController.bulkAddBrands);

router
  .route('/bulk-delete')
  .delete(auth('deleteBrands'), validate(brandValidation.bulkDeleteBrands), brandController.bulkDeleteBrands);

router
  .route('/:brandId')
  .get(auth('viewBrands'), validate(brandValidation.getBrand), brandController.getBrand)
  .patch(
    auth('editBrands'),
    upload.single('image'),
    validate(brandValidation.updateBrand),
    brandController.updateBrand
  )
  .delete(auth('deleteBrands'), validate(brandValidation.deleteBrand), brandController.deleteBrand);

module.exports = router;
