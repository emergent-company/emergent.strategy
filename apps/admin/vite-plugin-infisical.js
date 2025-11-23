/**
 * Vite Plugin: Infisical Secrets Loader
 *
 * Loads secrets from Infisical at build time and injects them into the Vite config
 * Only loads secrets prefixed with VITE_ to expose to the browser
 *
 * Based on: https://infisical.com/docs/integrations/frameworks/vite
 *
 * Usage:
 *   import { infisicalPlugin } from './vite-plugin-infisical';
 *
 *   export default defineConfig(async () => {
 *     const secrets = await infisicalPlugin();
 *     return {
 *       plugins: [...],
 *       define: secrets
 *     };
 *   });
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { config } from 'dotenv';
import path from 'path';
// Load .env files from workspace root (two levels up from apps/admin)
var rootDir = path.resolve(__dirname, '../..');
config({ path: path.join(rootDir, '.env') });
config({ path: path.join(rootDir, '.env.local'), override: false });
/**
 * Get Infisical configuration from environment
 */
function getInfisicalConfig() {
    var _a;
    var enabled = ((_a = process.env.INFISICAL_ENABLED) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'true';
    if (!enabled) {
        return {
            enabled: false,
            siteUrl: '',
            projectId: '',
            environment: 'dev'
        };
    }
    var environment = process.env.INFISICAL_ENVIRONMENT || process.env.NODE_ENV || 'dev';
    return {
        enabled: true,
        siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
        clientId: process.env.INFISICAL_CLIENT_ID,
        clientSecret: process.env.INFISICAL_CLIENT_SECRET,
        projectId: process.env.INFISICAL_PROJECT_ID || '',
        environment: environment,
    };
}
/**
 * Authenticate with Infisical using Universal Auth and get access token
 */
function getAccessToken(config) {
    return __awaiter(this, void 0, void 0, function () {
        var response, errorText, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!config.clientId || !config.clientSecret) {
                        throw new Error('INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET are required');
                    }
                    return [4 /*yield*/, fetch("".concat(config.siteUrl, "/api/v1/auth/universal-auth/login"), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                clientId: config.clientId,
                                clientSecret: config.clientSecret,
                            }),
                        })];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _a.sent();
                    throw new Error("Authentication failed (".concat(response.status, "): ").concat(errorText));
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    data = _a.sent();
                    return [2 /*return*/, data.accessToken];
            }
        });
    });
}
/**
 * Fetch secrets from a specific Infisical folder path
 */
function fetchSecretsFromPath(accessToken, config, secretPath) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, errorText, data, secrets, _i, _a, secret;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    url = new URL("".concat(config.siteUrl, "/api/v3/secrets/raw"));
                    url.searchParams.set('workspaceId', config.projectId);
                    url.searchParams.set('environment', config.environment);
                    url.searchParams.set('secretPath', secretPath);
                    return [4 /*yield*/, fetch(url.toString(), {
                            method: 'GET',
                            headers: {
                                'Authorization': "Bearer ".concat(accessToken),
                            },
                        })];
                case 1:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _b.sent();
                    throw new Error("Failed to fetch secrets from ".concat(secretPath, " (").concat(response.status, "): ").concat(errorText));
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    data = _b.sent();
                    secrets = {};
                    if (data.secrets && Array.isArray(data.secrets)) {
                        for (_i = 0, _a = data.secrets; _i < _a.length; _i++) {
                            secret = _a[_i];
                            secrets[secret.secretKey] = secret.secretValue;
                        }
                    }
                    return [2 /*return*/, secrets];
            }
        });
    });
}
/**
 * Load secrets from Infisical and return as Vite define object
 * Only includes secrets prefixed with VITE_ for security
 *
 * Returns object in format:
 * {
 *   'import.meta.env.VITE_KEY': JSON.stringify(value),
 *   ...
 * }
 */
export function infisicalPlugin() {
    return __awaiter(this, void 0, void 0, function () {
        var config, accessToken, workspaceSecrets, adminSecrets, allSecrets, viteSecrets, defineObject, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = getInfisicalConfig();
                    if (!config.enabled) {
                        console.log('⏭️  Infisical: Disabled (INFISICAL_ENABLED=false or not set)');
                        return [2 /*return*/, {}];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    console.log('🔐 Infisical: Loading secrets for Vite...');
                    console.log("   Site: ".concat(config.siteUrl));
                    console.log("   Environment: ".concat(config.environment));
                    console.log("   Project: ".concat(config.projectId));
                    // Authenticate
                    console.log('   🔑 Authenticating with Universal Auth...');
                    return [4 /*yield*/, getAccessToken(config)];
                case 2:
                    accessToken = _a.sent();
                    console.log('   ✅ Authentication successful');
                    return [4 /*yield*/, fetchSecretsFromPath(accessToken, config, '/workspace')];
                case 3:
                    workspaceSecrets = _a.sent();
                    console.log("   \u2705 Loaded ".concat(Object.keys(workspaceSecrets).length, " secrets from /workspace"));
                    return [4 /*yield*/, fetchSecretsFromPath(accessToken, config, '/admin')];
                case 4:
                    adminSecrets = _a.sent();
                    console.log("   \u2705 Loaded ".concat(Object.keys(adminSecrets).length, " secrets from /admin"));
                    allSecrets = __assign(__assign({}, workspaceSecrets), adminSecrets);
                    viteSecrets = Object.entries(allSecrets)
                        .filter(function (_a) {
                        var key = _a[0];
                        return key.startsWith('VITE_');
                    })
                        .reduce(function (acc, _a) {
                        var key = _a[0], value = _a[1];
                        acc[key] = value;
                        return acc;
                    }, {});
                    console.log("   \uD83C\uDFAF Filtered to ".concat(Object.keys(viteSecrets).length, " VITE_* secrets for browser"));
                    defineObject = Object.entries(viteSecrets).reduce(function (acc, _a) {
                        var key = _a[0], value = _a[1];
                        acc["import.meta.env.".concat(key)] = JSON.stringify(value);
                        return acc;
                    }, {});
                    console.log("   \uD83C\uDF89 Total: ".concat(Object.keys(defineObject).length, " secrets loaded from Infisical\n"));
                    return [2 /*return*/, defineObject];
                case 5:
                    error_1 = _a.sent();
                    console.error('❌ Infisical: Failed to load secrets');
                    console.error('   Error:', error_1 instanceof Error ? error_1.message : String(error_1));
                    console.error('   ⚠️  Falling back to local environment variables');
                    console.error('   ℹ️  Vite will use VITE_* variables from .env files\n');
                    // Return empty object - Vite will use .env files as fallback
                    return [2 /*return*/, {}];
                case 6: return [2 /*return*/];
            }
        });
    });
}
