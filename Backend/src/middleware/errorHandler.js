function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  const message = statusCode >= 500 ? 'Internal server error' : error.message;

  if (statusCode >= 500) {
    const upstreamCode = typeof error.response?.data?.error === 'string'
      ? error.response.data.error
      : undefined;

    console.error('Unhandled request error', {
      name: error.name,
      message: error.message,
      code: error.code,
      upstreamStatus: error.response?.status,
      upstreamCode,
      method: req.method,
      path: req.originalUrl,
      stack: error.stack,
    });
  }

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
