/**
 * CloudGuard WAF GraphQL Queries and Mutations
 * Used by get_objects, manage_objects, call_waf_api, and publish_and_enforce.
 */

// ============ Asset / Practice / Zone / Profile / Agent / Behavior (get_objects) ============

export const GET_ASSETS = `
  query GetAssets($matchSearch: String, $sortBy: String, $globalObject: Boolean) {
    getAssets(matchSearch: $matchSearch, sortBy: $sortBy, globalObject: $globalObject) {
      status
      assets {
        id name assetType objectStatus
        ... on WebApplicationAsset {
          URLs { id URL }
          sourceIdentifiers { sourceIdentifier values { id IdentifierValue } }
        }
        ... on WebAPIAsset {
          URLs { id URL }
          sourceIdentifiers { sourceIdentifier values { id IdentifierValue } }
        }
        practices { id mainMode practice { id name practiceType } }
        profiles { id name profileType }
        behaviors { id name type subType objectStatus }
      }
    }
  }
`;

export const GET_PRACTICES = `
  query GetPractices($matchSearch: String, $sortBy: String, $practiceType: String, $includePrivatePractices: Boolean = true) {
    getPractices(matchSearch: $matchSearch, sortBy: $sortBy, practiceType: $practiceType, includePrivatePractices: $includePrivatePractices) {
      id name practiceType category visibility objectStatus default
    }
  }
`;

export const GET_ZONES = `
  query GetZones($matchSearch: String, $sortBy: String) {
    getZones(matchSearch: $matchSearch, sortBy: $sortBy) {
      status
      zones { id name objectStatus }
    }
  }
`;

export const GET_PROFILES = `
  query GetProfiles($matchSearch: String) {
    getProfiles(matchSearch: $matchSearch) {
      id name profileType objectStatus
    }
  }
`;

export const GET_AGENTS = `
  query GetAgents {
    getAgents {
      id agentType status name platform architecture policyVersion
      profile { id name type subType objectStatus }
      creationDate lastSeen agentId
    }
  }
`;

export const GET_BEHAVIORS = `
  query GetBehaviors($matchSearch: String, $sortBy: String, $includePrivateBehaviors: Boolean = true) {
    getBehaviors(matchSearch: $matchSearch, sortBy: $sortBy, includePrivateBehaviors: $includePrivateBehaviors) {
      id name behaviorType visibility objectStatus
    }
  }
`;

export const GET_TRIGGERS = `
  query GetTriggers($matchSearch: String, $sortBy: String) {
    getTriggers(matchSearch: $matchSearch, sortBy: $sortBy) {
      id name triggerType objectStatus
    }
  }
`;

// ============ Asset mutations (manage_objects) ============

export const CREATE_WEB_APP_ASSET = `
  mutation NewWebApplicationAsset($assetInput: WebApplicationAssetInput!) {
    newWebApplicationAsset(assetInput: $assetInput) {
      id name assetType objectStatus
      URLs { id URL }
    }
  }
`;

export const UPDATE_WEB_APP_ASSET = `
  mutation UpdateWebApplicationAsset($id: ID!, $assetInput: WebApplicationAssetUpdateInput!) {
    updateWebApplicationAsset(id: $id, assetInput: $assetInput)
  }
`;

export const DELETE_ASSET = `
  mutation DeleteAsset($id: String!) {
    deleteAsset(id: $id)
  }
`;

export const CREATE_WEB_API_ASSET = `
  mutation NewWebAPIAsset($assetInput: WebAPIAssetInput!) {
    newWebAPIAsset(assetInput: $assetInput) {
      id name assetType objectStatus
      URLs { id URL }
    }
  }
`;

export const UPDATE_WEB_API_ASSET = `
  mutation UpdateWebAPIAsset($id: ID!, $assetInput: WebAPIAssetUpdateInput!) {
    updateWebAPIAsset(id: $id, assetInput: $assetInput)
  }
`;

// ============ Practice mutations ============

export const CREATE_PRACTICE = `
  mutation NewWebApplicationPractice($ownerId: ID, $practiceInput: WebApplicationPracticeInput!) {
    newWebApplicationPractice(ownerId: $ownerId, practiceInput: $practiceInput) {
      id name practiceType objectStatus
    }
  }
`;

export const UPDATE_PRACTICE = `
  mutation UpdateWebApplicationPractice($id: ID!, $practiceInput: WebApplicationPracticeUpdateInput, $ownerId: ID) {
    updateWebApplicationPractice(id: $id, practiceInput: $practiceInput, ownerId: $ownerId)
  }
`;

export const DELETE_PRACTICE = `
  mutation DeletePractice($id: ID!) {
    deletePractice(id: $id)
  }
`;

export const CREATE_WEB_API_PRACTICE = `
  mutation NewWebAPIPractice($ownerId: ID, $practiceInput: WebAPIPracticeInput!) {
    newWebAPIPractice(ownerId: $ownerId, practiceInput: $practiceInput) {
      id name practiceType objectStatus
    }
  }
`;

export const UPDATE_WEB_API_PRACTICE = `
  mutation UpdateWebAPIPractice($id: ID!, $practiceInput: WebAPIPracticeUpdateInput, $ownerId: ID) {
    updateWebAPIPractice(id: $id, practiceInput: $practiceInput, ownerId: $ownerId)
  }
`;

export const CREATE_RATE_LIMIT_PRACTICE = `
  mutation NewRateLimitPractice($ownerId: ID, $practiceInput: RateLimitPracticeInput!) {
    newRateLimitPractice(ownerId: $ownerId, practiceInput: $practiceInput) {
      id name practiceType objectStatus
    }
  }
`;

export const UPDATE_RATE_LIMIT_PRACTICE = `
  mutation UpdateRateLimitPractice($id: ID!, $practiceInput: RateLimitPracticeUpdateInput, $ownerId: ID) {
    updateRateLimitPractice(id: $id, practiceInput: $practiceInput, ownerId: $ownerId)
  }
`;

export const CREATE_CACHING_PRACTICE = `
  mutation NewCachingPractice($ownerId: ID, $practiceInput: CachingPracticeInput!) {
    newCachingPractice(ownerId: $ownerId, practiceInput: $practiceInput) {
      id name practiceType objectStatus
    }
  }
`;

export const UPDATE_CACHING_PRACTICE = `
  mutation UpdateCachingPractice($id: ID!, $practiceInput: CachingPracticeUpdateInput, $ownerId: ID) {
    updateCachingPractice(id: $id, practiceInput: $practiceInput, ownerId: $ownerId)
  }
`;

// ============ Zone mutations ============

export const CREATE_ZONE = `
  mutation NewGenericZone($zoneInput: GenericZoneInput!) {
    newGenericZone(zoneInput: $zoneInput) {
      id name objectStatus
    }
  }
`;

export const UPDATE_ZONE = `
  mutation UpdateGenericZone($id: ID!, $zoneInput: GenericZoneUpdateInput!) {
    updateGenericZone(id: $id, zoneInput: $zoneInput)
  }
`;

export const DELETE_ZONE = `
  mutation DeleteZone($id: ID!) {
    deleteZone(id: $id)
  }
`;

// ============ Behavior mutations ============

export const CREATE_TRUSTED_SOURCE_BEHAVIOR = `
  mutation NewTrustedSourceBehavior($ownerId: ID, $practiceId: ID, $behaviorInput: TrustedSourceBehaviorInput!) {
    newTrustedSourceBehavior(ownerId: $ownerId, practiceId: $practiceId, behaviorInput: $behaviorInput) {
      id name objectStatus
    }
  }
`;

export const CREATE_EXCEPTION_BEHAVIOR = `
  mutation NewExceptionBehavior($ownerId: ID, $practiceId: ID, $behaviorInput: ExceptionBehaviorInput!) {
    newExceptionBehavior(ownerId: $ownerId, practiceId: $practiceId, behaviorInput: $behaviorInput) {
      id name objectStatus
    }
  }
`;

export const CREATE_WEB_USER_RESPONSE_BEHAVIOR = `
  mutation NewWebUserResponseBehavior($ownerId: ID, $practiceId: ID, $behaviorInput: WebUserResponseBehaviorInput!) {
    newWebUserResponseBehavior(ownerId: $ownerId, practiceId: $practiceId, behaviorInput: $behaviorInput) {
      id name objectStatus
    }
  }
`;

export const UPDATE_TRUSTED_SOURCE_BEHAVIOR = `
  mutation UpdateTrustedSourceBehavior($id: ID!, $behaviorInput: TrustedSourceBehaviorUpdateInput) {
    updateTrustedSourceBehavior(id: $id, behaviorInput: $behaviorInput)
  }
`;

export const UPDATE_EXCEPTION_BEHAVIOR = `
  mutation UpdateExceptionBehavior($id: ID!, $behaviorInput: ExceptionBehaviorUpdateInput) {
    updateExceptionBehavior(id: $id, behaviorInput: $behaviorInput)
  }
`;

export const UPDATE_WEB_USER_RESPONSE_BEHAVIOR = `
  mutation UpdateWebUserResponseBehavior($id: ID!, $behaviorInput: WebUserResponseBehaviorUpdateInput) {
    updateWebUserResponseBehavior(id: $id, behaviorInput: $behaviorInput)
  }
`;

// ============ Profile mutations ============

export const CREATE_APPSEC_GATEWAY_PROFILE = `
  mutation NewCloudGuardAppSecGatewayProfile($profileInput: CloudGuardAppSecGatewayProfileInput!) {
    newCloudGuardAppSecGatewayProfile(profileInput: $profileInput) {
      id name profileType objectStatus
    }
  }
`;

export const CREATE_EMBEDDED_PROFILE = `
  mutation NewEmbeddedProfile($profileInput: EmbeddedProfileInput!) {
    newEmbeddedProfile(profileInput: $profileInput) {
      id name profileType objectStatus
    }
  }
`;

export const CREATE_DOCKER_PROFILE = `
  mutation NewDockerProfile($profileInput: DockerProfileInput!) {
    newDockerProfile(profileInput: $profileInput) {
      id name profileType objectStatus
    }
  }
`;

export const CREATE_KUBERNETES_PROFILE = `
  mutation NewKubernetesProfile($profileInput: KubernetesProfileInput!) {
    newKubernetesProfile(profileInput: $profileInput) {
      id name profileType objectStatus
    }
  }
`;

export const UPDATE_APPSEC_GATEWAY_PROFILE = `
  mutation UpdateCloudGuardAppSecGatewayProfile($id: ID!, $profileInput: CloudGuardAppSecGatewayProfileUpdateInput) {
    updateCloudGuardAppSecGatewayProfile(id: $id, profileInput: $profileInput)
  }
`;

export const UPDATE_EMBEDDED_PROFILE = `
  mutation UpdateEmbeddedProfile($id: ID!, $profileInput: EmbeddedProfileUpdateInput) {
    updateEmbeddedProfile(id: $id, profileInput: $profileInput)
  }
`;

export const UPDATE_DOCKER_PROFILE = `
  mutation UpdateDockerProfile($id: ID!, $profileInput: DockerProfileUpdateInput) {
    updateDockerProfile(id: $id, profileInput: $profileInput)
  }
`;

export const UPDATE_KUBERNETES_PROFILE = `
  mutation UpdateKubernetesProfile($id: ID!, $profileInput: KubernetesProfileUpdateInput) {
    updateKubernetesProfile(id: $id, profileInput: $profileInput)
  }
`;

export const CREATE_SDWAN_PROFILE = `
  mutation NewSdWanProfile($input: SdWanProfileInput) {
    newSdWanProfile(input: $input) {
      id name profileType objectStatus
    }
  }
`;

export const UPDATE_SDWAN_PROFILE = `
  mutation UpdateSdWanProfile($id: ID!, $input: SdWanProfileUpdateInput!) {
    updateSdWanProfile(id: $id, input: $input)
  }
`;

export const CREATE_SDWAN_SETTINGS_PROFILE = `
  mutation NewSdWanSettingsProfile($input: SdWanSettingsProfileInput) {
    newSdWanSettingsProfile(input: $input) {
      id name profileType objectStatus
    }
  }
`;

export const UPDATE_SDWAN_SETTINGS_PROFILE = `
  mutation UpdateSdWanSettingsProfile($id: ID!, $input: SdWanSettingsProfileUpdateInput!) {
    updateSdWanSettingsProfile(id: $id, input: $input)
  }
`;

export const CREATE_QUANTUM_PROFILE = `
  mutation NewQuantumProfile($input: QuantumProfileInput) {
    newQuantumProfile(input: $input) {
      id name profileType objectStatus
    }
  }
`;

export const UPDATE_QUANTUM_PROFILE = `
  mutation UpdateQuantumProfile($id: ID!, $input: QuantumProfileUpdateInput!) {
    updateQuantumProfile(id: $id, input: $input)
  }
`;

// ============ Trigger mutations ============

export const CREATE_LOG_TRIGGER = `
  mutation NewLogTrigger($triggerInput: LogTriggerInput!) {
    newLogTrigger(triggerInput: $triggerInput) {
      id name
    }
  }
`;

export const CREATE_REPORT_TRIGGER = `
  mutation NewReportTrigger($triggerInput: ReportTriggerInput!) {
    newReportTrigger(triggerInput: $triggerInput) {
      id name
    }
  }
`;

export const UPDATE_LOG_TRIGGER = `
  mutation UpdateLogTrigger($id: ID, $triggerInput: LogTriggerInput) {
    updateLogTrigger(id: $id, triggerInput: $triggerInput)
  }
`;

export const UPDATE_REPORT_TRIGGER = `
  mutation UpdateReportTrigger($id: ID, $triggerInput: ReportTriggerUpdateInput) {
    updateReportTrigger(id: $id, triggerInput: $triggerInput)
  }
`;

// ============ Shared delete mutations ============

export const DELETE_BEHAVIOR = `
  mutation DeleteBehavior($id: ID!) {
    deleteBehavior(id: $id)
  }
`;

export const DELETE_PROFILE = `
  mutation DeleteProfile($id: ID!) {
    deleteProfile(id: $id)
  }
`;

export const DELETE_TRIGGER = `
  mutation DeleteTrigger($id: ID!) {
    deleteTrigger(id: $id)
  }
`;

// ============ UsedBy queries (for auto-detach on delete) ============

export const PRACTICE_USED_BY = `
  query PracticeUsedBy($id: ID!) {
    practiceUsedBy(id: $id) { id name type subType objectStatus }
  }
`;

export const BEHAVIOR_USED_BY = `
  query BehaviorUsedBy($id: ID!) {
    behaviorUsedBy(id: $id) { id name type subType objectStatus }
  }
`;

export const TRIGGER_USED_BY = `
  query TriggerUsedBy($id: ID!) {
    triggerUsedBy(id: $id) { container practices }
  }
`;

// Individual profile GET queries with usedBy (for auto-detach on delete)

export const GET_APPSEC_GATEWAY_PROFILE_USED_BY = `
  query GetAppSecGatewayProfileUsedBy($id: ID!) {
    getCloudGuardAppSecGatewayProfile(id: $id) {
      usedBy { id name type subType objectStatus }
    }
  }
`;

export const GET_EMBEDDED_PROFILE_USED_BY = `
  query GetEmbeddedProfileUsedBy($id: ID!) {
    getEmbeddedProfile(id: $id) {
      usedBy { id name type subType objectStatus }
    }
  }
`;

export const GET_DOCKER_PROFILE_USED_BY = `
  query GetDockerProfileUsedBy($id: ID!) {
    getDockerProfile(id: $id) {
      usedBy { id name type subType objectStatus }
    }
  }
`;

export const GET_KUBERNETES_PROFILE_USED_BY = `
  query GetKubernetesProfileUsedBy($id: ID!) {
    getKubernetesProfile(id: $id) {
      usedBy { id name type subType objectStatus }
    }
  }
`;

// Trigger detach mutation (removes a trigger from a practice)

export const UPDATE_PRACTICE_TRIGGERS = `
  mutation UpdatePracticeTriggers($addTriggers: [ID], $removeTriggers: [ID], $practiceId: ID!, $containerId: ID!) {
    updatePracticeTriggers(addTriggers: $addTriggers, removeTriggers: $removeTriggers, practiceId: $practiceId, containerId: $containerId)
  }
`;

// ============ Policy publishing and enforcement ============

/**
 * Publish pending configuration changes.
 * This mutation validates and publishes all pending changes to the WAF configuration.
 */
export const PUBLISH_CHANGES = `
  mutation PublishChanges {
    publishChanges {
      isValid
      errors {
        message
      }
      warnings {
        message
      }
    }
  }
`;

/**
 * Enforce the published policy.
 * This mutation applies the published configuration to the enforcement points.
 */
export const ENFORCE_POLICY = `
  mutation EnforcePolicy {
    enforcePolicy {
      id
      status
    }
  }
`;

/**
 * Get the session status including publish state and number of pending changes.
 * This query returns information about the current configuration session.
 */
export const GET_SESSION_STATUS = `
  query GetSessionStatus($sessionId: ID) {
    sessionStatus(sessionId: $sessionId) {
      id
      numberOfChanges
      publishState
      sessionDescription
      isOwned
      isActive
    }
  }
`;
