// server/auth-middleware.js
const xsenv = require('@sap/xsenv');
const xssec = require('@sap/xssec');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { logInfo, logError, logWarning } = require('./cloud-logger.js');

// Initialize passport with JWT strategy for XSUAA
function initializeAuthentication(app) {
    // Load XSUAA service configuration
    const xsuaaService = xsenv.getServices({ uaa: { tag: 'xsuaa' } }).uaa;

    if (!xsuaaService) {
        logWarning('XSUAA service not found. Running without authentication (local mode).');
        return null;
    }

    // Use xssec.JWTStrategy - this is the correct approach for SAP XSUAA
    passport.use('JWT', new xssec.JWTStrategy(xsuaaService));

    // Initialize passport
    app.use(passport.initialize());

    logInfo('XSUAA authentication initialized', {
        xsuaaUrl: xsuaaService.url,
        clientId: xsuaaService.clientid
    });
    return passport;
}

// Middleware to authenticate requests - use passport.authenticate with JWT strategy
// In local mode, this will be a pass-through middleware
let authenticate;

// Check if running locally
const isLocal = !process.env.VCAP_APPLICATION;

if (isLocal) {
    // Local mode: pass-through middleware that sets a mock user
    authenticate = (req, res, next) => {
        req.user = {
            getLogonName: () => 'local.user@example.com',
            getGivenName: () => 'Local',
            getFamilyName: () => 'User',
            getEmail: () => 'local.user@example.com',
            getScopes: () => []
        };
        next();
    };
} else {
    // Cloud mode: use passport JWT authentication
    authenticate = passport.authenticate('JWT', { session: false });
}

// Middleware to check for specific scopes
function checkScope(scope) {
    return (req, res, next) => {
        // Skip in local mode
        const isLocal = !process.env.VCAP_APPLICATION;
        if (isLocal) {
            return next();
        }

        if (!req.user) {
            logWarning('Unauthorized access attempt - no user in request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // SAP RECOMMENDED: Use req.authInfo (set by @sap/xssec JWTStrategy)
        if (!req.authInfo) {
            logWarning('Access denied - req.authInfo not available', {
                userId: req.user.id || req.user.email || 'unknown',
                requiredScope: scope
            });
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication information not available'
            });
        }

        // Try checkLocalScope first (handles $XSAPPNAME prefix automatically)
        let hasScope = false;
        if (typeof req.authInfo.checkLocalScope === 'function') {
            hasScope = req.authInfo.checkLocalScope(scope);
        } else if (typeof req.authInfo.checkScope === 'function') {
            hasScope = req.authInfo.checkScope(scope);
        } else if (typeof req.authInfo.getScopes === 'function') {
            const userScopes = req.authInfo.getScopes();
            hasScope = userScopes.some(s =>
                s === scope || s.endsWith('.' + scope) || s.includes(scope)
            );
        } else {
            logWarning('No scope checking methods available on req.authInfo');
        }

        if (!hasScope) {
            const userScopes = typeof req.authInfo.getScopes === 'function'
                ? req.authInfo.getScopes()
                : [];

            logWarning('Access denied - missing required scope', {
                userId: req.user.id || req.user.email || 'unknown',
                requiredScope: scope,
                userScopes: userScopes
            });

            return res.status(403).json({
                error: `Forbidden - You don't have permission to perform this action.Required scope: ${scope}`,
                message: `You don't have permission to perform this action. Required scope: ${scope}`
            });
        }

        next();
    };
}

// Helper function to check if user has any of the specified scopes
function checkAnyScope(scopes) {
    return (req, res, next) => {
        // Skip in local mode
        const isLocal = !process.env.VCAP_APPLICATION;
        if (isLocal) {
            return next();
        }

        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // SAP RECOMMENDED: Use req.authInfo
        if (!req.authInfo) {
            logWarning('Access denied - req.authInfo not available');
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication information not available'
            });
        }

        let hasAnyScope = false;

        // Try checkLocalScope for each scope
        if (typeof req.authInfo.checkLocalScope === 'function') {
            for (const scope of scopes) {
                if (req.authInfo.checkLocalScope(scope)) {
                    hasAnyScope = true;
                    break;
                }
            }
        } else if (typeof req.authInfo.getScopes === 'function') {
            const userScopes = req.authInfo.getScopes();
            hasAnyScope = scopes.some(requiredScope =>
                userScopes.some(userScope =>
                    userScope === requiredScope ||
                    userScope.endsWith('.' + requiredScope) ||
                    userScope.includes(requiredScope)
                )
            );
        }

        if (!hasAnyScope) {
            const userScopes = typeof req.authInfo.getScopes === 'function'
                ? req.authInfo.getScopes()
                : [];

            logWarning('Access denied - missing required scopes', {
                userId: req.user.id || req.user.email || 'unknown',
                requiredScopes: scopes,
                userScopes: userScopes
            });

            return res.status(403).json({
                error: 'Forbidden - You don\'t have permission to perform this action.',
                message: `You don't have permission to perform this action.`
            });
        }

        next();
    };
}

// Helper function to extract JWT token from request headers
function extractJwtToken(req) {
    try {
        // Try to get JWT from Authorization header
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Try x-approuter-authorization header (used by approuter)
        const approuterHeader = req.headers['x-approuter-authorization'] || req.headers['X-Approuter-Authorization'];
        if (approuterHeader && approuterHeader.startsWith('Bearer ')) {
            return approuterHeader.substring(7);
        }

        return null;
    } catch (error) {
        logError('Error extracting JWT token from headers', error);
        return null;
    }
}

// Helper function to decode JWT and extract scopes
function extractScopesFromJwt(req) {
    try {
        const token = extractJwtToken(req);
        if (!token) {
            logWarning('No JWT token found in request headers');
            return [];
        }

        // Decode JWT without verification (we trust it since it came through approuter/XSUAA)
        const decoded = jwt.decode(token);

        logInfo('=== DEBUG: Decoded JWT token ===', {
            decodedKeys: decoded ? Object.keys(decoded) : 'null',
            scope: decoded ? decoded.scope : 'not available',
            scopes: decoded ? decoded.scopes : 'not available',
            decodedToken: JSON.stringify(decoded, null, 2)
        });

        if (!decoded) {
            logWarning('Failed to decode JWT token');
            return [];
        }

        // Extract scopes from JWT
        if (decoded.scope) {
            const scopes = Array.isArray(decoded.scope) ? decoded.scope : decoded.scope.split(' ');
            logInfo('✓ Extracted scopes from JWT token', { scopes });
            return scopes;
        } else if (decoded.scopes) {
            logInfo('✓ Extracted scopes from JWT token (scopes field)', { scopes: decoded.scopes });
            return decoded.scopes;
        }

        logWarning('No scopes found in JWT token');
        return [];
    } catch (error) {
        logError('Error extracting scopes from JWT', error);
        return [];
    }
}

// Get user information from request
function getUserInfo(req) {
    if (!req.user) {
        return { id: 'anonymous', name: 'Anonymous', email: '', givenName: '', familyName: '', scopes: [] };
    }

    try {
        // Extract user basic info from req.user (from approuter)
        const logonName = req.user.id || req.user.email || req.user.user_name || 'unknown';
        const givenName = req.user.name && req.user.name.givenName ? req.user.name.givenName : '';
        const familyName = req.user.name && req.user.name.familyName ? req.user.name.familyName : '';
        const email = req.user.emails && req.user.emails[0] ? req.user.emails[0].value : logonName;

        const fullName = givenName && familyName
            ? `${givenName} ${familyName}`.trim()
            : (givenName || familyName || logonName);

        // SAP RECOMMENDED: Get scopes from req.authInfo
        // Note: getScopes() is not available, but we can test scopes with checkLocalScope()
        let scopes = [];

        // Try to extract scopes from token info if available
        if (req.authInfo && typeof req.authInfo.getTokenInfo === 'function') {
            try {
                const tokenInfo = req.authInfo.getTokenInfo();
                if (tokenInfo && typeof tokenInfo.getPayload === 'function') {
                    const payload = tokenInfo.getPayload();
                    if (payload && payload.scope) {
                        scopes = Array.isArray(payload.scope) ? payload.scope : payload.scope.split(' ');
                    }
                }
            } catch (e) {
                // Silently handle scope extraction failure
            }
        }

        const userInfo = {
            id: logonName,
            name: fullName,
            email: email,
            givenName: givenName,
            familyName: familyName,
            scopes: scopes
        };

        // Single consolidated log for user authentication
        logInfo('User authenticated', {
            id: logonName,
            name: fullName,
            email: email,
            scopes: scopes,
            scopeCount: scopes.length
        });

        return userInfo;
    } catch (error) {
        logError('Error extracting user info', error);
        return { id: 'unknown', name: 'Unknown User', email: '', givenName: '', familyName: '', scopes: [] };
    }
}

module.exports = {
    initializeAuthentication,
    authenticate,
    checkScope,
    checkAnyScope,
    getUserInfo
};
