const LOGROTATE_DEFAULTS = {
    /**
     * Maximum size for a single log file before rotation occurs.
     * Accepts values such as `10M`, `20M`, etc.
     */
    max_size: '20M',

    /**
     * Number of rotated files to keep on disk before old files are removed.
     */
    retain: 30,

    /**
     * Compress rotated archives to save disk space.
     */
    compress: true,

    /**
     * Timestamp pattern appended to rotated file names.
     */
    dateFormat: 'YYYY-MM-DD_HH-mm-ss',

    /**
     * Frequency (in seconds) for the rotation worker to poll log sizes.
     */
    workerInterval: '30',

    /**
     * Optional cron expression to force rotation regardless of size.
     * Default rotates daily at midnight.
     */
    rotateInterval: '0 0 * * *',

    /**
     * Ensure module logs are also rotated.
     */
    rotateModule: true
};

module.exports = {
    LOGROTATE_DEFAULTS
};
