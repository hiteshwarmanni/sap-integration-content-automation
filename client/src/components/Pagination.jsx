// client/src/components/Pagination.jsx
import React, { useMemo, useCallback } from 'react';

// Memoized Pagination component to prevent unnecessary re-renders
const Pagination = React.memo(({ currentPage, totalPages, onPageChange, itemsPerPage, totalItems, onItemsPerPageChange }) => {
    // Memoize page numbers calculation
    const getPageNumbers = useMemo(() => {
        const pages = [];
        const maxPagesToShow = 5;

        if (totalPages <= maxPagesToShow) {
            // Show all pages if total is less than max
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            // Calculate range around current page
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            // Adjust range if near start
            if (currentPage <= 3) {
                end = 4;
            }

            // Adjust range if near end
            if (currentPage >= totalPages - 2) {
                start = totalPages - 3;
            }

            // Add ellipsis after first page if needed
            if (start > 2) {
                pages.push('...');
            }

            // Add middle pages
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            // Add ellipsis before last page if needed
            if (end < totalPages - 1) {
                pages.push('...');
            }

            // Always show last page
            pages.push(totalPages);
        }

        return pages;
    }, [currentPage, totalPages]);

    const handlePrevious = useCallback(() => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    }, [currentPage, onPageChange]);

    const handleNext = useCallback(() => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    }, [currentPage, totalPages, onPageChange]);

    const handlePageClick = useCallback((page) => {
        if (page !== '...' && page !== currentPage) {
            onPageChange(page);
        }
    }, [currentPage, onPageChange]);

    // Memoize calculated values
    const startItem = useMemo(() => (currentPage - 1) * itemsPerPage + 1, [currentPage, itemsPerPage]);
    const endItem = useMemo(() => Math.min(currentPage * itemsPerPage, totalItems), [currentPage, itemsPerPage, totalItems]);

    return (
        <div className="pagination-container">
            <div className="pagination-info">
                Showing {startItem} to {endItem} of {totalItems} entries
            </div>

            <div className="pagination-controls">
                <div className="items-per-page">
                    <label>Items per page:</label>
                    <select
                        value={itemsPerPage}
                        onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                        className="items-per-page-select"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>

                <div className="pagination-buttons">
                    <button
                        onClick={handlePrevious}
                        disabled={currentPage === 1}
                        className="pagination-btn"
                        title="Previous page"
                    >
                        ‹
                    </button>

                    {getPageNumbers.map((page, index) => (
                        <button
                            key={index}
                            onClick={() => handlePageClick(page)}
                            disabled={page === '...'}
                            className={`pagination-btn ${page === currentPage ? 'active' : ''} ${page === '...' ? 'ellipsis' : ''}`}
                        >
                            {page}
                        </button>
                    ))}

                    <button
                        onClick={handleNext}
                        disabled={currentPage === totalPages}
                        className="pagination-btn"
                        title="Next page"
                    >
                        ›
                    </button>
                </div>
            </div>
        </div>
    );
});

Pagination.displayName = 'Pagination';

export default Pagination;
