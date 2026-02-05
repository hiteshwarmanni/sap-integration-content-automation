// server/auth-middleware.js
const xsenv = require('@sap/xsenv');
const xssec = require('@sap/xssec');
const passport = require('passport');
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
        const xsuaaService = xsenv.getServices({ uaa: { tag: 'xsuaa' } }).uaa;
        if (!xsuaaService) {
            return next();
        }

        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userScopes = req.user.scopes || [];
        const hasScope = userScopes.some(s => s.endsWith(scope));

        if (!hasScope) {
            logWarning('Access denied - missing required scope', {
                userId: req.user.id || req.user.getLogonName(),
                requiredScope: scope,
                userScopes: userScopes
            });
            return res.status(403).json({
                error: 'Forbidden',
                message: `Required scope: ${scope}`
            });
        }

        next();
    };
}

// Get user information from request
function getUserInfo(req) {
    if (!req.user) {
        return { id: 'anonymous', name: 'Anonymous', email: '', givenName: '', familyName: '', scopes: [] };
    }

    // When using @sap/xssec, the user object is a SecurityContext
    // Extract user information from the security context
    try {
        const logonName = req.user.getLogonName ? req.user.getLogonName() : req.user.id || 'unknown';
        const givenName = req.user.getGivenName ? req.user.getGivenName() : '';
        const familyName = req.user.getFamilyName ? req.user.getFamilyName() : '';
        const email = req.user.getEmail ? req.user.getEmail() : logonName;

        const fullName = givenName && familyName
            ? `${givenName} ${familyName}`.trim()
            : (givenName || familyName || logonName);

        // Try multiple ways to get scopes
        let scopes = [];
        if (req.user.getScopes) {
            scopes = req.user.getScopes();
        } else if (req.user.scopes) {
            scopes = req.user.scopes;
        } else if (req.authInfo && req.authInfo.scopes) {
            scopes = req.authInfo.scopes;
        }

        // Log scope extraction for debugging
        logInfo('User scope extraction', {
            logonName,
            email,
            scopesFromGetScopes: req.user.getScopes ? req.user.getScopes() : 'method not available',
            scopesFromProperty: req.user.scopes || 'property not available',
            authInfoScopes: (req.authInfo && req.authInfo.scopes) || 'authInfo not available',
            finalScopes: scopes,
            hasCheckLocalScope: req.user.checkLocalScope ? 'available' : 'not available',
            hasCheckScope: req.user.checkScope ? 'available' : 'not available'
        });

        const userInfo = {
            id: logonName,
            name: fullName,
            email: email,
            givenName: givenName,
            familyName: familyName,
            scopes: scopes
        };

        return userInfo;
    } catch (error) {
        logError('Error extracting user info from JWT token', error);
        return { id: 'unknown', name: 'Unknown User', email: '', givenName: '', familyName: '', scopes: [] };
    }
}

module.exports = {
    initializeAuthentication,
    authenticate,
    checkScope,
    getUserInfo
};
