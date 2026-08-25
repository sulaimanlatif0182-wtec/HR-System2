import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } },
  base: { service: 'hr-system', environment: process.env.NODE_ENV || 'development' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createChildLogger(bindings) {
  return logger.child(bindings);
}

export function createRequestLogger(req, res) {
  const start = Date.now();
  const requestId = req.headers?.['x-request-id'] || crypto.randomUUID();
  
  const log = logger.child({
    requestId,
    method: req.method,
    url: req.url,
    ip: req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress,
    userAgent: req.headers?.['user-agent'],
  });

  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - start;
    log.info({ statusCode: res.statusCode, duration, requestId }, 'Request completed');
    return originalSend.call(this, body);
  };

  return log;
}

export default logger;