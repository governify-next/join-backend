import { bootEnv } from '../config/bootConfig.js';

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
const currentLogLevel = bootEnv.GOV_LOG_LEVEL.toUpperCase();

function shouldLog(level: string) {
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLogLevel);
}

class Logger {
    private service: string;
    private tag?: string;

    constructor(service: string) {
        this.service = service;
    }

    setTag(tag: string) {
        this.tag = tag;
        return this;
    }

    info(...messages: unknown[]) {
        if (shouldLog('INFO')) this._log('info', ...messages);
    }

    log(...messages: unknown[]) {
        this.info(...messages);
    }

    warn(...messages: unknown[]) {
        if (shouldLog('WARN')) this._log('warn', ...messages);
    }

    error(...messages: unknown[]) {
        if (shouldLog('ERROR')) this._log('error', ...messages);
    }

    debug(...messages: unknown[]) {
        if (shouldLog('DEBUG')) this._log('debug', ...messages);
    }

    private _log(level: 'info' | 'warn' | 'error' | 'debug', ...messages: unknown[]) {
        const formatted = this._formatLog(level, ...messages);
        switch (level) {
            case 'info':
                console.info(...formatted);
                break;
            case 'warn':
                console.warn(...formatted);
                break;
            case 'error':
                console.error(...formatted);
                break;
            case 'debug':
                console.debug(...formatted);
                break;
            default:
                console.log(...formatted);
        }
    }

    private _formatLog(level: string, ...messages: unknown[]): unknown[] {
        const timestamp = new Date().toISOString();
        const service = this.service ? `${this.service}` : '';
        const tag = this.tag ? `: ${this.tag}` : '';
        const prefix = `[${timestamp}] [${service}${tag}] [${level.toUpperCase()}]:`;
        return [prefix, ...messages];
    }
}

// Factory to get a logger for a specific service
export function getLogger(service: string | null = null): Logger {
    return new Logger(service || bootEnv.GOV_SERVICE_NAME);
}
