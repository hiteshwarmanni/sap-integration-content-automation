// client/src/hooks/useAdminCheck.js
// Custom hook to check if user has Admin scope

/**
 * Check if user has Admin scope
 * In local development mode, always return true (no auth)
 * @param {Object} userInfo - User information object with scopes
 * @returns {boolean} True if user is admin or running locally, false otherwise
 */
export function useAdminCheck(userInfo) {
    // Check if running in local development
    const isDevelopment = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    // In local mode, always allow admin access (no authentication)
    if (isDevelopment) {
        return true;
    }

    // In production, check for Admin scope
    if (!userInfo || !userInfo.scopes) {
        return false;
    }

    // Check if user has Admin scope (case-insensitive)
    return userInfo.scopes.some(scope =>
        scope.includes('Admin') || scope.includes('admin')
    );
}
