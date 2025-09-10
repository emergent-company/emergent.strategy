"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalHttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let GlobalHttpExceptionFilter = class GlobalHttpExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        if (response.headersSent)
            return;
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'internal';
        let message = 'Internal server error';
        let details;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
            }
            else if (typeof res === 'object' && res) {
                const anyRes = res;
                message = anyRes.message || message;
                details = anyRes.details || anyRes.errors || undefined;
            }
            switch (status) {
                case 400:
                    code = 'bad-request';
                    break;
                case 401:
                    code = 'unauthorized';
                    break;
                case 403:
                    code = 'forbidden';
                    break;
                case 404:
                    code = 'not-found';
                    break;
                case 409:
                    code = 'conflict';
                    break;
                case 422:
                    code = 'validation-failed';
                    break;
                case 429:
                    code = 'rate-limited';
                    break;
                case 503:
                    code = 'upstream-unavailable';
                    break;
                default: code = status >= 500 ? 'internal' : code;
            }
        }
        const envelope = { error: { code, message, ...(details ? { details } : {}) } };
        response.status(status).json(envelope);
    }
};
exports.GlobalHttpExceptionFilter = GlobalHttpExceptionFilter;
exports.GlobalHttpExceptionFilter = GlobalHttpExceptionFilter = __decorate([
    (0, common_1.Catch)()
], GlobalHttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map