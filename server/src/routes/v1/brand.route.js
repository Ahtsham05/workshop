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
