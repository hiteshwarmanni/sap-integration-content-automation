// server/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, getUserInfo } = require('../auth-middleware');

// Helper function to check if user has admin role
function isUserAdmin(userInfo) {
    if (!userInfo || !userInfo.scopes) {
        return false;
    }
    const adminScope = 'sap-integration-automation.Admin';
    return userInfo.scopes.some(scope => scope === adminScope || scope.endsWith('.Admin'));
}

// Get user info
router.get('/user-info', authenticate, (req, res) => {
    const userInfo = getUserInfo(req);
    const isAdmin = isUserAdmin(userInfo);
    res.json({
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        givenName: userInfo.givenName,
        familyName: userInfo.familyName,
        isAdmin: isAdmin,
        scopes: userInfo.scopes || []
    });
});

// Logout
router.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy();
    }
    res.send('<html><body><h2>Logged out successfully</h2><p><a href="/">Return to application</a></p></body></html>');
});

module.exports = router;
