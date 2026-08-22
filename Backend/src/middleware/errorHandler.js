function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;
  const canExposeMessage = !isServerError || error.expose === true;
  const message = canExposeMessage ? error.message : 'Internal server error';

  if (isServerError) {
    const upstreamCode = typeof error.response?.data?.error === 'string'
      ? error.response.data.error
      : undefined;

    console.error('Unhandled request error', {
      requestId: req.requestId,
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

  res.status(statusCode).json({
    error: message,
    ...(isServerError ? { requestId: req.requestId } : {}),
  });
}

module.exports = errorHandler;
