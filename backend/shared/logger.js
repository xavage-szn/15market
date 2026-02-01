const winston = require('winston');

class Logger {
    constructor(serviceName) {
        this.buffer = [];
        this.serviceName = serviceName;

        const format = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
            const msg = `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(metadata).length ? JSON.stringify(metadata) : ''}`;
            this.addToBuffer(level, message);
            return msg;
        });

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                format
            ),
            transports: [
                new winston.transports.Console()
            ]
        });
    }

    addToBuffer(level, message) {
        this.buffer.push({
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString(),
            type: level.toUpperCase(),
            message: message
        });
        if (this.buffer.length > 200) this.buffer.shift();
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    getLogs() {
        return this.buffer;
    }
}

module.exports = Logger;
