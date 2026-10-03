const { apiMessage } = require("../utils/apiMessages");

function globalErrorHandler(err, req, res, next) {
  console.error("UNHANDLED API ERROR:", {
    method: req.method,
    path: req.originalUrl,
    error: err,
  });

  if (res.headersSent) return next(err);
  return res.status(500).json(apiMessage("SERVER_ERROR"));
}

module.exports = { globalErrorHandler };
