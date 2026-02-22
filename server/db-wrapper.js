// server/db-wrapper.js
// Unified database wrapper for both SQLite (local) and HANA (cloud)

const isLocal = !process.env.VCAP_APPLICATION;

let dbModule;

if (isLocal) {
    // Use SQLite with Knex for local development
    dbModule = require('./db.js');
} else {
    // Use HANA for Cloud Foundry
    dbModule = require('./db-hana.js');
}

// Unified interface for database operations
const db = {
    // Insert a log entry
    async insertLog(data) {
        if (isLocal) {
            const { knex } = dbModule;
            const [result] = await knex('logs').insert(data).returning('id');
            return result.id || result[0].id || result[0];
        } else {
            return await dbModule.insertAndReturnId('LOGS', {
                PROJECT_NAME: data.projectName,
                ENVIRONMENT: data.environment,
                USER_NAME: data.userName || 'N/A',
                ACTIVITY_TYPE: data.activityType,
                TIMESTAMP: data.timestamp,
                LOG_CONTENT: data.logContent || null,
                RESULT_CONTENT: data.resultContent || null,
                STATUS: data.status || 'Unknown',
                ARTIFACT_COUNT: data.artifactCount || null,
                PARAMETER_COUNT: data.parameterCount || null,
                TIME_TAKEN_SECONDS: data.timeTakenSeconds || null
            });
        }
    },

    // Get all logs
    async getAllLogs() {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('logs').select('*').orderBy('id', 'desc');
        } else {
            const logs = await dbModule.selectRecords('LOGS', '', [], '*');
            // Convert HANA column names to match frontend expectations
            return logs.map(log => ({
                id: log.ID,
                projectName: log.PROJECT_NAME,
                environment: log.ENVIRONMENT,
                userName: log.USER_NAME,
                activityType: log.ACTIVITY_TYPE,
                timestamp: log.TIMESTAMP,
                logContent: log.LOG_CONTENT,
                resultContent: log.RESULT_CONTENT,
                status: log.STATUS,
                artifactCount: log.ARTIFACT_COUNT,
                parameterCount: log.PARAMETER_COUNT,
                timeTakenSeconds: log.TIME_TAKEN_SECONDS
            }));
        }
    },

    // Get a specific log by ID
    async getLogById(id) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('logs').where({ id }).first();
        } else {
            const logs = await dbModule.selectRecords('LOGS', '"ID" = ?', [id]);
            if (logs.length === 0) return null;
            const log = logs[0];
            return {
                id: log.ID,
                projectName: log.PROJECT_NAME,
                environment: log.ENVIRONMENT,
                userName: log.USER_NAME,
                activityType: log.ACTIVITY_TYPE,
                timestamp: log.TIMESTAMP,
                logContent: log.LOG_CONTENT,
                resultContent: log.RESULT_CONTENT,
                status: log.STATUS,
                artifactCount: log.ARTIFACT_COUNT,
                parameterCount: log.PARAMETER_COUNT,
                timeTakenSeconds: log.TIME_TAKEN_SECONDS
            };
        }
    },

    // Get the most recent log by project, environment, and activity type
    async getLogByJobInfo(projectName, environment, activityType) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('logs')
                .where({ projectName, environment, activityType })
                .orderBy('id', 'desc')
                .first();
        } else {
            const logs = await dbModule.selectRecords(
                'LOGS',
                '"PROJECT_NAME" = ? AND "ENVIRONMENT" = ? AND "ACTIVITY_TYPE" = ?',
                [projectName, environment, activityType]
            );
            if (logs.length === 0) return null;
            // Sort by ID descending to get the most recent
            logs.sort((a, b) => b.ID - a.ID);
            const log = logs[0];
            return {
                id: log.ID,
                projectName: log.PROJECT_NAME,
                environment: log.ENVIRONMENT,
                userName: log.USER_NAME,
                activityType: log.ACTIVITY_TYPE,
                timestamp: log.TIMESTAMP,
                logContent: log.LOG_CONTENT,
                resultContent: log.RESULT_CONTENT,
                status: log.STATUS,
                artifactCount: log.ARTIFACT_COUNT,
                parameterCount: log.PARAMETER_COUNT,
                timeTakenSeconds: log.TIME_TAKEN_SECONDS
            };
        }
    },

    // Insert a download job
    async insertDownloadJob(data) {
        if (isLocal) {
            const { knex } = dbModule;
            const [result] = await knex('download_jobs').insert(data).returning('id');
            return result.id || result[0].id || result[0];
        } else {
            return await dbModule.insertAndReturnId('DOWNLOAD_JOBS', {
                STATUS: data.status,
                PROGRESS: data.progress,
                TOTAL: data.total,
                FORM_DATA_JSON: data.form_data_json
            });
        }
    },

    // Get download job by ID
    async getDownloadJobById(id) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('download_jobs').where({ id }).first();
        } else {
            const jobs = await dbModule.selectRecords('DOWNLOAD_JOBS', '"ID" = ?', [id]);
            if (jobs.length === 0) return null;
            const job = jobs[0];
            return {
                id: job.ID,
                status: job.STATUS,
                progress: job.PROGRESS,
                total: job.TOTAL,
                log_file_path: job.LOG_FILE_PATH,
                result_file_path: job.RESULT_FILE_PATH,
                form_data_json: job.FORM_DATA_JSON,
                log_id: job.LOG_ID,
                created_at: job.CREATED_AT
            };
        }
    },

    // Update download job
    async updateDownloadJob(id, data) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('download_jobs').where({ id }).update(data);
        } else {
            const updateData = {};
            if (data.status !== undefined) updateData.STATUS = data.status;
            if (data.progress !== undefined) updateData.PROGRESS = data.progress;
            if (data.total !== undefined) updateData.TOTAL = data.total;
            if (data.log_file_path !== undefined) updateData.LOG_FILE_PATH = data.log_file_path;
            if (data.result_file_path !== undefined) updateData.RESULT_FILE_PATH = data.result_file_path;
            if (data.log_id !== undefined) updateData.LOG_ID = data.log_id;

            return await dbModule.updateRecords('DOWNLOAD_JOBS', updateData, '"ID" = ?', [id]);
        }
    },

    // Insert upload job
    async insertUploadJob(data) {
        if (isLocal) {
            const { knex } = dbModule;
            const [result] = await knex('upload_jobs').insert(data).returning('id');
            return result.id || result[0].id || result[0];
        } else {
            return await dbModule.insertAndReturnId('UPLOAD_JOBS', {
                STATUS: data.status,
                PROGRESS: data.progress,
                TOTAL: data.total,
                TEMP_UPLOAD_PATH: data.temp_upload_path,
                FORM_DATA_JSON: data.form_data_json
            });
        }
    },

    // Get upload job by ID
    async getUploadJobById(id) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('upload_jobs').where({ id }).first();
        } else {
            const jobs = await dbModule.selectRecords('UPLOAD_JOBS', '"ID" = ?', [id]);
            if (jobs.length === 0) return null;
            const job = jobs[0];
            return {
                id: job.ID,
                status: job.STATUS,
                progress: job.PROGRESS,
                total: job.TOTAL,
                log_file_path: job.LOG_FILE_PATH,
                result_file_path: job.RESULT_FILE_PATH,
                temp_upload_path: job.TEMP_UPLOAD_PATH,
                form_data_json: job.FORM_DATA_JSON,
                log_id: job.LOG_ID,
                created_at: job.CREATED_AT
            };
        }
    },

    // Update upload job
    async updateUploadJob(id, data) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('upload_jobs').where({ id }).update(data);
        } else {
            const updateData = {};
            if (data.status !== undefined) updateData.STATUS = data.status;
            if (data.progress !== undefined) updateData.PROGRESS = data.progress;
            if (data.total !== undefined) updateData.TOTAL = data.total;
            if (data.log_file_path !== undefined) updateData.LOG_FILE_PATH = data.log_file_path;
            if (data.result_file_path !== undefined) updateData.RESULT_FILE_PATH = data.result_file_path;
            if (data.log_id !== undefined) updateData.LOG_ID = data.log_id;

            return await dbModule.updateRecords('UPLOAD_JOBS', updateData, '"ID" = ?', [id]);
        }
    },

    // ========== PROJECT MASTER OPERATIONS ==========

    // Insert a new project
    async insertProject(data) {
        if (isLocal) {
            const { knex } = dbModule;
            const [result] = await knex('projects').insert(data).returning('id');
            return result.id || result[0].id || result[0];
        } else {
            return await dbModule.insertAndReturnId('PROJECTS', {
                PROJECT_NAME: data.projectName,
                ENVIRONMENT: data.environment,
                CPI_BASE_URL: data.cpiBaseUrl,
                TOKEN_URL: data.tokenUrl,
                CLIENT_ID: data.clientId,
                CLIENT_SECRET: data.clientSecret,
                PROJECT_MEMBERS: data.projectMembers,
                CREATED_BY: data.createdBy,
                UPDATED_BY: data.updatedBy
            });
        }
    },

    // Get all projects
    async getAllProjects() {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('projects').select('*').orderBy('id', 'desc');
        } else {
            const projects = await dbModule.selectRecords('PROJECTS', '', [], '*');
            return projects.map(proj => ({
                id: proj.ID,
                projectName: proj.PROJECT_NAME,
                environment: proj.ENVIRONMENT,
                cpiBaseUrl: proj.CPI_BASE_URL,
                tokenUrl: proj.TOKEN_URL,
                clientId: proj.CLIENT_ID,
                clientSecret: proj.CLIENT_SECRET,
                projectMembers: proj.PROJECT_MEMBERS,
                createdBy: proj.CREATED_BY,
                createdAt: proj.CREATED_AT,
                updatedBy: proj.UPDATED_BY,
                updatedAt: proj.UPDATED_AT
            }));
        }
    },

    // Get project by ID
    async getProjectById(id) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('projects').where({ id }).first();
        } else {
            const projects = await dbModule.selectRecords('PROJECTS', '"ID" = ?', [id]);
            if (projects.length === 0) return null;
            const proj = projects[0];
            return {
                id: proj.ID,
                projectName: proj.PROJECT_NAME,
                environment: proj.ENVIRONMENT,
                cpiBaseUrl: proj.CPI_BASE_URL,
                tokenUrl: proj.TOKEN_URL,
                clientId: proj.CLIENT_ID,
                clientSecret: proj.CLIENT_SECRET,
                projectMembers: proj.PROJECT_MEMBERS,
                createdBy: proj.CREATED_BY,
                createdAt: proj.CREATED_AT,
                updatedBy: proj.UPDATED_BY,
                updatedAt: proj.UPDATED_AT
            };
        }
    },

    // Get project by name and environment
    async getProjectByNameAndEnv(projectName, environment) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('projects').where({ projectName, environment }).first();
        } else {
            const projects = await dbModule.selectRecords('PROJECTS', '"PROJECT_NAME" = ? AND "ENVIRONMENT" = ?', [projectName, environment]);
            if (projects.length === 0) return null;
            const proj = projects[0];
            return {
                id: proj.ID,
                projectName: proj.PROJECT_NAME,
                environment: proj.ENVIRONMENT,
                cpiBaseUrl: proj.CPI_BASE_URL,
                tokenUrl: proj.TOKEN_URL,
                clientId: proj.CLIENT_ID,
                clientSecret: proj.CLIENT_SECRET,
                projectMembers: proj.PROJECT_MEMBERS,
                createdBy: proj.CREATED_BY,
                createdAt: proj.CREATED_AT,
                updatedBy: proj.UPDATED_BY,
                updatedAt: proj.UPDATED_AT
            };
        }
    },

    // Update project
    async updateProject(id, data, updatedBy) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('projects').where({ id }).update({ ...data, updatedBy, updatedAt: new Date() });
        } else {
            const updateData = {};
            if (data.projectName !== undefined) updateData.PROJECT_NAME = data.projectName;
            if (data.environment !== undefined) updateData.ENVIRONMENT = data.environment;
            if (data.cpiBaseUrl !== undefined) updateData.CPI_BASE_URL = data.cpiBaseUrl;
            if (data.tokenUrl !== undefined) updateData.TOKEN_URL = data.tokenUrl;
            if (data.clientId !== undefined) updateData.CLIENT_ID = data.clientId;
            if (data.clientSecret !== undefined) updateData.CLIENT_SECRET = data.clientSecret;
            if (data.projectMembers !== undefined) updateData.PROJECT_MEMBERS = data.projectMembers;
            updateData.UPDATED_BY = updatedBy;
            updateData.UPDATED_AT = new Date().toISOString();

            return await dbModule.updateRecords('PROJECTS', updateData, '"ID" = ?', [id]);
        }
    },

    // Delete project
    async deleteProject(id) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('projects').where({ id }).delete();
        } else {
            return await dbModule.deleteRecords('PROJECTS', '"ID" = ?', [id]);
        }
    },

    // ========== CLEANUP OPERATIONS ==========

    // Get logs older than cutoff date (for cleanup job)
    async getLogsOlderThan(cutoffDate) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('logs')
                .where('timestamp', '<', cutoffDate.toISOString())
                .select('id', 'projectName', 'environment', 'timestamp');
        } else {
            const logs = await dbModule.selectRecords(
                'LOGS',
                '"TIMESTAMP" < ?',
                [cutoffDate.toISOString()],
                '"ID", "PROJECT_NAME", "ENVIRONMENT", "TIMESTAMP"'
            );
            return logs.map(log => ({
                id: log.ID,
                projectName: log.PROJECT_NAME,
                environment: log.ENVIRONMENT,
                timestamp: log.TIMESTAMP
            }));
        }
    },

    // Clear LOG_CONTENT and RESULT_CONTENT for logs older than cutoff date
    async clearLogContent(cutoffDate) {
        if (isLocal) {
            const { knex } = dbModule;
            const updated = await knex('logs')
                .where('timestamp', '<', cutoffDate.toISOString())
                .update({
                    logContent: null,
                    resultContent: null
                });
            return updated;
        } else {
            const result = await dbModule.updateRecords(
                'LOGS',
                {
                    LOG_CONTENT: null,
                    RESULT_CONTENT: null
                },
                '"TIMESTAMP" < ?',
                [cutoffDate.toISOString()]
            );
            return result;
        }
    },

    // Clear LOG_CONTENT and RESULT_CONTENT for specific log IDs (manual deletion)
    async clearLogContentByIds(logIds) {
        if (isLocal) {
            const { knex } = dbModule;
            const updated = await knex('logs')
                .whereIn('id', logIds)
                .update({
                    logContent: null,
                    resultContent: null
                });
            return updated;
        } else {
            // For HANA, update each log ID separately
            let totalUpdated = 0;
            for (const logId of logIds) {
                const result = await dbModule.updateRecords(
                    'LOGS',
                    {
                        LOG_CONTENT: null,
                        RESULT_CONTENT: null
                    },
                    '"ID" = ?',
                    [logId]
                );
                totalUpdated += result;
            }
            return totalUpdated;
        }
    },

    // ========== CLEANUP LOGS OPERATIONS ==========

    // Insert a cleanup log entry
    async createCleanupLog(data) {
        if (isLocal) {
            const { knex } = dbModule;
            const [result] = await knex('cleanup_logs').insert({
                executionTimestamp: data.executionTimestamp,
                status: data.status,
                logsCleanedCount: data.logsCleanedCount,
                message: data.message,
                executedBy: data.executedBy,
                cutoffDate: data.cutoffDate,
                errorMessage: data.errorMessage || null
            }).returning('id');
            return result.id || result[0].id || result[0];
        } else {
            return await dbModule.insertAndReturnId('CLEANUP_LOGS', {
                EXECUTION_TIMESTAMP: data.executionTimestamp,
                STATUS: data.status,
                LOGS_CLEANED_COUNT: data.logsCleanedCount,
                MESSAGE: data.message,
                EXECUTED_BY: data.executedBy,
                CUTOFF_DATE: data.cutoffDate,
                ERROR_MESSAGE: data.errorMessage || null
            });
        }
    },

    // Get all cleanup logs with optional date range filter and pagination
    async getAllCleanupLogs(filters = {}) {
        const { dateFrom, dateTo, limit = 50, offset = 0 } = filters;

        if (isLocal) {
            const { knex } = dbModule;
            let query = knex('cleanup_logs').select('*');

            if (dateFrom) {
                query = query.where('executionTimestamp', '>=', dateFrom);
            }
            if (dateTo) {
                query = query.where('executionTimestamp', '<=', dateTo);
            }

            query = query.orderBy('id', 'desc').limit(limit).offset(offset);
            return await query;
        } else {
            let whereClause = '';
            const params = [];

            if (dateFrom && dateTo) {
                whereClause = '"EXECUTION_TIMESTAMP" >= ? AND "EXECUTION_TIMESTAMP" <= ?';
                params.push(dateFrom, dateTo);
            } else if (dateFrom) {
                whereClause = '"EXECUTION_TIMESTAMP" >= ?';
                params.push(dateFrom);
            } else if (dateTo) {
                whereClause = '"EXECUTION_TIMESTAMP" <= ?';
                params.push(dateTo);
            }

            // Fetch all logs matching the filter (no ORDER BY/LIMIT in WHERE clause)
            const logs = await dbModule.selectRecords('CLEANUP_LOGS', whereClause, params, '*');

            // Sort by ID descending in JavaScript
            const sortedLogs = logs.sort((a, b) => b.ID - a.ID);

            // Apply pagination in JavaScript
            const paginatedLogs = sortedLogs.slice(offset, offset + limit);

            return paginatedLogs.map(log => ({
                id: log.ID,
                executionTimestamp: log.EXECUTION_TIMESTAMP,
                status: log.STATUS,
                logsCleanedCount: log.LOGS_CLEANED_COUNT,
                message: log.MESSAGE,
                executedBy: log.EXECUTED_BY,
                cutoffDate: log.CUTOFF_DATE,
                errorMessage: log.ERROR_MESSAGE,
                createdAt: log.CREATED_AT
            }));
        }
    },

    // Get total count of cleanup logs with optional date filter
    async getCleanupLogsCount(filters = {}) {
        const { dateFrom, dateTo } = filters;

        if (isLocal) {
            const { knex } = dbModule;
            let query = knex('cleanup_logs').count('* as count');

            if (dateFrom) {
                query = query.where('executionTimestamp', '>=', dateFrom);
            }
            if (dateTo) {
                query = query.where('executionTimestamp', '<=', dateTo);
            }

            const result = await query.first();
            return result.count;
        } else {
            let whereClause = '';
            const params = [];

            if (dateFrom && dateTo) {
                whereClause = '"EXECUTION_TIMESTAMP" >= ? AND "EXECUTION_TIMESTAMP" <= ?';
                params.push(dateFrom, dateTo);
            } else if (dateFrom) {
                whereClause = '"EXECUTION_TIMESTAMP" >= ?';
                params.push(dateFrom);
            } else if (dateTo) {
                whereClause = '"EXECUTION_TIMESTAMP" <= ?';
                params.push(dateTo);
            }

            const logs = await dbModule.selectRecords('CLEANUP_LOGS', whereClause, params, 'COUNT(*) as COUNT');
            return logs[0].COUNT;
        }
    },

    // Get specific cleanup log by ID
    async getCleanupLogById(id) {
        if (isLocal) {
            const { knex } = dbModule;
            return await knex('cleanup_logs').where({ id }).first();
        } else {
            const logs = await dbModule.selectRecords('CLEANUP_LOGS', '"ID" = ?', [id]);
            if (logs.length === 0) return null;
            const log = logs[0];
            return {
                id: log.ID,
                executionTimestamp: log.EXECUTION_TIMESTAMP,
                status: log.STATUS,
                logsCleanedCount: log.LOGS_CLEANED_COUNT,
                message: log.MESSAGE,
                executedBy: log.EXECUTED_BY,
                cutoffDate: log.CUTOFF_DATE,
                errorMessage: log.ERROR_MESSAGE,
                createdAt: log.CREATED_AT
            };
        }
    }
};

module.exports = db;
