function globalErrorHandler(err, req, res, next) {
  console.error("UNHANDLED API ERROR:", {
    method: req.method,
    path: req.originalUrl,
    error: err,
  });

  if (res.headersSent) return next(err);
  return res.status(500).json({ message: "Internal server error" });
}

module.exports = { globalErrorHandler };
