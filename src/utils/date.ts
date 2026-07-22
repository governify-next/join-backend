import { ValidationError } from './customErrors.js';

export const localDateTimeInZoneToIso = (value: unknown, timezone: unknown) => {
    const input = String(value);
    if (/Z$|[+-]\d{2}:\d{2}$/.test(input)) return new Date(input).toISOString();
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match || typeof timezone !== 'string')
        throw new ValidationError(`Cannot materialize local date '${input}' without a timezone`);
    const desired = match.slice(1).map(Number);
    const desiredWallTime = Date.UTC(
        desired[0],
        desired[1] - 1,
        desired[2],
        desired[3],
        desired[4],
        desired[5] || 0,
    );
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    let instant = desiredWallTime;
    for (let iteration = 0; iteration < 3; iteration += 1) {
        const parts = Object.fromEntries(
            formatter
                .formatToParts(new Date(instant))
                .filter(({ type }) => type !== 'literal')
                .map(({ type, value: partValue }) => [type, Number(partValue)]),
        );
        const representedWallTime = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
        );
        const correction = desiredWallTime - representedWallTime;
        instant += correction;
        if (!correction) return new Date(instant).toISOString();
    }
    throw new ValidationError(`Local date '${input}' does not exist in timezone '${timezone}'`);
};
