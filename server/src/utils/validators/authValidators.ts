import { body } from 'express-validator';

export const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Full Name is required')
    .isLength({ min: 2 }).withMessage('Full Name must be at least 2 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword')
    .isString()
    .notEmpty().withMessage('Confirm Password is required')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
  body('country')
    .trim()
    .notEmpty().withMessage('Country is required'),
  body().custom((_, { req }) => {
    const incomeBracket = req.body?.incomeBracket ?? req.body?.income_bracket;
    if (!incomeBracket) {
      throw new Error('Income Bracket is required');
    }
    if (!['low', 'middle', 'high'].includes(String(incomeBracket))) {
      throw new Error('Income Bracket must be low, middle, or high');
    }
    return true;
  }),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isString().isLength({ min: 6 }).withMessage('Password is required'),
];

export const forgotValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
];

export const resetValidator = [
  body('token').isString().withMessage('Reset token is required'),
  body('password')
    .isString()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/).withMessage('Password must include a lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
    .matches(/\d/).withMessage('Password must include a number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must include a special character'),
];
