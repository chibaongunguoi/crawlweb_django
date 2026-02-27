import React from "react";

export default function Pagination({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }) {
  // Calculate totalPages if totalItems and itemsPerPage are provided
  const calculatedTotalPages = totalPages || Math.ceil(totalItems / itemsPerPage) || 1;
  
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    
    if (calculatedTotalPages <= maxPagesToShow) {
      for (let i = 1; i <= calculatedTotalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(calculatedTotalPages);
      } else if (currentPage >= calculatedTotalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = calculatedTotalPages - 3; i <= calculatedTotalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(calculatedTotalPages);
      }
    }
    
    return pages;
  };

  if (calculatedTotalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination">
      <button 
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Trước
      </button>
      
      {getPageNumbers().map((page, index) => (
        page === '...' ? (
          <span key={`ellipsis-${index}`} style={{padding: '0 8px'}}>...</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={currentPage === page ? 'active' : ''}
          >
            {page}
          </button>
        )
      ))}
      
      <button 
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === calculatedTotalPages}
      >
        Sau
      </button>
    </div>
  );
}
