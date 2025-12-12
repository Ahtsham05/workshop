const httpStatus = require('http-status');
const { PerformanceReview, Employee } = require('../models');
const ApiError = require('../utils/ApiError');

const createPerformanceReview = async (reviewBody) => {
  const employee = await Employee.findById(reviewBody.employee);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  // Calculate overall rating from individual ratings
  const ratings = reviewBody.ratings || {};
  const ratingValues = Object.values(ratings).filter(val => val > 0);
  const overallRating = ratingValues.length > 0 
    ? ratingValues.reduce((sum, val) => sum + val, 0) / ratingValues.length 
    : 3;
  
  reviewBody.overallRating = Math.round(overallRating * 10) / 10;
  
  return PerformanceReview.create(reviewBody);
};

const queryPerformanceReviews = async (filter, options) => {
  const reviews = await PerformanceReview.paginate(filter, options);
  return reviews;
};

const getPerformanceReviewById = async (id) => {
  const review = await PerformanceReview.findById(id).populate('employee').populate('reviewer');
  return review;
};

const updatePerformanceReviewById = async (reviewId, updateBody) => {
  const review = await getPerformanceReviewById(reviewId);
  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Performance review not found');
  }
  
  // Recalculate overall rating if ratings are updated
  if (updateBody.ratings) {
    const ratings = { ...review.ratings.toObject(), ...updateBody.ratings };
    const ratingValues = Object.values(ratings).filter(val => val > 0);
    const overallRating = ratingValues.length > 0 
      ? ratingValues.reduce((sum, val) => sum + val, 0) / ratingValues.length 
      : 3;
    updateBody.overallRating = Math.round(overallRating * 10) / 10;
  }
  
  Object.assign(review, updateBody);
  await review.save();
  return review;
};

const deletePerformanceReviewById = async (reviewId) => {
  const review = await getPerformanceReviewById(reviewId);
  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Performance review not found');
  }
  await review.remove();
  return review;
};

const submitReview = async (reviewId) => {
  const review = await getPerformanceReviewById(reviewId);
  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Performance review not found');
  }
  
  if (review.status !== 'Draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Review is not in draft status');
  }
  
  review.status = 'Submitted';
  review.submittedDate = new Date();
  await review.save();
  return review;
};

const acknowledgeReview = async (reviewId, employeeComments) => {
  const review = await getPerformanceReviewById(reviewId);
  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Performance review not found');
  }
  
  if (review.status !== 'Reviewed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Review must be in reviewed status to acknowledge');
  }
  
  review.status = 'Acknowledged';
  review.acknowledgedDate = new Date();
  if (employeeComments) {
    review.employeeComments = employeeComments;
  }
  await review.save();
  return review;
};

const getEmployeeReviews = async (employeeId) => {
  return PerformanceReview.find({ employee: employeeId }).sort({ 'reviewPeriod.endDate': -1 });
};

module.exports = {
  createPerformanceReview,
  queryPerformanceReviews,
  getPerformanceReviewById,
  updatePerformanceReviewById,
  deletePerformanceReviewById,
  submitReview,
  acknowledgeReview,
  getEmployeeReviews,
};
