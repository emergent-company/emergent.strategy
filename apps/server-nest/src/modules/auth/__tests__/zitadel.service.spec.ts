import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ZitadelService } from '../zitadel.service';
import { PostgresCacheService } from '../postgres-cache.service';

// Mock the jose library to avoid needing real RSA keys in tests
vi.mock('jose', () => ({
    importPKCS8: vi.fn().mockResolvedValue({ type: 'private' }),
    SignJWT: vi.fn().mockImplementation(() => ({
        setProtectedHeader: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setIssuer: vi.fn().mockReturnThis(),
        setSubject: vi.fn().mockReturnThis(),
        setAudience: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue('mock.jwt.token'),
    })),
}));

describe('ZitadelService', () => {
    let service: ZitadelService;
    let mockCacheService: any;

    beforeEach(async () => {
        // Mock PostgresCacheService
        mockCacheService = {
            get: vi.fn(),
            set: vi.fn(),
            invalidate: vi.fn(),
        };

        const module = await Test.createTestingModule({
            providers: [
                ZitadelService,
                {
                    provide: PostgresCacheService,
                    useValue: mockCacheService,
                },
            ],
        }).compile();

        service = module.get<ZitadelService>(ZitadelService);
        
        // Manually assign mock for Vitest DI limitation
        (service as any).cacheService = mockCacheService;

        // Reset environment variables
        delete process.env.ZITADEL_DOMAIN;
        delete process.env.ZITADEL_CLIENT_JWT;
        delete process.env.ZITADEL_CLIENT_JWT_PATH;
        delete process.env.ZITADEL_MAIN_ORG_ID;
        delete process.env.ZITADEL_PROJECT_ID;
    });

    describe('onModuleInit', () => {
        it('should log warning if ZITADEL_DOMAIN not set', () => {
            const logSpy = vi.spyOn(service['logger'], 'warn');

            service.onModuleInit();

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('not configured')
            );
        });

        it('should initialize successfully with valid configuration', () => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });

            const logSpy = vi.spyOn(service['logger'], 'log');

            service.onModuleInit();

            expect(logSpy).toHaveBeenCalledWith(
                'Zitadel service initialized successfully'
            );
        });

        it('should throw error in production if configuration invalid', () => {
            process.env.NODE_ENV = 'production';
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_CLIENT_JWT = 'invalid-json';

            expect(() => service.onModuleInit()).toThrow();

            delete process.env.NODE_ENV;
        });

        it('should not throw in development if configuration invalid', () => {
            process.env.NODE_ENV = 'development';
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_CLIENT_JWT = 'invalid-json';

            const errorSpy = vi.spyOn(service['logger'], 'error');

            expect(() => service.onModuleInit()).not.toThrow();
            expect(errorSpy).toHaveBeenCalled();

            delete process.env.NODE_ENV;
        });
    });

    describe('getAccessToken', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF3H6PHkFLdvXgZU5VWP1SQq1xLza\ntest-key-content\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should throw error if service account key not loaded', async () => {
            (service as any).serviceAccountKey = undefined;

            await expect(service.getAccessToken()).rejects.toThrow(
                'service account key not loaded'
            );
        });

        it('should return cached token if still valid', async () => {
            const cachedToken = 'cached-test-token';
            (service as any).cachedToken = {
                token: cachedToken,
                expiresAt: Date.now() + 300000, // 5 minutes in future
            };

            const token = await service.getAccessToken();

            expect(token).toBe(cachedToken);
        });

        it('should request new token if cache expired', async () => {
            (service as any).cachedToken = {
                token: 'expired-token',
                expiresAt: Date.now() - 1000, // 1 second in past
            };

            // Mock token request
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        access_token: 'new-test-token',
                        token_type: 'Bearer',
                        expires_in: 3600,
                    }),
            });
            global.fetch = mockFetch;

            const token = await service.getAccessToken();

            expect(token).toBe('new-test-token');
            expect(mockFetch).toHaveBeenCalled();
        });

        it('should cache new token with safety margin', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        access_token: 'new-test-token',
                        token_type: 'Bearer',
                        expires_in: 3600,
                    }),
            });
            global.fetch = mockFetch;

            await service.getAccessToken();

            const cached = (service as any).cachedToken;
            expect(cached).toBeDefined();
            expect(cached.token).toBe('new-test-token');
            // Should cache with 1-minute safety margin
            expect(cached.expiresAt).toBeLessThan(
                Date.now() + 3600 * 1000
            );
        });
    });

    describe('introspect', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should return null if service not configured', async () => {
            (service as any).serviceAccountKey = undefined;

            const result = await service.introspect('test-token');

            expect(result).toBeNull();
        });

        it('should return cached introspection on cache hit', async () => {
            const cachedData = {
                active: true,
                sub: 'test-user',
                email: 'test@example.com',
            };
            mockCacheService.get.mockResolvedValue({
                data: cachedData,
                expiresAt: new Date(),
            });

            const result = await service.introspect('test-token');

            expect(result).toEqual(cachedData);
            expect(mockCacheService.get).toHaveBeenCalledWith('test-token');
        });

        it('should call Zitadel API on cache miss', async () => {
            mockCacheService.get.mockResolvedValue(null);

            const introspectionResult = {
                active: true,
                sub: 'test-user',
                email: 'test@example.com',
                exp: Math.floor(Date.now() / 1000) + 3600,
            };

            const mockFetch = vi.fn()
                // First call: get access token
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                // Second call: introspect
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(introspectionResult),
                });
            global.fetch = mockFetch;

            const result = await service.introspect('test-token');

            expect(result).toEqual(introspectionResult);
            expect(mockCacheService.set).toHaveBeenCalled();
        });

        it('should return null on API error', async () => {
            mockCacheService.get.mockResolvedValue(null);

            const mockFetch = vi.fn()
                // First call: get access token
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                // Second call: introspect fails
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    text: () => Promise.resolve('Unauthorized'),
                });
            global.fetch = mockFetch;

            const result = await service.introspect('test-token');

            expect(result).toBeNull();
        });

        it('should not cache inactive tokens', async () => {
            mockCacheService.get.mockResolvedValue(null);

            const introspectionResult = {
                active: false,
            };

            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(introspectionResult),
                });
            global.fetch = mockFetch;

            await service.introspect('test-token');

            expect(mockCacheService.set).not.toHaveBeenCalled();
        });
    });

    describe('createUser', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_MAIN_ORG_ID = 'test-org-id';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should create user successfully', async () => {
            const mockFetch = vi.fn()
                // First call: get access token
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                // Second call: create user
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            userId: 'new-user-id',
                        }),
                });
            global.fetch = mockFetch;

            const userId = await service.createUser(
                'test@example.com',
                'Test',
                'User'
            );

            expect(userId).toBe('new-user-id');
        });

        it('should include correct payload', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            userId: 'new-user-id',
                        }),
                });
            global.fetch = mockFetch;

            await service.createUser('test@example.com', 'Test', 'User');

            const createUserCall = mockFetch.mock.calls.find(call =>
                call[0].includes('/users/human/_import')
            );
            expect(createUserCall).toBeDefined();

            const payload = JSON.parse(createUserCall![1].body);
            expect(payload).toEqual({
                userName: 'test@example.com',
                profile: {
                    firstName: 'Test',
                    lastName: 'User',
                    displayName: 'Test User',
                },
                email: {
                    email: 'test@example.com',
                    isEmailVerified: false,
                },
            });
        });

        it('should throw error on API failure', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    text: () => Promise.resolve('Invalid email'),
                });
            global.fetch = mockFetch;

            await expect(
                service.createUser('invalid', 'Test', 'User')
            ).rejects.toThrow();
        });
    });

    describe('getUserByEmail', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_MAIN_ORG_ID = 'test-org-id';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should return user if found', async () => {
            const mockUser = {
                id: 'test-user-id',
                state: 'ACTIVE',
                userName: 'test@example.com',
                email: 'test@example.com',
            };

            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            result: [mockUser],
                        }),
                });
            global.fetch = mockFetch;

            const user = await service.getUserByEmail('test@example.com');

            expect(user).toEqual(mockUser);
        });

        it('should return null if user not found', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            result: [],
                        }),
                });
            global.fetch = mockFetch;

            const user = await service.getUserByEmail('notfound@example.com');

            expect(user).toBeNull();
        });
    });

    describe('updateUserMetadata', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_MAIN_ORG_ID = 'test-org-id';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should update metadata successfully', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({}),
                });
            global.fetch = mockFetch;

            await service.updateUserMetadata('test-user-id', {
                invitation_id: 'inv-123',
                role: 'admin',
            });

            // Should call API once per metadata key
            expect(mockFetch).toHaveBeenCalledTimes(3); // 1 token + 2 metadata
        });

        it('should base64 encode metadata values', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({}),
                });
            global.fetch = mockFetch;

            await service.updateUserMetadata('test-user-id', {
                test_key: 'test_value',
            });

            const metadataCall = mockFetch.mock.calls.find(call =>
                call[0].includes('/metadata')
            );
            expect(metadataCall).toBeDefined();

            const payload = JSON.parse(metadataCall![1].body);
            expect(payload.key).toBe('test_key');
            expect(payload.value).toBe(
                Buffer.from(JSON.stringify('test_value')).toString('base64')
            );
        });
    });

    describe('grantProjectRole', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_MAIN_ORG_ID = 'test-org-id';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should grant role successfully', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({}),
                });
            global.fetch = mockFetch;

            await service.grantProjectRole(
                'user-id',
                'project-id',
                'project_admin'
            );

            const grantCall = mockFetch.mock.calls.find(call =>
                call[0].includes('/grants')
            );
            expect(grantCall).toBeDefined();

            const payload = JSON.parse(grantCall![1].body);
            expect(payload).toEqual({
                projectId: 'project-id',
                roleKeys: ['project_admin'],
            });
        });
    });

    describe('getUserProjectRoles', () => {
        beforeEach(() => {
            process.env.ZITADEL_DOMAIN = 'test.zitadel.cloud';
            process.env.ZITADEL_MAIN_ORG_ID = 'test-org-id';
            process.env.ZITADEL_CLIENT_JWT = JSON.stringify({
                type: 'serviceaccount',
                keyId: 'test-key-id',
                key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
                userId: 'test-user-id',
            });
            service.onModuleInit();
        });

        it('should return roles if found', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            result: [
                                {
                                    roleKeys: ['project_admin', 'project_member'],
                                },
                            ],
                        }),
                });
            global.fetch = mockFetch;

            const roles = await service.getUserProjectRoles(
                'user-id',
                'project-id'
            );

            expect(roles).toEqual(['project_admin', 'project_member']);
        });

        it('should return empty array if no roles found', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            access_token: 'service-token',
                            token_type: 'Bearer',
                            expires_in: 3600,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            result: [],
                        }),
                });
            global.fetch = mockFetch;

            const roles = await service.getUserProjectRoles(
                'user-id',
                'project-id'
            );

            expect(roles).toEqual([]);
        });
    });
});
