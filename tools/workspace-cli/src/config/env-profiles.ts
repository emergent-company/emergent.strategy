import type { EnvironmentProfile, EnvironmentProfileId } from './types.js';

const PROFILES: Record<EnvironmentProfileId, EnvironmentProfile> = {
  development: {
    profileId: 'development',
    variables: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
    },
    secretsRefs: [],
    hostRequirements: ['node', 'docker'],
    logRetentionDays: 14,
  },
  staging: {
    profileId: 'staging',
    variables: {
      NODE_ENV: 'staging',
      LOG_LEVEL: 'info',
    },
    secretsRefs: ['doppler:staging'],
    hostRequirements: ['node', 'docker'],
    logRetentionDays: 14,
  },
  production: {
    profileId: 'production',
    variables: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
    },
    secretsRefs: ['doppler:production'],
    hostRequirements: ['node', 'docker'],
    logRetentionDays: 30,
  },
};

export function getEnvironmentProfile(
  profileId: EnvironmentProfileId
): EnvironmentProfile {
  return PROFILES[profileId];
}

export function listEnvironmentProfiles(): readonly EnvironmentProfile[] {
  return Object.values(PROFILES);
}
