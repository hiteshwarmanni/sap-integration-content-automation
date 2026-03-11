// server/jobs/constants.js

// CSV Headers for different job types
const DOWNLOAD_CSV_HEADERS = [
    "PackageName",
    "PackageID",
    "IflowName",
    "IflowID",
    "ParameterKey",
    "ParameterValue",
    "DataType"
];

const UPLOAD_CSV_HEADERS = [
    "PackageName",
    "PackageID",
    "IflowName",
    "IflowID",
    "ParameterKey",
    "ParameterValue",
    "DataType",
    "StatusCode",
    "Status",
    "Message"
];

const DEPLOY_CSV_HEADERS = [
    "ArtifactID",
    "Version",
    "ResponseCode",
    "ResponseMessage"
];

const TRANSPORT_CSV_HEADERS = [
    "SourcePackageId",
    "TargetPackageId",
    "SourceIflowId",
    "TargetIflowId",
    "StatusCode",
    "Status"
];

// Default version for artifacts
const DEFAULT_VERSION = 'active';

// Artifact types (normalized)
const ARTIFACT_TYPES = {
    INTEGRATION_FLOW: 'integration flow',
    SCRIPT_COLLECTION: 'script collection',
    VALUE_MAPPING: 'value mapping'
};

// Operation types
const OPERATIONS = {
    DEPLOY: 'deploy',
    UNDEPLOY: 'undeploy'
};

module.exports = {
    DOWNLOAD_CSV_HEADERS,
    UPLOAD_CSV_HEADERS,
    DEPLOY_CSV_HEADERS,
    TRANSPORT_CSV_HEADERS,
    DEFAULT_VERSION,
    ARTIFACT_TYPES,
    OPERATIONS
};
