/**
 * Express 4 does not forward rejected promises from async handlers to the error
 * middleware — an unhandled rejection leaves the request hanging. Wrap async
 * handlers with this so failures reach the error handler in app.js.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
