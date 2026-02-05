// client/src/pages/ProjectMasterPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

function ProjectMasterPage({ projects, error: projectsError, refreshProjects }) {
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState(null);

    const initialFormState = {
        projectName: '',
        environment: '',
        cpiBaseUrl: '',
        tokenUrl: '',
        clientId: '',
        clientSecret: '',
        projectMembers: ''
    };

    const [formData, setFormData] = useState(initialFormState);

    // Fetch user info
    useEffect(() => {
        fetchUserInfo();
    }, []);

    const fetchUserInfo = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/api/user-info`);
            setUserInfo(data);
        } catch (err) {
            console.error('Error fetching user info:', err);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            // Convert comma-separated emails to array
            const members = formData.projectMembers
                ? formData.projectMembers.split(',').map(m => m.trim()).filter(m => m)
                : [];

            const payload = {
                ...formData,
                projectMembers: members
            };

            if (editingProject) {
                // Update existing project
                await axios.put(`${API_URL}/api/projects/${editingProject.id}`, payload);
                setSuccess('Project updated successfully!');
            } else {
                // Create new project
                await axios.post(`${API_URL}/api/projects`, payload);
                setSuccess('Project created successfully!');
            }

            // Reset form and refresh list
            setFormData(initialFormState);
            setShowForm(false);
            setEditingProject(null);
            refreshProjects(); // Call parent's refresh function

            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to save project';
            setError(errorMsg);
        }
    };

    const handleEdit = (project) => {
        setEditingProject(project);
        setFormData({
            projectName: project.projectName,
            environment: project.environment,
            cpiBaseUrl: project.cpiBaseUrl,
            tokenUrl: project.tokenUrl,
            clientId: project.clientId,
            clientSecret: project.clientSecret,
            projectMembers: Array.isArray(project.projectMembers)
                ? project.projectMembers.join(', ')
                : (typeof project.projectMembers === 'string' ? JSON.parse(project.projectMembers || '[]').join(', ') : '')
        });
        setShowForm(true);
        setError('');
        setSuccess('');
    };

    const handleDelete = (project) => {
        setProjectToDelete(project);
        setShowDeleteDialog(true);
    };

    const confirmDelete = async () => {
        if (!projectToDelete) return;

        try {
            await axios.delete(`${API_URL}/api/projects/${projectToDelete.id}`);
            setSuccess('Project deleted successfully!');
            refreshProjects(); // Call parent's refresh function
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to delete project';
            setError(errorMsg);
        } finally {
            setShowDeleteDialog(false);
            setProjectToDelete(null);
        }
    };

    const cancelDelete = () => {
        setShowDeleteDialog(false);
        setProjectToDelete(null);
    };

    const handleCancel = () => {
        setFormData(initialFormState);
        setShowForm(false);
        setEditingProject(null);
        setError('');
    };

    const handleNewProject = () => {
        setFormData(initialFormState);
        setEditingProject(null);
        setShowForm(true);
        setError('');
        setSuccess('');
    };

    return (
        <div className="page-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>Project Master</h2>
                {!showForm && (
                    <button
                        className="btn-primary"
                        onClick={handleNewProject}
                        style={{ padding: '0.75rem 1.5rem' }}
                    >
                        + Create New Project
                    </button>
                )}
            </div>

            {/* Success/Error Messages */}
            {success && <div className="form-success">{success}</div>}
            {error && <div className="form-error">{error}</div>}
            {projectsError && <div className="form-error">{projectsError}</div>}

            {/* Project Form */}
            {showForm && (
                <div className="modern-form" style={{ marginBottom: '2rem' }}>
                    <h3>{editingProject ? 'Edit Project' : 'Create New Project'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Project Name *</label>
                            <input
                                type="text"
                                name="projectName"
                                value={formData.projectName}
                                onChange={handleInputChange}
                                placeholder="e.g., SAP Integration Project"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Environment *</label>
                            <input
                                type="text"
                                name="environment"
                                value={formData.environment}
                                onChange={handleInputChange}
                                placeholder="e.g., Development, Production"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>CPI Base URL *</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                                <input
                                    type="text"
                                    name="cpiBaseUrl"
                                    value={formData.cpiBaseUrl}
                                    onChange={handleInputChange}
                                    placeholder="https://your-tenant.api.sap"
                                    required
                                    style={{ borderTopRightRadius: '0', borderBottomRightRadius: '0', flexGrow: 1 }}
                                />
                                <span style={{
                                    padding: '0.75rem 1rem',
                                    backgroundColor: '#f0f0f0',
                                    color: '#666',
                                    border: '1px solid #ddd',
                                    borderLeft: 'none',
                                    borderTopRightRadius: '6px',
                                    borderBottomRightRadius: '6px',
                                    fontSize: '0.95rem',
                                    whiteSpace: 'nowrap'
                                }}>
                                    /api/v1
                                </span>
                            </div>
                            <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                Note: "/api/v1" will be automatically appended
                            </small>
                        </div>

                        <div className="form-group">
                            <label>Token URL *</label>
                            <input
                                type="text"
                                name="tokenUrl"
                                value={formData.tokenUrl}
                                onChange={handleInputChange}
                                placeholder="https://your-tenant.authentication.sap"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Client ID *</label>
                            <input
                                type="text"
                                name="clientId"
                                value={formData.clientId}
                                onChange={handleInputChange}
                                placeholder="Copy from service key"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Client Secret *</label>
                            <input
                                type="password"
                                name="clientSecret"
                                value={formData.clientSecret}
                                onChange={handleInputChange}
                                placeholder="Copy from service key"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Project Members (Comma-separated emails)</label>
                            <textarea
                                name="projectMembers"
                                value={formData.projectMembers}
                                onChange={handleInputChange}
                                placeholder="user1@example.com, user2@example.com"
                                rows="3"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    fontFamily: 'inherit',
                                    fontSize: '1rem'
                                }}
                            />
                            <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                These users will have access to this project. Admins have access to all projects.
                            </small>
                        </div>

                        <div className="button-group" style={{ marginTop: '1.5rem' }}>
                            <button type="submit" className="btn-primary">
                                {editingProject ? 'Update Project' : 'Create Project'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={handleCancel}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteDialog && (
                <>
                    {/* Overlay */}
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        onClick={cancelDelete}
                    >
                        {/* Dialog Box */}
                        <div
                            style={{
                                backgroundColor: '#ffffff',
                                borderRadius: '8px',
                                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                                maxWidth: '500px',
                                width: '90%',
                                padding: '2rem',
                                position: 'relative'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Warning Icon */}
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="64"
                                    height="64"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#dc3545"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ margin: '0 auto' }}
                                >
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>

                            {/* Title */}
                            <h3 style={{
                                margin: '0 0 1rem 0',
                                fontSize: '1.5rem',
                                color: '#333',
                                textAlign: 'center'
                            }}>
                                Delete Project?
                            </h3>

                            {/* Message */}
                            <p style={{
                                margin: '0 0 1.5rem 0',
                                color: '#666',
                                fontSize: '1rem',
                                textAlign: 'center',
                                lineHeight: '1.5'
                            }}>
                                Are you sure you want to delete <strong>{projectToDelete?.projectName}</strong>?
                                <br />
                                This action cannot be undone.
                            </p>

                            {/* Buttons */}
                            <div style={{
                                display: 'flex',
                                gap: '1rem',
                                justifyContent: 'center',
                                marginTop: '2rem'
                            }}>
                                <button
                                    onClick={cancelDelete}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        border: '1px solid #d1dadd',
                                        borderRadius: '6px',
                                        backgroundColor: '#ffffff',
                                        color: '#333',
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontWeight: '500'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        border: 'none',
                                        borderRadius: '6px',
                                        backgroundColor: '#dc3545',
                                        color: '#ffffff',
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontWeight: '500'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
                                >
                                    Delete Project
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Projects List */}
            <div>
                <h3>All Projects</h3>
                {projects.length === 0 ? (
                    <p style={{ color: '#666' }}>No projects found. Create your first project above.</p>
                ) : (
                    <div className="logs-table-container">
                        <table className="logs-table">
                            <thead>
                                <tr>
                                    <th>Project Name</th>
                                    <th>Environment</th>
                                    <th>CPI Base URL</th>
                                    <th>Members</th>
                                    <th>Created By</th>
                                    <th>Access</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => {
                                    let members = [];
                                    try {
                                        members = typeof project.projectMembers === 'string'
                                            ? JSON.parse(project.projectMembers)
                                            : project.projectMembers || [];
                                    } catch (e) {
                                        members = [];
                                    }

                                    return (
                                        <tr key={project.id}>
                                            <td><strong>{project.projectName}</strong></td>
                                            <td>{project.environment}</td>
                                            <td style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                                                {project.hasAccess ? project.cpiBaseUrl : '***'}
                                            </td>
                                            <td style={{ fontSize: '0.85rem' }}>
                                                {members.length > 0 ? `${members.length} member(s)` : 'None'}
                                            </td>
                                            <td>{project.createdBy || 'N/A'}</td>
                                            <td>
                                                {project.hasAccess ? (
                                                    <span style={{ color: 'green', fontWeight: 'bold' }}>✓ Access</span>
                                                ) : (
                                                    <span style={{ color: '#999' }}>No Access</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="action-buttons" style={{ alignItems: 'center' }}>
                                                    {project.hasAccess && (
                                                        <>
                                                            <button
                                                                onClick={() => handleEdit(project)}
                                                                title="Edit Project"
                                                                style={{
                                                                    borderRadius: '2px',
                                                                    color: '#007bff',
                                                                    border: 'none',
                                                                    background: 'none',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(project)}
                                                                title="Delete Project"
                                                                style={{
                                                                    marginLeft: '15px',
                                                                    borderRadius: '2px',
                                                                    color: '#dc3545',
                                                                    border: 'none',
                                                                    background: 'none',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                                                </svg>
                                                            </button>
                                                        </>
                                                    )}
                                                    {!project.hasAccess && (
                                                        <span style={{ color: '#999', fontSize: '0.9rem' }}>-</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div >
    );
}

export default ProjectMasterPage;